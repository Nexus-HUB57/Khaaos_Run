// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/LiveOps/KhaaosTelemetryPipeline.generated.h"

// ─── Telemetry Event Types ──────────────────────────────────────────────────────

/**
 * EKhaaosTelemetryEvent
 * All telemetry event categories for analytics pipeline.
 */
UENUM(BlueprintType)
enum class EKhaaosTelemetryEvent : uint8
{
        MatchStart       UMETA(DisplayName = "MATCH_START"),
        MatchEnd         UMETA(DisplayName = "MATCH_END"),
        PlayerEliminated UMETA(DisplayName = "PLAYER_ELIMINATED"),
        WeaponFired      UMETA(DisplayName = "WEAPON_FIRED"),
        ItemLooted       UMETA(DisplayName = "ITEM_LOOTED"),
        ZonePhase        UMETA(DisplayName = "ZONE_PHASE"),
        VehicleUsed      UMETA(DisplayName = "VEHICLE_USED"),
        EconomyTxn       UMETA(DisplayName = "ECONOMY_TXN"),
        CrashReport      UMETA(DisplayName = "CRASH_REPORT"),
        PerformanceAlert UMETA(DisplayName = "PERFORMANCE_ALERT"),
        SessionEvent     UMETA(DisplayName = "SESSION_EVENT"),
        CustomEvent      UMETA(DisplayName = "CUSTOM_EVENT")
};

/**
 * FKhaaosTelemetryEvent
 * Structured telemetry event with context and metadata.
 */
USTRUCT(BlueprintType)
struct FKhaaosTelemetryEvent
{
        GENERATED_BODY()

        /** Event type. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        EKhaaosTelemetryEvent EventType = EKhaaosTelemetryEvent::CustomEvent;

        /** Event name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString EventName;

        /** Player EOS ID (empty for server events). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString PlayerEosId;

        /** Match ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString MatchId;

        /** Timestamp (unix ms). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        int64 Timestamp = 0;

        /** Numeric value (kills, damage, KRC amount, FPS, etc). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        double Value = 0.0;

        /** String metadata (JSON-encoded). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString Metadata;

        /** Server region. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString Region;

        /** Platform. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString Platform;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnTelemetryFlushed, int32, EventsFlushed);

/**
 * UKhaaosTelemetryPipeline
 *
 * Server-side telemetry pipeline that collects, batches, and ships game
 * events to the analytics backend (Prometheus/Grafana + custom analytics).
 *
 * Architecture:
 *   UE5 Server → TelemetryPipeline (batch) → HTTP POST → Analytics Backend
 *
 * Current behavior:
 *   - Structured event types with typed metadata
 *   - Batch flush at the configured threshold; critical events request immediate flush
 *   - Optional async POST from dedicated servers when endpoint and token are configured
 *   - Up to 10K events mirrored in memory; this is not durable persistence or replay
 *   - Verbose sampling defaults to 10%; critical event categories are not sampled
 *   - Experiment tags are included when configured; region currently defaults to sa1
 *
 * Analytics Use Cases:
 *   - Win rate by species, weapon, platform
 *   - Match duration distribution per world
 *   - Zone damage patterns (difficulty tuning)
 *   - Economy flow (KRC earn/spend per session)
 *   - Performance regression detection (FPS by platform)
 *   - Bot difficulty calibration (kill rate by bot tier)
 *
 * Console Budget:
 *   - Telemetry overhead: <0.1ms per tick
 *   - Memory: 10K event buffer ≈ 5MB max
 */
UCLASS(Config=Game, ClassGroup=(Khaaos))
class UKhaaosTelemetryPipeline : public UEngineSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Event Recording ──────────────────────────────────────────────────

        /** Record a telemetry event. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Telemetry")
        void RecordEvent(const FKhaaosTelemetryEvent& Event);

        /** Record a simple event with type and name. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Telemetry")
        void RecordSimpleEvent(EKhaaosTelemetryEvent EventType, const FString& EventName, const FString& PlayerEosId);

        /** Record a performance metric. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Telemetry")
        void RecordPerformanceMetric(const FString& MetricName, double Value, const FString& Platform);

        // ─── Flush Control ─────────────────────────────────────────────────────

        /** Force flush all pending events. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Telemetry")
        void Flush();

        /** Get pending event count. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Telemetry")
        int32 GetPendingEventCount() const { return PendingEvents.Num(); }

        /** Get total events recorded this session. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Telemetry")
        int64 GetTotalEventsRecorded() const { return TotalEventsRecorded; }

        // ─── Configuration ────────────────────────────────────────────────────

        /** Analytics backend URL. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        FString AnalyticsUrl;

        /** Batch size for flush. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        int32 BatchSize;

        /** Flush interval (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        float FlushInterval;

        /** Max events per second (rate limit). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        int32 MaxEventsPerSecond;

        /** Local buffer size for offline persistence. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        int32 LocalBufferSize;

        /** Sampling rate for verbose events (0-1). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry")
        float VerboseSamplingRate;

        // ─── A/B Testing ──────────────────────────────────────────────────────

        /** Tag events with active experiment IDs. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Telemetry|AB")
        TArray<FString> ActiveExperiments;

        /** Get variant for a player in an experiment. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Telemetry|AB")
        FString GetExperimentVariant(const FString& ExperimentId, const FString& PlayerEosId) const;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Telemetry")
        FOnTelemetryFlushed OnTelemetryFlushed;

private:

        /** Serialized batch retained until the backend acknowledges it. */
        struct FPendingBatch
        {
                FString BatchId;
                FString JsonPayload;
                int32 EventCount = 0;
                int32 RetryCount = 0;
                bool bInFlight = false;
                bool bRetryScheduled = false;
        };

        /** Pending events buffer. */
        TArray<FKhaaosTelemetryEvent> PendingEvents;

        /** Batches awaiting HTTP acknowledgement or a scheduled retry. */
        TMap<FString, FPendingBatch> PendingBatches;

        /** Best-effort in-memory buffer; no disk persistence or automatic replay. */
        TArray<FKhaaosTelemetryEvent> LocalBuffer;

        /** Total events recorded. */
        int64 TotalEventsRecorded;

        /** Events recorded this second (rate limit). */
        int32 EventsThisSecond;

        /** Rate limit timer. */
        float RateLimitTimer;

        /** Time since last flush. */
        float TimeSinceLastFlush;

        /** Server region tag. */
        FString ServerRegion;

        /** Serialize event to JSON. */
        FString SerializeEvent(const FKhaaosTelemetryEvent& Event) const;

        /** Serialize batch to JSON array. */
        FString SerializeBatch(const TArray<FKhaaosTelemetryEvent>& Batch) const;

        /** HTTP POST batch to analytics backend. */
        void ShipBatch(const TArray<FKhaaosTelemetryEvent>& Batch);

        /** Send or resend one retained batch asynchronously. */
        void SendPendingBatch(const FString& BatchId);

        /** Handle an HTTP completion without logging the response body. */
        void HandleBatchResponse(const FString& BatchId, bool bWasSuccessful,
                int32 ResponseCode, float RetryAfterSeconds);

        /** Schedule a bounded retry for a transient transport/server failure. */
        void ScheduleRetry(const FString& BatchId, const FString& FailureReason,
                float RetryAfterSeconds = 0.0f);

        /** Check if event should be sampled. */
        bool ShouldSample(EKhaaosTelemetryEvent EventType) const;

        /** Prevent callbacks from creating new retries during subsystem teardown. */
        bool bIsShuttingDown = false;
};
