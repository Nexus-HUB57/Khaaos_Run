// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Network/KhaaosNetMetrics.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Engine/Engine.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/GameStateBase.h"
#include "NetConnection.h"
#include "NetDriver.h"

// ─── UKhaaosNetMetricsSubsystem ────────────────────────────────────────────────

UKhaaosNetMetricsSubsystem::UKhaaosNetMetricsSubsystem()
{
        HighLatencyThreshold = 150.0f;
        MetricsUpdateInterval = 1.0f;
        bVerboseLogging = false;
        bMetricsEnabled = true;
        TimeSinceLastUpdate = 0.0f;
        bHighLatencyAlerted = false;
        RunningAvgRTT = 0.0f;
        EmaAlpha = 0.1f; // Smooth: 10% new, 90% old
}

void UKhaaosNetMetricsSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosNetMetricsSubsystem::Initialize - "
                "HighLatencyThreshold=%.1fms, UpdateInterval=%.2fs"),
                HighLatencyThreshold, MetricsUpdateInterval);
}

void UKhaaosNetMetricsSubsystem::Deinitialize()
{
        Super::Deinitialize();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosNetMetricsSubsystem::Deinitialize"));
}

void UKhaaosNetMetricsSubsystem::Tick(float DeltaTime)
{
        if (!bMetricsEnabled)
        {
                return;
        }

        TimeSinceLastUpdate += DeltaTime;
        if (TimeSinceLastUpdate < MetricsUpdateInterval)
        {
                return;
        }
        TimeSinceLastUpdate = 0.0f;

        // ─── Collect metrics ──────────────────────────────────────────────────
        CollectMetrics();

        // ─── Update replicated actor count ────────────────────────────────────
        CurrentSnapshot.ReplicatedActorCount = CountReplicatedActors();
        CurrentSnapshot.Timestamp = FPlatformTime::Seconds();

        // ─── High latency detection ───────────────────────────────────────────
        if (CurrentSnapshot.AvgRTT > HighLatencyThreshold)
        {
                if (!bHighLatencyAlerted)
                {
                        bHighLatencyAlerted = true;
                        OnHighLatency.Broadcast(CurrentSnapshot.AvgRTT, HighLatencyThreshold);

                        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosNetMetricsSubsystem - HIGH LATENCY: %.1fms (threshold: %.1fms)"),
                                CurrentSnapshot.AvgRTT, HighLatencyThreshold);
                }
        }
        else
        {
                bHighLatencyAlerted = false;
        }

        // ─── Broadcast metrics update ─────────────────────────────────────────
        OnMetricsUpdated.Broadcast(DeltaTime);

        // ─── Verbose logging ──────────────────────────────────────────────────
        if (bVerboseLogging)
        {
                LogMetrics();
        }
}

TStatId UKhaaosNetMetricsSubsystem::GetStatId() const
{
        RETURN_QUICK_DECLARE_CYCLE_STAT(KhaaosNetMetricsSubsystem, STATGROUP_Tickables);
}

TMap<FString, int32> UKhaaosNetMetricsSubsystem::GetReplicationStats() const
{
        TMap<FString, int32> Stats;

        UWorld* World = GetWorld();
        if (!World)
        {
                return Stats;
        }

        // Count replicated actors by type
        for (FConstControllerIterator It = World->GetControllerIterator(); It; ++It)
        {
                if (AController* Controller = It->Get())
                {
                        if (APlayerState* PS = Controller->PlayerState)
                        {
                                FString TypeName = PS->GetClass()->GetName();
                                Stats.FindOrAdd(TypeName)++;
                        }
                }
        }

        return Stats;
}

void UKhaaosNetMetricsSubsystem::LogMetrics() const
{
        UE_LOG(LogKhaaosRun, Log, TEXT("═══ Khaaos Net Metrics ═══"));
        UE_LOG(LogKhaaosRun, Log, TEXT("  AvgRTT:              %.1f ms"), CurrentSnapshot.AvgRTT);
        UE_LOG(LogKhaaosRun, Log, TEXT("  PacketLoss:          %.2f %%"), CurrentSnapshot.PacketLoss);
        UE_LOG(LogKhaaosRun, Log, TEXT("  BandwidthIn:         %.1f bytes/s"), CurrentSnapshot.BandwidthIn);
        UE_LOG(LogKhaaosRun, Log, TEXT("  BandwidthOut:        %.1f bytes/s"), CurrentSnapshot.BandwidthOut);
        UE_LOG(LogKhaaosRun, Log, TEXT("  ReplicatedActors:    %d"), CurrentSnapshot.ReplicatedActorCount);
        UE_LOG(LogKhaaosRun, Log, TEXT("  HighLatencyThreshold:%.1f ms"), HighLatencyThreshold);
        UE_LOG(LogKhaaosRun, Log, TEXT("═════════════════════════"));
}

void UKhaaosNetMetricsSubsystem::CollectMetrics()
{
        UWorld* World = GetWorld();
        if (!World)
        {
                return;
        }

        UNetDriver* NetDriver = World->GetNetDriver();
        if (!NetDriver)
        {
                return;
        }

        // ─── Aggregate metrics from all client connections ────────────────────
        float TotalRTT = 0.0f;
        float TotalPacketLoss = 0.0f;
        float TotalInRate = 0.0f;
        float TotalOutRate = 0.0f;
        int32 ConnectionCount = 0;

        for (UNetConnection* Connection : NetDriver->ClientConnections)
        {
                if (!Connection || !Connection->PlayerController)
                {
                        continue;
                }

                // RTT from the connection's last reported round trip time
                float ConnRTT = Connection->AvgRTT * 1000.0f; // Convert to ms
                TotalRTT += ConnRTT;

                // Packet loss
                float ConnPacketLoss = 0.0f;
                if (Connection->LastOutPackets != 0)
                {
                        ConnPacketLoss = 100.0f * (1.0f - static_cast<float>(Connection->LastInPackets) /
                                static_cast<float>(Connection->LastOutPackets));
                        ConnPacketLoss = FMath::Clamp(ConnPacketLoss, 0.0f, 100.0f);
                }
                TotalPacketLoss += ConnPacketLoss;

                // Bandwidth
                TotalInRate += Connection->InRate;
                TotalOutRate += Connection->OutRate;

                ConnectionCount++;
        }

        // ─── Compute averages ─────────────────────────────────────────────────
        if (ConnectionCount > 0)
        {
                float NewAvgRTT = TotalRTT / ConnectionCount;

                // Exponential moving average for smooth RTT
                if (RunningAvgRTT > 0.0f)
                {
                        RunningAvgRTT = (EmaAlpha * NewAvgRTT) + ((1.0f - EmaAlpha) * RunningAvgRTT);
                }
                else
                {
                        RunningAvgRTT = NewAvgRTT;
                }

                CurrentSnapshot.AvgRTT = RunningAvgRTT;
                CurrentSnapshot.PacketLoss = TotalPacketLoss / ConnectionCount;
        }
        else
        {
                // Single player or listen server - no network metrics
                CurrentSnapshot.AvgRTT = 0.0f;
                CurrentSnapshot.PacketLoss = 0.0f;
        }

        CurrentSnapshot.BandwidthIn = TotalInRate;
        CurrentSnapshot.BandwidthOut = TotalOutRate;
}

int32 UKhaaosNetMetricsSubsystem::CountReplicatedActors() const
{
        UWorld* World = GetWorld();
        if (!World)
        {
                return 0;
        }

        int32 Count = 0;
        for (FConstActorIterator It = World->GetActorIterator(); It; ++It)
        {
                AActor* Actor = *It;
                if (Actor && Actor->GetIsReplicated())
                {
                        Count++;
                }
        }

        return Count;
}
