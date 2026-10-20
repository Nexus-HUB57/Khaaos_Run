// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosCirclePrediction.generated.h"

// ─── Forward Declarations ────────────────────────────────────────────────────

class UKhaaosZoneManagerComponent;

// ─── Circle Prediction Data ───────────────────────────────────────────────────

/** Predicted next safe zone circle data for minimap UI rendering.
 *  Implements the "white circle" prediction seen in Fortnite — shows players
 *  where the next zone will be before it starts shrinking, with accuracy
 *  that improves as the current phase nears completion. */
USTRUCT(BlueprintType)
struct FKhaaosCirclePrediction
{
    GENERATED_BODY()

    /** Predicted center of the next zone phase. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    FVector2D PredictedCenter = FVector2D::ZeroVector;

    /** Predicted radius of the next zone phase (world units). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float PredictedRadius = 0.0f;

    /** Seconds until the current zone finishes shrinking (time until next phase). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float TimeUntilShrink = 0.0f;

    /** Phase index of the predicted circle (next phase). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    int32 PhaseIndex = -1;

    /** Prediction accuracy (0.0 = wild guess, 1.0 = confirmed).
     *  Accuracy increases as the current phase nears completion:
     *  • At phase start: accuracy ~ 0.3 (rough estimate)
     *  • At 50% progress: accuracy ~ 0.6
     *  • At 90% progress: accuracy ~ 0.95 (nearly confirmed) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float Accuracy = 0.0f;

    FKhaaosCirclePrediction()
        : PredictedCenter(FVector2D::ZeroVector)
        , PredictedRadius(0.0f)
        , TimeUntilShrink(0.0f)
        , PhaseIndex(-1)
        , Accuracy(0.0f)
    {}
};

// ─── Current Circle Data ───────────────────────────────────────────────────────

/** Current safe zone circle data for minimap rendering. */
USTRUCT(BlueprintType)
struct FKhaaosCurrentCircleData
{
    GENERATED_BODY()

    /** Current zone center. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    FVector2D Center = FVector2D::ZeroVector;

    /** Current zone radius. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float Radius = 0.0f;

    /** Target zone center (where zone is shrinking toward). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    FVector2D TargetCenter = FVector2D::ZeroVector;

    /** Target zone radius. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float TargetRadius = 0.0f;

    /** Current phase index. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    int32 Phase = -1;

    /** Whether the zone is currently shrinking. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    uint8 bIsShrinking : 1;

    /** Shrink progress (0.0 = just started, 1.0 = complete). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float ShrinkProgress = 0.0f;

    FKhaaosCurrentCircleData()
        : Center(FVector2D::ZeroVector)
        , Radius(0.0f)
        , TargetCenter(FVector2D::ZeroVector)
        , TargetRadius(0.0f)
        , Phase(-1)
        , bIsShrinking(false)
        , ShrinkProgress(0.0f)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPredictionUpdated, const FKhaaosCirclePrediction&, Prediction);

/**
 * UKhaaosCirclePredictionComponent
 *
 * Circle prediction data provider for minimap UI (Fortnite white circle).
 *
 * Architecture:
 *   - Reads current zone state from UKhaaosZoneManagerComponent
 *   - Computes predicted next circle position and radius
 *   - Prediction accuracy improves as current phase nears completion
 *   - "White circle" rendering: UI draws the predicted circle with
 *     opacity proportional to accuracy
 *   - GetPrediction(): main query for UI to get predicted circle
 *   - GetCurrentCircleData(): query for current zone rendering
 *   - GetNextCircleData(): query for confirmed next zone (when available)
 *   - TickComponent: recalculates prediction each frame
 *
 * Integration:
 *   - GameMode creates this component and calls SetZoneManager()
 *   - MinimapWidget reads GetPrediction() for white circle rendering
 *   - UKhaaosZoneManagerComponent provides zone state data
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosCirclePredictionComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosCirclePredictionComponent();

    // ─── Setup ──────────────────────────────────────────────────────────────

    /** Set the zone manager component to read zone state from. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CirclePrediction")
    void SetZoneManager(UKhaaosZoneManagerComponent* InZoneManager);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Get the current circle prediction (white circle for minimap). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CirclePrediction")
    FKhaaosCirclePrediction GetPrediction() const { return CurrentPrediction; }

    /** Get current zone circle data for rendering. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CirclePrediction")
    FKhaaosCurrentCircleData GetCurrentCircleData() const { return CurrentCircleData; }

    /** Get confirmed next circle data (available when current phase is shrinking). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CirclePrediction")
    FKhaaosCirclePrediction GetNextCircleData() const { return NextCirclePrediction; }

    // ─── Configuration ──────────────────────────────────────────────────────

    /** How often to update predictions (seconds). Lower = smoother but more CPU. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    float PredictionUpdateInterval = 0.5f;

    /** Whether prediction is enabled (can be disabled for performance). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    uint8 bPredictionEnabled : 1;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|CirclePrediction")
    FOnPredictionUpdated OnPredictionUpdated;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Internal State ─────────────────────────────────────────────────────

    /** Cached zone manager reference. */
    UPROPERTY()
    UKhaaosZoneManagerComponent* ZoneManager = nullptr;

    /** Current circle prediction result. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    FKhaaosCirclePrediction CurrentPrediction;

    /** Current circle data from zone manager. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    FKhaaosCurrentCircleData CurrentCircleData;

    /** Next circle prediction (confirmed when zone is shrinking). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CirclePrediction")
    FKhaaosCirclePrediction NextCirclePrediction;

    /** Time since last prediction update. */
    float TimeSinceLastUpdate = 0.0f;

    // ─── Internal Methods ───────────────────────────────────────────────────

    /** Compute prediction based on current zone manager state. */
    void ComputePrediction();

    /** Read current zone state from the zone manager. */
    void ReadZoneState();

    /** Extrapolate next circle from current state and phase config. */
    FKhaaosCirclePrediction ExtrapolateNextCircle() const;

    /** Compute prediction accuracy based on current phase progress. */
    float ComputeAccuracy() const;
};
