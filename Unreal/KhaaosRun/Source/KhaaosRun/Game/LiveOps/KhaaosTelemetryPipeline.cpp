// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/LiveOps/KhaaosTelemetryPipeline.h"
#include "KhaaosRun.h"

#include "Misc/DateTime.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "HAL/PlatformTime.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosTelemetryPipeline::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        BatchSize = 100;
        FlushInterval = 5.0f;
        MaxEventsPerSecond = 1000;
        LocalBufferSize = 10000;
        VerboseSamplingRate = 0.1f;
        TotalEventsRecorded = 0;
        EventsThisSecond = 0;
        RateLimitTimer = 0.0f;
        TimeSinceLastFlush = 0.0f;
        ServerRegion = TEXT("sa1"); // Default: São Paulo

        PendingEvents.Reserve(BatchSize);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosTelemetryPipeline: Initialized (batch=%d, interval=%.1fs)"),
                BatchSize, FlushInterval);
}

void UKhaaosTelemetryPipeline::Deinitialize()
{
        // Flush remaining events before shutdown
        Flush();
        Super::Deinitialize();
}

// ─── Event Recording ────────────────────────────────────────────────────────────

void UKhaaosTelemetryPipeline::RecordEvent(const FKhaaosTelemetryEvent& Event)
{
        // Rate limit check
        if (EventsThisSecond >= MaxEventsPerSecond)
        {
                // Drop event (would increment a dropped counter in production)
                return;
        }

        // Sampling check for verbose events
        if (!ShouldSample(Event.EventType))
        {
                return;
        }

        FKhaaosTelemetryEvent TaggedEvent = Event;
        TaggedEvent.Timestamp = FDateTime::UtcNow().ToUnixTimestampMilli();
        TaggedEvent.Region = ServerRegion;

        PendingEvents.Add(TaggedEvent);
        TotalEventsRecorded++;
        EventsThisSecond++;

        // Critical events: immediate flush
        if (Event.EventType == EKhaaosTelemetryEvent::CrashReport ||
            Event.EventType == EKhaaosTelemetryEvent::PerformanceAlert)
        {
                Flush();
        }

        // Auto-flush when batch is full
        if (PendingEvents.Num() >= BatchSize)
        {
                Flush();
        }
}

void UKhaaosTelemetryPipeline::RecordSimpleEvent(EKhaaosTelemetryEvent EventType, const FString& EventName, const FString& PlayerEosId)
{
        FKhaaosTelemetryEvent Event;
        Event.EventType = EventType;
        Event.EventName = EventName;
        Event.PlayerEosId = PlayerEosId;
        RecordEvent(Event);
}

void UKhaaosTelemetryPipeline::RecordPerformanceMetric(const FString& MetricName, double Value, const FString& Platform)
{
        FKhaaosTelemetryEvent Event;
        Event.EventType = EKhaaosTelemetryEvent::PerformanceAlert;
        Event.EventName = MetricName;
        Event.Value = Value;
        Event.Platform = Platform;
        RecordEvent(Event);
}

// ─── Flush Control ──────────────────────────────────────────────────────────────

void UKhaaosTelemetryPipeline::Flush()
{
        if (PendingEvents.Num() == 0)
        {
                return;
        }

        // Move events to shipping batch
        TArray<FKhaaosTelemetryEvent> Batch;
        Batch.Append(PendingEvents);
        PendingEvents.Empty(PendingEvents.Num()); // Preserve capacity

        // Ship to backend
        ShipBatch(Batch);

        // Also persist to local buffer for recovery
        for (const FKhaaosTelemetryEvent& Event : Batch)
        {
                if (LocalBuffer.Num() >= LocalBufferSize)
                {
                        LocalBuffer.RemoveAt(0); // FIFO
                }
                LocalBuffer.Add(Event);
        }

        OnTelemetryFlushed.Broadcast(Batch.Num());

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosTelemetryPipeline: Flushed %d events"), Batch.Num());
}

// ─── A/B Testing ────────────────────────────────────────────────────────────────

FString UKhaaosTelemetryPipeline::GetExperimentVariant(const FString& ExperimentId, const FString& PlayerEosId) const
{
        // Deterministic hash-based variant assignment
        // This ensures the same player always gets the same variant
        uint32 Hash = GetTypeHash(ExperimentId + PlayerEosId);
        const int32 Variant = Hash % 100;

        // Default: 50/50 split. Custom splits would be configured per experiment.
        if (Variant < 50)
        {
                return TEXT("control");
        }
        else
        {
                return TEXT("treatment");
        }
}

// ─── Internal ───────────────────────────────────────────────────────────────────

FString UKhaaosTelemetryPipeline::SerializeEvent(const FKhaaosTelemetryEvent& Event) const
{
        // JSON serialization of telemetry event
        FString JsonStr;
        JsonStr += TEXT("{\"type\":\"") + Event.EventName + TEXT("\"");
        JsonStr += TEXT(",\"category\":") + FString::FromInt((int32)Event.EventType);
        JsonStr += TEXT(",\"player\":\"") + Event.PlayerEosId + TEXT("\"");
        JsonStr += TEXT(",\"match\":\"") + Event.MatchId + TEXT("\"");
        JsonStr += TEXT(",\"ts\":") + FString::FromInt(Event.Timestamp);
        JsonStr += TEXT(",\"value\":") + FString::SanitizeFloat(Event.Value);
        JsonStr += TEXT(",\"region\":\"") + Event.Region + TEXT("\"");
        JsonStr += TEXT(",\"platform\":\"") + Event.Platform + TEXT("\"");

        // Add A/B experiment tags
        if (ActiveExperiments.Num() > 0)
        {
                JsonStr += TEXT(",\"experiments\":[");
                for (int32 i = 0; i < ActiveExperiments.Num(); ++i)
                {
                        if (i > 0) JsonStr += TEXT(",");
                        JsonStr += TEXT("\"") + ActiveExperiments[i] + TEXT("\"");
                }
                JsonStr += TEXT("]");
        }

        JsonStr += TEXT("}");
        return JsonStr;
}

FString UKhaaosTelemetryPipeline::SerializeBatch(const TArray<FKhaaosTelemetryEvent>& Batch) const
{
        FString JsonStr = TEXT("[");
        for (int32 i = 0; i < Batch.Num(); ++i)
        {
                if (i > 0) JsonStr += TEXT(",");
                JsonStr += SerializeEvent(Batch[i]);
        }
        JsonStr += TEXT("]");
        return JsonStr;
}

void UKhaaosTelemetryPipeline::ShipBatch(const TArray<FKhaaosTelemetryEvent>& Batch)
{
        // In production, this would use HTTP client to POST to analytics backend
        // For now, log the batch size
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosTelemetryPipeline: Shipping %d events to %s"),
                Batch.Num(), *AnalyticsUrl);
}

bool UKhaaosTelemetryPipeline::ShouldSample(EKhaaosTelemetryEvent EventType) const
{
        // Critical events are always sampled at 100%
        if (EventType == EKhaaosTelemetryEvent::CrashReport ||
            EventType == EKhaaosTelemetryEvent::PerformanceAlert ||
            EventType == EKhaaosTelemetryEvent::MatchStart ||
            EventType == EKhaaosTelemetryEvent::MatchEnd)
        {
                return true;
        }

        // Verbose events use sampling rate
        if (EventType == EKhaaosTelemetryEvent::WeaponFired ||
            EventType == EKhaaosTelemetryEvent::CustomEvent)
        {
                return FMath::FRand() < VerboseSamplingRate;
        }

        // Default: always sample
        return true;
}
