// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "Game/Animation/KhaaosLocomotionCore.h"
#include "KhaaosNaturalLocomotionComponent.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

/**
 * Broadcast exactly when the procedural stride crosses a foot plant.
 * bLeftFoot=true for the left foot. The FootstepSystem binds to this so
 * audio/VFX fire in sync with the on-screen feet instead of on arbitrary
 * animation notifies.
 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnFootstepPhase, bool, bLeftFoot);

/**
 * UKhaaosNaturalLocomotionComponent
 *
 * The UE5 bridge of the natural locomotion system. Every character that
 * wears this component stops moving like a marionette:
 *
 *   - Locomotion parameters (speed/direction) delivered to the Anim Graph
 *     are critically damped — no blend-space parameter jumps.
 *   - Acceleration-driven body lean (roll/pitch) with a touch of spring
 *     overshoot — the body reacts to starts, stops and strafes.
 *   - Procedural stride phase with alternating foot-plant events that
 *     scale with real speed (footsteps match the feet).
 *   - Landing absorption spring (knees take the impact, then recover).
 *   - Eased, hysteresis-guarded turn-in-place (root yaw follows the
 *     camera smoothly when stationary instead of snapping).
 *   - Deterministic breathing + organic noise (idle is alive).
 *   - Smoothed, clamped head look-at.
 *   - Per-foot IK offsets from real line traces (uneven terrain).
 *   - Extra exponential smoothing for simulated proxies.
 *
 * The Anim Graph (KhaaosPlayerAnimInstance / KhaaosSpeciesAnimInstance)
 * reads the BlueprintReadOnly outputs every frame. The math lives in
 * KhaaosLocomotionCore (pure C++, unit-tested in CI); this component only
 * samples engine state, traces feet, and routes events.
 *
 * Tick group: TG_PrePhysics (samples are stable within the frame).
 * LOD: beyond AnimLODFarDistanceCm the component self-throttles (the
 *     spring state keeps integrating, traces stop) to protect the
 *     100-player BR frame budget.
 */
UCLASS(ClassGroup = (Khaaos, Animation), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosNaturalLocomotionComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosNaturalLocomotionComponent();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    // ─── Setup ───────────────────────────────────────────────────────────

    /**
     * Apply a species locomotion profile (lean authority, stride length,
     * breathing rate). Safe to call again at runtime (species swap).
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Natural")
    void ApplySpeciesProfile(EKhaaosSpecies Species);

    /** Per-character organic noise seed (default: derived from owner name). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Natural")
    void SetNoiseSeed(int32 Seed);

    // ─── Runtime overrides (systems can inject state) ────────────────────

    /** Force a landing impulse (montage-driven landings, vehicles). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Natural")
    void NotifyLanding(float LandingSpeed);

    /** Kick the tail/wings/crystal secondary motion (gameplay events). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Natural")
    void NotifyImpulse(float LateralAccel, float ForwardAccel);

    // ─── Anim Graph outputs (read every frame by the AnimInstances) ──────

    /** Smoothed speed (uu/s). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float SmoothedSpeed = 0.0f;

    /** Smoothed movement direction relative to facing (deg). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float SmoothedDirectionDeg = 0.0f;

    /** 1 = moving, 0 = fully stopped (eased). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float StopEase = 1.0f;

    /** Body roll lean (deg, + = right). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float LeanRollDeg = 0.0f;

    /** Body pitch lean (deg, + = forward). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float LeanPitchDeg = 0.0f;

    /** Procedural stride phase (0..1, one full L+R cycle). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float StridePhase = 0.0f;

    /** Landing absorption spring value (approx -1..1). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float LandRecovery = 0.0f;

    /** True while an eased root turn is in progress. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    bool bTurningInPlace = false;

    /** Pending turn yaw offset (deg) for the Anim Graph's turn node. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float TurnYawOffsetDeg = 0.0f;

    /** Head look yaw (deg). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float HeadLookYawDeg = 0.0f;

    /** Head look pitch (deg). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float HeadLookPitchDeg = 0.0f;

    /** Breathing output (approx -1..1) — idle chest/spine additive. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float Breath = 0.0f;

    /** Left foot IK: vertical offset (cm) and roll tilt (deg). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float FootOffsetLeftCm = 0.0f;

    /** Right foot IK: vertical offset (cm). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float FootOffsetRightCm = 0.0f;

    /** Left foot tilt (deg). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float FootTiltLeftDeg = 0.0f;

    /** Right foot tilt (deg). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float FootTiltRightDeg = 0.0f;

    /** Network-smoothed speed for simulated proxies. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float NetworkSmoothedSpeed = 0.0f;

    // ─── Footstep sync ───────────────────────────────────────────────────

    /** Fires on every procedural foot plant (alternating feet). */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Anim|Natural")
    FOnFootstepPhase OnFootstepPhase;

    // ─── Tuning exposed for designers ────────────────────────────────────

    /** Master enable. When off, outputs freeze (emergency hatch). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    bool bEnabled = true;

    /** Enable foot IK line traces (disable on ultra-low LOD). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    bool bEnableFootIK = true;

    /** Beyond this distance (cm) from the local viewer, traces stop. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    float AnimLODFarDistanceCm = 5000.0f;

    /** Foot bone sockets for the IK traces. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    FName FootLeftSocket = TEXT("foot_l");

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
    FName FootRightSocket = TEXT("foot_r");

    /** Access the full core state (for advanced Anim Graph nodes). */
    const KhaaosLoco::FKhaaosLocomotionState& GetCoreState() const { return Core; }
    const KhaaosLoco::FKhaaosLocomotionConfig& GetCoreConfig() const { return Config; }

private:
    /** Sample engine state into the core input struct. */
    void SampleEngineState(float DeltaTime, KhaaosLoco::FKhaaosLocomotionInput& In);

    /** Trace the ground under one foot; returns height delta (cm) and tilt (deg). */
    void TraceFoot(const FName& SocketName, float& OutGroundDeltaCm, float& OutTiltDeg);

    /** Publish core state to the BlueprintReadOnly mirror properties. */
    void PublishOutputs();

    /** Detect lateral/forward acceleration from velocity change. */
    void ComputeAcceleration(float DeltaTime, float& OutLateral, float& OutForward);

    /** Landing edge detection + landing speed capture. */
    bool DetectLanding(float& OutLandingSpeed);

    KhaaosLoco::FKhaaosLocomotionConfig Config;
    KhaaosLoco::FKhaaosLocomotionState Core;

    /** Cached owner (ACharacter). */
    TWeakObjectPtr<class ACharacter> CachedCharacter;

    /** Previous frame velocity (world) for acceleration estimation. */
    FVector PrevVelocity = FVector::ZeroVector;
    bool bPrevFalling = false;
    float FallingSpeedPeak = 0.0f;

    /** Whether the species profile has been applied. */
    bool bProfileApplied = false;
};
