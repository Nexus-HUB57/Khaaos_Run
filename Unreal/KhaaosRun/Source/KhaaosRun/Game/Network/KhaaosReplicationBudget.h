// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosReplicationBudget.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UNetConnection;

// ─── Replication System Budget Types ──────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosBudgetSystem : uint8
{
    Combat      UMETA(DisplayName = "COMBAT"),
    Movement    UMETA(DisplayName = "MOVEMENT"),
    Inventory   UMETA(DisplayName = "INVENTORY"),
    UI          UMETA(DisplayName = "UI"),
    Other       UMETA(DisplayName = "OTHER")
};

// ─── Connection Quality Levels ────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosNetCondition : uint8
{
    LAN         UMETA(DisplayName = "LAN"),
    Good        UMETA(DisplayName = "GOOD"),
    Moderate    UMETA(DisplayName = "MODERATE"),
    Poor        UMETA(DisplayName = "POOR")
};

// ─── Per-Connection Bandwidth Track ───────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosConnectionBandwidth
{
    GENERATED_BODY()

    /** Net connection this track refers to. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    int32 ConnectionId = INDEX_NONE;

    /** Average round-trip time in ms. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float AvgRTTMs = 0.0f;

    /** Current outbound bytes per second. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float OutBytesPerSec = 0.0f;

    /** Current inbound bytes per second. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float InBytesPerSec = 0.0f;

    /** Per-system bandwidth usage (key = system enum value). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    TMap<EKhaaosBudgetSystem, float> SystemUsageBytesPerSec;

    /** Detected net condition. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    EKhaaosNetCondition NetCondition = EKhaaosNetCondition::Good;

    /** Last update timestamp. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float LastUpdateTime = 0.0f;
};

// ─── Budget Allocation Config ─────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosBudgetAllocation
{
    GENERATED_BODY()

    /** Combat budget percentage (default 40%). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float CombatPct = 40.0f;

    /** Movement budget percentage (default 25%). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float MovementPct = 25.0f;

    /** Inventory budget percentage (default 10%). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float InventoryPct = 10.0f;

    /** UI budget percentage (default 15%). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float UIPct = 15.0f;

    /** Other budget percentage (default 10%). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float OtherPct = 10.0f;
};

// ─── Tick Rate Configuration Per Net Condition ────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosTickRateConfig
{
    GENERATED_BODY()

    /** LAN tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|TickRate")
    float LANTickRate = 30.0f;

    /** Good connection tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|TickRate")
    float GoodTickRate = 20.0f;

    /** Moderate connection tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|TickRate")
    float ModerateTickRate = 14.0f;

    /** Poor connection tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|TickRate")
    float PoorTickRate = 8.0f;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnBandwidthExceeded, EKhaaosBudgetSystem, System, float, UsedBytesPerSec, float, BudgetBytesPerSec);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnTickRateChanged, EKhaaosNetCondition, OldCondition, EKhaaosNetCondition, NewCondition);

/**
 * UKhaaosReplicationBudgetComponent
 *
 * PhD-Level Replication Budget Manager for 60-100 player Battle Royale.
 *
 * Architecture:
 *   - Bandwidth budgets per system: Combat=40%, Movement=25%, Inventory=10%, UI=15%, Other=10%
 *   - Per-connection bandwidth tracking with RTT-based quality detection
 *   - Configurable tick rates per net condition: LAN=30Hz, Good=20Hz, Moderate=14Hz, Poor=8Hz
 *   - Adaptive replication: auto-downgrades non-critical data rate for poor connections
 *   - DOREPLIFETIME_CONDITION_NOTIFY for conditional replication
 *   - Delegates for OnBandwidthExceeded, OnTickRateChanged
 *
 * Integration:
 *   - Add to GameMode or GameState as a component
 *   - Other systems query GetBudgetForSystem() before replicating
 *   - Connection quality detection drives tick rate adaptation
 *   - Poor connections: reduce non-critical (UI, Inventory) replication frequency
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosReplicationBudgetComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosReplicationBudgetComponent();

    // ─── Budget Query ──────────────────────────────────────────────────────

    /** Get the bandwidth budget (bytes/sec) for a given system. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    float GetBudgetForSystem(EKhaaosBudgetSystem System) const;

    /** Get current bandwidth usage for a system on a specific connection. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    float GetSystemUsage(int32 ConnectionId, EKhaaosBudgetSystem System) const;

    /** Get total bandwidth budget (bytes/sec) across all systems. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    float GetTotalBandwidthBudget() const { return TotalBandwidthBudgetBytesPerSec; }

    /** Check if a system has exceeded its budget on any connection. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    bool IsBudgetExceeded(int32 ConnectionId, EKhaaosBudgetSystem System) const;

    // ─── Tick Rate Query ───────────────────────────────────────────────────

    /** Get current effective tick rate based on net condition. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    float GetCurrentTickRate() const { return CurrentEffectiveTickRate; }

    /** Get current net condition. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    EKhaaosNetCondition GetNetCondition() const { return CurrentNetCondition; }

    /** Get tick rate for a specific net condition. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    float GetTickRateForCondition(EKhaaosNetCondition Condition) const;

    // ─── Connection Quality ────────────────────────────────────────────────

    /** Detect net condition from average RTT. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    EKhaaosNetCondition DetectNetConditionFromRTT(float AvgRTTMs) const;

    /** Update bandwidth tracking for a connection (called from NetDriver hooks). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Network|Budget")
    void UpdateConnectionBandwidth(int32 ConnectionId, float AvgRTTMs, float OutBytesPerSec, float InBytesPerSec);

    /** Remove a connection from tracking (on disconnect). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Network|Budget")
    void RemoveConnection(int32 ConnectionId);

    // ─── Adaptive Replication ──────────────────────────────────────────────

    /** Get replication rate multiplier for a system on current connection quality.
     *  Returns 1.0 for critical systems regardless of condition.
     *  Returns reduced rate for non-critical systems on poor connections. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network|Budget")
    float GetReplicationRateMultiplier(EKhaaosBudgetSystem System) const;

    // ─── Configuration ─────────────────────────────────────────────────────

    /** Budget allocation percentages per system. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    FKhaaosBudgetAllocation BudgetAllocation;

    /** Tick rate configuration per net condition. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    FKhaaosTickRateConfig TickRateConfig;

    /** Total bandwidth budget in bytes/sec (default: 600 KB/s for dedicated server). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float TotalBandwidthBudgetBytesPerSec = 614400.0f;

    /** RTT threshold for Good connection (ms). Below = LAN. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float RTTThresholdLAN = 10.0f;

    /** RTT threshold for Moderate connection (ms). Below = Good. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float RTTThresholdGood = 80.0f;

    /** RTT threshold for Poor connection (ms). Below = Moderate. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float RTTThresholdModerate = 200.0f;

    /** Replication multiplier for non-critical systems on Moderate connections. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float ModerateReplicationMultiplier = 0.7f;

    /** Replication multiplier for non-critical systems on Poor connections. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float PoorReplicationMultiplier = 0.4f;

    /** How often to re-evaluate connection quality (seconds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float QualityReevaluateInterval = 2.0f;

    // ─── Replicated State ──────────────────────────────────────────────────

    /** Current net condition (replicated to clients for UI display). */
    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    EKhaaosNetCondition CurrentNetCondition = EKhaaosNetCondition::Good;

    /** Current effective tick rate (replicated for client prediction). */
    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    float CurrentEffectiveTickRate = 20.0f;

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast when any system exceeds its bandwidth budget. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Network|Budget")
    FOnBandwidthExceeded OnBandwidthExceeded;

    /** Broadcast when tick rate changes due to connection quality change. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Network|Budget")
    FOnTickRateChanged OnTickRateChanged;

    // ─── Tick & Replication ────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

    // ─── Per-Connection Tracking ───────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Network|Budget")
    TMap<int32, FKhaaosConnectionBandwidth> ConnectionBandwidths;

    /** Time since last quality re-evaluation. */
    float QualityReevaluateTimer = 0.0f;

    /** Previous net condition (for change detection). */
    EKhaaosNetCondition PreviousNetCondition = EKhaaosNetCondition::Good;

    // ─── Internal Methods ──────────────────────────────────────────────────

    /** Evaluate connection quality for all tracked connections. */
    void EvaluateConnectionQuality();

    /** Compute the worst net condition across all connections. */
    EKhaaosNetCondition ComputeWorstNetCondition() const;

    /** Update effective tick rate based on net condition. */
    void UpdateEffectiveTickRate();

    /** Check bandwidth budgets and fire delegates for exceeded systems. */
    void CheckBudgetExceeded();
};
