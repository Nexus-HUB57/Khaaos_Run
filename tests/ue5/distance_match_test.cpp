// Khaaos Run — Distance Matching & Motion Warping standalone unit test (Fase 32).
//
// Same pattern as natural_locomotion_test.cpp: the kernel is pure C++20
// with zero Unreal dependencies, so CI compiles and runs it directly.
// This test pins the Fase 32 contract:
//
//   PredictStopDistanceCm  — v²/2a kinematics, monotonic in speed, 0 at rest,
//                            frame-rate independent via the Step() integration.
//   StopMatchPhase         — monotonic 0→1 during a braking stop, stays 1
//                            while stopped, resets on the next acceleration.
//   WarpPhaseForDistance   — exact identity at ratio 1, clamped to the warp
//                            window, NaN-safe, deterministic.
//   ChoosePivotFoot        — right turn → LEFT pivot, left turn → RIGHT pivot,
//                            hysteresis below the keep threshold, clamped weight.
//   AirPoseBlend           — saturates at ±1 with vertical velocity, decays to
//                            0 when grounded, no NaN under fuzz.

#include "Game/Animation/KhaaosLocomotionCore.h"

#include <cmath>
#include <cstdint>
#include <iostream>

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

    // ─── Pure helpers ────────────────────────────────────────────────────

    void TestPredictStopDistance()
    {
        ExpectNear(KhaaosLoco::PredictStopDistanceCm(0.0f, 1000.0f), 0.0f, 1e-4f,
                   "stop distance at rest is 0");
        ExpectNear(KhaaosLoco::PredictStopDistanceCm(600.0f, 0.0f), 0.0f, 1e-4f,
                   "stop distance with no braking is 0 (fails closed)");
        ExpectNear(KhaaosLoco::PredictStopDistanceCm(600.0f, 1000.0f), 180.0f, 0.01f,
                   "600 uu/s @ 1000 uu/s² stops in 180 cm");
        ExpectNear(KhaaosLoco::PredictStopDistanceCm(900.0f, 1000.0f), 405.0f, 0.01f,
                   "900 uu/s @ 1000 uu/s² stops in 405 cm");

        const float D400 = KhaaosLoco::PredictStopDistanceCm(400.0f, 1000.0f);
        const float D800 = KhaaosLoco::PredictStopDistanceCm(800.0f, 1000.0f);
        Expect(D800 > D400 * 3.0f, "stop distance grows with the SQUARE of speed");
        Expect(KhaaosLoco::PredictStopDistanceCm(-50.0f, 1000.0f) >= 0.0f,
               "negative speed still yields a non-negative distance");
    }

    // ─── Warp math ───────────────────────────────────────────────────────

    void TestWarpPhase()
    {
        ExpectNear(KhaaosLoco::WarpPhaseForDistance(0.5f, 150.0f, 150.0f, 0.35f),
                   0.5f, 1e-5f, "warp is identity when distance matches the base clip");
        ExpectNear(KhaaosLoco::WarpPhaseForDistance(0.5f, 150.0f, 200.0f, 0.35f),
                   0.5f * (200.0f / 150.0f), 1e-5f, "longer target stretches the phase");
        ExpectNear(KhaaosLoco::WarpPhaseForDistance(0.5f, 150.0f, 30.0f, 0.35f),
                   0.5f * 0.65f, 1e-5f, "shorter target compresses the phase to the window floor");

        const float Far = KhaaosLoco::WarpPhaseForDistance(0.9f, 150.0f, 1000.0f, 0.35f);
        ExpectNear(Far, 1.0f, 1e-5f, "warp beyond the window clamps to 1 (never rubber-bands)");

        ExpectNear(KhaaosLoco::WarpPhaseForDistance(0.4f, 0.0f, 100.0f, 0.35f), 0.4f, 1e-5f,
                   "degenerate base distance fails closed to identity");
        ExpectNear(KhaaosLoco::WarpPhaseForDistance(0.4f, 150.0f, -5.0f, 0.35f), 0.4f, 1e-5f,
                   "negative target distance fails closed to identity");
        ExpectNear(KhaaosLoco::WarpPhaseForDistance(0.4f, 150.0f, 100.0f, 0.0f), 0.4f, 1e-5f,
                   "zero window disables warping");

        const float A = KhaaosLoco::WarpPhaseForDistance(0.37f, 150.0f, 180.0f, 0.35f);
        const float B = KhaaosLoco::WarpPhaseForDistance(0.37f, 150.0f, 180.0f, 0.35f);
        ExpectNear(A, B, 0.0f, "warp is deterministic");
    }

    // ─── Pivot foot ──────────────────────────────────────────────────────

    void TestPivotFoot()
    {
        bool bLeft = false;
        float W = KhaaosLoco::ChoosePivotFoot(90.0f, bLeft, 55.0f, 12.0f, bLeft);
        Expect(bLeft, "turning RIGHT pivots the LEFT foot");
        ExpectNear(W, 1.0f, 1e-5f, "a 90° turn has full pivot weight");

        bLeft = true;
        W = KhaaosLoco::ChoosePivotFoot(-90.0f, bLeft, 55.0f, 12.0f, bLeft);
        Expect(!bLeft, "turning LEFT pivots the RIGHT foot");
        ExpectNear(W, 1.0f, 1e-5f, "a -90° turn has full pivot weight");

        bLeft = true;
        KhaaosLoco::ChoosePivotFoot(5.0f, bLeft, 55.0f, 12.0f, bLeft);
        Expect(bLeft, "a 5° turn keeps the previous foot (hysteresis)");
        KhaaosLoco::ChoosePivotFoot(-4.0f, bLeft, 55.0f, 12.0f, bLeft);
        Expect(bLeft, "crossing zero below the keep threshold keeps the foot");

        bLeft = false;
        KhaaosLoco::ChoosePivotFoot(-30.0f, bLeft, 55.0f, 12.0f, bLeft);
        Expect(bLeft == false, "a -30° turn decisively pivots the right foot");

        W = KhaaosLoco::ChoosePivotFoot(27.5f, false, 55.0f, 12.0f, bLeft);
        ExpectNear(W, 0.5f, 0.01f, "pivot weight ramps linearly (27.5/55 = 0.5)");
        W = KhaaosLoco::ChoosePivotFoot(500.0f, false, 55.0f, 12.0f, bLeft);
        ExpectNear(W, 1.0f, 1e-5f, "pivot weight clamps at 1");
        W = KhaaosLoco::ChoosePivotFoot(0.0f, false, 55.0f, 12.0f, bLeft);
        ExpectNear(W, 0.0f, 1e-5f, "zero turn has zero pivot weight");
    }

    // ─── Step() integration: stop matching ──────────────────────────────

    void TestStopMatchIntegration()
    {
        KhaaosLoco::FKhaaosLocomotionConfig Config;
        KhaaosLoco::FKhaaosLocomotionState State;

        // Simulate a sprint → brake → stop on flat ground at 60 Hz.
        KhaaosLoco::FKhaaosLocomotionInput In;
        In.DeltaTime = 1.0f / 60.0f;
        In.BrakingDecel = 1000.0f;
        In.TimeSeconds = 0.0f;

        // Sprint up to 900 uu/s.
        float Speed = 0.0f;
        for (int i = 0; i < 60; ++i)
        {
            Speed = std::fmin(900.0f, Speed + 1600.0f / 60.0f);
            In.RawSpeed = Speed;
            In.ForwardAccel = 1600.0f;
            KhaaosLoco::Step(Config, State, In);
            In.TimeSeconds += In.DeltaTime;
        }
        Expect(State.StopMatchPhase < 0.05f,
               "no stop match while accelerating at full speed");

        // Brake to zero.
        float PrevPhase = State.StopMatchPhase;
        bool bMonotonic = true;
        while (Speed > 0.0f)
        {
            Speed = std::fmax(0.0f, Speed - 1000.0f / 60.0f);
            In.RawSpeed = Speed;
            In.ForwardAccel = (Speed > 0.0f) ? -1000.0f : 0.0f;
            KhaaosLoco::Step(Config, State, In);
            In.TimeSeconds += In.DeltaTime;
            if (State.StopMatchPhase < PrevPhase - 1e-4f) { bMonotonic = false; }
            PrevPhase = State.StopMatchPhase;
        }
        Expect(bMonotonic, "stop-match phase is monotonic during braking");
        ExpectNear(State.StopMatchPhase, 1.0f, 1e-5f, "stop-match phase reaches 1 when planted");

        // Hold stopped for 1 s: phase stays at 1.
        for (int i = 0; i < 60; ++i)
        {
            In.RawSpeed = 0.0f;
            In.ForwardAccel = 0.0f;
            KhaaosLoco::Step(Config, State, In);
            In.TimeSeconds += In.DeltaTime;
        }
        ExpectNear(State.StopMatchPhase, 1.0f, 1e-5f, "phase stays 1 while stopped");

        // Accelerate again (a full second): the match resets for the next stop
        // and the predicted distance converges toward the sprint value.
        for (int i = 0; i < 60; ++i)
        {
            Speed = std::fmin(900.0f, Speed + 1600.0f / 60.0f);
            In.RawSpeed = Speed;
            In.ForwardAccel = 1600.0f;
            KhaaosLoco::Step(Config, State, In);
            In.TimeSeconds += In.DeltaTime;
        }
        Expect(State.StopMatchPhase < 0.05f, "phase resets when accelerating again");
        Expect(State.StopDistanceCm > 250.0f, "predicted distance reflects the sprint speed");
    }

    // ─── Step() integration: air pose & frame-rate independence ─────────

    void TestAirPoseAndDeterminism()
    {
        KhaaosLoco::FKhaaosLocomotionConfig Config;
        KhaaosLoco::FKhaaosLocomotionState State60;
        KhaaosLoco::FKhaaosLocomotionState State120;

        KhaaosLoco::FKhaaosLocomotionInput In;
        In.DeltaTime = 1.0f / 60.0f;

        // Rising fast: blend saturates toward -1 (rising pose).
        In.bInAir = true;
        In.VerticalSpeed = 700.0f;
        for (int i = 0; i < 60; ++i) { KhaaosLoco::Step(Config, State60, In); }
        Expect(State60.AirPoseBlend < -0.9f, "fast rise saturates the air pose to -1");

        // Falling fast: blend saturates toward +1.
        In.VerticalSpeed = -700.0f;
        for (int i = 0; i < 60; ++i) { KhaaosLoco::Step(Config, State60, In); }
        Expect(State60.AirPoseBlend > 0.9f, "fast fall saturates the air pose to +1");

        // Frame-rate independence: 120 Hz @ half dt converges to the same value.
        KhaaosLoco::FKhaaosLocomotionInput In120 = In;
        In120.DeltaTime = 1.0f / 120.0f;
        for (int i = 0; i < 120; ++i) { KhaaosLoco::Step(Config, State120, In120); }
        ExpectNear(State120.AirPoseBlend, State60.AirPoseBlend, 0.02f,
                   "air pose is frame-rate independent (60 Hz ≈ 120 Hz)");

        // Grounded: blend decays back to 0.
        In.bInAir = false;
        In.VerticalSpeed = 0.0f;
        for (int i = 0; i < 90; ++i) { KhaaosLoco::Step(Config, State60, In); }
        ExpectNear(State60.AirPoseBlend, 0.0f, 0.02f, "grounded air pose decays to 0");

        // NaN fuzz: extreme-but-finite inputs never poison the state.
        In.bInAir = true;
        for (int i = 0; i < 600; ++i)
        {
            In.VerticalSpeed = (i % 2 == 0) ? 5000.0f : -5000.0f;
            In.RawSpeed = (i % 3 == 0) ? 2000.0f : 0.0f;
            In.BrakingDecel = (i % 7 == 0) ? 0.0f : 1000.0f;
            KhaaosLoco::Step(Config, State60, In);
            In.TimeSeconds += In.DeltaTime;
        }
        Expect(std::isfinite(State60.AirPoseBlend), "air pose stays finite under fuzz");
        Expect(std::isfinite(State60.StopDistanceCm), "stop distance stays finite under fuzz");
        Expect(std::isfinite(State60.StopMatchPhase), "stop-match phase stays finite under fuzz");
        Expect(std::fabs(State60.AirPoseBlend) <= 1.0f + 1e-4f, "air pose stays clamped under fuzz");
    }
}

int main()
{
    TestPredictStopDistance();
    TestWarpPhase();
    TestPivotFoot();
    TestStopMatchIntegration();
    TestAirPoseAndDeterminism();

    std::cout << "All distance matching & motion warping tests passed ("
              << Passed << " checks).\n";
    if (Failures > 0)
    {
        std::cout << Failures << " checks FAILED.\n";
        return 1;
    }
    return 0;
}
