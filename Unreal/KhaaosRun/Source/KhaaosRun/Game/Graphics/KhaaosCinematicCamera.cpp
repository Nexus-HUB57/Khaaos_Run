// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Graphics/KhaaosCinematicCamera.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/GameplayStatics.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

// ─── Construction ─────────────────────────────────────────────────────────────

UKhaaosCinematicCamera::UKhaaosCinematicCamera()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;

    CurrentMode    = EKhaaosCameraMode::GAMEPLAY;
    PreviousMode   = EKhaaosCameraMode::GAMEPLAY;
    CurrentFOV     = DefaultFOV;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosCinematicCamera::BeginPlay()
{
    Super::BeginPlay();

    // Cache the camera manager for the owning player.
    CachedCameraManager = ResolveCameraManager();
}

// ─── Camera Mode Management ──────────────────────────────────────────────────

void UKhaaosCinematicCamera::SetCameraMode(EKhaaosCameraMode Mode)
{
    if (CurrentMode == Mode)
    {
        return;
    }

    // Store previous mode before switching.
    PreviousMode = CurrentMode;
    CurrentMode  = Mode;

    // Broadcast the mode change delegate.
    OnCameraModeChanged.Broadcast(PreviousMode, CurrentMode);

    // Apply mode-specific time scale and FOV.
    switch (CurrentMode)
    {
    case EKhaaosCameraMode::KILLCAM_REPLAY:
        ApplyTimeScale(KillCamTimeScale);
        SetFOV(60.0f);
        break;

    case EKhaaosCameraMode::SPECTATOR_FREECAM:
        ApplyTimeScale(1.0f);
        SetFOV(90.0f);
        break;

    case EKhaaosCameraMode::SPECTATOR_FOLLOW:
        ApplyTimeScale(1.0f);
        SetFOV(80.0f);
        break;

    case EKhaaosCameraMode::SPECTATOR_OVERHEAD:
        ApplyTimeScale(1.0f);
        SetFOV(100.0f);
        break;

    case EKhaaosCameraMode::SPECTATOR_RING:
        ApplyTimeScale(1.0f);
        SetFOV(90.0f);
        break;

    case EKhaaosCameraMode::CINEMATIC_WORLD_TRANSITION:
        ApplyTimeScale(0.5f);
        SetFOV(50.0f);
        break;

    case EKhaaosCameraMode::CINEMATIC_INTRO:
        ApplyTimeScale(0.5f);
        SetFOV(50.0f);
        break;

    case EKhaaosCameraMode::CINEMATIC_VICTORY:
        ApplyTimeScale(0.3f);
        SetFOV(45.0f);
        break;

    case EKhaaosCameraMode::DEATH_CAMERA:
        ApplyTimeScale(0.5f);
        SetFOV(70.0f);
        break;

    case EKhaaosCameraMode::GAMEPLAY:
    default:
        ApplyTimeScale(1.0f);
        ResetFOV();
        break;
    }
}

EKhaaosCameraMode UKhaaosCinematicCamera::GetCurrentCameraMode() const
{
    return CurrentMode;
}

EKhaaosCameraMode UKhaaosCinematicCamera::GetPreviousCameraMode() const
{
    return PreviousMode;
}

void UKhaaosCinematicCamera::ReturnToGameplay()
{
    SetCameraMode(EKhaaosCameraMode::GAMEPLAY);
}

// ─── Kill Cam System ──────────────────────────────────────────────────────────

void UKhaaosCinematicCamera::StartKillCam(const FKhaaosKillCamData& Data)
{
    KillCamData = Data;
    bKillCamActive = true;
    KillCamStartTime = GetWorld()->GetTimeSeconds();

    // Switch to kill cam mode (applies slow-mo time scale and cinematic FOV).
    SetCameraMode(EKhaaosCameraMode::KILLCAM_REPLAY);
}

bool UKhaaosCinematicCamera::IsKillCamActive() const
{
    return bKillCamActive;
}

float UKhaaosCinematicCamera::GetKillCamRemainingTime() const
{
    if (!bKillCamActive)
    {
        return 0.0f;
    }

    const float Elapsed = GetWorld()->GetTimeSeconds() - KillCamStartTime;
    const float Remaining = KillCamDuration - Elapsed;
    return FMath::Max(0.0f, Remaining);
}

// ─── Spectator Camera ─────────────────────────────────────────────────────────

void UKhaaosCinematicCamera::SetSpectatorTarget(AActor* Target)
{
    SpectatorTarget = Target;
}

AActor* UKhaaosCinematicCamera::GetSpectatorTarget() const
{
    return SpectatorTarget.Get();
}

void UKhaaosCinematicCamera::SetSpectatorOffset(const FVector& Offset)
{
    SpectatorOffset = Offset;
}

void UKhaaosCinematicCamera::CycleSpectatorTarget()
{
    // Gather all pawn actors that are valid spectator targets (alive players).
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    TArray<AActor*> PlayerPawns;
    UGameplayStatics::GetAllActorsOfClass(World, APawn::StaticClass(), PlayerPawns);

    // Filter out invalid targets.
    PlayerPawns.RemoveAll([](AActor* Actor)
    {
        return !IsValid(Actor) || Actor->IsPendingKillPending();
    });

    if (PlayerPawns.Num() == 0)
    {
        return;
    }

    // Find the current target index and advance to the next.
    AActor* CurrentTarget = SpectatorTarget.Get();
    int32 CurrentIndex = PlayerPawns.Find(CurrentTarget);
    int32 NextIndex = (CurrentIndex + 1) % PlayerPawns.Num();

    SpectatorTarget = PlayerPawns[NextIndex];
}

// ─── World Transition Cinematic ───────────────────────────────────────────────

void UKhaaosCinematicCamera::PlayWorldTransitionCinematic(FName FromWorld, FName ToWorld)
{
    TransitionFromWorld = FromWorld;
    TransitionToWorld   = ToWorld;
    bTransitionCinematicActive = true;
    TransitionStartTime = GetWorld()->GetTimeSeconds();

    // Switch to cinematic world transition mode (0.5x time scale, 50 FOV).
    SetCameraMode(EKhaaosCameraMode::CINEMATIC_WORLD_TRANSITION);
}

bool UKhaaosCinematicCamera::IsTransitionCinematicActive() const
{
    return bTransitionCinematicActive;
}

// ─── Camera Shake ─────────────────────────────────────────────────────────────

void UKhaaosCinematicCamera::TriggerCameraShake(const FKhaaosCameraShakeConfig& Config)
{
    CameraShakeConfig = Config;
    bCameraShakeActive = true;
    CameraShakeStartTime = GetWorld()->GetTimeSeconds();
}

void UKhaaosCinematicCamera::StopCameraShake()
{
    bCameraShakeActive = false;
}

// ─── Camera Effects ───────────────────────────────────────────────────────────

void UKhaaosCinematicCamera::SetFOV(float FOV)
{
    CurrentFOV = FOV;

    APlayerCameraManager* CamManager = ResolveCameraManager();
    if (CamManager)
    {
        CamManager->SetFOV(FOV);
    }
}

void UKhaaosCinematicCamera::ResetFOV()
{
    CurrentFOV = DefaultFOV;

    APlayerCameraManager* CamManager = ResolveCameraManager();
    if (CamManager)
    {
        CamManager->SetFOV(DefaultFOV);
    }
}

// ─── Death Camera ─────────────────────────────────────────────────────────────

void UKhaaosCinematicCamera::StartDeathCamera(FVector InDeathLocation, FVector InKillerLocation)
{
    DeathLocation  = InDeathLocation;
    KillerLocation = InKillerLocation;
    bDeathCameraActive = true;
    DeathCameraStartTime = GetWorld()->GetTimeSeconds();

    // Switch to death camera mode (0.5x time scale, 70 FOV).
    SetCameraMode(EKhaaosCameraMode::DEATH_CAMERA);
}

// ─── Tick (Component Update) ──────────────────────────────────────────────────

void UKhaaosCinematicCamera::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (!GetWorld())
    {
        return;
    }

    // Update systems based on current mode and active states.
    if (bKillCamActive)
    {
        UpdateKillCam(DeltaTime);
    }

    if (CurrentMode == EKhaaosCameraMode::SPECTATOR_FOLLOW ||
        CurrentMode == EKhaaosCameraMode::SPECTATOR_OVERHEAD ||
        CurrentMode == EKhaaosCameraMode::SPECTATOR_RING)
    {
        UpdateSpectatorCamera(DeltaTime);
    }

    if (bDeathCameraActive)
    {
        UpdateDeathCamera(DeltaTime);
    }

    if (bCameraShakeActive)
    {
        UpdateCameraShake(DeltaTime);
    }

    if (bTransitionCinematicActive)
    {
        const float TransitionElapsed = GetWorld()->GetTimeSeconds() - TransitionStartTime;
        if (TransitionElapsed >= TransitionCinematicDuration)
        {
            bTransitionCinematicActive = false;
            ApplyTimeScale(1.0f);
            OnTransitionCinematicFinished.Broadcast();
            ReturnToGameplay();
        }
    }
}

// ─── Internal: Update Kill Cam ────────────────────────────────────────────────

void UKhaaosCinematicCamera::UpdateKillCam(float DeltaTime)
{
    const float Elapsed = GetWorld()->GetTimeSeconds() - KillCamStartTime;

    if (Elapsed >= KillCamDuration)
    {
        // Kill cam finished — restore normal time and return to gameplay.
        bKillCamActive = false;
        ApplyTimeScale(1.0f);
        OnKillCamFinished.Broadcast();
        ReturnToGameplay();
    }
}

// ─── Internal: Update Spectator Camera ────────────────────────────────────────

void UKhaaosCinematicCamera::UpdateSpectatorCamera(float DeltaTime)
{
    AActor* Target = SpectatorTarget.Get();
    if (!Target || !IsValid(Target))
    {
        return;
    }

    APlayerCameraManager* CamManager = ResolveCameraManager();
    if (!CamManager)
    {
        return;
    }

    // Compute the desired camera location: target + offset.
    FVector DesiredLocation = Target->GetActorLocation() + SpectatorOffset;

    // For overhead mode, position the camera high above the target.
    if (CurrentMode == EKhaaosCameraMode::SPECTATOR_OVERHEAD)
    {
        DesiredLocation = Target->GetActorLocation() + FVector(0.0f, 0.0f, 1500.0f);
    }

    // Smoothly interpolate the camera manager's view target location toward desired.
    const FVector CurrentLocation = CamManager->GetCameraLocation();
    const FVector InterpLocation = FMath::VInterpTo(CurrentLocation, DesiredLocation, DeltaTime, SpectatorLerpSpeed);

    // Apply the interpolated location by adjusting the camera manager transform.
    if (APawn* OwningPawn = Cast<APawn>(GetOwner()))
    {
        if (APlayerController* PC = Cast<APlayerController>(OwningPawn->GetController()))
        {
            // Set the spectator pawn location for the camera to follow.
            OwningPawn->SetActorLocation(InterpLocation);
        }
    }
}

// ─── Internal: Update Death Camera ────────────────────────────────────────────

void UKhaaosCinematicCamera::UpdateDeathCamera(float DeltaTime)
{
    const float Elapsed = GetWorld()->GetTimeSeconds() - DeathCameraStartTime;

    if (Elapsed >= DeathCameraDuration)
    {
        // Death camera sequence finished.
        bDeathCameraActive = false;
        ApplyTimeScale(1.0f);
        OnDeathCameraFinished.Broadcast();
        ReturnToGameplay();
        return;
    }

    // Zoom-out effect: gradually increase FOV over the death camera duration.
    const float Progress = Elapsed / DeathCameraDuration;
    const float ZoomOutFOV = 70.0f + Progress * 40.0f; // 70 → 110 over the sequence
    SetFOV(ZoomOutFOV);

    // Interpolate camera position away from death location toward killer.
    APlayerCameraManager* CamManager = ResolveCameraManager();
    if (CamManager)
    {
        const FVector CurrentLocation = CamManager->GetCameraLocation();
        const FVector DesiredLocation = FMath::Lerp(DeathLocation, KillerLocation, Progress);
        const FVector InterpLocation = FMath::VInterpTo(CurrentLocation, DesiredLocation, DeltaTime, 3.0f);

        if (APawn* OwningPawn = Cast<APawn>(GetOwner()))
        {
            OwningPawn->SetActorLocation(InterpLocation);
        }
    }
}

// ─── Internal: Update Camera Shake ────────────────────────────────────────────

void UKhaaosCinematicCamera::UpdateCameraShake(float DeltaTime)
{
    const float Elapsed = GetWorld()->GetTimeSeconds() - CameraShakeStartTime;

    // Exponential decay factor — shake fades over DecayTime.
    const float DecayFactor = FMath::Exp(-Elapsed / FMath::Max(CameraShakeConfig.DecayTime, KINDA_SMALL_NUMBER));

    if (DecayFactor < 0.01f)
    {
        // Shake has decayed below threshold — stop.
        StopCameraShake();
        return;
    }

    // Sinusoidal oscillation with per-axis amplitude.
    const float Frequency = 30.0f; // 30 Hz oscillation frequency.
    const float SinValue  = FMath::Sin(Elapsed * Frequency * TWO_PI);

    const FVector ShakeOffset(
        CameraShakeConfig.OscillationX * SinValue * DecayFactor * CameraShakeConfig.ShakeScale,
        CameraShakeConfig.OscillationY * FMath::Cos(Elapsed * Frequency * TWO_PI * 1.3f) * DecayFactor * CameraShakeConfig.ShakeScale,
        CameraShakeConfig.OscillationZ * FMath::Sin(Elapsed * Frequency * TWO_PI * 0.7f) * DecayFactor * CameraShakeConfig.ShakeScale
    );

    // Apply the shake offset to the camera manager.
    APlayerCameraManager* CamManager = ResolveCameraManager();
    if (CamManager)
    {
        // Apply as a transient offset via the camera manager's view offset.
        CamManager->ViewPitchOffset = ShakeOffset.Y;
        CamManager->ViewYawOffset   = ShakeOffset.X;
        CamManager->ViewRollOffset  = ShakeOffset.Z;
    }
}

// ─── Internal: Resolve Camera Manager ─────────────────────────────────────────

APlayerCameraManager* UKhaaosCinematicCamera::ResolveCameraManager()
{
    // Return cached manager if still valid.
    if (CachedCameraManager.IsValid())
    {
        return CachedCameraManager.Get();
    }

    // Re-acquire from the owning pawn's player controller.
    if (APawn* OwningPawn = Cast<APawn>(GetOwner()))
    {
        if (APlayerController* PC = Cast<APlayerController>(OwningPawn->GetController()))
        {
            CachedCameraManager = PC->PlayerCameraManager;
            return CachedCameraManager.Get();
        }
    }

    // Fallback: attempt to find via gameplay statics.
    if (UWorld* World = GetWorld())
    {
        if (APlayerController* PC = World->GetFirstPlayerController())
        {
            CachedCameraManager = PC->PlayerCameraManager;
            return CachedCameraManager.Get();
        }
    }

    return nullptr;
}

// ─── Internal: Apply Time Scale ───────────────────────────────────────────────

void UKhaaosCinematicCamera::ApplyTimeScale(float Scale)
{
    // Apply custom time dilation to the owning pawn for localized slow-motion.
    if (APawn* OwningPawn = Cast<APawn>(GetOwner()))
    {
        OwningPawn->CustomTimeDilation = Scale;
    }

    // Also apply global time dilation for cinematic modes that need world-wide slow-mo
    // (e.g., kill cam, victory cinematic). For spectator modes, only local dilation is used.
    if (CurrentMode == EKhaaosCameraMode::KILLCAM_REPLAY ||
        CurrentMode == EKhaaosCameraMode::CINEMATIC_VICTORY ||
        CurrentMode == EKhaaosCameraMode::CINEMATIC_INTRO ||
        CurrentMode == EKhaaosCameraMode::CINEMATIC_WORLD_TRANSITION ||
        CurrentMode == EKhaaosCameraMode::DEATH_CAMERA)
    {
        UGameplayStatics::SetGlobalTimeDilation(GetWorld(), Scale);
    }
    else
    {
        // Ensure global time is restored for non-cinematic modes.
        UGameplayStatics::SetGlobalTimeDilation(GetWorld(), 1.0f);
    }
}
