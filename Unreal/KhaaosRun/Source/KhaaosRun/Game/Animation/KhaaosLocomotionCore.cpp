// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
//
// Implementation of the deterministic natural-locomotion math kernel.
// See KhaaosLocomotionCore.h for the anti-robotization contract.
// This translation unit must remain free of Unreal Engine includes so
// CI can compile it standalone (tests/ue5/natural_locomotion_test.cpp).

#include "Game/Animation/KhaaosLocomotionCore.h"

#include <cmath>

namespace KhaaosLoco
{
    namespace
    {
        // PCG-style integer hash: fast, deterministic, no libm.
        inline uint32_t HashU32(uint32_t X)
        {
            X ^= X >> 16;
            X *= 0x7feb352du;
            X ^= X >> 15;
            X *= 0x846ca68bu;
            X ^= X >> 16;
            return X;
        }

        // Map a uint32 to [-1, 1].
        inline float HashToBipolar(uint32_t H)
        {
            return (static_cast<float>(H) / 2147483647.5f) - 1.0f;
        }

        inline float SmoothStep01(float X)
        {
            X = ClampFloat(X, 0.0f, 1.0f);
            return X * X * (3.0f - 2.0f * X);
        }
    }

    float ClampFloat(float Value, float Min, float Max)
    {
        if (Value < Min) return Min;
        if (Value > Max) return Max;
        return Value;
    }

    float NormalizeAngleDeg(float AngleDeg)
    {
        // Wrap into (-180, 180] using two folds to stay exact for any magnitude.
        AngleDeg = std::fmod(AngleDeg + 180.0f, 360.0f);
        if (AngleDeg < 0.0f)
        {
            AngleDeg += 360.0f;
        }
        return AngleDeg - 180.0f;
    }

    float SmoothFloat(float Current, float Target, float Rate, float DeltaTime)
    {
        if (DeltaTime <= 0.0f)
        {
            return Current;
        }
        if (Rate <= 0.0f)
        {
            return Target;
        }
        // Exact exponential approach: frame-rate independent.
        const float Alpha = 1.0f - std::exp(-Rate * DeltaTime);
        return Current + (Target - Current) * Alpha;
    }

    float SmoothAngleDeg(float Current, float Target, float Rate, float DeltaTime)
    {
        if (DeltaTime <= 0.0f)
        {
            return Current;
        }
        if (Rate <= 0.0f)
        {
            return Target;
        }
        const float Delta = NormalizeAngleDeg(Target - Current);
        const float Alpha = 1.0f - std::exp(-Rate * DeltaTime);
        return NormalizeAngleDeg(Current + Delta * Alpha);
    }

    float SpringStep(float Position, float Velocity, float Target,
                     float Stiffness, float DampingRatio, float DeltaTime,
                     float& OutVelocity)
    {
        // Critical damping coefficient for the given stiffness.
        const float Critical = 2.0f * std::sqrt(std::fabs(Stiffness));
        const float Damping = Critical * DampingRatio;

        // Semi-implicit Euler: stable for our parameter ranges.
        // Sub-step if the frame is long (protects against tab spikes).
        const float MaxStep = 1.0f / 30.0f;
        float Remaining = ClampFloat(DeltaTime, 0.0f, 0.25f);
        while (Remaining > 0.0f)
        {
            const float H = (Remaining > MaxStep) ? MaxStep : Remaining;
            Remaining -= H;

            const float Accel = -Stiffness * (Position - Target) - Damping * Velocity;
            Velocity += Accel * H;
            Position += Velocity * H;
        }

        OutVelocity = Velocity;
        return Position;
    }

    float PerlinLike(uint32_t Seed, float Time)
    {
        // 1D lattice value noise with smoothstep interpolation.
        const float T = Time * 1.0f;
        const float FloorT = std::floor(T);
        const float FracT = T - FloorT;

        const int32_t Index = static_cast<int32_t>(FloorT);
        const float H0 = HashToBipolar(HashU32(static_cast<uint32_t>(Index) ^ Seed));
        const float H1 = HashToBipolar(HashU32(static_cast<uint32_t>(Index + 1) ^ Seed));

        const float U = SmoothStep01(FracT);
        return H0 + (H1 - H0) * U;
    }

    namespace
    {
        // ── Sub-updaters (file-local; called from Step) ──────────────────

        void UpdateStridePhase(const FKhaaosLocomotionConfig& Config,
                               FKhaaosLocomotionState& State,
                               const FKhaaosLocomotionInput& Input)
        {
            if (Input.RawSpeed < Config.StrideMinSpeed || Input.DeltaTime <= 0.0f)
            {
                return; // Freeze phase while idle; last foot event stays consumed.
            }

            // Stride length scales with speed: short quick steps when slow,
            // long powerful strides at sprint. This is what separates a
            // human gait from a metronome.
            const float SpeedRatio = ClampFloat(Input.RawSpeed / Config.StrideSpeedRef, 0.0f, Config.StrideMaxScale);
            const float Scale = ClampFloat(0.75f + 0.25f * SpeedRatio, Config.StrideMinScale, Config.StrideMaxScale);
            const float CycleLength = Config.StrideLengthCm * Scale;

            State.StridePhaseUnwrapped += (Input.RawSpeed / CycleLength) * Input.DeltaTime;
            State.StridePhase = State.StridePhaseUnwrapped - std::floor(State.StridePhaseUnwrapped);

            // Two foot plants per full cycle (plants at phase 0.0 and 0.5).
            // Counting on the unwrapped phase makes crossings, wrap and
            // multi-plant frames (low FPS) all robust.
            const int32_t PrevPlantIndex = State.StrideStepIndex;
            const int32_t CurrPlantIndex = static_cast<int32_t>(std::floor(State.StridePhaseUnwrapped * 2.0f));
            if (CurrPlantIndex > PrevPlantIndex)
            {
                // Emit exactly one event even if several plants were crossed
                // in one frame (prevents audio bursts after hitches).
                State.LastFootEvent = (State.StrideStepIndex % 2 == 0) ? 2 : 1; // 2 = right, 1 = left
                State.StrideStepIndex = CurrPlantIndex;
            }
        }

        void UpdateLean(const FKhaaosLocomotionConfig& Config,
                        FKhaaosLocomotionState& State,
                        const FKhaaosLocomotionInput& Input)
        {
            // Acceleration → target lean. Airborne: relax to zero (body
            // stabilizes in air, no fake banking without ground contact).
            float TargetRoll = 0.0f;
            float TargetPitch = 0.0f;

            if (!Input.bInAir)
            {
                TargetRoll = ClampFloat(
                    (Input.LateralAccel / Config.LeanAccelFullRoll) * Config.LeanRollMaxDeg,
                    -Config.LeanRollMaxDeg, Config.LeanRollMaxDeg);
                TargetPitch = ClampFloat(
                    (Input.ForwardAccel / Config.LeanAccelFullRoll) * Config.LeanPitchMaxDeg,
                    -Config.LeanPitchMaxDeg, Config.LeanPitchMaxDeg);
            }

            // Slight underdamping (0.85) so the lean settles with a hint of
            // organic overshoot instead of a dead exponential.
            State.LeanRollDeg = SpringStep(State.LeanRollDeg, State.LeanRollVelocity,
                                           TargetRoll, Config.LeanSmoothing * 6.0f, 0.85f,
                                           Input.DeltaTime, State.LeanRollVelocity);
            State.LeanPitchDeg = SpringStep(State.LeanPitchDeg, State.LeanPitchVelocity,
                                            TargetPitch, Config.LeanSmoothing * 6.0f, 0.85f,
                                            Input.DeltaTime, State.LeanPitchVelocity);

            State.LeanRollDeg = ClampFloat(State.LeanRollDeg, -Config.LeanRollMaxDeg * 1.2f, Config.LeanRollMaxDeg * 1.2f);
            State.LeanPitchDeg = ClampFloat(State.LeanPitchDeg, -Config.LeanPitchMaxDeg * 1.2f, Config.LeanPitchMaxDeg * 1.2f);
        }

        void UpdateLandRecovery(const FKhaaosLocomotionConfig& Config,
                                FKhaaosLocomotionState& State,
                                const FKhaaosLocomotionInput& Input)
        {
            if (Input.bJustLanded)
            {
                const float Saturation = ClampFloat(Input.LandingSpeed / Config.LandVelocitySaturation, 0.0f, 1.0f);
                // Downward landing pushes the knees DOWN (negative recovery),
                // then the spring rebounds — a human absorption curve.
                State.LandRecoveryVelocity -= Config.LandImpulseMax * Saturation * 10.0f;
            }

            State.LandRecovery = SpringStep(State.LandRecovery, State.LandRecoveryVelocity,
                                            0.0f, Config.LandStiffness, Config.LandDampingRatio,
                                            Input.DeltaTime, State.LandRecoveryVelocity);

            State.LandRecovery = ClampFloat(State.LandRecovery, -2.0f, 2.0f);
            State.bPrevInAir = Input.bInAir;
        }

        void UpdateTurnInPlace(const FKhaaosLocomotionConfig& Config,
                               FKhaaosLocomotionState& State,
                               const FKhaaosLocomotionInput& Input)
        {
            const float Residual = NormalizeAngleDeg(Input.ResidualYawDeg);
            const bool bStationary = Input.RawSpeed < Config.StrideMinSpeed;

            if (!State.bTurningInPlace)
            {
                // Start a turn only past the start threshold while stationary.
                if (bStationary && std::fabs(Residual) > Config.TurnInPlaceStartDeg)
                {
                    State.bTurningInPlace = true;
                }
            }
            else
            {
                // End the turn under the hysteresis threshold (prevents
                // start/stop flicker around the threshold).
                if (!bStationary || std::fabs(Residual) < Config.TurnInPlaceEndDeg)
                {
                    State.bTurningInPlace = false;
                }
            }

            if (State.bTurningInPlace)
            {
                // Ease the root yaw toward the residual at a rate that
                // scales with how far we still have to turn — large
                // corrections start fast and land softly.
                const float MaxStep = Config.TurnInPlaceRate * Input.DeltaTime;
                float Step = Residual * 0.5f;
                Step = ClampFloat(Step, -MaxStep, MaxStep);
                State.TurnYawOffsetDeg = NormalizeAngleDeg(State.TurnYawOffsetDeg + Step);
            }
            else
            {
                // Not turning: decay any leftover offset smoothly.
                State.TurnYawOffsetDeg = SmoothAngleDeg(State.TurnYawOffsetDeg, 0.0f,
                                                        8.0f, Input.DeltaTime);
            }
        }

        void UpdateBreath(const FKhaaosLocomotionConfig& Config,
                          FKhaaosLocomotionState& State,
                          const FKhaaosLocomotionInput& Input)
        {
            // Breathing rate rises with exertion (speed) and calms at rest.
            const float Exertion = ClampFloat(Input.RawSpeed / 900.0f, 0.0f, 1.0f);
            const float Frequency = Config.BreathFrequencyHz * (1.0f + Exertion * 2.5f);

            State.BreathPhase += Frequency * Input.DeltaTime;
            if (State.BreathPhase > 1.0f)
            {
                State.BreathPhase -= std::floor(State.BreathPhase);
            }

            // Carrier + organic noise wobble: the noise makes the idle
            // chest/spine cycle feel alive instead of mechanical.
            const float Carrier = std::sin(State.BreathPhase * 2.0f * 3.14159265358979f);
            const float Wobble = PerlinLike(Config.NoiseSeed, Input.TimeSeconds * 0.6f);
            State.Breath = (Carrier * 0.7f + Wobble * 0.3f) * Config.BreathAmplitude;
        }

        void UpdateHeadLook(const FKhaaosLocomotionConfig& Config,
                            FKhaaosLocomotionState& State,
                            const FKhaaosLocomotionInput& Input)
        {
            const float TargetYaw = ClampFloat(Input.HeadLookTargetYawDeg,
                                               -Config.HeadLookMaxYawDeg, Config.HeadLookMaxYawDeg);
            const float TargetPitch = ClampFloat(Input.HeadLookTargetPitchDeg,
                                                 -Config.HeadLookMaxPitchDeg, Config.HeadLookMaxPitchDeg);

            State.HeadLookYawDeg = SmoothAngleDeg(State.HeadLookYawDeg, TargetYaw,
                                                  Config.HeadLookSmoothing, Input.DeltaTime);
            State.HeadLookPitchDeg = SmoothFloat(State.HeadLookPitchDeg, TargetPitch,
                                                 Config.HeadLookSmoothing, Input.DeltaTime);
        }

        void UpdateFootIK(const FKhaaosLocomotionConfig& Config,
                          FKhaaosLocomotionState& State,
                          const FKhaaosLocomotionInput& Input)
        {
            // In air the feet relax to neutral (no fake IK mid-fall).
            const float TargetL = Input.bInAir ? 0.0f : ClampFloat(Input.FootGroundDeltaL, -Config.FootMaxOffsetCm, Config.FootMaxOffsetCm);
            const float TargetR = Input.bInAir ? 0.0f : ClampFloat(Input.FootGroundDeltaR, -Config.FootMaxOffsetCm, Config.FootMaxOffsetCm);
            const float TiltL = Input.bInAir ? 0.0f : ClampFloat(Input.FootGroundTiltL, -Config.FootMaxTiltDeg, Config.FootMaxTiltDeg);
            const float TiltR = Input.bInAir ? 0.0f : ClampFloat(Input.FootGroundTiltR, -Config.FootMaxTiltDeg, Config.FootMaxTiltDeg);

            // Critically damped: foot IK must never oscillate visibly.
            State.FootLeft.HeightOffsetCm = SpringStep(State.FootLeft.HeightOffsetCm, State.FootLeft.HeightVelocity,
                                                       TargetL, Config.FootStiffness, 1.0f,
                                                       Input.DeltaTime, State.FootLeft.HeightVelocity);
            State.FootRight.HeightOffsetCm = SpringStep(State.FootRight.HeightOffsetCm, State.FootRight.HeightVelocity,
                                                        TargetR, Config.FootStiffness, 1.0f,
                                                        Input.DeltaTime, State.FootRight.HeightVelocity);
            State.FootLeft.TiltDeg = SpringStep(State.FootLeft.TiltDeg, State.FootLeft.TiltVelocity,
                                                TiltL, Config.FootStiffness, 1.0f,
                                                Input.DeltaTime, State.FootLeft.TiltVelocity);
            State.FootRight.TiltDeg = SpringStep(State.FootRight.TiltDeg, State.FootRight.TiltVelocity,
                                                 TiltR, Config.FootStiffness, 1.0f,
                                                 Input.DeltaTime, State.FootRight.TiltVelocity);
        }
    }

    void Step(const FKhaaosLocomotionConfig& Config,
              FKhaaosLocomotionState& State,
              const FKhaaosLocomotionInput& Input)
    {
        const float Dt = ClampFloat(Input.DeltaTime, 0.0f, 0.25f);

        // 1) Parameter smoothing (kills blend-space parameter jumps).
        State.SmoothedSpeed = SmoothFloat(State.SmoothedSpeed, Input.RawSpeed,
                                          Config.SpeedSmoothing, Dt);
        State.SmoothedDirectionDeg = SmoothAngleDeg(State.SmoothedDirectionDeg,
                                                    Input.RawDirectionDeg,
                                                    Config.DirectionSmoothing, Dt);

        // 2) Stop ease (for stop/transition anims + distance matching hooks).
        const float StopTarget = (Input.RawSpeed > 10.0f || Input.bInAir) ? 1.0f : 0.0f;
        const float StopRate = (Config.StopEaseTime > 0.001f) ? (1.0f / Config.StopEaseTime) : 20.0f;
        State.StopEase = SmoothFloat(State.StopEase, StopTarget, StopRate, Dt);

        // 3) Secondary motion & procedural life.
        UpdateLean(Config, State, Input);
        UpdateStridePhase(Config, State, Input);
        UpdateLandRecovery(Config, State, Input);
        UpdateTurnInPlace(Config, State, Input);
        UpdateBreath(Config, State, Input);
        UpdateHeadLook(Config, State, Input);
        UpdateFootIK(Config, State, Input);

        // 4) Network smoothing for simulated proxies.
        State.NetworkSmoothedSpeed = SmoothFloat(State.NetworkSmoothedSpeed,
                                                 Input.RawSpeed,
                                                 Config.NetworkSmoothingRate, Dt);
    }

    int32_t ConsumeFootEvent(FKhaaosLocomotionState& State)
    {
        const int32_t Event = State.LastFootEvent;
        State.LastFootEvent = 0;
        return Event;
    }
}
