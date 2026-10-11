// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KhaaosNetMetrics.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when high latency is detected (RTT exceeds threshold). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnHighLatency, float, CurrentRTT, float, Threshold);

/** Broadcast when metrics are updated (for HUD display). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMetricsUpdated, float, DeltaTime);

/**
 * FNetMetricsSnapshot
 *
 * Per-frame snapshot of network metrics.
 * Captured each tick for running average computation and HUD display.
 */
USTRUCT(BlueprintType)
struct FNetMetricsSnapshot
{
        GENERATED_BODY()

        /** Average round-trip time (ms). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        float AvgRTT = 0.0f;

        /** Packet loss percentage (0-100). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        float PacketLoss = 0.0f;

        /** Incoming bandwidth (bytes/sec). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        float BandwidthIn = 0.0f;

        /** Outgoing bandwidth (bytes/sec). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        float BandwidthOut = 0.0f;

        /** Number of replicated actors. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        int32 ReplicatedActorCount = 0;

        /** Timestamp of this snapshot. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        double Timestamp = 0.0;
};

/**
 * UKhaaosNetMetricsSubsystem
 *
 * TickableWorldSubsystem for tracking network performance metrics.
 *
 * Tracks:
 *   - AvgRTT: average round-trip time across all connections
 *   - PacketLoss: packet loss percentage
 *   - BandwidthIn/BandwidthOut: bandwidth utilization
 *   - ReplicatedActorCount: number of actively replicated actors
 *
 * Features:
 *   - FOnHighLatency delegate: fires when RTT exceeds HighLatencyThreshold
 *   - FOnMetricsUpdated delegate: fires each metrics update for HUD
 *   - LogMetrics(): verbose logging for debugging
 *   - GetReplicationStats(): per-actor-type replication counts
 *   - Configurable update interval and latency threshold
 */
UCLASS(Abstract)
class UKhaaosNetMetricsSubsystem : public UTickableWorldSubsystem
{
        GENERATED_BODY()

public:
        UKhaaosNetMetricsSubsystem();

        // ─── Lifecycle ──────────────────────────────────────────────────────────

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;
        virtual void Tick(float DeltaTime) override;
        virtual TStatId GetStatId() const override;

        // ─── Metrics Access ────────────────────────────────────────────────────

        /** Get the current metrics snapshot. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|NetMetrics")
        const FNetMetricsSnapshot& GetCurrentSnapshot() const { return CurrentSnapshot; }

        /** Get per-actor-type replication counts. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|NetMetrics")
        TMap<FString, int32> GetReplicationStats() const;

        /** Log verbose network metrics (for debug/diagnostics). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|NetMetrics")
        void LogMetrics() const;

        // ─── Configuration ──────────────────────────────────────────────────────

        /** High latency threshold in milliseconds. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        float HighLatencyThreshold;

        /** Metrics update interval in seconds. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        float MetricsUpdateInterval;

        /** Whether verbose metrics logging is enabled. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        uint8 bVerboseLogging : 1;

        /** Whether the metrics subsystem is enabled. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetMetrics")
        uint8 bMetricsEnabled : 1;

        // ─── Delegates ──────────────────────────────────────────────────────────

        /** Broadcast when RTT exceeds HighLatencyThreshold. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|NetMetrics")
        FOnHighLatency OnHighLatency;

        /** Broadcast when metrics are updated (for HUD display). */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|NetMetrics")
        FOnMetricsUpdated OnMetricsUpdated;

private:

        /** Current metrics snapshot. */
        UPROPERTY()
        FNetMetricsSnapshot CurrentSnapshot;

        /** Time since last metrics update. */
        float TimeSinceLastUpdate;

        /** Whether high latency has been alerted (avoid spam). */
        uint8 bHighLatencyAlerted : 1;

        /** Running average RTT (exponential moving average). */
        float RunningAvgRTT;

        /** Alpha for exponential moving average (0-1). */
        float EmaAlpha;

        /** Count replicated actors in the world. */
        int32 CountReplicatedActors() const;

        /** Collect metrics from all net connections. */
        void CollectMetrics();
};
