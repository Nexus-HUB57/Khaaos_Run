// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosAirdropSystem.generated.h"

// ─── Airdrop Rarity ───────────────────────────────────────────────────────────

/** Rarity tier for airdrop loot pools.
 *  Common/Uncommon in early game; Rare/Lendário (Legendary) in later phases
 *  with special VFX and high-value loot. Free Fire-style escalation. */
UENUM(BlueprintType)
enum class EKhaaosAirdropRarity : uint8
{
    Common    UMETA(DisplayName = "COMMON"),
    Uncommon  UMETA(DisplayName = "UNCOMMON"),
    Rare      UMETA(DisplayName = "RARE"),
    Lendario  UMETA(DisplayName = "LENDÁRIO")
};

// ─── Airdrop Data ──────────────────────────────────────────────────────────────

/** Represents a single scheduled or active airdrop/supply drop. */
USTRUCT(BlueprintType)
struct FKhaaosAirdrop
{
    GENERATED_BODY()

    /** World-space landing location for this airdrop. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    FVector Location = FVector::ZeroVector;

    /** Loot pool item names to spawn on landing. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    TArray<FName> LootPool;

    /** Scheduled server time for this drop. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float DropTime = 0.0f;

    /** Whether the crate has landed and loot is available. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    uint8 bHasLanded : 1;

    /** Rarity tier determining loot quality and VFX. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    EKhaaosAirdropRarity Rarity = EKhaaosAirdropRarity::Common;

    /** Unique identifier for this airdrop. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    int32 AirdropId = -1;

    FKhaaosAirdrop()
        : Location(FVector::ZeroVector)
        , DropTime(0.0f)
        , bHasLanded(false)
        , Rarity(EKhaaosAirdropRarity::Common)
        , AirdropId(-1)
    {}
};

// ─── Drop Pattern Config ───────────────────────────────────────────────────────

/** Configurable airdrop pattern — intervals, rarity distribution, zone weighting. */
USTRUCT(BlueprintType)
struct FKhaaosAirdropPattern
{
    GENERATED_BODY()

    /** Base interval between airdrops in seconds. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float BaseIntervalSeconds = 120.0f;

    /** Interval decrease per match minute (drops become more frequent). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float IntervalDecreasePerMinute = 5.0f;

    /** Minimum interval between drops (floor). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float MinimumIntervalSeconds = 30.0f;

    /** Weight toward zone edge (0 = fully random, 1 = always zone edge). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float ZoneEdgeWeight = 0.6f;

    /** Whether to auto-drop at zone edges in later phases. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    uint8 bDropAtZoneEdgeLaterPhases : 1;

    /** Match phase after which edge-drops begin. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    int32 EdgeDropStartPhase = 2;

    FKhaaosAirdropPattern()
        : BaseIntervalSeconds(120.0f)
        , IntervalDecreasePerMinute(5.0f)
        , MinimumIntervalSeconds(30.0f)
        , ZoneEdgeWeight(0.6f)
        , bDropAtZoneEdgeLaterPhases(true)
        , EdgeDropStartPhase(2)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAirdropIncoming, int32, AirdropId, const FVector&, Location);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAirdropLanded, int32, AirdropId, const FVector&, Location);

/**
 * UKhaaosAirdropSystemComponent
 *
 * Free Fire-style airdrop/supply drop system for Khaaos Run.
 *
 * Architecture:
 *   - ScheduleAirdrop(): server schedules a drop at a random location,
 *     weighted toward safe zone edges in later phases.
 *   - ConfigureDropPattern(): customizable intervals that decrease over time
 *     (120s base, -5s/min, floor 30s) — matching Free Fire pacing.
 *   - Loot pool selection: rarity escalates with match time.
 *     Early game = Common/Uncommon; later = Rare/Lendário with special VFX.
 *   - Zone-edge weighting: drops land near the zone boundary but inside,
 *     creating high-risk/high-reward contest zones.
 *   - Lendário (Legendary) drops: distinct VFX, top-tier loot pool,
 *     announced to all players — creates map-wide urgency.
 *   - Server-authoritative: only the server schedules and spawns drops.
 *
 * Integration:
 *   - GameMode creates this component and calls SetZoneManager()
 *   - TickComponent handles scheduled drops automatically
 *   - UI binds OnAirdropIncoming for minimap markers
 *   - VFX system binds OnAirdropLanded for crate effects
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosAirdropSystemComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosAirdropSystemComponent();

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Configure the airdrop drop pattern (intervals, weighting, etc). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Airdrop")
    void ConfigureDropPattern(const FKhaaosAirdropPattern& InPattern);

    /** Set the safe zone center and radius for zone-edge weighted drops. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Airdrop")
    void SetZoneInfo(const FVector2D& ZoneCenter, float ZoneRadius, int32 CurrentPhase);

    /** Set the map bounds for random location generation. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Airdrop")
    void SetMapBounds(const FVector2D& InMapCenter, float InMapRadius);

    // ─── Drop Control ───────────────────────────────────────────────────────

    /** Schedule an airdrop at a random location (server-only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Airdrop")
    void ScheduleAirdrop();

    /** Schedule an airdrop at a specific location (debug/testing). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Airdrop", meta=(DevelopmentOnly))
    void ScheduleAirdropAtLocation(const FVector& Location, EKhaaosAirdropRarity Rarity);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Get all active (not yet landed) airdrops. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Airdrop")
    TArray<FKhaaosAirdrop> GetPendingAirdrops() const;

    /** Get all landed airdrops. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Airdrop")
    TArray<FKhaaosAirdrop> GetLandedAirdrops() const;

    /** Get total airdrops scheduled this match. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Airdrop")
    int32 GetTotalAirdropsScheduled() const { return NextAirdropId; }

    // ─── Drop Pattern ───────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    FKhaaosAirdropPattern DropPattern;

    /** Loot pools by rarity tier (FName references to data table rows). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    TMap<EKhaaosAirdropRarity, TArray<FName>> LootPoolsByRarity;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Airdrop")
    FOnAirdropIncoming OnAirdropIncoming;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Airdrop")
    FOnAirdropLanded OnAirdropLanded;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Internal State ─────────────────────────────────────────────────────

    /** All scheduled and active airdrops. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    TArray<FKhaaosAirdrop> ActiveAirdrops;

    /** Monotonically increasing airdrop ID counter. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    int32 NextAirdropId = 0;

    /** Match elapsed time (tracked internally). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float MatchElapsedTime = 0.0f;

    /** Time until next scheduled drop. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Airdrop")
    float TimeUntilNextDrop = 0.0f;

    /** Zone info for weighted location selection. */
    FVector2D SafeZoneCenter = FVector2D::ZeroVector;
    float SafeZoneRadius = 10000.0f;
    int32 ZonePhase = 0;

    /** Map bounds for random location generation. */
    FVector2D MapCenter = FVector2D::ZeroVector;
    float MapRadius = 10000.0f;

    // ─── Internal Methods ───────────────────────────────────────────────────

    /** Compute a random drop location weighted toward zone edge. */
    FVector ComputeDropLocation() const;

    /** Determine rarity based on match time. */
    EKhaaosAirdropRarity DetermineRarity() const;

    /** Select loot pool items for the given rarity. */
    TArray<FName> SelectLootForRarity(EKhaaosAirdropRarity Rarity) const;

    /** Compute current interval based on match time. */
    float ComputeCurrentInterval() const;

    /** Initialize default loot pools. */
    void InitializeDefaultLootPools();
};
