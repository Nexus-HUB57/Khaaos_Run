// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Polish/KhaaosServerHealthMonitor.h"
#include "KhaaosRun.h"

#include "Misc/DateTime.h"
#include "HAL/PlatformMemory.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosServerHealthMonitor::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        CheckInterval = 5.0f;
        StartTime = FDateTime::UtcNow().ToUnixTimestampMilli();

        LastReport.Status = EKhaaosHealthStatus::Healthy;
        LastReport.bEOSConnected = true;
        LastReport.bEconomyConnected = true;

        // Register standard metrics
        RegisterMetric(TEXT("server_fps"), 50.0, 30.0, true);
        RegisterMetric(TEXT("memory_mb"), 4096.0, 6144.0, true);
        RegisterMetric(TEXT("network_kbps"), 51200.0, 81920.0, false);
        RegisterMetric(TEXT("economy_latency_ms"), 100.0, 500.0, true);
        RegisterMetric(TEXT("gc_pause_ms"), 10.0, 50.0, false);
        RegisterMetric(TEXT("actor_count"), 5000.0, 8000.0, false);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosServerHealthMonitor: Initialized with %d metrics"), RegisteredMetrics.Num());
}

void UKhaaosServerHealthMonitor::Deinitialize()
{
        RegisteredMetrics.Empty();
        Super::Deinitialize();
}

// ─── Metric Recording ───────────────────────────────────────────────────────────

void UKhaaosServerHealthMonitor::RecordMetric(const FString& Name, double Value, bool bCritical)
{
        FKhaaosHealthMetric* Metric = RegisteredMetrics.Find(Name);
        if (Metric)
        {
                Metric->Value = Value;
                Metric->LastUpdate = FDateTime::UtcNow().ToUnixTimestampMilli();

                // Check thresholds
                if (Metric->CriticalThreshold > 0 && Value >= Metric->CriticalThreshold)
                {
                        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosHealth: CRITICAL - %s = %.1f (threshold: %.1f)"),
                                *Name, Value, Metric->CriticalThreshold);
                }
                else if (Metric->WarningThreshold > 0 && Value >= Metric->WarningThreshold)
                {
                        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosHealth: WARNING - %s = %.1f (threshold: %.1f)"),
                                *Name, Value, Metric->WarningThreshold);
                }
        }
        else
        {
                // Auto-register metric
                RegisterMetric(Name, 0.0, 0.0, bCritical);
                RecordMetric(Name, Value, bCritical);
        }
}

// ─── Metric Registration ────────────────────────────────────────────────────────

void UKhaaosServerHealthMonitor::RegisterMetric(const FString& Name, double WarningThreshold, double CriticalThreshold, bool bCritical)
{
        FKhaaosHealthMetric Metric;
        Metric.Name = Name;
        Metric.WarningThreshold = WarningThreshold;
        Metric.CriticalThreshold = CriticalThreshold;
        Metric.bIsCritical = bCritical;
        Metric.LastUpdate = FDateTime::UtcNow().ToUnixTimestampMilli();

        RegisteredMetrics.Add(Name, Metric);
}

// ─── Health Check ───────────────────────────────────────────────────────────────

void UKhaaosServerHealthMonitor::PerformHealthCheck()
{
        const EKhaaosHealthStatus OldStatus = LastReport.Status;

        // Update uptime
        const int64 Now = FDateTime::UtcNow().ToUnixTimestampMilli();
        LastReport.UptimeSeconds = (Now - StartTime) / 1000.0;

        // Collect current metric values into report
        LastReport.Metrics.Empty();
        for (const auto& Pair : RegisteredMetrics)
        {
                LastReport.Metrics.Add(Pair.Value);
        }

        // Compute overall status
        LastReport.Status = ComputeOverallStatus();

        // Broadcast if status changed
        if (LastReport.Status != OldStatus)
        {
                OnHealthChanged.Broadcast(LastReport.Status, OldStatus);
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosHealth: Status changed %d → %d"),
                        (int32)OldStatus, (int32)LastReport.Status);
        }

        OnHealthReport.Broadcast(LastReport);
}

EKhaaosHealthStatus UKhaaosServerHealthMonitor::ComputeOverallStatus() const
{
        bool bHasWarning = false;
        bool bHasCritical = false;

        for (const auto& Pair : RegisteredMetrics)
        {
                const FKhaaosHealthMetric& Metric = Pair.Value;

                if (Metric.CriticalThreshold > 0 && Metric.Value >= Metric.CriticalThreshold)
                {
                        if (Metric.bIsCritical)
                        {
                                bHasCritical = true;
                        }
                        else
                        {
                                bHasWarning = true;
                        }
                }
                else if (Metric.WarningThreshold > 0 && Metric.Value >= Metric.WarningThreshold)
                {
                        bHasWarning = true;
                }
        }

        if (bHasCritical) return EKhaaosHealthStatus::Critical;
        if (bHasWarning) return EKhaaosHealthStatus::Degraded;
        return EKhaaosHealthStatus::Healthy;
}

// ─── Prometheus ─────────────────────────────────────────────────────────────────

FString UKhaaosServerHealthMonitor::ExportPrometheusMetrics() const
{
        FString Output;

        // Standard server metrics
        Output += FString::Printf(TEXT("khaaos_uptime_seconds %.0f\n"), LastReport.UptimeSeconds);
        Output += FString::Printf(TEXT("khaaos_active_players %d\n"), LastReport.ActivePlayers);
        Output += FString::Printf(TEXT("khaaos_active_matches %d\n"), LastReport.ActiveMatches);
        Output += FString::Printf(TEXT("khaaos_server_fps %.1f\n"), LastReport.ServerFPS);
        Output += FString::Printf(TEXT("khaaos_memory_mb %.1f\n"), LastReport.MemoryUsageMB);
        Output += FString::Printf(TEXT("khaaos_network_kbps %.1f\n"), LastReport.NetworkBandwidthKBps);
        Output += FString::Printf(TEXT("khaaos_eos_connected %d\n"), LastReport.bEOSConnected ? 1 : 0);
        Output += FString::Printf(TEXT("khaaos_economy_connected %d\n"), LastReport.bEconomyConnected ? 1 : 0);

        // Health status as numeric (0=Healthy, 1=Degraded, 2=Critical, 3=Down)
        Output += FString::Printf(TEXT("khaaos_health_status %d\n"), (int32)LastReport.Status);

        // Custom metrics
        for (const auto& Pair : RegisteredMetrics)
        {
                const FString& Name = Pair.Key;
                const double Value = Pair.Value.Value;
                const FString PromName = Name.Replace(TEXT("."), TEXT("_")).ToLower();
                Output += FString::Printf(TEXT("khaaos_%s %.1f\n"), *PromName, Value);
        }

        return Output;
}
