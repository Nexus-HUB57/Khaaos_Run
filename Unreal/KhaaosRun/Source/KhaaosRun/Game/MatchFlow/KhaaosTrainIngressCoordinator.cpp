// Khaaos Run — server-side bridge from GameMode to the train handover kernel.
#include "Game/MatchFlow/KhaaosTrainIngressCoordinator.h"

#include "Game/Character/KhaaosOperativeActor.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerState.h"
#include "KhaaosRun.h"
#include "TimerManager.h"

class UKhaaosTrainIngressCoordinator::FEffects final
    : public KhaaosTrainHandover::IEffects
{
public:
    explicit FEffects(UKhaaosTrainIngressCoordinator& InOwner)
        : Owner(InOwner)
    {
    }

    bool TeleportPlayer(
        const FString& PlayerId,
        const FVector& Location,
        const FRotator& Rotation) override
    {
        APlayerController* PC = Owner.FindController(PlayerId);
        APawn* Pawn = PC ? PC->GetPawn() : nullptr;
        if (!Pawn)
        {
            return false;
        }

        const bool bTeleported = Pawn->TeleportTo(Location, Rotation, false, true);
        if (!bTeleported)
        {
            return false;
        }

        if (ACharacter* Character = Cast<ACharacter>(Pawn))
        {
            if (UCharacterMovementComponent* Movement = Character->GetCharacterMovement())
            {
                Movement->StopMovementImmediately();
            }
        }
        return true;
    }

    bool UnlockGameplay(const FString& PlayerId) override
    {
        return Owner.SetGameplayLocked(PlayerId, false);
    }

    bool ReleaseSpawnReservation(const FString& IngressId) override
    {
        // Reservation ownership is represented by the retained ingress record.
        // Removing it here would make late duplicate callbacks non-idempotent.
        Owner.Emit(TEXT("barburhen_train_spawn_released"), IngressId, TEXT("handover_cleanup"));
        return true;
    }

    void EmitTelemetry(const KhaaosTrainHandover::FTelemetryEvent& Event) override
    {
        Owner.Emit(Event.Name, Event.IngressId, Event.Reason);
    }

private:
    UKhaaosTrainIngressCoordinator& Owner;
};

UKhaaosTrainIngressCoordinator::UKhaaosTrainIngressCoordinator()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;
}

FString UKhaaosTrainIngressCoordinator::MakePlayerKey(const FString& PlayerId) const
{
    return PlayerId;
}

FString UKhaaosTrainIngressCoordinator::FindPlayerId(APlayerState* PlayerState) const
{
    if (!PlayerState)
    {
        return FString();
    }

    const FString UniqueId = PlayerState->GetUniqueId().ToString();
    return UniqueId.IsEmpty() ? PlayerState->GetPlayerName() : UniqueId;
}

APlayerController* UKhaaosTrainIngressCoordinator::FindController(const FString& PlayerId) const
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return nullptr;
    }

    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        APlayerController* PC = It->Get();
        if (!PC)
        {
            continue;
        }

        const FString CurrentId = FindPlayerId(PC->PlayerState);
        if (CurrentId == MakePlayerKey(PlayerId) ||
            (PC->PlayerState && PC->PlayerState->GetPlayerName() == PlayerId))
        {
            return PC;
        }
    }
    return nullptr;
}

bool UKhaaosTrainIngressCoordinator::SetGameplayLocked(
    const FString& PlayerId,
    bool bLocked) const
{
    APlayerController* PC = FindController(PlayerId);
    if (!PC)
    {
        return false;
    }

    PC->SetIgnoreMoveInput(bLocked);
    PC->SetIgnoreLookInput(bLocked);

    APawn* Pawn = PC->GetPawn();
    if (ACharacter* Character = Cast<ACharacter>(Pawn))
    {
        if (UCharacterMovementComponent* Movement = Character->GetCharacterMovement())
        {
            if (bLocked)
            {
                Movement->StopMovementImmediately();
                Movement->DisableMovement();
            }
            else
            {
                Movement->SetMovementMode(MOVE_Walking);
            }
        }
    }
    return true;
}

FString UKhaaosTrainIngressCoordinator::BeginIngress(
    const FString& PlayerId,
    const FString& MatchId,
    const FVector& SpawnLocation,
    const FRotator& SpawnRotation,
    const FString& UeAssetId,
    const FString& CanonicalSkeleton)
{
    if (!GetOwner() || !GetOwner()->HasAuthority() || PlayerId.IsEmpty() || MatchId.IsEmpty())
    {
        return FString();
    }

    APlayerController* PC = FindController(PlayerId);
    AKhaaosOperativeActor* Operative = PC ? Cast<AKhaaosOperativeActor>(PC->GetPawn()) : nullptr;
    if (!Operative)
    {
        Emit(TEXT("barburhen_train_ingress_failed"), PlayerId, TEXT("operative_actor_not_found"));
        return FString();
    }

    FString AvatarReason;
    if (!Operative->ApplyAvatarSpawnIdentity(UeAssetId, CanonicalSkeleton, AvatarReason))
    {
        Emit(TEXT("barburhen_train_ingress_failed"), PlayerId, AvatarReason);
        return FString();
    }

    const FString IngressId = FString::Printf(
        TEXT("%s/%s/ingress-%d"),
        *MatchId,
        *PlayerId,
        ++Sequence);

    KhaaosTrainHandover::FIngress Ingress;
    Ingress.IngressId = IngressId;
    Ingress.PlayerId = PlayerId;
    Ingress.SpawnLocation = SpawnLocation;
    Ingress.SpawnRotation = SpawnRotation;
    Ingress.State = KhaaosTrainHandover::EState::Handover;

    if (!SetGameplayLocked(PlayerId, true))
    {
        Emit(TEXT("barburhen_train_ingress_failed"), IngressId, TEXT("player_not_found"));
        return FString();
    }

    if (!Effects.IsValid())
    {
        Effects = MakeShared<FEffects>(*this);
    }

    FRuntimeIngress Runtime;
    Runtime.PlayerId = PlayerId;
    Runtime.HandoverAtServerSeconds = GetWorld() ? GetWorld()->GetTimeSeconds() + 3.4 : 0.0;
    Runtime.Controller = MakeShared<KhaaosTrainHandover::FController>(MoveTemp(Ingress), *Effects);
    ActiveIngresses.Add(IngressId, MoveTemp(Runtime));

    Emit(TEXT("barburhen_train_ingress_announced"), IngressId, TEXT("ZU_TRAIN_V1"));
    return IngressId;
}

bool UKhaaosTrainIngressCoordinator::CompleteIngress(
    const FString& IngressId,
    const FString& Reason)
{
    FRuntimeIngress* Runtime = ActiveIngresses.Find(IngressId);
    if (!Runtime || !Runtime->Controller.IsValid())
    {
        return false;
    }

    const KhaaosTrainHandover::EResult Result = Runtime->Controller->Complete(Reason);
    return Result == KhaaosTrainHandover::EResult::Completed ||
        Result == KhaaosTrainHandover::EResult::AlreadyCompleted;
}

void UKhaaosTrainIngressCoordinator::DebugCompleteIngressTwice(const FString& IngressId)
{
    if (!GetOwner() || !GetOwner()->HasAuthority())
    {
        return;
    }
    CompleteIngress(IngressId, TEXT("debug_client_ready"));
    CompleteIngress(IngressId, TEXT("debug_server_deadline"));
}

void UKhaaosTrainIngressCoordinator::TickComponent(
    float DeltaTime,
    ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (!GetOwner() || !GetOwner()->HasAuthority() || !GetWorld())
    {
        return;
    }

    const double Now = GetWorld()->GetTimeSeconds();
    for (TPair<FString, FRuntimeIngress>& Pair : ActiveIngresses)
    {
        FRuntimeIngress& Runtime = Pair.Value;
        if (Runtime.Controller.IsValid() && Now >= Runtime.HandoverAtServerSeconds)
        {
            Runtime.Controller->Complete(TEXT("server_deadline"));
            Runtime.HandoverAtServerSeconds = TNumericLimits<double>::Max();
        }
    }
}

void UKhaaosTrainIngressCoordinator::Emit(
    const FString& Name,
    const FString& IngressId,
    const FString& Reason) const
{
    UE_LOG(
        LogKhaaosRun,
        Log,
        TEXT("TrainIngress event=%s ingress=%s reason=%s"),
        *Name,
        *IngressId,
        *Reason);
}
