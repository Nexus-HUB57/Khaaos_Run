// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosMonitorDashboard.generated.h"

// ─── Server Health Metrics ─────────────────────────────────────────────────────

/**
 * FServerHealthMetrics
 *
 * Server infrastructure health metrics.
 */
USTRUCT(BlueprintType)
struct FServerHealthMetrics
{
	GENERATED_BODY()

	/** CPU usage percentage (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float CPU_Usage = 0.0f;

	/** Memory usage in MB. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float Memory_UsageMB = 0.0f;

	/** Number of active players. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 ActivePlayers = 0;

	/** Current server FPS. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float ServerFPS = 0.0f;

	/** Network inbound throughput (KB/s). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float NetworkIn_KBps = 0.0f;

	/** Network outbound throughput (KB/s). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float NetworkOut_KBps = 0.0f;

	/** Server uptime in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float UptimeSeconds = 0.0f;
};

// ─── Game Health Metrics ───────────────────────────────────────────────────────

/**
 * FGameHealthMetrics
 *
 * Game-specific health metrics for match and economy status.
 */
USTRUCT(BlueprintType)
struct FGameHealthMetrics
{
	GENERATED_BODY()

	/** Number of active matches. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 MatchCount = 0;

	/** Average match duration in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float AverageMatchDuration = 0.0f;

	/** Number of active safe zones. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 ActiveZones = 0;

	/** Number of loot items spawned. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 LootSpawned = 0;

	/** Object pool hit rate (0-1). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float PoolHitRate = 0.0f;

	/** Network relevancy efficiency (0-1, higher = better). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float RelevancyEfficiency = 0.0f;
};

// ─── Security Metrics ──────────────────────────────────────────────────────────

/**
 * FSecurityMetrics
 *
 * Security-related metrics for anti-cheat and DDoS monitoring.
 */
USTRUCT(BlueprintType)
struct FSecurityMetrics
{
	GENERATED_BODY()

	/** Number of currently blocked IPs (DDoS). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 ActiveDDoSBlocks = 0;

	/** Total cheat detections since server start. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 CheatDetections = 0;

	/** Total rate limit blocks since server start. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 RateLimitBlocks = 0;

	/** Number of players currently flagged as suspicious. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	int32 SuspiciousPlayers = 0;
};

// ─── Dashboard Snapshot ────────────────────────────────────────────────────────

/**
 * FDashboardSnapshot
 *
 * Complete snapshot of all monitoring metrics at a point in time.
 */
USTRUCT(BlueprintType)
struct FDashboardSnapshot
{
	GENERATED_BODY()

	/** Server infrastructure metrics. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	FServerHealthMetrics ServerHealth;

	/** Game-specific metrics. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	FGameHealthMetrics GameHealth;

	/** Security metrics. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	FSecurityMetrics Security;

	/** Timestamp of this snapshot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Monitor")
	double Timestamp = 0.0;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

/** Broadcast when metrics are updated (every 5 seconds by default). */
DECLARE_DELEGATE_OneParam(FOnMetricsUpdated, const FDashboardSnapshot&);

// ── Monitor Dashboard Subsystem ────────────────────────────────────────────────

/**
 * UKhaaosMonitorDashboard
 *
 * Monitoring dashboard data provider subsystem.
 *
 * Collects server health, game health, and security metrics
 * on a configurable interval and provides them as a unified
 * snapshot for dashboards (Grafana) and API consumers.
 *
 * Metrics collection is lightweight and does not impact
 * game performance. All gathering is O(1) or O(active_players).
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos Monitor Dashboard"))
class UKhaaosMonitorDashboard : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosMonitorDashboard();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Metrics Collection ─────────────────────────────────────────────────

	/**
	 * Collect all metrics and return a complete dashboard snapshot.
	 * Can be called on-demand or via the periodic timer.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Monitor")
	FDashboardSnapshot CollectAllMetrics();

	/**
	 * Export the current metrics as a JSON string.
	 * Suitable for Prometheus exporters or HTTP API endpoints.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Monitor")
	FString ExportMetricsAsJSON();

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast every metrics collection interval with fresh data. */
	FOnMetricsUpdated OnMetricsUpdated;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Whether monitoring is enabled. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Monitor")
	uint8 bIsMonitoring : 1 = true;

	/** Metrics collection interval in seconds. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Monitor")
	float MetricsCollectionIntervalSeconds = 5.0f;

private:

	/** Timer handle for periodic metrics collection. */
	FTimerHandle MetricsTimer;

	/** Server start time for uptime calculation. */
	double ServerStartTime = 0.0;

	/** Total cheat detections counter. */
	int32 TotalCheatDetections = 0;

	/** Total rate limit blocks counter. */
	int32 TotalRateLimitBlocks = 0;

	/** Timer callback for periodic collection. */
	void OnMetricsTimer();

	/** Collect server health metrics. */
	FServerHealthMetrics CollectServerHealth();

	/** Collect game health metrics. */
	FGameHealthMetrics CollectGameHealth();

	/** Collect security metrics. */
	FSecurityMetrics CollectSecurity();
};
