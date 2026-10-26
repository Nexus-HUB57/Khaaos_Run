// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "NiagaraComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosKillCamComponent.generated.h"

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Kill cam playback mode. */
UENUM(BlueprintType)
enum class EKillCamMode : uint8
{
        /** Third-person orbit around the killed operative. */
        Orbit           UMETA(DisplayName = "Orbit"),
        /** Slow-motion fly-by from killer to victim. */
        FlyBy           UMETA(DisplayName = "FlyBy"),
        /** Close-up of the final hit with species VFX highlight. */
        SpeciesCloseUp  UMETA(DisplayName = "SpeciesCloseUp"),
        /** Cinematic dolly with depth-of-field. */
        CinematicDolly  UMETA(DisplayName = "CinematicDolly")
};

/** Kill cam state machine. */
UENUM(BlueprintType)
enum class EKillCamState : uint8
{
        Idle            UMETA(DisplayName = "Idle"),
        PreRoll         UMETA(DisplayName = "PreRoll"),
        Playback        UMETA(DisplayName = "Playback"),
        SlowMo          UMETA(DisplayName = "SlowMo"),
        SpeciesReveal   UMETA(DisplayName = "SpeciesReveal"),
        FadeOut         UMETA(DisplayName = "FadeOut"),
        Finished        UMETA(DisplayName = "Finished")
};

// ─── Structs ──────────────────────────────────────────────────────────────────

/** Configuration for a single kill cam sequence. */
USTRUCT(BlueprintType)
struct FKhaaosKillCamConfig
{
        GENERATED_BODY()

        /** Camera mode for this kill cam. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        EKillCamMode Mode = EKillCamMode::Orbit;

        /** Total playback duration (seconds). */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float Duration = 3.0f;

        /** Slow-motion time scale (1.0 = normal, 0.25 = quarter speed). */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float SlowMoTimeScale = 0.3f;

        /** Duration of the slow-motion segment (seconds). */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float SlowMoDuration = 1.0f;

        /** Orbit radius for Orbit mode (cm). */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float OrbitRadius = 300.0f;

        /** Orbit speed (degrees per second). */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float OrbitSpeed = 90.0f;

        /** Field of view during kill cam. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float FOV = 70.0f;

        /** Depth-of-field aperture for cinematic modes. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float DOFAperture = 2.8f;

        /** Whether to highlight the species VFX during SpeciesCloseUp. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        bool bShowSpeciesVFX = true;

        /** Fade-out duration at the end (seconds). */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KillCam")
        float FadeOutDuration = 0.5f;
};

/** Data captured at the moment of a kill for kill cam playback. */
USTRUCT(BlueprintType)
struct FKhaaosKillCamData
{
        GENERATED_BODY()

        /** Killer's location at time of kill. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        FVector KillerLocation = FVector::ZeroVector;

        /** Victim's location at time of kill. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        FVector VictimLocation = FVector::ZeroVector;

        /** Killer's rotation at time of kill. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        FRotator KillerRotation = FRotator::ZeroRotator;

        /** Victim's rotation at time of kill. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        FRotator VictimRotation = FRotator::ZeroRotator;

        /** Killer's species. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        EKhaaosSpecies KillerSpecies = EKhaaosSpecies::NONE;

        /** Victim's species. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        EKhaaosSpecies VictimSpecies = EKhaaosSpecies::NONE;

        /** Damage amount of the killing blow. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        float KillingBlowDamage = 0.0f;

        /** Timestamp of the kill (world time seconds). */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        float KillTimestamp = 0.0f;

        /** Whether the kill was a headshot. */
        UPROPERTY(BlueprintReadOnly, Category = "KillCam")
        bool bWasHeadshot = false;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a kill cam starts. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnKillCamStarted, EKillCamMode, Mode, EKhaaosSpecies, KillerSpecies, EKhaaosSpecies, VictimSpecies);

/** Broadcast when a kill cam finishes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKillCamFinished, EKillCamMode, Mode);

/**
 * UKhaaosKillCamComponent
 *
 * Kill Cam component attached to the game mode or spectator system.
 * When a kill event fires, this component:
 *   1. Captures FKhaaosKillCamData (positions, species, damage)
 *   2. Transitions the spectator camera to the kill cam viewpoint
 *   3. Applies slow-motion time dilation for the dramatic moment
 *   4. Highlights species-specific VFX on the killer/victim
 *   5. Fades out and returns to normal spectator view
 *
 * Modes:
 *   Orbit         - Classic FreeFire-style orbit around the downed operative
 *   FlyBy         - Camera flies from killer position to victim
 *   SpeciesCloseUp- Close-up showing the species VFX (e.g. Huran RegenGlow, Khael CryoShield)
 *   CinematicDolly- Film-quality dolly with depth-of-field
 *
 * Usage:
 *   KillCamComponent->TriggerKillCam(KillData, EKillCamMode::SpeciesCloseUp);
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosKillCamComponent : public UActorComponent
{
        GENERATED_BODY()

public:
        UKhaaosKillCamComponent();

        // ─── Kill Cam Trigger ─────────────────────────────────────────────────

        /**
         * Trigger a kill cam sequence with captured kill data.
         * @param KillData   Data captured at the moment of kill.
         * @param Mode       Camera mode to use.
         * @param OverrideConfig  Optional config override (nullptr = use defaults).
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|KillCam")
        void TriggerKillCam(
                const FKhaaosKillCamData& KillData,
                EKillCamMode Mode = EKillCamMode::Orbit,
                const FKhaaosKillCamConfig* OverrideConfig = nullptr
        );

        /**
         * Cancel an active kill cam and return to normal view.
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|KillCam")
        void CancelKillCam();

        // ─── State Query ──────────────────────────────────────────────────────

        /** Get the current kill cam state. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|KillCam")
        EKillCamState GetKillCamState() const { return CurrentState; }

        /** Check if a kill cam is currently active. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|KillCam")
        bool IsKillCamActive() const { return CurrentState != EKillCamState::Idle && CurrentState != EKillCamState::Finished; }

        /** Get the current kill cam data. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|KillCam")
        const FKhaaosKillCamData& GetCurrentKillData() const { return CurrentKillData; }

        /** Get the elapsed playback time. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|KillCam")
        float GetElapsedPlaybackTime() const { return ElapsedTime; }

        // ─── Configuration ────────────────────────────────────────────────────

        /** Default kill cam configuration. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|KillCam")
        FKhaaosKillCamConfig DefaultConfig;

        /** Per-mode configuration overrides. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|KillCam")
        TMap<EKillCamMode, FKhaaosKillCamConfig> ModeConfigs;

        /** Global time dilation applied during slow-motion. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|KillCam")
        float GlobalSlowMoDilation = 0.3f;

        /** Whether to spawn species VFX during SpeciesCloseUp mode. */
        UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|KillCam")
        bool bSpawnSpeciesVFXOnReveal = true;

        // ─── Camera References ────────────────────────────────────────────────

        /** Spring arm for the kill cam camera. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillCam|Camera")
        TObjectPtr<USpringArmComponent> KillCamSpringArm;

        /** Camera component for the kill cam. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillCam|Camera")
        TObjectPtr<UCameraComponent> KillCamCamera;

        // ─── Delegates ────────────────────────────────────────────────────────

        /** Broadcast when a kill cam starts. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|KillCam")
        FOnKillCamStarted OnKillCamStarted;

        /** Broadcast when a kill cam finishes. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|KillCam")
        FOnKillCamFinished OnKillCamFinished;

protected:

        virtual void BeginPlay() override;
        virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:

        // ─── State Machine ────────────────────────────────────────────────────

        /** Current kill cam state. */
        UPROPERTY()
        EKillCamState CurrentState = EKillCamState::Idle;

        /** Active kill cam mode. */
        UPROPERTY()
        EKillCamMode ActiveMode = EKillCamMode::Orbit;

        /** Data for the current kill cam. */
        UPROPERTY()
        FKhaaosKillCamData CurrentKillData;

        /** Active config for the current kill cam. */
        FKhaaosKillCamConfig ActiveConfig;

        /** Elapsed playback time. */
        UPROPERTY()
        float ElapsedTime = 0.0f;

        /** Current orbit angle (for Orbit mode). */
        UPROPERTY()
        float OrbitAngle = 0.0f;

        /** Saved time dilation to restore after slow-mo. */
        UPROPERTY()
        float SavedTimeDilation = 1.0f;

        /** Species VFX spawned during SpeciesCloseUp (for cleanup). */
        UPROPERTY()
        TArray<TObjectPtr<UNiagaraComponent>> SpawnedSpeciesVFX;

        // ─── State Machine Transitions ────────────────────────────────────────

        /** Transition to a new kill cam state. */
        void TransitionToState(EKillCamState NewState);

        /** Handle the PreRoll state (brief pause before playback). */
        void TickPreRoll(float DeltaTime);

        /** Handle the Playback state (main camera movement). */
        void TickPlayback(float DeltaTime);

        /** Handle the SlowMo state (time dilation + dramatic pause). */
        void TickSlowMo(float DeltaTime);

        /** Handle the SpeciesReveal state (VFX highlight). */
        void TickSpeciesReveal(float DeltaTime);

        /** Handle the FadeOut state (transition back). */
        void TickFadeOut(float DeltaTime);

        // ─── Camera Update ────────────────────────────────────────────────────

        /** Update camera position for Orbit mode. */
        void UpdateOrbitCamera(float DeltaTime);

        /** Update camera position for FlyBy mode. */
        void UpdateFlyByCamera(float DeltaTime);

        /** Update camera position for SpeciesCloseUp mode. */
        void UpdateSpeciesCloseUpCamera(float DeltaTime);

        /** Update camera position for CinematicDolly mode. */
        void UpdateCinematicDollyCamera(float DeltaTime);

        // ─── Time Dilation ────────────────────────────────────────────────────

        /** Apply slow-motion time dilation. */
        void ApplySlowMotion();

        /** Restore normal time dilation. */
        void RestoreTimeDilation();

        // ─── Species VFX ──────────────────────────────────────────────────────

        /** Spawn species VFX for the killer/victim during reveal. */
        void SpawnSpeciesRevealVFX();

        /** Clean up spawned species VFX. */
        void CleanupSpeciesVFX();

        // ─── Helpers ──────────────────────────────────────────────────────────

        /** Resolve the config for a given mode. */
        FKhaaosKillCamConfig ResolveConfig(EKillCamMode Mode) const;
};
