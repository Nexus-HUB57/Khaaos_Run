// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Spectator/KhaaosSpectatorComponent.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "GameFramework/PlayerController.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosSpectatorComponent::UKhaaosSpectatorComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    CurrentMode = ESpectatorMode::FollowPlayer;
    SpectateTarget = nullptr;
    FreeCamSpeed = 1200.0f;
    DefaultFreeCamSpeed = 1200.0f;
    FastCamMultiplier = 3.0f;
    OverviewHeight = 5000.0f;
    FollowIndex = 0;
    CacheAge = 0.0f;
}

// ─── Mode Control ───────────────────────────────────────────────────────────────

void UKhaaosSpectatorComponent::SetSpectatorMode(ESpectatorMode NewMode)
{
    ESpectatorMode OldMode = CurrentMode;
    if (OldMode == NewMode) return;

    CurrentMode = NewMode;

    // Clear follow target when leaving FollowPlayer mode
    if (NewMode != ESpectatorMode::FollowPlayer)
    {
        SpectateTarget = nullptr;
    }

    OnSpectatorModeChanged.Broadcast(OldMode, NewMode);
    UE_LOG(LogKhaaosRun, Log, TEXT("SpectatorComponent::SetSpectatorMode - %d → %d"),
        static_cast<int32>(OldMode), static_cast<int32>(NewMode));
}

// ─── Target Control ─────────────────────────────────────────────────────────────

void UKhaaosSpectatorComponent::SetSpectateTarget(APlayerState* Target)
{
    if (!Target) return;

    SpectateTarget = Target;
    CurrentMode = ESpectatorMode::FollowPlayer;

    OnSpectateTargetChanged.Broadcast(Target->GetUniqueId().ToString());
}

void UKhaaosSpectatorComponent::FollowNextAlive()
{
    RefreshAlivePlayersCache();
    if (AlivePlayersCache.Num() == 0) return;

    FollowIndex = (FollowIndex + 1) % AlivePlayersCache.Num();
    SpectateTarget = AlivePlayersCache[FollowIndex];

    if (SpectateTarget)
    {
        OnSpectateTargetChanged.Broadcast(SpectateTarget->GetUniqueId().ToString());
    }
}

void UKhaaosSpectatorComponent::FollowPrevAlive()
{
    RefreshAlivePlayersCache();
    if (AlivePlayersCache.Num() == 0) return;

    FollowIndex = (FollowIndex - 1 + AlivePlayersCache.Num()) % AlivePlayersCache.Num();
    SpectateTarget = AlivePlayersCache[FollowIndex];

    if (SpectateTarget)
    {
        OnSpectateTargetChanged.Broadcast(SpectateTarget->GetUniqueId().ToString());
    }
}

void UKhaaosSpectatorComponent::FollowKiller(const FString& KillerId)
{
    if (KillerId.IsEmpty()) return;

    UWorld* World = GetWorld();
    if (!World) return;

    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (PC->PlayerState && PC->PlayerState->GetUniqueId().ToString() == KillerId)
            {
                SetSpectateTarget(PC->PlayerState);
                return;
            }
        }
    }
}

// ─── Replication ────────────────────────────────────────────────────────────────

void UKhaaosSpectatorComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME_CONDITION(UKhaaosSpectatorComponent, CurrentMode, COND_None);
    DOREPLIFETIME_CONDITION(UKhaaosSpectatorComponent, SpectateTarget, COND_None);
    DOREPLIFETIME_CONDITION(UKhaaosSpectatorComponent, FreeCamSpeed, COND_None);
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosSpectatorComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Refresh alive players cache periodically
    CacheAge += DeltaTime;
    if (CacheAge >= CacheRefreshInterval)
    {
        RefreshAlivePlayersCache();
        CacheAge = 0.0f;
    }

    // In FollowPlayer mode, verify target is still alive
    if (CurrentMode == ESpectatorMode::FollowPlayer && SpectateTarget)
    {
        AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(SpectateTarget);
        if (KPS && KPS->PlayerStatus != EPlayerStatus::Vivo)
        {
            // Target eliminated — auto-follow next
            FollowNextAlive();
        }
    }
}

void UKhaaosSpectatorComponent::RefreshAlivePlayersCache()
{
    AlivePlayersCache.Empty();

    UWorld* World = GetWorld();
    if (!World) return;

    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState))
            {
                if (KPS->PlayerStatus == EPlayerStatus::Vivo)
                {
                    AlivePlayersCache.Add(KPS);
                }
            }
        }
    }
}

APlayerController* UKhaaosSpectatorComponent::GetOwnerPlayerController() const
{
    AActor* Owner = GetOwner();
    return Owner ? Cast<APlayerController>(Owner) : nullptr;
}
