// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/LiveOps/KhaaosTelemetryPipeline.h"
#include "KhaaosRun.h"

#include "Misc/DateTime.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonWriter.h"
#include "Async/Async.h"
#include "Containers/Ticker.h"
#include "HAL/PlatformMisc.h"
#include "HAL/PlatformTime.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#endif

namespace
{
TSharedRef<FJsonObject> MakeTelemetryEventJson(
	const FKhaaosTelemetryEvent& Event,
	const TArray<FString>& ActiveExperiments)
{
	TSharedRef<FJsonObject> JsonEvent = MakeShared<FJsonObject>();
	JsonEvent->SetStringField(TEXT("type"), Event.EventName);
	JsonEvent->SetNumberField(TEXT("category"), static_cast<double>(static_cast<uint8>(Event.EventType)));
	// Never transmit the raw EOS account identifier; correlate only through
	// server-authorized, short-lived identifiers defined by the backend contract.
	JsonEvent->SetStringField(TEXT("match"), Event.MatchId);
	JsonEvent->SetNumberField(TEXT("ts"), static_cast<double>(Event.Timestamp));
	JsonEvent->SetNumberField(TEXT("value"), Event.Value);
	JsonEvent->SetStringField(TEXT("region"), Event.Region);
	JsonEvent->SetStringField(TEXT("platform"), Event.Platform);

	// Metadata permanece uma string conforme o tipo do evento; o serializer
	// escapa aspas, barras e caracteres de controle sem montar JSON manualmente.
	JsonEvent->SetStringField(TEXT("metadata"), Event.Metadata);

	if (!ActiveExperiments.IsEmpty())
	{
		TArray<TSharedPtr<FJsonValue>> ExperimentValues;
		ExperimentValues.Reserve(ActiveExperiments.Num());
		for (const FString& Experiment : ActiveExperiments)
		{
			ExperimentValues.Add(MakeShared<FJsonValueString>(Experiment));
		}
		JsonEvent->SetArrayField(TEXT("experiments"), ExperimentValues);
	}

	return JsonEvent;
}

bool SerializeTelemetryJson(const TSharedRef<FJsonValue>& RootValue, FString& OutJson)
{
	OutJson.Reset();
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
	return FJsonSerializer::Serialize(RootValue, Writer);
}
}

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosTelemetryJsonSerializationTest,
	"Khaaos.Telemetry.JsonSerialization",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosTelemetryJsonSerializationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;

	FKhaaosTelemetryEvent Event;
	Event.EventType = EKhaaosTelemetryEvent::WeaponFired;
	Event.EventName = TEXT("weapon\"fired\n");
	Event.PlayerEosId = TEXT("player\"id");
	Event.MatchId = TEXT("match-1");
	Event.Timestamp = 1793574000123LL;
	Event.Value = 12.5;
	Event.Metadata = TEXT("{\"note\":\"quoted \\\"text\\\"\",\"line\":\"first\\nsecond\"}");
	Event.Region = TEXT("sa1");
	Event.Platform = TEXT("server\nlinux");

	TArray<FString> Experiments;
	Experiments.Add(TEXT("exp\"one"));
	Experiments.Add(TEXT("exp-two\n"));

	const TSharedRef<FJsonValue> EventValue = MakeShared<FJsonValueObject>(
		MakeTelemetryEventJson(Event, Experiments));
	FString EventJson;
	TestTrue(TEXT("Event serializes through FJsonSerializer"), SerializeTelemetryJson(EventValue, EventJson));

	TSharedPtr<FJsonObject> ParsedEvent;
	const TSharedRef<TJsonReader<>> EventReader = TJsonReaderFactory<>::Create(EventJson);
	TestTrue(TEXT("Serialized event parses as a JSON object"), FJsonSerializer::Deserialize(EventReader, ParsedEvent));
	if (!ParsedEvent.IsValid())
	{
		return false;
	}

	TestFalse(TEXT("Raw EOS player ID is not serialized"), ParsedEvent->HasField(TEXT("player")));
	TestEqual(TEXT("Event name survives quotes/newlines"), ParsedEvent->GetStringField(TEXT("type")), Event.EventName);
	TestEqual(TEXT("Metadata survives JSON string escaping"), ParsedEvent->GetStringField(TEXT("metadata")), Event.Metadata);
	TestTrue(TEXT("64-bit millisecond timestamp is preserved"),
		FMath::IsNearlyEqual(ParsedEvent->GetNumberField(TEXT("ts")), static_cast<double>(Event.Timestamp)));
	const TArray<TSharedPtr<FJsonValue>>& ParsedExperiments = ParsedEvent->GetArrayField(TEXT("experiments"));
	TestEqual(TEXT("Both experiment tags are serialized"), ParsedExperiments.Num(), Experiments.Num());
	if (ParsedExperiments.Num() == Experiments.Num())
	{
		TestEqual(TEXT("Experiment strings are escaped and restored"), ParsedExperiments[0]->AsString(), Experiments[0]);
		TestEqual(TEXT("Experiment control characters are restored"), ParsedExperiments[1]->AsString(), Experiments[1]);
	}

	TArray<TSharedPtr<FJsonValue>> BatchValues;
	BatchValues.Add(EventValue);
	const TSharedRef<FJsonValue> BatchValue = MakeShared<FJsonValueArray>(MoveTemp(BatchValues));
	FString BatchJson;
	TestTrue(TEXT("Batch serializes through FJsonSerializer"), SerializeTelemetryJson(BatchValue, BatchJson));

	TSharedPtr<FJsonValue> ParsedBatch;
	const TSharedRef<TJsonReader<>> BatchReader = TJsonReaderFactory<>::Create(BatchJson);
	TestTrue(TEXT("Serialized batch parses as JSON"), FJsonSerializer::Deserialize(BatchReader, ParsedBatch));
	TestTrue(TEXT("Batch remains a top-level JSON array"), ParsedBatch.IsValid() && ParsedBatch->Type == EJson::Array);
	if (ParsedBatch.IsValid() && ParsedBatch->Type == EJson::Array)
	{
		TestEqual(TEXT("Batch contains the event"), ParsedBatch->AsArray().Num(), 1);
	}
	return true;
}
#endif // WITH_DEV_AUTOMATION_TESTS

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
        bIsShuttingDown = false;
        ServerRegion = TEXT("sa1"); // Default: São Paulo

        PendingEvents.Reserve(BatchSize);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosTelemetryPipeline: Initialized (batch=%d, interval=%.1fs)"),
                BatchSize, FlushInterval);
}

void UKhaaosTelemetryPipeline::Deinitialize()
{
        // Flush remaining events before shutdown
        Flush();
        bIsShuttingDown = true;
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

        UE_LOG(LogKhaaosRun, Verbose,
                TEXT("KhaaosTelemetryPipeline: Queued %d events for telemetry delivery"), Batch.Num());
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
	const TSharedRef<FJsonValue> JsonEvent = MakeShared<FJsonValueObject>(
		MakeTelemetryEventJson(Event, ActiveExperiments));
	FString JsonString;
	if (!SerializeTelemetryJson(JsonEvent, JsonString))
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosTelemetryPipeline: Failed to serialize telemetry event"));
		return FString();
	}
	return JsonString;
}

FString UKhaaosTelemetryPipeline::SerializeBatch(const TArray<FKhaaosTelemetryEvent>& Batch) const
{
	TArray<TSharedPtr<FJsonValue>> JsonEvents;
	JsonEvents.Reserve(Batch.Num());
	for (const FKhaaosTelemetryEvent& Event : Batch)
	{
		JsonEvents.Add(MakeShared<FJsonValueObject>(MakeTelemetryEventJson(Event, ActiveExperiments)));
	}

	const TSharedPtr<FJsonValue> JsonBatch = MakeShared<FJsonValueArray>(MoveTemp(JsonEvents));
	FString JsonString;
	if (!SerializeTelemetryJson(JsonBatch.ToSharedRef(), JsonString))
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosTelemetryPipeline: Failed to serialize telemetry batch"));
		return FString();
	}
	return JsonString;
}

void UKhaaosTelemetryPipeline::ShipBatch(const TArray<FKhaaosTelemetryEvent>& Batch)
{
	if (Batch.IsEmpty())
	{
		return;
	}

	if (!IsRunningDedicatedServer())
	{
		UE_LOG(LogKhaaosRun, Verbose,
			TEXT("KhaaosTelemetryPipeline: HTTP delivery is restricted to dedicated servers"));
		return;
	}

	if (AnalyticsUrl.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Warning,
			TEXT("KhaaosTelemetryPipeline: AnalyticsUrl is not configured; batch retained only in memory"));
		return;
	}

	const FString AuthToken = FPlatformMisc::GetEnvironmentVariable(TEXT("KHAAOS_TELEMETRY_TOKEN"));
	if (AuthToken.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error,
			TEXT("KhaaosTelemetryPipeline: KHAAOS_TELEMETRY_TOKEN is not configured; refusing unauthenticated delivery"));
		return;
	}

	const FString Payload = SerializeBatch(Batch);
	if (Payload.IsEmpty())
	{
		return;
	}

	FPendingBatch PendingBatch;
	PendingBatch.BatchId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphens);
	PendingBatch.JsonPayload = Payload;
	PendingBatch.EventCount = Batch.Num();
	const FString BatchId = PendingBatch.BatchId;
	PendingBatches.Add(BatchId, MoveTemp(PendingBatch));

	SendPendingBatch(BatchId);
}

void UKhaaosTelemetryPipeline::SendPendingBatch(const FString& BatchId)
{
	if (bIsShuttingDown)
	{
		return;
	}

	FPendingBatch* PendingBatch = PendingBatches.Find(BatchId);
	if (PendingBatch == nullptr || PendingBatch->bInFlight)
	{
		return;
	}

	PendingBatch->bRetryScheduled = false;

	const FString Endpoint = AnalyticsUrl.TrimStartAndEnd();
	if (!Endpoint.StartsWith(TEXT("https://"), ESearchCase::IgnoreCase))
	{
		UE_LOG(LogKhaaosRun, Error,
			TEXT("KhaaosTelemetryPipeline: AnalyticsUrl must use HTTPS; batch %s will not be sent"), *BatchId);
		PendingBatches.Remove(BatchId);
		return;
	}

	const FString AuthToken = FPlatformMisc::GetEnvironmentVariable(TEXT("KHAAOS_TELEMETRY_TOKEN"));
	if (AuthToken.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error,
			TEXT("KhaaosTelemetryPipeline: KHAAOS_TELEMETRY_TOKEN is missing; batch %s will not be sent"), *BatchId);
		PendingBatches.Remove(BatchId);
		return;
	}

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Endpoint);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *AuthToken));
	Request->SetHeader(TEXT("Idempotency-Key"), BatchId);
	Request->SetHeader(TEXT("X-Telemetry-Schema-Version"), TEXT("1"));
	Request->SetTimeout(10.0f);
	Request->SetContentAsString(PendingBatch->JsonPayload);
	PendingBatch->bInFlight = true;

	const TWeakObjectPtr<UKhaaosTelemetryPipeline> WeakThis(this);
	Request->OnProcessRequestComplete().BindLambda(
		[WeakThis, BatchId](FHttpRequestPtr CompletedRequest, FHttpResponsePtr Response, bool bWasSuccessful)
		{
			const int32 ResponseCode = Response.IsValid() ? Response->GetResponseCode() : 0;
			const FString RetryAfterHeader = Response.IsValid()
				? Response->GetHeader(TEXT("Retry-After"))
				: FString();
			const float RetryAfterSeconds = FCString::Atof(*RetryAfterHeader);

			AsyncTask(ENamedThreads::GameThread,
				[WeakThis, BatchId, bWasSuccessful, ResponseCode, RetryAfterSeconds]()
				{
					if (UKhaaosTelemetryPipeline* StrongThis = WeakThis.Get())
					{
						StrongThis->HandleBatchResponse(
							BatchId, bWasSuccessful, ResponseCode, RetryAfterSeconds);
					}
				});

			(void)CompletedRequest;
		});

	if (!Request->ProcessRequest())
	{
		PendingBatch->bInFlight = false;
		ScheduleRetry(BatchId, TEXT("request could not be started"));
	}
}

void UKhaaosTelemetryPipeline::HandleBatchResponse(
	const FString& BatchId, bool bWasSuccessful, int32 ResponseCode, float RetryAfterSeconds)
{
	if (bIsShuttingDown)
	{
		return;
	}

	FPendingBatch* PendingBatch = PendingBatches.Find(BatchId);
	if (PendingBatch == nullptr)
	{
		return;
	}
	PendingBatch->bInFlight = false;

	if (bWasSuccessful && ResponseCode >= 200 && ResponseCode < 300)
	{
		const int32 DeliveredEventCount = PendingBatch->EventCount;
		PendingBatches.Remove(BatchId);
		OnTelemetryFlushed.Broadcast(DeliveredEventCount);
		UE_LOG(LogKhaaosRun, Verbose,
			TEXT("KhaaosTelemetryPipeline: Backend acknowledged batch %s (%d events)"),
			*BatchId, DeliveredEventCount);
		return;
	}

	const bool bRetryableFailure = !bWasSuccessful || ResponseCode == 0 ||
		ResponseCode == 408 || ResponseCode == 429 || ResponseCode >= 500;
	if (bRetryableFailure)
	{
		ScheduleRetry(BatchId, FString::Printf(TEXT("transport/status %d"), ResponseCode), RetryAfterSeconds);
		return;
	}

	UE_LOG(LogKhaaosRun, Error,
		TEXT("KhaaosTelemetryPipeline: Backend permanently rejected batch %s (status %d); payload not logged"),
		*BatchId, ResponseCode);
	PendingBatches.Remove(BatchId);
}

void UKhaaosTelemetryPipeline::ScheduleRetry(
	const FString& BatchId, const FString& FailureReason, float RetryAfterSeconds)
{
	if (bIsShuttingDown)
	{
		return;
	}

	FPendingBatch* PendingBatch = PendingBatches.Find(BatchId);
	if (PendingBatch == nullptr || PendingBatch->bRetryScheduled || PendingBatch->bInFlight)
	{
		return;
	}

	constexpr int32 MaxRetries = 5;
	constexpr float BaseDelaySeconds = 1.0f;
	constexpr float MaxBackoffSeconds = 30.0f;
	if (PendingBatch->RetryCount >= MaxRetries)
	{
		UE_LOG(LogKhaaosRun, Error,
			TEXT("KhaaosTelemetryPipeline: Batch %s exhausted after %d retries (%s)"),
			*BatchId, PendingBatch->RetryCount, *FailureReason);
		PendingBatches.Remove(BatchId);
		return;
	}

	++PendingBatch->RetryCount;
	const float ExponentialDelay = FMath::Min(
		MaxBackoffSeconds,
		BaseDelaySeconds * FMath::Pow(2.0f, static_cast<float>(PendingBatch->RetryCount - 1)));
	const float JitteredDelay = FMath::FRandRange(ExponentialDelay * 0.8f, ExponentialDelay * 1.2f);
	float RetryDelaySeconds = FMath::Min(MaxBackoffSeconds, JitteredDelay);
	if (RetryAfterSeconds > 0.0f)
	{
		RetryDelaySeconds = FMath::Max(RetryDelaySeconds, FMath::Min(RetryAfterSeconds, 60.0f));
	}

	PendingBatch->bRetryScheduled = true;
	UE_LOG(LogKhaaosRun, Warning,
		TEXT("KhaaosTelemetryPipeline: Scheduling retry %d/%d for batch %s in %.1fs (%s)"),
		PendingBatch->RetryCount, MaxRetries, *BatchId, RetryDelaySeconds, *FailureReason);

	const TWeakObjectPtr<UKhaaosTelemetryPipeline> WeakThis(this);
	FTSTicker::GetCoreTicker().AddTicker(
		[WeakThis, BatchId](float)
		{
			if (UKhaaosTelemetryPipeline* StrongThis = WeakThis.Get())
			{
				StrongThis->SendPendingBatch(BatchId);
			}
			return false;
		},
		RetryDelaySeconds);
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
