// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosZoneManager.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosGameState;

// ─── Zone Phase Configuration ─────────────────────────────────────────────────

/** Single phase of the safe zone shrinking cycle.
 *  Each phase has a wait period (zone stable), then a shrink period (zone moves).
 *  Damage escalates with each phase — matching Fortnite battle royale pacing. */
USTRUCT(BlueprintType)
struct FKhaaosZonePhase
{
    GENERATED_BODY()

    /** Seconds the zone waits at current size before shrinking. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float WaitTimeSeconds = 120.0f;

    /** Seconds the zone takes to shrink to the target size. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float ShrinkTimeSeconds = 60.0f;

    /** Target radius as percentage of map radius (0.0 = point, 1.0 = full map). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float TargetRadiusPct = 0.5f;

    /** Damage per tick for players outside zone during this phase. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float DamagePerTick = 1.0f;

    /** Whether the zone center shifts to a new random point during this shrink. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    uint8 bIsMoving : 1;

    FKhaaosZonePhase()
        : WaitTimeSeconds(120.0f)
        , ShrinkTimeSeconds(60.0f)
        , TargetRadiusPct(0.5f)
        , DamagePerTick(1.0f)
        , bIsMoving(false)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnZonePhaseChanged, int32, OldPhase, int32, NewPhase, float, DamagePerTick);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnZoneShrinkStarted, int32, Phase, float, DurationSeconds);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZoneShrinkComplete, int32, Phase);

/**
 * UKhaaosZoneManagerComponent
 *
 * PhD-Level multi-phase safe zone manager (Fortnite-style storm circle).
 *
 * Architecture:
 *   - Configurable phase array: each phase defines wait time, shrink time,
 *     target radius %, damage/tick, and whether the center moves.
 *   - Smooth interpolation: zone center and radius interpolate using
 *     cubic easing during shrink phases, giving the visual "closing circle".
 *   - Server-authoritative: only the server ticks zone progression.
 *     Clients receive replicated zone state for rendering.
 *   - Phase escalation: damage per tick increases each phase,
 *     forcing players inward with escalating pressure.
 *   - Random center drift: later phases can shift the zone center,
 *     preventing camping at the final circle center.
 *
 * Integration:
 *   - GameMode calls InitializeZone() on StartMatch
 *   - GameMode reads ZoneCenter/ZoneRadius/ZoneDamagePerTick for ApplyZoneDamage()
 *   - GameState receives zone state updates for client replication
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosZoneManagerComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosZoneManagerComponent();

    // ─── Initialization ─────────────────────────────────────────────────────

    /** Initialize zone with map bounds. Generates default phases if none configured. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone")
    void InitializeZone(const FVector2D& MapCenter, float MapRadius);

    /** Override default phases with custom configuration (called from GameMode). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone")
    void SetZonePhases(const TArray<FKhaaosZonePhase>& InPhases);

    // ─── Phase Control ──────────────────────────────────────────────────────

    /** Skip the current wait phase and start shrinking immediately (debug/testing). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone", meta=(DevelopmentOnly))
    void SkipCurrentWait();

    /** Force advance to the next phase (debug/testing). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone", meta=(DevelopmentOnly))
    void ForceNextPhase();

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Get the current zone center in world space (2D). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    FVector2D GetZoneCenter() const { return ZoneCenter; }

    /** Get the current zone radius (world units). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    float GetZoneRadius() const { return ZoneRadius; }

    /** Get the target zone center (where zone is shrinking toward). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    FVector2D GetTargetCenter() const { return TargetCenter; }

    /** Get the target zone radius. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    float GetTargetRadius() const { return TargetRadius; }

    /** Get current damage per tick for players outside the zone. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    float GetDamagePerTick() const { return CurrentDamagePerTick; }

    /** Get the current phase index (0-based). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    int32 GetCurrentPhase() const { return CurrentPhase; }

    /** Get the total number of phases. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    int32 GetTotalPhases() const { return ZonePhases.Num(); }

    /** Is the zone currently shrinking? */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    bool IsShrinking() const { return bIsShrinking; }

    /** Get shrink progress (0.0 = just started, 1.0 = complete). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    float GetShrinkProgress() const { return ShrinkProgress; }

    /** Get seconds remaining in current phase (wait or shrink). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    float GetPhaseTimeRemaining() const { return PhaseTimeRemaining; }

    /** Check if all phases are complete (final zone reached). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
    bool IsZoneComplete() const { return CurrentPhase >= ZonePhases.Num(); }

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Zone phase configuration array. Set before InitializeZone(). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    TArray<FKhaaosZonePhase> ZonePhases;

    /** Interpolation speed for smooth zone shrink (higher = snappier). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float InterpolationSpeed = 2.0f;

    /** Minimum zone radius in world units (zone never shrinks below this). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float MinimumRadius = 500.0f;

    /** How far the zone center can drift during a moving phase (0-1 pct of map radius). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
    float MaxCenterDriftPct = 0.3f;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zone")
    FOnZonePhaseChanged OnZonePhaseChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zone")
    FOnZoneShrinkStarted OnZoneShrinkStarted;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zone")
    FOnZoneShrinkComplete OnZoneShrinkComplete;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Replicated Zone State ──────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    FVector2D ZoneCenter = FVector2D::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    float ZoneRadius = 10000.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    FVector2D TargetCenter = FVector2D::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    float TargetRadius = 10000.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    float CurrentDamagePerTick = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    int32 CurrentPhase = -1;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    uint8 bIsShrinking : 1;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    float ShrinkProgress = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Zone")
    float PhaseTimeRemaining = 0.0f;

    // ─── Internal State ─────────────────────────────────────────────────────

    UPROPERTY()
    FVector2D MapCenterPoint = FVector2D::ZeroVector;

    UPROPERTY()
    float MapRadiusUnits = 10000.0f;

    /** Phase state: Waiting → Shrinking → (next phase) Waiting → ... */
    enum class EPhaseState : uint8 { Inactive, Waiting, Shrinking };
    EPhaseState PhaseState = EPhaseState::Inactive;

    /** Start center/radius for current shrink interpolation. */
    FVector2D ShrinkStartCenter = FVector2D::ZeroVector;
    float ShrinkStartRadius = 0.0f;

    // ─── Internal Methods ───────────────────────────────────────────────────

    /** Advance to the next zone phase. Generates target center/radius. */
    void AdvancePhase();

    /** Compute a random target center for a moving phase. */
    FVector2D ComputeRandomTargetCenter() const;

    /** Cubic ease-in-out interpolation for smooth shrink. */
    static float CubicEaseInOut(float T);

    /** Generate default 5-phase zone configuration. */
    void GenerateDefaultPhases();
};
