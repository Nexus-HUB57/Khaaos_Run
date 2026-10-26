// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Ring Prediction Component — Shows next ring on minimap (FreeFire style)

#include "Ring/KhaaosRingPredictionComponent.h"
#include "Ring/KhaaosRingSubsystem.h"

UKhaaosRingPredictionComponent::UKhaaosRingPredictionComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UKhaaosRingPredictionComponent::UpdatePrediction(int32 NextPhase)
{
    CurrentPrediction.PhaseIndex = NextPhase;

    // Get phase data from subsystem
    if (const UGameInstance* GI = GetOwner() ? GetOwner()->GetGameInstance() : nullptr)
    {
        if (const UKhaaosRingSubsystem* RingSub = GI->GetSubsystem<UKhaaosRingSubsystem>())
        {
            // Determine current world and get phases
            // For now, use default prediction
            CurrentPrediction.PredictedCenter = FVector::ZeroVector;
            CurrentPrediction.PredictedRadius = 400.f; // Default next radius
        }
    }

    // Set accuracy based on phase (degrades in later phases)
    ApplyAccuracyShift(NextPhase);

    UE_LOG(LogTemp, Log,
        TEXT("RingPrediction: Phase %d, R=%.0f, accuracy=%s"),
        NextPhase, CurrentPrediction.PredictedRadius,
        *UEnum::GetValueAsString(CurrentPrediction.Accuracy));
}

FVector UKhaaosRingPredictionComponent::GetPredictedCenter() const
{
    return CurrentPrediction.PredictedCenter;
}

float UKhaaosRingPredictionComponent::GetPredictedRadius() const
{
    return CurrentPrediction.PredictedRadius;
}

void UKhaaosRingPredictionComponent::ApplyAccuracyShift(int32 Phase)
{
    // Accuracy degrades with each phase
    if (Phase <= 2)
    {
        CurrentPrediction.Accuracy = EPredictionAccuracy::EXACT;
        CurrentPrediction.RandomShiftMeters = 0.f;
    }
    else if (Phase == 3)
    {
        CurrentPrediction.Accuracy = EPredictionAccuracy::APPROXIMATE_90PCT;
        CurrentPrediction.RandomShiftMeters = FMath::FRandRange(-10.f, 10.f);
    }
    else if (Phase == 4)
    {
        CurrentPrediction.Accuracy = EPredictionAccuracy::APPROXIMATE_80PCT;
        CurrentPrediction.RandomShiftMeters = FMath::FRandRange(-20.f, 20.f);
    }
    else if (Phase == 5)
    {
        CurrentPrediction.Accuracy = EPredictionAccuracy::APPROXIMATE_70PCT;
        CurrentPrediction.RandomShiftMeters = FMath::FRandRange(-30.f, 30.f);
    }
    else
    {
        CurrentPrediction.Accuracy = EPredictionAccuracy::RANDOM_SHIFT;
        CurrentPrediction.RandomShiftMeters = FMath::FRandRange(-50.f, 50.f);
    }

    // Apply random shift to center
    if (CurrentPrediction.RandomShiftMeters != 0.f)
    {
        const float Angle = FMath::FRand() * 2.f * PI;
        CurrentPrediction.PredictedCenter += FVector(
            CurrentPrediction.RandomShiftMeters * FMath::Cos(Angle),
            CurrentPrediction.RandomShiftMeters * FMath::Sin(Angle),
            0.f
        );
    }
}

void UKhaaosRingPredictionComponent::RenderMinimapPreview()
{
    if (!bShowOnMinimap) return;

    // Render transparent white circle on minimap at predicted position
    // This would use UMinimapWidget or UCanvas to draw the preview circle
    // Canvas->K2_DrawCircle(CurrentPrediction.PredictedCenter, CurrentPrediction.PredictedRadius, FLinearColor(1,1,1,0.25));
}
