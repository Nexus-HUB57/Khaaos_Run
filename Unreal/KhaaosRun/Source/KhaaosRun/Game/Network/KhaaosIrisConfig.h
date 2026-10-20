// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/KhaaosGameMode.h"
#include "KhaaosIrisConfig.generated.h"

// ─── Iris Replication Priority ────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosIrisPriority : uint8
{
    Critical UMETA(DisplayName = "CRITICAL"),
    High     UMETA(DisplayName = "HIGH"),
    Medium   UMETA(DisplayName = "MEDIUM"),
    Low      UMETA(DisplayName = "LOW")
};

// ─── Iris Object Configuration ────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosIrisObjectConfig
{
    GENERATED_BODY()

    /** Iris replication priority for this object type. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Config")
    EKhaaosIrisPriority Priority = EKhaaosIrisPriority::Medium;

    /** Minimum bandwidth allocation for this object type (bytes/sec). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Config")
    float MinBandwidthBytesPerSec = 0.0f;

    /** Maximum update rate for this object type (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Config")
    float MaxUpdateRate = 30.0f;

    /** Spatial replication cell size (0 = use default). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Config")
    float SpatialCellSize = 0.0f;

    FKhaaosIrisObjectConfig() = default;

    FKhaaosIrisObjectConfig(EKhaaosIrisPriority InPriority, float InMinBandwidth, float InMaxUpdateRate, float InCellSize = 0.0f)
        : Priority(InPriority)
        , MinBandwidthBytesPerSec(InMinBandwidth)
        , MaxUpdateRate(InMaxUpdateRate)
        , SpatialCellSize(InCellSize)
    {}
};

// ─── Spatial Replication Grid Settings ─────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosIrisSpatialGrid
{
    GENERATED_BODY()

    /** Grid cell size in world units. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Spatial")
    float CellSize = 4000.0f;

    /** Spatial hysteresis distance (cells within this range stay relevant). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Spatial")
    float HysteresisDistance = 1000.0f;

    /** Maximum number of spatially relevant actors per connection. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Spatial")
    int32 MaxRelevantActors = 1024;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnIrisConfigChanged, EWorldSequence, World, int32, PlayerCount);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPriorityEscalation, bool, bEscalated);

/**
 * UKhaaosIrisConfigSubsystem
 *
 * PhD-Level Iris Serialization Configuration for UE5.8.
 *
 * Architecture:
 *   - EKhaaosIrisPriority (Critical, High, Medium, Low) for all game objects
 *   - FKhaaosIrisObjectConfig per object type with priority, min bandwidth, max update rate
 *   - Default priority mappings: PlayerState=Critical, Weapon=High, Loot=Medium,
 *     Vehicle=Medium, KillFeed=Low
 *   - Spatial replication grid with per-world cell size tuning
 *   - ConfigureForWorld(EWorldSequence) adjusts bandwidth based on world player count
 *   - Dynamic priority escalation: when player count < 20, all upgrade to Critical
 *     for final circle (every replication matters in endgame)
 *
 * World-Specific Tuning:
 *   - Barburhen (100p): cell size = 5000, larger bandwidth
 *   - CIGKV (50p): cell size = 4000, moderate bandwidth
 *   - Ckesalth (dense): cell size = 3000, tighter spatial clustering
 *   - Priadus/Arukheea: default cell size = 4000
 *
 * Integration:
 *   - Initialized as GameInstanceSubsystem
 *   - GameMode calls ConfigureForWorld() on world transition
 *   - ReplicationGraph queries GetObjectConfig() for actor types
 *   - BudgetManager queries GetSpatialGrid() for spatial settings
 */
UCLASS(Config=Engine, defaultconfig)
class UKhaaosIrisConfigSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosIrisConfigSubsystem();

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Configure Iris settings for a specific world.
     *  Adjusts spatial grid cell size and bandwidth based on world characteristics. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Iris")
    void ConfigureForWorld(EWorldSequence World, int32 PlayerCount = 100);

    /** Get Iris object configuration for a named object type. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Iris")
    FKhaaosIrisObjectConfig GetObjectConfig(FName ObjectType) const;

    /** Get current spatial grid settings. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Iris")
    FKhaaosIrisSpatialGrid GetSpatialGrid() const { return CurrentSpatialGrid; }

    /** Get the current world being configured. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Iris")
    EWorldSequence GetCurrentWorld() const { return ConfiguredWorld; }

    /** Get current player count used for bandwidth calculation. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Iris")
    int32 GetCurrentPlayerCount() const { return CurrentPlayerCount; }

    // ─── Priority Escalation ────────────────────────────────────────────────

    /** Check if priority escalation is active (final circle, < 20 players). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Iris")
    bool IsPriorityEscalationActive() const { return bPriorityEscalationActive; }

    /** Manually trigger priority escalation (e.g., final circle event). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Iris")
    void ActivatePriorityEscalation();

    /** Deactivate priority escalation. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Iris")
    void DeactivatePriorityEscalation();

    /** Get effective priority for an object, accounting for escalation. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Iris")
    EKhaaosIrisPriority GetEffectivePriority(FName ObjectType) const;

    // ─── Settings ───────────────────────────────────────────────────────────

    /** Default object type configurations. Key = object type FName. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Iris|Objects")
    TMap<FName, FKhaaosIrisObjectConfig> DefaultObjectConfigs;

    /** Default spatial grid configuration. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Iris|Spatial")
    FKhaaosIrisSpatialGrid DefaultSpatialGrid;

    /** Player count threshold for priority escalation (final circle). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Iris|Escalation")
    int32 EscalationPlayerThreshold = 20;

    /** Whether Iris is enabled. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Iris")
    uint8 bEnableIris : 1;

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast when Iris config changes for a world. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Iris")
    FOnIrisConfigChanged OnIrisConfigChanged;

    /** Broadcast when priority escalation is activated/deactivated. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Iris")
    FOnPriorityEscalation OnPriorityEscalation;

protected:

    /** Current spatial grid (may differ per world). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Iris")
    FKhaaosIrisSpatialGrid CurrentSpatialGrid;

    /** Current configured world. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Iris")
    EWorldSequence ConfiguredWorld = EWorldSequence::CIGKV;

    /** Current player count for bandwidth calculations. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Iris")
    int32 CurrentPlayerCount = 100;

    /** Whether priority escalation is active. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Iris")
    uint8 bPriorityEscalationActive : 1;

    // ─── Internal Methods ──────────────────────────────────────────────────

    /** Initialize default priority mappings for all game objects. */
    void InitDefaultPriorityMappings();

    /** Set spatial grid cell size for a specific world. */
    void SetSpatialGridForWorld(EWorldSequence World);

    /** Check and auto-activate priority escalation based on player count. */
    void CheckAutoEscalation(int32 PlayerCount);
};
