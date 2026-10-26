// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Polish/KhaaosServerHealthMonitor.generated.h"

// ─── Health Check Types ─────────────────────────────────────────────────────────

/**
 * EKhaaosHealthStatus
 * Overall server health status.
 */
UENUM(BlueprintType)
enum class EKhaaosHealthStatus : uint8
{
        Healthy   UMETA(DisplayName = "HEALTHY"),     // All systems nominal
        Degraded  UMETA(DisplayName = "DEGRADED"),    // Some systems slow
        Critical  UMETA(DisplayName = "CRITICAL"),    // Imminent failure
        Down      UMETA(DisplayName = "DOWN")         // Server unresponsive
};

/**
 * FKhaaosHealthMetric
 * Single health metric with thresholds.
 */
USTRUCT(BlueprintType)
struct FKhaaosHealthMetric
{
        GENERATED_BODY()

        /** Metric name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        FString Name;

        /** Current value. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        double Value = 0.0;

        /** Warning threshold. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        double WarningThreshold = 0.0;

        /** Critical threshold. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        double CriticalThreshold = 0.0;

        /** Is this metric critical? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        uint8 bIsCritical : 1;

        /** Timestamp of last update. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        int64 LastUpdate = 0;
};

/**
 * FKhaaosServerHealthReport
 * Complete server health snapshot.
 */
USTRUCT(BlueprintType)
struct FKhaaosServerHealthReport
{
        GENERATED_BODY()

        /** Overall status. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        EKhaaosHealthStatus Status = EKhaaosHealthStatus::Healthy;

        /** Server uptime (seconds). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        double UptimeSeconds = 0.0;

        /** Active player count. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        int32 ActivePlayers = 0;

        /** Active match count. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        int32 ActiveMatches = 0;

        /** Server FPS. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        float ServerFPS = 60.0f;

        /** Memory usage (MB). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        double MemoryUsageMB = 0.0;

        /** Network bandwidth (KB/s). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        double NetworkBandwidthKBps = 0.0;

        /** EOS connection status. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        uint8 bEOSConnected : 1;

        /** Economy API connected. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        uint8 bEconomyConnected : 1;

        /** All individual metrics. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Health")
        TArray<FKhaaosHealthMetric> Metrics;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnHealthChanged, EKhaaosHealthStatus, NewStatus, EKhaaosHealthStatus, OldStatus);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnHealthReport, const FKhaaosServerHealthReport&, Report);

/**
 * UKhaaosServerHealthMonitor
 *
 * Real-time server health monitoring with metric collection, threshold
 * alerting, and Prometheus-compatible metrics export.
 *
 * Monitored Systems:
 *   - Server FPS (target: 60fps, warning: <50fps, critical: <30fps)
 *   - Memory usage (warning: >4GB, critical: >6GB)
 *   - Network bandwidth (warning: >50MB/s, critical: >80MB/s)
 *   - Player count (capacity tracking)
 *   - EOS connectivity (critical if disconnected)
 *   - Economy API latency (warning: >100ms, critical: >500ms)
 *   - Match count (capacity tracking)
 *   - GC pause time (warning: >10ms, critical: >50ms)
 *   - Actor count (warning: >5000, critical: >8000)
 *   - Replication view count
 *
 * Alert Pipeline:
 *   - Warning → Log + Grafana annotation
 *   - Critical → Log + PagerDuty alert + auto-scale
 *   - Down → Emergency shutdown + player migration
 *
 * Prometheus Export:
 *   - /metrics endpoint for Prometheus scraping
 *   - Standard format: khaaos_fps 60.0, khaaos_players 45, etc.
 *
 * Console Parity:
 *   - Health metrics forwarded to Grafana dashboard
 *   - Auto-scaling triggers when metrics exceed thresholds
 *   - Grace period before marking server critical
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosServerHealthMonitor : public UEngineSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Metric Recording ─────────────────────────────────────────────────

        /** Record a metric value. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Health")
        void RecordMetric(const FString& Name, double Value, bool bCritical = false);

        /** Get current health report. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Health")
        FKhaaosServerHealthReport GetHealthReport() const { return LastReport; }

        /** Get overall health status. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Health")
        EKhaaosHealthStatus GetHealthStatus() const { return LastReport.Status; }

        // ─── Metric Registration ──────────────────────────────────────────────

        /** Register a metric with thresholds. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Health")
        void RegisterMetric(const FString& Name, double WarningThreshold, double CriticalThreshold, bool bCritical = false);

        // ─── Health Check ─────────────────────────────────────────────────────

        /** Perform full health check (called on interval). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Health")
        void PerformHealthCheck();

        /** Check interval (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Health")
        float CheckInterval;

        // ─── Prometheus ───────────────────────────────────────────────────────

        /** Export metrics in Prometheus format. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Health")
        FString ExportPrometheusMetrics() const;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Health")
        FOnHealthChanged OnHealthChanged;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Health")
        FOnHealthReport OnHealthReport;

private:

        /** Last health report. */
        FKhaaosServerHealthReport LastReport;

        /** Registered metrics (Name → Metric). */
        TMap<FString, FKhaaosHealthMetric> RegisteredMetrics;

        /** Server start time. */
        int64 StartTime;

        /** Compute overall status from individual metrics. */
        EKhaaosHealthStatus ComputeOverallStatus() const;
};
