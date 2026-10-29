// Khaaos Run — Natural Locomotion Core standalone unit test.
//
// The locomotion kernel (Game/Animation/KhaaosLocomotionCore) is pure
// C++20 with zero Unreal dependencies, so CI compiles and runs it
// directly (same pattern as the CIGKV world rule tests). This test pins
// the anti-robotization contract: smooth parameter convergence, shortest
// path angle wrap, lean clamping, stride phase foot events, landing
// recovery stability, turn-in-place hysteresis, deterministic breathing
// noise, foot IK spring stability and network smoothing.

#include "Game/Animation/KhaaosLocomotionCore.h"

#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>

namespace
{
    int Failures = 0;
    int Passed = 0;

    void Expect(bool Condition, const char* Description)
    {
        if (Condition) { ++Passed; }
        else { std::cerr << "FAIL: " << Description << '\n'; ++Failures; }
    }

    void ExpectNear(float Actual, float Expected, float Tolerance, const char* Description)
    {
        const float Diff = std::fabs(Actual - Expected);
        if (Diff <= Tolerance) { ++Passed; }
        else
        {
            std::cerr << "FAIL: " << Description << " (actual=" << Actual
                      << ", expected=" << Expected << ", diff=" << Diff << ")\n";
            ++Failures;
        }
    }

    bool IsFinite(float V)
    {
        return std::isfinite(V);
    }

    // Run N frames of Step with fixed dt and return the final state.
    struct StepHarness
    {
        KhaaosLoco::FKhaaosLocomotionConfig Config;
        KhaaosLoco::FKhaaosLocomotionState State;
        float Time = 0.0f;

        void Run(const KhaaosLoco::FKhaaosLocomotionInput& In, int Frames)
        {
            for (int i = 0; i < Frames; ++i)
            {
                KhaaosLoco::FKhaaosLocomotionInput Frame = In;
                Frame.TimeSeconds = Time;
                KhaaosLoco::Step(Config, State, Frame);
                Time += In.DeltaTime;
            }
        }
    };

    KhaaosLoco::FKhaaosLocomotionInput MakeInput(float Speed, float Dt = 1.0f / 60.0f)
    {
        KhaaosLoco::FKhaaosLocomotionInput In;
        In.DeltaTime = Dt;
        In.RawSpeed = Speed;
        In.RawDirectionDeg = 0.0f;
        return In;
    }
}

int main()
{
    using namespace KhaaosLoco;

    // ── 1. SmoothFloat convergence & frame-rate independence ─────────────
    {
        // Converges to target.
        float V = 0.0f;
        for (int i = 0; i < 600; ++i) V = SmoothFloat(V, 100.0f, 8.0f, 1.0f / 60.0f);
        ExpectNear(V, 100.0f, 0.01f, "SmoothFloat converges to target");

        // Same total time, different frame rates → same result (within tolerance).
        float A = 0.0f, B = 0.0f;
        for (int i = 0; i < 120; ++i) A = SmoothFloat(A, 300.0f, 6.0f, 1.0f / 120.0f);
        for (int i = 0; i < 20;  ++i) B = SmoothFloat(B, 300.0f, 6.0f, 1.0f / 20.0f);
        ExpectNear(A, B, 1.5f, "SmoothFloat is frame-rate independent");

        // Zero dt keeps state (no time passed).
        ExpectNear(SmoothFloat(42.0f, 100.0f, 8.0f, 0.0f), 42.0f, 1e-6f, "SmoothFloat with dt=0 is identity");

        // No NaN for extreme-but-finite inputs.
        Expect(IsFinite(SmoothFloat(1e30f, -1e30f, 50.0f, 0.1f)), "SmoothFloat stays finite for extreme inputs");
    }

    // ── 2. Angle wrap: shortest path ─────────────────────────────────────
    {
        ExpectNear(NormalizeAngleDeg(190.0f), -170.0f, 1e-4f, "NormalizeAngleDeg wraps 190 to -170");
        ExpectNear(NormalizeAngleDeg(-190.0f), 170.0f, 1e-4f, "NormalizeAngleDeg wraps -190 to 170");
        {
            // 540 ≡ 180 ≡ -180: accept either representation of the boundary.
            const float Wrapped = NormalizeAngleDeg(540.0f);
            Expect(std::fabs(std::fabs(Wrapped) - 180.0f) < 1e-4f, "NormalizeAngleDeg wraps 540 to the 180 boundary");
        }
        ExpectNear(NormalizeAngleDeg(0.0f), 0.0f, 1e-6f, "NormalizeAngleDeg keeps 0");

        // -170 → 170 is 20 deg apart across the ±180 boundary; one frame
        // of smoothing must REDUCE the circular distance (not take -340).
        {
            const float A = SmoothAngleDeg(-170.0f, 170.0f, 10.0f, 1.0f / 60.0f);
            const float DistBefore = std::fabs(NormalizeAngleDeg(170.0f - (-170.0f)));
            const float DistAfter = std::fabs(NormalizeAngleDeg(170.0f - A));
            Expect(DistAfter < DistBefore, "SmoothAngleDeg takes shortest path across the wrap");
        }

        // Converges regardless of wrap direction.
        float B = 179.0f;
        for (int i = 0; i < 300; ++i) B = SmoothAngleDeg(B, -179.0f, 8.0f, 1.0f / 60.0f);
        ExpectNear(B, -179.0f, 0.5f, "SmoothAngleDeg converges across wrap");
    }

    // ── 3. Step: speed smoothing into the state ──────────────────────────
    {
        StepHarness H;
        H.Run(MakeInput(0.0f), 1); // idle frame
        ExpectNear(H.State.SmoothedSpeed, 0.0f, 1e-5f, "Idle frame keeps SmoothedSpeed at 0");

        H.Run(MakeInput(900.0f), 120); // 2s at sprint
        ExpectNear(H.State.SmoothedSpeed, 900.0f, 1.0f, "SmoothedSpeed converges to sprint speed");
        Expect(IsFinite(H.State.SmoothedSpeed), "SmoothedSpeed finite");
    }

    // ── 4. Lean: acceleration driven, clamped, recovers to zero ──────────
    {
        StepHarness H;
        KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(600.0f);
        In.LateralAccel = 100000.0f; // absurd accel → must clamp, not explode
        H.Run(In, 60);
        Expect(H.State.LeanRollDeg <= H.Config.LeanRollMaxDeg * 1.21f, "Lean roll clamps to max*1.2");
        Expect(H.State.LeanRollDeg > 0.0f, "Rightward accel produces positive (right) roll");

        KhaaosLoco::FKhaaosLocomotionInput Calm = MakeInput(600.0f);
        H.Run(Calm, 240); // 4s calm
        ExpectNear(H.State.LeanRollDeg, 0.0f, 0.05f, "Lean roll returns to zero after accel ends");
        ExpectNear(H.State.LeanPitchDeg, 0.0f, 0.05f, "Lean pitch returns to zero after accel ends");

        // Airborne: lean relaxes to neutral.
        StepHarness Air;
        KhaaosLoco::FKhaaosLocomotionInput AirIn = MakeInput(600.0f);
        AirIn.LateralAccel = 100000.0f;
        AirIn.bInAir = true;
        Air.Run(AirIn, 60);
        ExpectNear(Air.State.LeanRollDeg, 0.0f, 0.05f, "No fake banking while airborne");
    }

    // ── 5. Stride phase: foot events alternate and scale with speed ──────
    {
        StepHarness H;
        // 10 seconds walking at 300 uu/s with default stride (~1 stride cycle per ~0.53s at scale 1.0)
        H.Run(MakeInput(300.0f), 600);

        int Lefts = 0, Rights = 0;
        // Count by re-running and consuming each frame.
        StepHarness H2;
        for (int i = 0; i < 600; ++i)
        {
            KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(300.0f);
            In.TimeSeconds = H2.Time;
            Step(H2.Config, H2.State, In);
            H2.Time += In.DeltaTime;
            const int32_t Ev = ConsumeFootEvent(H2.State);
            if (Ev == 1) ++Lefts;
            if (Ev == 2) ++Rights;
        }
        Expect(Lefts > 10 && Rights > 10, "Walking emits both feet regularly in 10s");
        Expect(std::abs(Lefts - Rights) <= 2, "Foot events alternate evenly L/R");

        // Faster speed → more events in same window.
        StepHarness H3;
        int SprintSteps = 0;
        for (int i = 0; i < 600; ++i)
        {
            KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(900.0f);
            In.TimeSeconds = H3.Time;
            Step(H3.Config, H3.State, In);
            H3.Time += In.DeltaTime;
            if (ConsumeFootEvent(H3.State) != 0) ++SprintSteps;
        }
        int WalkSteps = Lefts + Rights;
        Expect(SprintSteps > WalkSteps, "Sprint cadence exceeds walk cadence");

        // Idle emits nothing new.
        int IdleSteps = 0;
        for (int i = 0; i < 120; ++i)
        {
            KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(0.0f);
            In.TimeSeconds = H3.Time;
            Step(H3.Config, H3.State, In);
            H3.Time += In.DeltaTime;
            if (ConsumeFootEvent(H3.State) != 0) ++IdleSteps;
        }
        Expect(IdleSteps == 0, "Idle freezes stride and emits no footsteps");
    }

    // ── 6. Landing recovery: impulse then stable spring settle ───────────
    {
        StepHarness H;
        KhaaosLoco::FKhaaosLocomotionInput Fall = MakeInput(0.0f);
        Fall.bInAir = true;
        H.Run(Fall, 30);

        KhaaosLoco::FKhaaosLocomotionInput Land = MakeInput(0.0f);
        Land.bJustLanded = true;
        Land.LandingSpeed = 800.0f;
        H.Run(Land, 1);
        Expect(H.State.LandRecovery < 0.0f, "Landing pushes recovery negative (knees absorb)");
        Expect(IsFinite(H.State.LandRecovery), "Land recovery finite after impulse");

        H.Run(MakeInput(0.0f), 600); // 10s settle
        ExpectNear(H.State.LandRecovery, 0.0f, 0.05f, "Land recovery spring settles to zero");
        ExpectNear(H.State.LandRecoveryVelocity, 0.0f, 0.05f, "Land recovery velocity settles to zero");
    }

    // ── 7. Turn in place: hysteresis + eased yaw ─────────────────────────
    {
        StepHarness H;
        KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(0.0f);
        In.ResidualYawDeg = 120.0f; // beyond start threshold (70)
        H.Run(In, 1);
        Expect(H.State.bTurningInPlace, "Large residual yaw starts turn-in-place");

        // Half the residual: still above end threshold → keeps turning.
        KhaaosLoco::FKhaaosLocomotionInput Half = MakeInput(0.0f);
        Half.ResidualYawDeg = 60.0f;
        H.Run(Half, 1);
        Expect(H.State.bTurningInPlace, "Hysteresis keeps turning between end and start thresholds");

        // Residual cleared → turn ends, offset decays.
        KhaaosLoco::FKhaaosLocomotionInput Clear = MakeInput(0.0f);
        Clear.ResidualYawDeg = 0.0f;
        H.Run(Clear, 120);
        Expect(!H.State.bTurningInPlace, "Turn ends when residual clears");
        ExpectNear(H.State.TurnYawOffsetDeg, 0.0f, 0.5f, "Turn yaw offset decays to zero");

        // Moving characters do not turn in place.
        StepHarness Moving;
        KhaaosLoco::FKhaaosLocomotionInput MoveIn = MakeInput(600.0f);
        MoveIn.ResidualYawDeg = 170.0f;
        Moving.Run(MoveIn, 5);
        Expect(!Moving.State.bTurningInPlace, "Turning suppressed while moving");
    }

    // ── 8. Breathing: deterministic noise, bounded ───────────────────────
    {
        // Same seed & time → identical value.
        const float A = PerlinLike(1234u, 3.7f);
        const float B = PerlinLike(1234u, 3.7f);
        Expect(A == B, "PerlinLike is deterministic for same seed/time");

        // Different seeds diverge.
        Expect(PerlinLike(1u, 3.7f) != PerlinLike(999u, 3.7f), "PerlinLike varies with seed");

        // Bounded in [-1, 1].
        bool Bounded = true;
        for (int i = 0; i < 1000; ++i)
        {
            const float V = PerlinLike(7u, static_cast<float>(i) * 0.013f);
            if (V < -1.0f || V > 1.0f || !IsFinite(V)) { Bounded = false; break; }
        }
        Expect(Bounded, "PerlinLike stays within [-1,1] over 1000 samples");

        // Breath output bounded for a long idle session.
        StepHarness H;
        H.Run(MakeInput(0.0f), 1200);
        Expect(std::fabs(H.State.Breath) <= H.Config.BreathAmplitude * 1.001f, "Breath bounded by amplitude");
        Expect(IsFinite(H.State.Breath), "Breath finite after 20s idle");
    }

    // ── 9. Foot IK springs: stable, clamped, converge ────────────────────
    {
        StepHarness H;
        KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(0.0f);
        In.FootGroundDeltaL = 18.0f;  // ground 18cm higher under left foot
        In.FootGroundDeltaR = -9.0f;
        In.FootGroundTiltL = 12.0f;
        In.FootGroundTiltR = -4.0f;
        H.Run(In, 240);

        ExpectNear(H.State.FootLeft.HeightOffsetCm, 18.0f, 0.1f, "Left foot IK converges to ground delta");
        ExpectNear(H.State.FootRight.HeightOffsetCm, -9.0f, 0.1f, "Right foot IK converges to ground delta");
        ExpectNear(H.State.FootLeft.TiltDeg, 12.0f, 0.1f, "Left foot tilt converges");
        Expect(IsFinite(H.State.FootLeft.HeightOffsetCm), "Foot IK finite");

        // Oversized terrain must clamp, never explode.
        StepHarness H2;
        KhaaosLoco::FKhaaosLocomotionInput Cliff = MakeInput(0.0f);
        Cliff.FootGroundDeltaL = 5000.0f;
        Cliff.FootGroundDeltaR = -5000.0f;
        H2.Run(Cliff, 120);
        Expect(std::fabs(H2.State.FootLeft.HeightOffsetCm) <= H2.Config.FootMaxOffsetCm + 0.5f, "Foot offset clamps to max");

        // Air relaxes feet to neutral.
        StepHarness H3;
        KhaaosLoco::FKhaaosLocomotionInput AirIn = MakeInput(0.0f);
        AirIn.bInAir = true;
        AirIn.FootGroundDeltaL = 20.0f;
        H3.Run(AirIn, 120);
        ExpectNear(H3.State.FootLeft.HeightOffsetCm, 0.0f, 0.1f, "Foot IK relaxes in air");
    }

    // ── 10. Network smoothing + stop ease ────────────────────────────────
    {
        StepHarness H;
        KhaaosLoco::FKhaaosLocomotionInput In = MakeInput(900.0f);
        In.bSimulatedProxy = true;
        H.Run(In, 120);
        ExpectNear(H.State.NetworkSmoothedSpeed, 900.0f, 1.0f, "Network smoothed speed converges");
        ExpectNear(H.State.StopEase, 1.0f, 0.05f, "StopEase = 1 while moving");

        H.Run(MakeInput(0.0f), 120);
        ExpectNear(H.State.StopEase, 0.0f, 0.05f, "StopEase eases to 0 when stopped");
    }

    // ── 11. Long-run fuzz: no NaN, no divergence (60s mixed scenario) ────
    {
        StepHarness H;
        uint32_t Seed = 0xc0ffeeu;
        bool AllFinite = true;

        for (int i = 0; i < 3600; ++i) // 60s at 60Hz
        {
            // Cheap deterministic pseudo-random scenario mixing.
            Seed = Seed * 1664525u + 1013904223u;
            const float R1 = static_cast<float>(Seed >> 8 & 0xFFFF) / 65535.0f;
            Seed = Seed * 1664525u + 1013904223u;
            const float R2 = static_cast<float>(Seed >> 8 & 0xFFFF) / 65535.0f;

            KhaaosLoco::FKhaaosLocomotionInput In;
            In.DeltaTime = (R2 > 0.95f) ? (1.0f / 12.0f) : (1.0f / 60.0f); // occasional hitch frames
            In.RawSpeed = R1 * 1200.0f;
            In.RawDirectionDeg = (R2 - 0.5f) * 720.0f;
            In.LateralAccel = (R2 - 0.5f) * 12000.0f;
            In.ForwardAccel = (R1 - 0.5f) * 12000.0f;
            In.ResidualYawDeg = (R1 - 0.5f) * 400.0f;
            In.bInAir = (R2 > 0.8f);
            In.bJustLanded = (R2 > 0.79f && R2 <= 0.8f);
            In.LandingSpeed = R1 * 1200.0f;
            In.FootGroundDeltaL = (R1 - 0.5f) * 80.0f;
            In.FootGroundDeltaR = (R2 - 0.5f) * 80.0f;
            In.FootGroundTiltL = (R1 - 0.5f) * 40.0f;
            In.FootGroundTiltR = (R2 - 0.5f) * 40.0f;
            In.HeadLookTargetYawDeg = (R2 - 0.5f) * 200.0f;
            In.HeadLookTargetPitchDeg = (R1 - 0.5f) * 100.0f;
            In.TimeSeconds = H.Time;

            Step(H.Config, H.State, In);
            H.Time += In.DeltaTime;

            if (!IsFinite(H.State.SmoothedSpeed) || !IsFinite(H.State.SmoothedDirectionDeg) ||
                !IsFinite(H.State.LeanRollDeg) || !IsFinite(H.State.LeanPitchDeg) ||
                !IsFinite(H.State.LandRecovery) || !IsFinite(H.State.StridePhase) ||
                !IsFinite(H.State.Breath) ||
                !IsFinite(H.State.FootLeft.HeightOffsetCm) || !IsFinite(H.State.FootRight.HeightOffsetCm))
            {
                AllFinite = false;
                break;
            }
        }
        Expect(AllFinite, "60s mixed fuzz produces no NaN/divergence");
        ExpectNear(H.State.StridePhase, H.State.StridePhase, 0.0f, "Stride phase remains comparable");
    }

    // ── 12. ConsumeFootEvent contract ────────────────────────────────────
    {
        FKhaaosLocomotionState S;
        S.LastFootEvent = 2;
        Expect(ConsumeFootEvent(S) == 2, "ConsumeFootEvent returns pending event");
        Expect(ConsumeFootEvent(S) == 0, "ConsumeFootEvent clears after read");
    }

    if (Failures > 0)
    {
        std::cerr << Failures << " failure(s), " << Passed << " passed.\n";
        return 1;
    }
    std::cout << "All natural locomotion core tests passed (" << Passed << " checks).\n";
    return 0;
}
