// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Camera/KhaaosKillCamComponent.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraFunctionLibrary.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosKillCam, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosKillCamComponent::UKhaaosKillCamComponent()
{
        PrimaryComponentTick.bCanEverTick = true;
        PrimaryComponentTick.bStartWithTickEnabled = false;

        // Default config
        DefaultConfig.Mode = EKillCamMode::Orbit;
        DefaultConfig.Duration = 3.0f;
        DefaultConfig.SlowMoTimeScale = 0.3f;
        DefaultConfig.SlowMoDuration = 1.0f;
        DefaultConfig.OrbitRadius = 300.0f;
        DefaultConfig.OrbitSpeed = 90.0f;
        DefaultConfig.FOV = 70.0f;
        DefaultConfig.DOFAperture = 2.8f;
        DefaultConfig.bShowSpeciesVFX = true;
        DefaultConfig.FadeOutDuration = 0.5f;

        // Per-mode overrides
        {
                FKhaaosKillCamConfig FlyByConfig;
                FlyByConfig.Mode = EKillCamMode::FlyBy;
                FlyByConfig.Duration = 2.5f;
                FlyByConfig.SlowMoTimeScale = 0.25f;
                FlyByConfig.SlowMoDuration = 0.8f;
                FlyByConfig.FOV = 80.0f;
                ModeConfigs.Add(EKillCamMode::FlyBy, FlyByConfig);
        }
        {
                FKhaaosKillCamConfig SpeciesConfig;
                SpeciesConfig.Mode = EKillCamMode::SpeciesCloseUp;
                SpeciesConfig.Duration = 3.5f;
                SpeciesConfig.SlowMoTimeScale = 0.2f;
                SpeciesConfig.SlowMoDuration = 1.2f;
                SpeciesConfig.OrbitRadius = 150.0f;
                SpeciesConfig.FOV = 55.0f;
                SpeciesConfig.DOFAperture = 1.4f;
                SpeciesConfig.bShowSpeciesVFX = true;
                ModeConfigs.Add(EKillCamMode::SpeciesCloseUp, SpeciesConfig);
        }
        {
                FKhaaosKillCamConfig DollyConfig;
                DollyConfig.Mode = EKillCamMode::CinematicDolly;
                DollyConfig.Duration = 4.0f;
                DollyConfig.SlowMoTimeScale = 0.35f;
                DollyConfig.SlowMoDuration = 1.5f;
                DollyConfig.FOV = 50.0f;
                DollyConfig.DOFAperture = 1.2f;
                ModeConfigs.Add(EKillCamMode::CinematicDolly, DollyConfig);
        }
}

// ─── BeginPlay ────────────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::BeginPlay()
{
        Super::BeginPlay();

        // Create spring arm and camera if we have an owner
        AActor* Owner = GetOwner();
        if (Owner)
        {
                KillCamSpringArm = NewObject<USpringArmComponent>(Owner, USpringArmComponent::StaticClass(), TEXT("KillCamSpringArm"));
                if (KillCamSpringArm)
                {
                        KillCamSpringArm->SetupAttachment(Owner->GetRootComponent());
                        KillCamSpringArm->TargetArmLength = DefaultConfig.OrbitRadius;
                        KillCamSpringArm->bUsePawnControlRotation = false;
                        KillCamSpringArm->RegisterComponent();
                }

                KillCamCamera = NewObject<UCameraComponent>(Owner, UCameraComponent::StaticClass(), TEXT("KillCamCamera"));
                if (KillCamCamera && KillCamSpringArm)
                {
                        KillCamCamera->SetupAttachment(KillCamSpringArm);
                        KillCamCamera->FieldOfView = DefaultConfig.FOV;
                        KillCamCamera->RegisterComponent();
                }
        }

        UE_LOG(LogKhaaosKillCam, Log, TEXT("KillCamComponent initialized on %s"), *GetNameSafe(GetOwner()));
}

// ─── TriggerKillCam ───────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::TriggerKillCam(
        const FKhaaosKillCamData& KillData,
        EKillCamMode Mode,
        const FKhaaosKillCamConfig* OverrideConfig)
{
        if (IsKillCamActive())
        {
                UE_LOG(LogKhaaosKillCam, Warning, TEXT("TriggerKillCam: Kill cam already active, cancelling previous"));
                CancelKillCam();
        }

        CurrentKillData = KillData;
        ActiveMode = Mode;
        ActiveConfig = OverrideConfig ? *OverrideConfig : ResolveConfig(Mode);
        ElapsedTime = 0.0f;
        OrbitAngle = 0.0f;

        // Set camera FOV
        if (KillCamCamera)
        {
                KillCamCamera->FieldOfView = ActiveConfig.FOV;
                KillCamCamera->SetActive(true);
        }

        // Set spring arm length
        if (KillCamSpringArm)
        {
                KillCamSpringArm->TargetArmLength = ActiveConfig.OrbitRadius;
        }

        // Enable ticking
        SetComponentTickEnabled(true);

        // Start the state machine
        TransitionToState(EKillCamState::PreRoll);

        UE_LOG(LogKhaaosKillCam, Log, TEXT("KillCam triggered: Mode=%s Killer=%d Victim=%d Dmg=%.1f Headshot=%d"),
                *UEnum::GetDisplayValueAsText(ActiveMode).ToString(),
                static_cast<int32>(KillData.KillerSpecies),
                static_cast<int32>(KillData.VictimSpecies),
                KillData.KillingBlowDamage,
                KillData.bWasHeadshot ? 1 : 0);

        OnKillCamStarted.Broadcast(ActiveMode, KillData.KillerSpecies, KillData.VictimSpecies);
}

// ─── CancelKillCam ────────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::CancelKillCam()
{
        if (!IsKillCamActive())
        {
                return;
        }

        RestoreTimeDilation();
        CleanupSpeciesVFX();

        if (KillCamCamera)
        {
                KillCamCamera->SetActive(false);
        }

        EKillCamMode PrevMode = ActiveMode;
        CurrentState = EKillCamState::Idle;
        SetComponentTickEnabled(false);

        UE_LOG(LogKhaaosKillCam, Log, TEXT("KillCam cancelled"));
        OnKillCamFinished.Broadcast(PrevMode);
}

// ─── TickComponent ────────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
        Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

        // Use dilated time for smooth slow-mo
        float ScaledDelta = DeltaTime;

        switch (CurrentState)
        {
        case EKillCamState::PreRoll:
                TickPreRoll(ScaledDelta);
                break;
        case EKillCamState::Playback:
                TickPlayback(ScaledDelta);
                break;
        case EKillCamState::SlowMo:
                TickSlowMo(ScaledDelta);
                break;
        case EKillCamState::SpeciesReveal:
                TickSpeciesReveal(ScaledDelta);
                break;
        case EKillCamState::FadeOut:
                TickFadeOut(ScaledDelta);
                break;
        default:
                break;
        }
}

// ─── State Machine ────────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::TransitionToState(EKillCamState NewState)
{
        EKillCamState PrevState = CurrentState;
        CurrentState = NewState;

        UE_LOG(LogKhaaosKillCam, Verbose, TEXT("KillCam state: %s -> %s"),
                *UEnum::GetDisplayValueAsText(PrevState).ToString(),
                *UEnum::GetDisplayValueAsText(NewState).ToString());

        // State entry actions
        switch (NewState)
        {
        case EKillCamState::PreRoll:
                ElapsedTime = 0.0f;
                break;
        case EKillCamState::Playback:
                ElapsedTime = 0.0f;
                break;
        case EKillCamState::SlowMo:
                ElapsedTime = 0.0f;
                ApplySlowMotion();
                break;
        case EKillCamState::SpeciesReveal:
                ElapsedTime = 0.0f;
                if (bSpawnSpeciesVFXOnReveal)
                {
                        SpawnSpeciesRevealVFX();
                }
                break;
        case EKillCamState::FadeOut:
                ElapsedTime = 0.0f;
                break;
        case EKillCamState::Finished:
                RestoreTimeDilation();
                CleanupSpeciesVFX();
                if (KillCamCamera)
                {
                        KillCamCamera->SetActive(false);
                }
                SetComponentTickEnabled(false);
                OnKillCamFinished.Broadcast(ActiveMode);
                CurrentState = EKillCamState::Idle;
                break;
        default:
                break;
        }
}

void UKhaaosKillCamComponent::TickPreRoll(float DeltaTime)
{
        ElapsedTime += DeltaTime;
        // Brief 0.2s pre-roll to stabilize camera
        if (ElapsedTime >= 0.2f)
        {
                TransitionToState(EKillCamState::Playback);
        }
}

void UKhaaosKillCamComponent::TickPlayback(float DeltaTime)
{
        ElapsedTime += DeltaTime;

        // Update camera based on mode
        switch (ActiveMode)
        {
        case EKillCamMode::Orbit:
                UpdateOrbitCamera(DeltaTime);
                break;
        case EKillCamMode::FlyBy:
                UpdateFlyByCamera(DeltaTime);
                break;
        case EKillCamMode::SpeciesCloseUp:
                UpdateSpeciesCloseUpCamera(DeltaTime);
                break;
        case EKillCamMode::CinematicDolly:
                UpdateCinematicDollyCamera(DeltaTime);
                break;
        }

        // Transition to slow-mo after playback portion
        float PlaybackDuration = ActiveConfig.Duration - ActiveConfig.SlowMoDuration - ActiveConfig.FadeOutDuration;
        if (PlaybackDuration < 0.5f) PlaybackDuration = 0.5f;

        if (ElapsedTime >= PlaybackDuration)
        {
                TransitionToState(EKillCamState::SlowMo);
        }
}

void UKhaaosKillCamComponent::TickSlowMo(float DeltaTime)
{
        ElapsedTime += DeltaTime;

        // Continue camera movement during slow-mo
        switch (ActiveMode)
        {
        case EKillCamMode::Orbit:
                UpdateOrbitCamera(DeltaTime * ActiveConfig.SlowMoTimeScale);
                break;
        case EKillCamMode::FlyBy:
                UpdateFlyByCamera(DeltaTime * ActiveConfig.SlowMoTimeScale);
                break;
        case EKillCamMode::SpeciesCloseUp:
                UpdateSpeciesCloseUpCamera(DeltaTime * ActiveConfig.SlowMoTimeScale);
                break;
        case EKillCamMode::CinematicDolly:
                UpdateCinematicDollyCamera(DeltaTime * ActiveConfig.SlowMoTimeScale);
                break;
        }

        // After slow-mo, go to species reveal (if applicable) or fade out
        if (ElapsedTime >= ActiveConfig.SlowMoDuration)
        {
                if (ActiveConfig.bShowSpeciesVFX && ActiveMode == EKillCamMode::SpeciesCloseUp)
                {
                        TransitionToState(EKillCamState::SpeciesReveal);
                }
                else
                {
                        TransitionToState(EKillCamState::FadeOut);
                }
        }
}

void UKhaaosKillCamComponent::TickSpeciesReveal(float DeltaTime)
{
        ElapsedTime += DeltaTime;
        // Species reveal lasts 1.0s
        if (ElapsedTime >= 1.0f)
        {
                TransitionToState(EKillCamState::FadeOut);
        }
}

void UKhaaosKillCamComponent::TickFadeOut(float DeltaTime)
{
        ElapsedTime += DeltaTime;
        if (ElapsedTime >= ActiveConfig.FadeOutDuration)
        {
                TransitionToState(EKillCamState::Finished);
        }
}

// ─── Camera Updates ───────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::UpdateOrbitCamera(float DeltaTime)
{
        if (!KillCamSpringArm) return;

        OrbitAngle += ActiveConfig.OrbitSpeed * DeltaTime;
        if (OrbitAngle > 360.0f) OrbitAngle -= 360.0f;

        // Orbit around the victim location
        FRotator OrbitRotation(0.0f, OrbitAngle, -30.0f); // 30 degree downward tilt
        KillCamSpringArm->SetWorldLocation(CurrentKillData.VictimLocation);
        KillCamSpringArm->SetWorldRotation(OrbitRotation);
}

void UKhaaosKillCamComponent::UpdateFlyByCamera(float DeltaTime)
{
        if (!KillCamSpringArm) return;

        // Lerp from killer to victim position
        float T = FMath::Clamp(ElapsedTime / ActiveConfig.Duration, 0.0f, 1.0f);
        // Ease-in-out curve
        float SmoothT = T * T * (3.0f - 2.0f * T);

        FVector CamPos = FMath::Lerp(CurrentKillData.KillerLocation, CurrentKillData.VictimLocation, SmoothT);
        // Offset camera up and to the side
        CamPos += FVector(0.0f, 150.0f, 200.0f);

        KillCamSpringArm->SetWorldLocation(CamPos);
        // Look at victim
        FRotator LookAt = (CurrentKillData.VictimLocation - CamPos).Rotation();
        KillCamSpringArm->SetWorldRotation(LookAt);
}

void UKhaaosKillCamComponent::UpdateSpeciesCloseUpCamera(float DeltaTime)
{
        if (!KillCamSpringArm) return;

        // Close-up orbit at smaller radius
        OrbitAngle += ActiveConfig.OrbitSpeed * 0.5f * DeltaTime;
        if (OrbitAngle > 360.0f) OrbitAngle -= 360.0f;

        FRotator CloseUpRotation(0.0f, OrbitAngle, -15.0f);
        KillCamSpringArm->SetWorldLocation(CurrentKillData.VictimLocation);
        KillCamSpringArm->SetWorldRotation(CloseUpRotation);

        if (KillCamSpringArm)
        {
                KillCamSpringArm->TargetArmLength = ActiveConfig.OrbitRadius;
        }
}

void UKhaaosKillCamComponent::UpdateCinematicDollyCamera(float DeltaTime)
{
        if (!KillCamSpringArm) return;

        // Dolly from side with slow pan
        float T = FMath::Clamp(ElapsedTime / ActiveConfig.Duration, 0.0f, 1.0f);
        float SmoothT = T * T * (3.0f - 2.0f * T);

        FVector StartPos = CurrentKillData.VictimLocation + FVector(500.0f, 0.0f, 100.0f);
        FVector EndPos = CurrentKillData.VictimLocation + FVector(-200.0f, 0.0f, 150.0f);
        FVector CamPos = FMath::Lerp(StartPos, EndPos, SmoothT);

        KillCamSpringArm->SetWorldLocation(CamPos);
        FRotator LookAt = (CurrentKillData.VictimLocation - CamPos).Rotation();
        KillCamSpringArm->SetWorldRotation(LookAt);
}

// ─── Time Dilation ────────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::ApplySlowMotion()
{
        UWorld* World = GetWorld();
        if (!World) return;

        AGameModeBase* GameMode = World->GetAuthGameMode();
        if (GameMode)
        {
                SavedTimeDilation = GameMode->GetTimeDilation();
                GameMode->SetTimeDilation(GlobalSlowMoDilation);
        }

        UE_LOG(LogKhaaosKillCam, Log, TEXT("Slow-mo applied: dilation=%.2f"), GlobalSlowMoDilation);
}

void UKhaaosKillCamComponent::RestoreTimeDilation()
{
        UWorld* World = GetWorld();
        if (!World) return;

        AGameModeBase* GameMode = World->GetAuthGameMode();
        if (GameMode)
        {
                GameMode->SetTimeDilation(SavedTimeDilation);
        }

        UE_LOG(LogKhaaosKillCam, Log, TEXT("Time dilation restored: %.2f"), SavedTimeDilation);
}

// ─── Species VFX ──────────────────────────────────────────────────────────────

void UKhaaosKillCamComponent::SpawnSpeciesRevealVFX()
{
        UWorld* World = GetWorld();
        if (!World) return;

        UGameInstance* GameInstance = World->GetGameInstance();
        if (!GameInstance) return;

        UKhaaosSpeciesVFXRegistry* VFXRegistry = GameInstance->GetSubsystem<UKhaaosSpeciesVFXRegistry>();
        if (!VFXRegistry)
        {
                UE_LOG(LogKhaaosKillCam, Warning, TEXT("SpeciesVFXRegistry not available for kill cam VFX"));
                return;
        }

        // Spawn killer species VFX at killer location
        if (CurrentKillData.KillerSpecies != EKhaaosSpecies::NONE)
        {
                TArray<FName> KillerVFXNames = VFXRegistry->GetSpeciesVFXNames(CurrentKillData.KillerSpecies);
                if (KillerVFXNames.Num() > 0)
                {
                        UNiagaraComponent* KillerVFX = VFXRegistry->SpawnSpeciesVFXAtLocation(
                                CurrentKillData.KillerSpecies,
                                KillerVFXNames[0], // Primary VFX
                                CurrentKillData.KillerLocation
                        );
                        if (KillerVFX)
                        {
                                SpawnedSpeciesVFX.Add(KillerVFX);
                        }
                }
        }

        // Spawn victim species VFX at victim location
        if (CurrentKillData.VictimSpecies != EKhaaosSpecies::NONE)
        {
                TArray<FName> VictimVFXNames = VFXRegistry->GetSpeciesVFXNames(CurrentKillData.VictimSpecies);
                if (VictimVFXNames.Num() > 0)
                {
                        UNiagaraComponent* VictimVFX = VFXRegistry->SpawnSpeciesVFXAtLocation(
                                CurrentKillData.VictimSpecies,
                                VictimVFXNames[0], // Primary VFX
                                CurrentKillData.VictimLocation
                        );
                        if (VictimVFX)
                        {
                                SpawnedSpeciesVFX.Add(VictimVFX);
                        }
                }
        }

        UE_LOG(LogKhaaosKillCam, Log, TEXT("Spawned %d species VFX for kill cam reveal"), SpawnedSpeciesVFX.Num());
}

void UKhaaosKillCamComponent::CleanupSpeciesVFX()
{
        for (UNiagaraComponent* VFX : SpawnedSpeciesVFX)
        {
                if (VFX && VFX->IsActive())
                {
                        VFX->Deactivate();
                }
        }
        SpawnedSpeciesVFX.Empty();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

FKhaaosKillCamConfig UKhaaosKillCamComponent::ResolveConfig(EKillCamMode Mode) const
{
        const FKhaaosKillCamConfig* ModeConfig = ModeConfigs.Find(Mode);
        if (ModeConfig)
        {
                return *ModeConfig;
        }
        FKhaaosKillCamConfig Config = DefaultConfig;
        Config.Mode = Mode;
        return Config;
}
