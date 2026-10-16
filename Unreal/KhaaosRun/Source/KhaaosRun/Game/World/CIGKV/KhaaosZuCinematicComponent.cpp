// Khaaos Run — CIGKV Zu Cinematic Component
// Implementation. Keeps UE5 audio + Niagara + camera behaviour in one place
// so the level script and player controller can stay network-agnostic.

#include "Game/World/CIGKV/KhaaosZuCinematicComponent.h"

#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/SceneComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraSystem.h"
#include "Sound/SoundBase.h"
#include "TimerManager.h"

UKhaaosZuCinematicComponent::UKhaaosZuCinematicComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
    bAutoActivate = true;
    SetIsReplicatedByDefault(false);
}

EKhaaosZuCinematicVariant UKhaaosZuCinematicComponent::VariantFromByte(uint8 VariantIndex)
{
    // ECIGKVZuVariant enum is also 0/1/2 — direct cast is safe and keeps
    // the component decoupled from the level header.
    switch (VariantIndex)
    {
    case 0: return EKhaaosZuCinematicVariant::Zu1_Cinto;
    case 1: return EKhaaosZuCinematicVariant::Zu2_Saltar;
    case 2: return EKhaaosZuCinematicVariant::Zu3_Mascara;
    default: return EKhaaosZuCinematicVariant::Zu1_Cinto;
    }
}

void UKhaaosZuCinematicComponent::BeginCinematic(
    APlayerController* OwningController,
    EKhaaosZuCinematicVariant Variant,
    float Duration)
{
    if (!IsValid(OwningController))
    {
        return;
    }

    // Cancel any in-flight cinematic before starting a new one.
    if (bCinematicActive)
    {
        EndCinematic();
    }

    const float SafeDuration = FMath::Max(0.1f, Duration);
    const int32 VariantIndex = static_cast<int32>(Variant);

    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    // Cache the prior view target so we can restore it cleanly.
    PreviousViewTarget = OwningController->GetViewTarget();
    ActiveController = OwningController;

    // ─── Camera: spawn a transient cinematic camera near the player ───
    const APawn* Pawn = OwningController->GetPawn();
    const FVector ImpactLocation = IsValid(Pawn)
        ? Pawn->GetActorLocation() + ImpactWorldOffset
        : ImpactWorldOffset;

    AActor* CinematicCamera = World->SpawnActor<AActor>(
        AActor::StaticClass(), ImpactLocation + CameraOffsetFromImpact, FRotator::ZeroRotator);
    if (CinematicCamera)
    {
        USceneComponent* Root = NewObject<USceneComponent>(CinematicCamera, TEXT("CinematicRoot"));
        CinematicCamera->SetRootComponent(Root);
        Root->RegisterComponent();
        UCameraComponent* Cam = NewObject<UCameraComponent>(CinematicCamera, TEXT("CinematicCam"));
        Cam->SetupAttachment(Root);
        Cam->RegisterComponent();
        Cam->SetActive(true);

        const FVector LookDirection = (ImpactLocation - CinematicCamera->GetActorLocation()).GetSafeNormal();
        CinematicCamera->SetActorRotation(LookDirection.Rotation());

        // 250ms blend so the snap-in is jarring (immersion) but not disorienting.
        OwningController->SetViewTargetWithBlend(CinematicCamera, 0.25f, VTBlend_Cubic);

        // Schedule the restore so the player regains control when the cinematic ends.
        FTimerHandle RestoreHandle;
        World->GetTimerManager().SetTimer(
            RestoreHandle,
            FTimerDelegate::CreateWeakLambda(this, [this, CinematicCamera]()
            {
                if (ActiveController.IsValid())
                {
                    AActor* RestoreTarget = PreviousViewTarget.IsValid() ? PreviousViewTarget.Get() : ActiveController->GetPawn();
                    if (RestoreTarget)
                    {
                        ActiveController->SetViewTargetWithBlend(RestoreTarget, 0.4f, VTBlend_Cubic);
                    }
                }
                if (IsValid(CinematicCamera))
                {
                    CinematicCamera->Destroy();
                }
            }),
            SafeDuration, false);
    }

    // ─── Niagara: spawn the impact FX at the crash point ───
    if (VariantImpactFX.IsValidIndex(VariantIndex) && VariantImpactFX[VariantIndex])
    {
        ActiveImpactFX = UNiagaraFunctionLibrary::SpawnSystemAtLocation(
            World,
            VariantImpactFX[VariantIndex],
            ImpactLocation,
            FRotator::ZeroRotator,
            FVector(1.0f),
            /*bAutoDestroy*/ true);
    }

    // ─── Audio: 3D impact MetaSound ───
    if (VariantImpactSounds.IsValidIndex(VariantIndex) && VariantImpactSounds[VariantIndex])
    {
        UGameplayStatics::PlaySoundAtLocation(
            World, VariantImpactSounds[VariantIndex], ImpactLocation, /*Volume*/ 1.0f, /*Pitch*/ 1.0f);
    }

    // ─── Audio: 2D voice line (Marshal distorted) ───
    if (VariantVoiceLines.IsValidIndex(VariantIndex) && VariantVoiceLines[VariantIndex])
    {
        PlayVoiceLine(VariantVoiceLines[VariantIndex], SafeDuration);
    }

    // ─── Haptics: controller rumble during the cinematic ───
    if (CinematicRumble)
    {
        FForceFeedbackParameters Params;
        Params.Tag = TEXT("CIGKV_ZuCinematic");
        Params.bLooping = false;
        Params.bIgnoreTimeDilation = true;
        OwningController->ClientPlayForceFeedback(CinematicRumble, Params);
    }

    // Schedule the EndCinematic cleanup.
    World->GetTimerManager().SetTimer(
        EndTimerHandle, this, &UKhaaosZuCinematicComponent::EndCinematic, SafeDuration, false);

    bCinematicActive = true;
}

void UKhaaosZuCinematicComponent::PlayVoiceLine(USoundBase* Voice, float Duration)
{
    if (!Voice)
    {
        return;
    }
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }
    // 2D sound, attached to nothing, auto-destroyed on completion.
    ActiveVoiceAudio = UGameplayStatics::SpawnSound2D(
        World, Voice, /*Volume*/ 1.0f, /*Pitch*/ 1.0f, /*StartTime*/ 0.0f,
        /*ConcurrencySettings*/ nullptr, /*bPersistAcrossLevelTransition*/ false,
        /*bAutoDestroy*/ true);
    if (ActiveVoiceAudio)
    {
        // Fade the voice out 250ms before the cinematic ends so it doesn't clip the
        // rumble/UI snap. This is a soft fade — no extra track required.
        const float FadeStart = FMath::Max(0.0f, Duration - 0.25f);
        FTimerHandle FadeHandle;
        World->GetTimerManager().SetTimer(
            FadeHandle,
            FTimerDelegate::CreateWeakLambda(this, [this]()
            {
                if (ActiveVoiceAudio)
                {
                    ActiveVoiceAudio->FadeOut(0.25f, 0.0f);
                }
            }),
            FadeStart, false);
    }
}

void UKhaaosZuCinematicComponent::EndCinematic()
{
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(EndTimerHandle);
    }
    ClearTransientEffects();
    bCinematicActive = false;
}

void UKhaaosZuCinematicComponent::ClearTransientEffects()
{
    if (ActiveImpactFX)
    {
        ActiveImpactFX->Deactivate();
        ActiveImpactFX = nullptr;
    }
    if (ActiveVoiceAudio && ActiveVoiceAudio->IsPlaying())
    {
        ActiveVoiceAudio->Stop();
    }
    ActiveVoiceAudio = nullptr;

    if (ActiveController.IsValid())
    {
        ActiveController->ClientStopForceFeedback(nullptr, TEXT("CIGKV_ZuCinematic"));
    }
}

void UKhaaosZuCinematicComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    EndCinematic();
    Super::EndPlay(EndPlayReason);
}
