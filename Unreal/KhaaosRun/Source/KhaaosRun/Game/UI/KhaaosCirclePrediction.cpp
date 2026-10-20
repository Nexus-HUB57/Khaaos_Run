// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/KhaaosCirclePrediction.h"
#include "Game/Zone/KhaaosZoneManager.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosCirclePredictionComponent::UKhaaosCirclePredictionComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;

    PredictionUpdateInterval = 0.5f;
    bPredictionEnabled       = true;

    TimeSinceLastUpdate = 0.0f;

    ZoneManager = nullptr;
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

void UKhaaosCirclePredictionComponent::SetZoneManager(UKhaaosZoneManagerComponent* InZoneManager)
{
    ZoneManager = InZoneManager;

    if (ZoneManager)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("CirclePrediction::SetZoneManager - Zone manager bound"));
    }
    else
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("CirclePrediction::SetZoneManager - Null zone manager"));
    }
}

// ─── Zone State Reading ─────────────────────────────────────────────────────────

void UKhaaosCirclePredictionComponent::ReadZoneState()
{
    if (!ZoneManager)
    {
        return;
    }

    CurrentCircleData.Center         = ZoneManager->GetZoneCenter();
    CurrentCircleData.Radius         = ZoneManager->GetZoneRadius();
    CurrentCircleData.TargetCenter   = ZoneManager->GetTargetCenter();
    CurrentCircleData.TargetRadius   = ZoneManager->GetTargetRadius();
    CurrentCircleData.Phase          = ZoneManager->GetCurrentPhase();
    CurrentCircleData.bIsShrinking   = ZoneManager->IsShrinking();
    CurrentCircleData.ShrinkProgress = ZoneManager->GetShrinkProgress();
}

// ─── Prediction Computation ─────────────────────────────────────────────────────

void UKhaaosCirclePredictionComponent::ComputePrediction()
{
    if (!ZoneManager)
    {
        return;
    }

    // Read current zone state
    ReadZoneState();

    // Compute the extrapolated next circle
    CurrentPrediction = ExtrapolateNextCircle();

    // Compute accuracy
    CurrentPrediction.Accuracy = ComputeAccuracy();

    // If currently shrinking, we have confirmed next circle data
    if (CurrentCircleData.bIsShrinking)
    {
        NextCirclePrediction.PredictedCenter = CurrentCircleData.TargetCenter;
        NextCirclePrediction.PredictedRadius = CurrentCircleData.TargetRadius;
        NextCirclePrediction.PhaseIndex      = CurrentCircleData.Phase;
        NextCirclePrediction.TimeUntilShrink = ZoneManager->GetPhaseTimeRemaining();
        NextCirclePrediction.Accuracy        = 1.0f; // Confirmed — this is the actual target
    }
    else
    {
        // Zone is waiting — next circle is the target for current phase
        NextCirclePrediction.PredictedCenter = CurrentCircleData.TargetCenter;
        NextCirclePrediction.PredictedRadius = CurrentCircleData.TargetRadius;
        NextCirclePrediction.PhaseIndex      = CurrentCircleData.Phase;
        NextCirclePrediction.TimeUntilShrink = ZoneManager->GetPhaseTimeRemaining();
        NextCirclePrediction.Accuracy        = 0.8f; // High but not confirmed (could still shift)
    }
}

FKhaaosCirclePrediction UKhaaosCirclePredictionComponent::ExtrapolateNextCircle() const
{
    FKhaaosCirclePrediction Prediction;

    if (!ZoneManager || ZoneManager->IsZoneComplete())
    {
        // Zone is complete — no next circle
        Prediction.PhaseIndex = -1;
        Prediction.Accuracy   = 0.0f;
        return Prediction;
    }

    const int32 CurrentPhase = ZoneManager->GetCurrentPhase();
    const int32 NextPhase    = CurrentPhase + 1;
    const int32 TotalPhases  = ZoneManager->GetTotalPhases();

    Prediction.PhaseIndex = NextPhase;

    if (CurrentCircleData.bIsShrinking)
    {
        // Zone is currently shrinking — we can see the target
        // Prediction for the *next* phase after current shrink
        if (NextPhase < TotalPhases)
        {
            // Estimate next-next circle by extrapolating the shrink pattern
            // The center tends to drift within a bounded region
            const FVector2D CurrentTarget = CurrentCircleData.TargetCenter;
            const float CurrentTargetR    = CurrentCircleData.TargetRadius;

            // Extrapolate: radius shrinks by roughly 50% per phase (heuristic)
            Prediction.PredictedRadius = CurrentTargetR * 0.5f;

            // Center may drift — estimate as continuation of current drift
            const FVector2D Drift = CurrentTarget - CurrentCircleData.Center;
            const float DriftMag  = Drift.Size();

            if (DriftMag > 1.0f)
            {
                // Continue drift in same direction but capped
                const FVector2D DriftDir = Drift / DriftMag;
                const float EstimatedNextDrift = FMath::Min(DriftMag * 0.5f, CurrentTargetR * 0.3f);
                Prediction.PredictedCenter = CurrentTarget + DriftDir * EstimatedNextDrift;
            }
            else
            {
                Prediction.PredictedCenter = CurrentTarget;
            }

            Prediction.TimeUntilShrink = ZoneManager->GetPhaseTimeRemaining();
        }
        else
        {
            // This is the last phase — no prediction needed
            Prediction.PredictedCenter = CurrentCircleData.TargetCenter;
            Prediction.PredictedRadius = 0.0f;
            Prediction.TimeUntilShrink = ZoneManager->GetPhaseTimeRemaining();
        }
    }
    else
    {
        // Zone is waiting — predict based on target of current phase
        Prediction.PredictedCenter = CurrentCircleData.TargetCenter;
        Prediction.PredictedRadius = CurrentCircleData.TargetRadius;
        Prediction.TimeUntilShrink = ZoneManager->GetPhaseTimeRemaining();
    }

    return Prediction;
}

float UKhaaosCirclePredictionComponent::ComputeAccuracy() const
{
    if (!ZoneManager || ZoneManager->IsZoneComplete())
    {
        return 0.0f;
    }

    // Accuracy model:
    // • When zone is waiting (not shrinking yet): base accuracy ~0.3
    // • As wait time progresses: accuracy increases to ~0.6
    // • When shrinking starts: accuracy jumps to ~0.7
    // • As shrink progresses: accuracy increases to ~0.95
    // • When shrink is nearly complete: accuracy ~0.99

    if (CurrentCircleData.bIsShrinking)
    {
        // Shrinking — accuracy based on shrink progress
        const float Progress = CurrentCircleData.ShrinkProgress;

        // Curve: 0.7 + 0.29 * (progress^0.5)
        // At progress=0: 0.7, at progress=1: 0.99
        return 0.7f + 0.29f * FMath::Sqrt(Progress);
    }
    else
    {
        // Waiting — accuracy based on how far through wait period
        const float PhaseTimeRemaining = ZoneManager->GetPhaseTimeRemaining();
        const int32 CurrentPhase = ZoneManager->GetCurrentPhase();

        // Estimate total wait time from phase config (heuristic: use remaining/total)
        // Since we don't have direct access to wait time, estimate from remaining
        // and a typical wait time of 120s
        const float EstimatedWaitTime = 120.0f;
        const float ElapsedPct = 1.0f - FMath::Clamp(PhaseTimeRemaining / EstimatedWaitTime, 0.0f, 1.0f);

        // Curve: 0.3 + 0.3 * elapsedPct
        // At start: 0.3, at end: 0.6
        return 0.3f + 0.3f * ElapsedPct;
    }
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosCirclePredictionComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (!bPredictionEnabled)
    {
        return;
    }

    // Throttle updates based on configured interval
    TimeSinceLastUpdate += DeltaTime;
    if (TimeSinceLastUpdate < PredictionUpdateInterval)
    {
        return;
    }

    TimeSinceLastUpdate = 0.0f;

    // Store previous prediction for change detection
    const FKhaaosCirclePrediction PreviousPrediction = CurrentPrediction;

    // Compute new prediction
    ComputePrediction();

    // Broadcast if prediction changed significantly
    const bool bCenterChanged = (CurrentPrediction.PredictedCenter - PreviousPrediction.PredictedCenter).SizeSquared() > 1.0f;
    const bool bRadiusChanged = FMath::Abs(CurrentPrediction.PredictedRadius - PreviousPrediction.PredictedRadius) > 1.0f;
    const bool bAccuracyChanged = FMath::Abs(CurrentPrediction.Accuracy - PreviousPrediction.Accuracy) > 0.05f;

    if (bCenterChanged || bRadiusChanged || bAccuracyChanged)
    {
        OnPredictionUpdated.Broadcast(CurrentPrediction);

        UE_LOG(LogKhaaosRun, Verbose, TEXT("CirclePrediction - Updated: Center=(%.0f,%.0f) R=%.0f Phase=%d Accuracy=%.2f TimeUntil=%.1fs"),
            CurrentPrediction.PredictedCenter.X, CurrentPrediction.PredictedCenter.Y,
            CurrentPrediction.PredictedRadius, CurrentPrediction.PhaseIndex,
            CurrentPrediction.Accuracy, CurrentPrediction.TimeUntilShrink);
    }
}
