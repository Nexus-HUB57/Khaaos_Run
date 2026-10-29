// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
//
// KhaaosLocomotionCore — deterministic natural-locomotion math kernel.
//
// PURPOSE
//   This is the pure-math heart of the Khaaos natural movement system.
//   It has ZERO Unreal Engine dependencies (plain C++20) so it can be
//   unit-tested standalone with g++/clang++ in CI (see
//   tests/ue5/natural_locomotion_test.cpp) exactly like the CIGKV world
//   rule kernels. UE-facing code (KhaaosNaturalLocomotionComponent,
//   KhaaosPlayerAnimInstance, KhaaosSpeciesAnimInstance) feeds real
//   engine values into Step() every frame and consumes the smoothed,
//   spring-driven outputs to drive the Anim Graph.
//
// WHY THIS EXISTS (anti-robotization contract)
//   Robotic avatar motion is caused by: instant parameter jumps into
//   blend spaces, zero secondary motion (no lean / no breathing / no
//   look-at), abrupt landings, instant foot IK, no procedural stride
//   phase for audio sync, and perfectly uniform bot locomotion. Every
//   function below attacks one of those failure modes:
//
//     SmoothFloat / SmoothAngleDeg  — frame-rate independent critically
//                                     damped smoothing (no parameter
//                                     jumps, shortest-path angles).
//     UpdateLean                    — acceleration-driven body lean
//                                     (roll from lateral accel, pitch
//                                     from forward accel/braking).
//     UpdateStridePhase             — continuous stride phase 0..1 with
//                                     alternating foot events synced to
//                                     real speed (footsteps that match
//                                     the feet on screen).
//     UpdateLandRecovery            — underdamped spring impulse on
//                                     landing (knees absorb impact).
//     UpdateTurnInPlace             — hysteresis turn-in-place with
//                                     eased yaw offset instead of a
//                                     boolean flick.
//     UpdateBreath                  — deterministic breathing + organic
//                                     noise wobble for idle life.
//     UpdateHeadLook                — clamped, smoothed head/spine look.
//     UpdateFootIK                  — critically damped per-foot spring
//                                     for height offset & tilt.
//     UpdateNetworkSmoothing        — exponential smoothing for simulated
//                                     proxies (kills teleport jitter).
//     UpdateStopEase                — eased "time to full stop" so stop
//                                     animations can be distance-matched.
//
// DETERMINISM
//   All code is deterministic given the same input stream. The organic
//   noise (PerlinLike) is a PCG-hashed value noise — no libm trig or
//   platform-dependent floating point paths are used for noise. sin()
//   is only used for the breathing carrier wave where cross-platform
//   bit-exactness is not required.
//
// THREAD SAFETY
//   Step() operates on caller-owned state. Each character owns one
//   FKhaaosLocomotionState; never share across threads.

#pragma once

#include <cstdint>

namespace KhaaosLoco
{
    // ─── Tuning Configuration ─────────────────────────────────────────────

    /**
     * FKhaaosLocomotionConfig
     * Per-species / per-character tuning. Defaults are tuned for a
     * ~180cm human-proportioned operative at Free Fire parity speeds
     * (walk 600, sprint 900, crouch 300, slide 1200 uu/s).
     */
    struct FKhaaosLocomotionConfig
    {
        // ── Parameter smoothing ──
        /** Critically damped rate for speed (higher = snappier, but keep < 12 to preserve blend organicity). */
        float SpeedSmoothing = 8.0f;
        /** Critically damped rate for movement direction (deg). */
        float DirectionSmoothing = 10.0f;

        // ── Lean (secondary motion) ──
        /** Max body roll from lateral acceleration (deg). */
        float LeanRollMaxDeg = 10.0f;
        /** Max body pitch from forward acceleration / braking (deg). */
        float LeanPitchMaxDeg = 7.0f;
        /** Lateral acceleration (uu/s^2) mapped to max roll. */
        float LeanAccelFullRoll = 2200.0f;
        /** Critically damped rate for lean. */
        float LeanSmoothing = 6.0f;

        // ── Stride phase ──
        /** Full stride cycle length (cm) at StrideSpeedRef. */
        float StrideLengthCm = 160.0f;
        /** Speed where stride length equals StrideLengthCm (uu/s). */
        float StrideSpeedRef = 300.0f;
        /** Min stride length scale (crouch/very slow). */
        float StrideMinScale = 0.6f;
        /** Max stride length scale (sprint). */
        float StrideMaxScale = 1.7f;
        /** Below this speed the stride phase freezes (idle). */
        float StrideMinSpeed = 15.0f;

        // ── Land recovery (knee absorption) ──
        /** Spring stiffness of landing recovery. */
        float LandStiffness = 90.0f;
        /** Spring damping (0..1 fraction of critical). 0.45 = visible recoil. */
        float LandDampingRatio = 0.45f;
        /** Landing velocity (uu/s downward) that saturates the impulse. */
        float LandVelocitySaturation = 900.0f;
        /** Impulse magnitude at saturation. */
        float LandImpulseMax = 1.4f;

        // ── Turn in place ──
        /** Residual aim yaw that starts a turn-in-place (deg). */
        float TurnInPlaceStartDeg = 70.0f;
        /** Residual yaw below which the turn ends (hysteresis, deg). */
        float TurnInPlaceEndDeg = 25.0f;
        /** Eased rotation rate of the root yaw toward camera while turning (deg/s at full residual). */
        float TurnInPlaceRate = 220.0f;

        // ── Idle breathing / organic noise ──
        /** Breathing carrier frequency at rest (Hz). */
        float BreathFrequencyHz = 0.22f;
        /** Breathing amplitude (fraction, drives additive chest/spine anim). */
        float BreathAmplitude = 1.0f;
        /** Noise seed for organic wobble (per-character). */
        uint32_t NoiseSeed = 0x4b485253u; // "KHRS"

        // ── Head look-at ──
        /** Critically damped rate for head look. */
        float HeadLookSmoothing = 6.0f;
        /** Max head yaw offset (deg) before spine/actor takes over. */
        float HeadLookMaxYawDeg = 75.0f;
        /** Max head pitch offset (deg). */
        float HeadLookMaxPitchDeg = 40.0f;

        // ── Foot IK ──
        /** Spring stiffness per foot (height). */
        float FootStiffness = 140.0f;
        /** Spring damping per foot (direct coefficient). */
        float FootDamping = 16.0f;
        /** Max foot height offset (cm). */
        float FootMaxOffsetCm = 35.0f;
        /** Max foot tilt (deg). */
        float FootMaxTiltDeg = 25.0f;

        // ── Network smoothing (simulated proxies) ──
        /** Exponential smoothing rate for replicated speed. */
        float NetworkSmoothingRate = 12.0f;

        // ── Stop ease ──
        /** Ease time to reach full-stop visual state (s). */
        float StopEaseTime = 0.22f;
    };

    // ─── Per-foot spring state ────────────────────────────────────────────

    struct FKhaaosFootState
    {
        /** Vertical offset applied to the foot bone (cm, + = raised). */
        float HeightOffsetCm = 0.0f;
        /** Spring velocity for height. */
        float HeightVelocity = 0.0f;
        /** Roll tilt applied to the foot bone (deg). */
        float TiltDeg = 0.0f;
        /** Spring velocity for tilt. */
        float TiltVelocity = 0.0f;
    };

    // ─── Persistent locomotion state ──────────────────────────────────────

    /**
     * FKhaaosLocomotionState
     * All smoothed/procedural outputs of one character's locomotion.
     * Owned by the UE component; advanced one step per frame via Step().
     */
    struct FKhaaosLocomotionState
    {
        // ── Locomotion parameters (Anim Graph inputs) ──
        /** Smoothed speed (uu/s). */
        float SmoothedSpeed = 0.0f;
        /** Smoothed movement direction relative to facing (deg, -180..180). */
        float SmoothedDirectionDeg = 0.0f;
        /** Eased stop factor: 1 = moving, 0 = fully stopped. */
        float StopEase = 1.0f;

        // ── Secondary motion ──
        /** Body roll lean (deg, + = leaning right). */
        float LeanRollDeg = 0.0f;
        /** Body pitch lean (deg, + = leaning forward). */
        float LeanPitchDeg = 0.0f;

        // ── Stride / footsteps ──
        /** Continuous stride phase (wraps at 1.0 = one full L+R cycle). */
        float StridePhase = 0.0f;
        /** Unwrapped stride phase (total cycles since spawn; drives plant counting). */
        float StridePhaseUnwrapped = 0.0f;
        /** Last emitted foot event (0 none, 1 left, 2 right). */
        int32_t LastFootEvent = 0;

        // ── Landing ──
        /** Spring value of land recovery (approx -1..1, blends land anims). */
        float LandRecovery = 0.0f;
        float LandRecoveryVelocity = 0.0f;

        // ── Turn in place ──
        /** True while an eased root turn is in progress. */
        bool bTurningInPlace = false;
        /** Yaw offset still pending on the root (deg). */
        float TurnYawOffsetDeg = 0.0f;

        // ── Head look ──
        float HeadLookYawDeg = 0.0f;
        float HeadLookPitchDeg = 0.0f;

        // ── Idle life ──
        /** Breathing output (approx -1..1, times BreathAmplitude). */
        float Breath = 0.0f;
        float BreathPhase = 0.0f;

        // ── Foot IK ──
        FKhaaosFootState FootLeft;
        FKhaaosFootState FootRight;

        // ── Network smoothing ──
        float NetworkSmoothedSpeed = 0.0f;

        // ── Internal bookkeeping ──
        bool bPrevInAir = false;
        int32_t StrideStepIndex = 0;
        float LeanRollVelocity = 0.0f;
        float LeanPitchVelocity = 0.0f;
    };

    // ─── Per-frame input ──────────────────────────────────────────────────

    /**
     * FKhaaosLocomotionInput
     * Raw engine values for one frame. The UE component fills this from
     * the CharacterMovementComponent + line traces.
     */
    struct FKhaaosLocomotionInput
    {
        float DeltaTime = 0.0f;
        /** Instantaneous planar speed (uu/s). */
        float RawSpeed = 0.0f;
        /** Instantaneous movement direction relative to facing (deg). */
        float RawDirectionDeg = 0.0f;
        /** Lateral acceleration (uu/s^2, + = rightward). */
        float LateralAccel = 0.0f;
        /** Forward acceleration (uu/s^2, + = accelerating forward). */
        float ForwardAccel = 0.0f;
        /** Residual aim yaw (control yaw - actor yaw, deg) for turn-in-place. */
        float ResidualYawDeg = 0.0f;
        /** Character is airborne. */
        bool bInAir = false;
        /** Character landed this frame (edge-detected upstream). */
        bool bJustLanded = false;
        /** Downward velocity at landing (uu/s, positive magnitude). */
        float LandingSpeed = 0.0f;
        /** Foot IK raycast results: ground height delta per foot (cm, + = ground higher). */
        float FootGroundDeltaL = 0.0f;
        float FootGroundDeltaR = 0.0f;
        /** Foot IK raycast results: ground slope tilt per foot (deg). */
        float FootGroundTiltL = 0.0f;
        float FootGroundTiltR = 0.0f;
        /** Desired head look yaw/pitch (deg, already relative to head rest). */
        float HeadLookTargetYawDeg = 0.0f;
        float HeadLookTargetPitchDeg = 0.0f;
        /** True for simulated proxies (enables extra network smoothing). */
        bool bSimulatedProxy = false;
        /** Absolute time in seconds (for breathing noise). */
        float TimeSeconds = 0.0f;
    };

    // ─── Math primitives ──────────────────────────────────────────────────

    /**
     * Frame-rate independent critically damped smoothing.
     * Returns the new value after moving Current toward Target with
     * exponential rate. Identical contract to UE FMath::FInterpTo with
     * DeltaTime-independent normalization; keeps CI tests deterministic.
     */
    float SmoothFloat(float Current, float Target, float Rate, float DeltaTime);

    /**
     * Angle smoothing with shortest-path wrap handling.
     * Current/Target in degrees; always takes the delta in [-180, 180].
     */
    float SmoothAngleDeg(float Current, float Target, float Rate, float DeltaTime);

    /**
     * Normalize any angle in degrees to [-180, 180).
     */
    float NormalizeAngleDeg(float AngleDeg);

    /**
     * Semi-implicit damped spring step toward Target.
     * DampingRatio 1.0 = critically damped, < 1 = underdamped (bounce),
     * > 1 = overdamped. Returns new position, writes new velocity.
     */
    float SpringStep(float Position, float Velocity, float Target,
                     float Stiffness, float DampingRatio, float DeltaTime,
                     float& OutVelocity);

    /**
     * Deterministic 1D value noise in [-1, 1] built on a PCG-style hash.
     * Organic micro-motion source (breathing wobble, idle sway).
     */
    float PerlinLike(uint32_t Seed, float Time);

    /**
     * Clamp helper (avoids pulling <algorithm> into hot headers).
     */
    float ClampFloat(float Value, float Min, float Max);

    // ─── Main update ──────────────────────────────────────────────────────

    /**
     * Advance the locomotion state by one frame.
     * Pure function of (Config, State, Input) → mutated State.
     * Never produces NaN for finite inputs; all outputs clamped.
     */
    void Step(const FKhaaosLocomotionConfig& Config,
              FKhaaosLocomotionState& State,
              const FKhaaosLocomotionInput& Input);

    /**
     * Consume and clear the pending footstep event.
     * Returns 0 (none), 1 (left foot) or 2 (right foot).
     * The component routes this to the footstep audio/VFX system so
     * footsteps fire exactly when the procedural stride crosses a
     * foot-plant, instead of on arbitrary anim notifies.
     */
    int32_t ConsumeFootEvent(FKhaaosLocomotionState& State);
}
