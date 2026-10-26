#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Ring/KhaaosRingManager.h"
#include "Ring/KhaaosRingPredictionComponent.generated.h"

UENUM(BlueprintType)
enum class EPredictionAccuracy : uint8
{
    EXACT              UMETA(DisplayName = "Exact"),
    APPROXIMATE_90PCT  UMETA(DisplayName = "Approximate 90%"),
    APPROXIMATE_80PCT  UMETA(DisplayName = "Approximate 80%"),
    APPROXIMATE_70PCT  UMETA(DisplayName = "Approximate 70%"),
    RANDOM_SHIFT       UMETA(DisplayName = "Random Shift")
};

USTRUCT(BlueprintType)
struct FRingPrediction
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector PredictedCenter = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float PredictedRadius = 0.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EPredictionAccuracy Accuracy = EPredictionAccuracy::EXACT;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float RandomShiftMeters = 0.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 PhaseIndex = 0;
};

UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosRingPredictionComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosRingPredictionComponent();

    void UpdatePrediction(int32 NextPhase);
    FVector GetPredictedCenter() const;
    float GetPredictedRadius() const;
    void ApplyAccuracyShift(int32 Phase);
    void RenderMinimapPreview();

private:
    UPROPERTY()
    FRingPrediction CurrentPrediction;

    UPROPERTY()
    bool bShowOnMinimap = true;
};
