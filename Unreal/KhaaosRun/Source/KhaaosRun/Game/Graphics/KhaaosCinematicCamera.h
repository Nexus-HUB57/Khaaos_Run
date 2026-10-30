// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameFramework/PlayerCameraManager.h"
#include "KhaaosCinematicCamera.generated.h"

// ─── Camera Mode Enumeration ──────────────────────────────────────────────────

/**
 * EKhaaosCameraMode — All camera modes supported by the cinematic camera system.
 * Covers gameplay, kill cam, spectator variants, cinematic sequences, and death camera.
 */
UENUM(BlueprintType)
enum class EKhaaosCameraMode : uint8
{
    GAMEPLAY                     UMETA(DisplayName = "Gameplay"),
    KILLCAM_REPLAY               UMETA(DisplayName = "Kill Cam Replay"),
    SPECTATOR_FREECAM            UMETA(DisplayName = "Spectator Free Cam"),
    SPECTATOR_FOLLOW             UMETA(DisplayName = "Spectator Follow"),
    SPECTATOR_OVERHEAD           UMETA(DisplayName = "Spectator Overhead"),
    SPECTATOR_RING               UMETA(DisplayName = "Spectator Ring"),
    CINEMATIC_WORLD_TRANSITION   UMETA(DisplayName = "Cinematic World Transition"),
    CINEMATIC_INTRO              UMETA(DisplayName = "Cinematic Intro"),
    CINEMATIC_VICTORY            UMETA(DisplayName = "Cinematic Victory"),
    DEATH_CAMERA                 UMETA(DisplayName = "Death Camera")
};

// ─── Kill Cam Data ────────────────────────────────────────────────────────────

/**
 * FKhaaosKillCamData — Data payload for a kill cam replay event.
 */
USTRUCT(BlueprintType)
struct FKhaaosKillCamData
{
    GENERATED_BODY()

    /** World location of the killer at the moment of the kill. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|KillCam")
    FVector KillerLocation = FVector::ZeroVector;

    /** World location of the victim at the moment of the kill. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|KillCam")
    FVector VictimLocation = FVector::ZeroVector;

    /** Weapon type used for the kill (FName for fast comparison). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|KillCam")
    FName WeaponType;

    /** Distance between killer and victim at time of kill. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|KillCam")
    float KillDistance = 0.0f;

    /** Timestamp (world time seconds) when the kill occurred. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|KillCam")
    float KillTimestamp = 0.0f;
};

// ─── Camera Shake Configuration ───────────────────────────────────────────────

/**
 * FKhaaosCameraShakeConfig — Configuration for procedural camera shake.
 * Uses sinusoidal oscillation with per-axis control and exponential decay.
 */
USTRUCT(BlueprintType)
struct FKhaaosCameraShakeConfig
{
    GENERATED_BODY()

    /** Overall shake intensity scale. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CameraShake")
    float ShakeScale = 1.0f;

    /** Time (seconds) for the shake amplitude to decay to near-zero. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CameraShake")
    float DecayTime = 0.5f;

    /** Oscillation amplitude on the X (right) axis. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CameraShake")
    float OscillationX = 1.0f;

    /** Oscillation amplitude on the Y (up) axis. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CameraShake")
    float OscillationY = 0.5f;

    /** Oscillation amplitude on the Z (forward) axis. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CameraShake")
    float OscillationZ = 0.3f;
};

// ─── Delegate Declarations ────────────────────────────────────────────────────

/** Delegate for camera mode changes: (OldMode, NewMode). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnCameraModeChanged, EKhaaosCameraMode, OldMode, EKhaaosCameraMode, NewMode);

/** Delegate broadcast when a kill cam replay finishes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnKillCamFinished);

/** Delegate broadcast when a world transition cinematic finishes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnTransitionCinematicFinished);

/** Delegate broadcast when the death camera sequence finishes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnDeathCameraFinished);

// ─── Cinematic Camera Component ───────────────────────────────────────────────

/**
 * UKhaaosCinematicCamera — Cinematic camera system for Khaaos Run.
 *
 * Provides kill cam replay with slow-motion, multiple spectator camera modes
 * (free cam, follow, overhead, ring center), world transition cinematic sequences,
 * procedural camera shake, FOV override, and death camera zoom-out sequences.
 *
 * This is a critical FreeFire-level feature: every elimination triggers a polished
 * kill cam, spectators get full camera control, and world transitions play out as
 * cinematic sequences with time dilation and FOV shifts.
 */
UCLASS(ClassGroup=(Khaaos, Camera), meta=(BlueprintSpawnableComponent))
class UKhaaosCinematicCamera : public UActorComponent
{
    GENERATED_BODY()

public:
    // ─── Construction & Lifecycle ────────────────────────────────────────────

    UKhaaosCinematicCamera();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    // ─── Camera Mode Management ──────────────────────────────────────────────

    /** Switch the camera to a new mode. Applies mode-specific time scale and FOV. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void SetCameraMode(EKhaaosCameraMode Mode);

    /** Get the current active camera mode. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CinematicCamera")
    EKhaaosCameraMode GetCurrentCameraMode() const;

    /** Get the previous camera mode (before the last switch). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CinematicCamera")
    EKhaaosCameraMode GetPreviousCameraMode() const;

    /** Restore the gameplay camera (normal third-person). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void ReturnToGameplay();

    // ─── Kill Cam System ─────────────────────────────────────────────────────

    /** Begin a kill cam replay with the given kill data. Runs for KillCamDuration at KillCamTimeScale speed. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void StartKillCam(const FKhaaosKillCamData& Data);

    /** Whether a kill cam replay is currently active. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CinematicCamera")
    bool IsKillCamActive() const;

    /** Remaining time (seconds) in the current kill cam replay. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CinematicCamera")
    float GetKillCamRemainingTime() const;

    /** Duration of kill cam replay in seconds. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|CinematicCamera|KillCam")
    float KillCamDuration = 3.0f;

    /** Time scale during kill cam (0.25 = quarter speed slow-motion). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|CinematicCamera|KillCam")
    float KillCamTimeScale = 0.25f;

    // ─── Spectator Camera ────────────────────────────────────────────────────

    /** Set the actor to follow in spectator follow mode. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void SetSpectatorTarget(AActor* Target);

    /** Get the current spectator follow target. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CinematicCamera")
    AActor* GetSpectatorTarget() const;

    /** Set the camera offset from the spectator target. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void SetSpectatorOffset(const FVector& Offset);

    /** Cycle to the next valid player in spectator follow mode. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void CycleSpectatorTarget();

    /** Camera interpolation speed when following a spectator target. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CinematicCamera|Spectator")
    float SpectatorLerpSpeed = 5.0f;

    // ─── World Transition Cinematic ──────────────────────────────────────────

    /** Trigger a world transition cinematic sequence (5 seconds). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void PlayWorldTransitionCinematic(FName FromWorld, FName ToWorld);

    /** Whether a world transition cinematic is currently playing. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CinematicCamera")
    bool IsTransitionCinematicActive() const;

    // ─── Camera Shake ────────────────────────────────────────────────────────

    /** Apply a procedural camera shake with the given configuration. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void TriggerCameraShake(const FKhaaosCameraShakeConfig& Config);

    /** Stop any active camera shake. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void StopCameraShake();

    // ─── Camera Effects ──────────────────────────────────────────────────────

    /** Override the field of view. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void SetFOV(float FOV);

    /** Reset FOV to the default value. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void ResetFOV();

    /** Default field of view for gameplay mode. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|CinematicCamera")
    float DefaultFOV = 90.0f;

    /** Current field of view (may differ from default during cinematic modes). */
    UPROPERTY(BlueprintReadOnly, Category = "Khaaos|CinematicCamera")
    float CurrentFOV = 90.0f;

    // ─── Death Camera ────────────────────────────────────────────────────────

    /** Start the death camera zoom-out sequence. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CinematicCamera")
    void StartDeathCamera(FVector DeathLocation, FVector KillerLocation);

    // ─── Delegates ───────────────────────────────────────────────────────────

    /** Broadcast when the camera mode changes (OldMode, NewMode). */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|CinematicCamera")
    FOnCameraModeChanged OnCameraModeChanged;

    /** Broadcast when a kill cam replay finishes. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|CinematicCamera")
    FOnKillCamFinished OnKillCamFinished;

    /** Broadcast when a world transition cinematic finishes. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|CinematicCamera")
    FOnTransitionCinematicFinished OnTransitionCinematicFinished;

    /** Broadcast when the death camera sequence finishes. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|CinematicCamera")
    FOnDeathCameraFinished OnDeathCameraFinished;

private:
    // ─── Internal State ──────────────────────────────────────────────────────

    /** Current active camera mode. */
    UPROPERTY()
    EKhaaosCameraMode CurrentMode = EKhaaosCameraMode::GAMEPLAY;

    /** Previous camera mode (before last switch). */
    UPROPERTY()
    EKhaaosCameraMode PreviousMode = EKhaaosCameraMode::GAMEPLAY;

    // ─── Kill Cam State ──────────────────────────────────────────────────────

    /** Whether a kill cam replay is currently running. */
    UPROPERTY()
    bool bKillCamActive = false;

    /** World time when the current kill cam started. */
    UPROPERTY()
    float KillCamStartTime = 0.0f;

    /** Kill data for the current kill cam replay. */
    UPROPERTY()
    FKhaaosKillCamData KillCamData;

    // ─── Spectator State ─────────────────────────────────────────────────────

    /** Weak reference to the spectator follow target actor. */
    UPROPERTY()
    TWeakObjectPtr<AActor> SpectatorTarget;

    /** Camera offset from the spectator target. */
    UPROPERTY()
    FVector SpectatorOffset = FVector::ZeroVector;

    // ─── World Transition State ──────────────────────────────────────────────

    /** Whether a world transition cinematic is currently playing. */
    UPROPERTY()
    bool bTransitionCinematicActive = false;

    /** World time when the current transition cinematic started. */
    UPROPERTY()
    float TransitionStartTime = 0.0f;

    /** Duration of world transition cinematic in seconds. */
    UPROPERTY()
    float TransitionCinematicDuration = 5.0f;

    /** Source world name for the current transition. */
    UPROPERTY()
    FName TransitionFromWorld;

    /** Destination world name for the current transition. */
    UPROPERTY()
    FName TransitionToWorld;

    // ─── Death Camera State ──────────────────────────────────────────────────

    /** Whether the death camera sequence is currently running. */
    UPROPERTY()
    bool bDeathCameraActive = false;

    /** World time when the death camera sequence started. */
    UPROPERTY()
    float DeathCameraStartTime = 0.0f;

    /** Duration of the death camera sequence in seconds. */
    UPROPERTY(EditDefaultsOnly, Category = "Khaaos|CinematicCamera")
    float DeathCameraDuration = 2.0f;

    /** Location where the player died. */
    UPROPERTY()
    FVector DeathLocation = FVector::ZeroVector;

    /** Location of the killer (for death camera framing). */
    UPROPERTY()
    FVector KillerLocation = FVector::ZeroVector;

    // ─── Camera Shake State ──────────────────────────────────────────────────

    /** Whether a camera shake is currently active. */
    UPROPERTY()
    bool bCameraShakeActive = false;

    /** Current camera shake configuration. */
    UPROPERTY()
    FKhaaosCameraShakeConfig CameraShakeConfig;

    /** World time when the current camera shake started. */
    UPROPERTY()
    float CameraShakeStartTime = 0.0f;

    // ─── Cached Camera Manager ───────────────────────────────────────────────

    /** Weak reference to the owning player's camera manager. */
    UPROPERTY()
    TWeakObjectPtr<APlayerCameraManager> CachedCameraManager;

    // ─── Internal Methods ────────────────────────────────────────────────────

    /** Resolve the player camera manager (cached or re-acquired). */
    APlayerCameraManager* ResolveCameraManager();

    /** Update kill cam replay each tick. */
    void UpdateKillCam(float DeltaTime);

    /** Update spectator camera interpolation each tick. */
    void UpdateSpectatorCamera(float DeltaTime);

    /** Update death camera sequence each tick. */
    void UpdateDeathCamera(float DeltaTime);

    /** Update procedural camera shake each tick. */
    void UpdateCameraShake(float DeltaTime);

    /** Apply a custom time scale to the owning pawn's custom time dilation. */
    void ApplyTimeScale(float Scale);
};
