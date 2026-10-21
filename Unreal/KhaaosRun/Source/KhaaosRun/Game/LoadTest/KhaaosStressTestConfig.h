// ============================================================================
// Khaaos Run — 1000-Player Stress Test Configuration (Fase 5)
// ============================================================================
// Production stress test framework extending KhaaosLoadTestManager.
// Test profiles: 100/500/1000/2000 players with per-profile config.
// Metrics: RTT p50/p95/p99, CPU%, memory, crash count, desync count.
// Network simulation: packet loss, latency, jitter.
// Ramp-up strategies: linear, exponential, step.
// Auto-stop criteria: crash > 0, RTT p95 > 200ms, memory > 90%.
// Result reporting: JSON output with Prometheus integration.
// ============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "Game/LoadTest/KhaaosLoadTestBot.h"
#include "KhaaosStressTestConfig.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosLoadTestManager;

// ─── Ramp-Up Strategy ─────────────────────────────────────────────────────────

/**
 * EKhaaosRampUpStrategy
 *
 * Strategy for ramping up bot count during a stress test.
 */
UENUM(BlueprintType)
enum class EKhaaosRampUpStrategy : uint8
{
	/** Linear ramp: bots added at constant rate. */
	Linear      UMETA(DisplayName = "Linear"),

	/** Exponential ramp: bots double each interval. */
	Exponential UMETA(DisplayName = "Exponential"),

	/** Step ramp: bots added in discrete steps with pauses. */
	Step        UMETA(DisplayName = "Step"),
};

// ─── Stress Test Profile ──────────────────────────────────────────────────────

/**
 * EKhaaosStressTestProfile
 *
 * Predefined stress test profiles for different player counts.
 */
UENUM(BlueprintType)
enum class EKhaaosStressTestProfile : uint8
{
	Profile_100  UMETA(DisplayName = "100 Players"),
	Profile_500  UMETA(DisplayName = "500 Players"),
	Profile_1000 UMETA(DisplayName = "1000 Players"),
	Profile_2000 UMETA(DisplayName = "2000 Players"),
};

// ─── Network Simulation Config ────────────────────────────────────────────────

/**
 * FKhaaosNetworkSimulation
 *
 * Network condition simulation for stress testing under adverse conditions.
 * Simulates packet loss, latency, and jitter to validate game behavior
 * under poor network conditions.
 */
USTRUCT(BlueprintType)
struct FKhaaosNetworkSimulation
{
	GENERATED_BODY()

	/** Simulated packet loss percentage (0.0 - 5.0). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Network")
	float PacketLossPercent = 0.0f;

	/** Simulated one-way latency in milliseconds (0 - 200). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Network")
	float LatencyMs = 0.0f;

	/** Simulated jitter in milliseconds (random variation on latency). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Network")
	float JitterMs = 0.0f;

	/** Whether to simulate out-of-order packet delivery. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Network")
	uint8 bSimulateOutOfOrder : 1 = false;

	/** Whether to simulate duplicate packets. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Network")
	uint8 bSimulateDuplicates : 1 = false;

	/** Return true if any network degradation is configured. */
	bool IsDegraded() const
	{
		return PacketLossPercent > 0.0f || LatencyMs > 0.0f || JitterMs > 0.0f;
	}
};

// ─── Auto-Stop Criteria ───────────────────────────────────────────────────────

/**
 * FKhaaosAutoStopCriteria
 *
 * Conditions that trigger automatic test termination.
 * If any criterion is met, the stress test stops immediately.
 */
USTRUCT(BlueprintType)
struct FKhaaosAutoStopCriteria
{
	GENERATED_BODY()

	/** Stop if any server crash occurs (0 = no crash tolerance). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|AutoStop")
	int32 MaxCrashCount = 0;

	/** Stop if RTT p95 exceeds this value (ms). 0 = no limit. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|AutoStop")
	float MaxRttP95Ms = 200.0f;

	/** Stop if memory usage exceeds this percentage (0-100). 0 = no limit. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|AutoStop")
	float MaxMemoryPercent = 90.0f;

	/** Stop if desync count exceeds this value. 0 = no limit. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|AutoStop")
	int32 MaxDesyncCount = 0;

	/** Stop if CPU usage exceeds this percentage (0-100). 0 = no limit. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|AutoStop")
	float MaxCpuPercent = 95.0f;

	/** Stop if server FPS drops below this value. 0 = no limit. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|AutoStop")
	float MinServerFPS = 15.0f;

	/** Check whether any auto-stop criterion is violated. */
	bool ShouldStop(int32 InCrashCount, float InRttP95, float InMemoryPct,
	                int32 InDesyncCount, float InCpuPct, float InFps) const
	{
		if (InCrashCount > MaxCrashCount) return true;
		if (MaxRttP95Ms > 0.0f && InRttP95 > MaxRttP95Ms) return true;
		if (MaxMemoryPercent > 0.0f && InMemoryPct > MaxMemoryPercent) return true;
		if (InDesyncCount > MaxDesyncCount) return true;
		if (MaxCpuPercent > 0.0f && InCpuPct > MaxCpuPercent) return true;
		if (MinServerFPS > 0.0f && InFps < MinServerFPS) return true;
		return false;
	}
};

// ─── Stress Test Metrics ──────────────────────────────────────────────────────

/**
 * FKhaaosStressTestMetrics
 *
 * Comprehensive metrics collected during a stress test run.
 * Includes percentile RTT measurements, resource usage, and
 * stability indicators.
 */
USTRUCT(BlueprintType)
struct FKhaaosStressTestMetrics
{
	GENERATED_BODY()

	// ── Player Metrics ──────────────────────────────────────────────────────

	/** Current active bot count. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 ActiveBots = 0;

	/** Total bots spawned since test start. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 TotalSpawned = 0;

	/** Peak concurrent bots during the test. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 PeakConcurrent = 0;

	// ── RTT Metrics (ms) ────────────────────────────────────────────────────

	/** Round-trip time p50 (median) in ms. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float RttP50Ms = 0.0f;

	/** Round-trip time p95 in ms. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float RttP95Ms = 0.0f;

	/** Round-trip time p99 in ms. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float RttP99Ms = 0.0f;

	/** Minimum RTT observed. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float RttMinMs = 0.0f;

	/** Maximum RTT observed. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float RttMaxMs = 0.0f;

	// ── Server Resource Metrics ─────────────────────────────────────────────

	/** Server CPU usage percentage (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float CpuPercent = 0.0f;

	/** Server memory usage percentage (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float MemoryPercent = 0.0f;

	/** Server memory usage in MB. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float MemoryUsageMB = 0.0f;

	/** Server FPS. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float ServerFPS = 0.0f;

	// ── Stability Metrics ───────────────────────────────────────────────────

	/** Number of server crashes during the test. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 CrashCount = 0;

	/** Number of client-server desync events. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 DesyncCount = 0;

	/** Number of disconnections during the test. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 DisconnectCount = 0;

	/** Number of timeout events. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 TimeoutCount = 0;

	// ── Gameplay Metrics ────────────────────────────────────────────────────

	/** Total eliminations across all bots. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 TotalEliminations = 0;

	/** Number of replicated actors on the server. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	int32 ReplicatedActors = 0;

	/** Network bandwidth in KB/s. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float NetBandwidthKBps = 0.0f;

	// ── Timing ──────────────────────────────────────────────────────────────

	/** Test elapsed time in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float ElapsedSeconds = 0.0f;

	/** Test duration configured in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Metrics")
	float ConfiguredDurationSeconds = 0.0f;
};

// ─── Stress Test Profile Config ───────────────────────────────────────────────

/**
 * FKhaaosStressTestProfileConfig
 *
 * Configuration for a single stress test profile (e.g., 1000 players).
 * Contains bot count, spawn rate, action frequency, and network simulation.
 */
USTRUCT(BlueprintType)
struct FKhaaosStressTestProfileConfig
{
	GENERATED_BODY()

	/** Profile identifier. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	EKhaaosStressTestProfile Profile = EKhaaosStressTestProfile::Profile_100;

	/** Number of bots for this profile. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	int32 BotCount = 100;

	/** Bots spawned per second during ramp-up. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	float SpawnRatePerSecond = 10.0f;

	/** Action frequency multiplier (1.0 = normal, 2.0 = double speed). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	float ActionFrequencyMultiplier = 1.0f;

	/** Test duration in seconds. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	float DurationSeconds = 300.0f;

	/** Ramp-up strategy. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	EKhaaosRampUpStrategy RampUpStrategy = EKhaaosRampUpStrategy::Linear;

	/** Ramp-up duration in seconds (time to reach full bot count). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	float RampUpDurationSeconds = 60.0f;

	/** Network simulation for this profile. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	FKhaaosNetworkSimulation NetworkSimulation;

	/** Auto-stop criteria for this profile. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	FKhaaosAutoStopCriteria AutoStopCriteria;

	/** Bot behavior profile for this stress test. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Profile")
	FBotBehaviorProfile BotProfile;
};

// ─── Stress Test Result ───────────────────────────────────────────────────────

/**
 * EKhaaosStressTestResult
 *
 * Final result of a stress test run.
 */
UENUM(BlueprintType)
enum class EKhaaosStressTestResult : uint8
{
	Pass    UMETA(DisplayName = "PASS"),
	Fail    UMETA(DisplayName = "FAIL"),
	Aborted UMETA(DisplayName = "ABORTED"),
};

// ─── Stress Test Report ───────────────────────────────────────────────────────

/**
 * FKhaaosStressTestReport
 *
 * Complete report from a stress test run including all metrics
 * and pass/fail determination.
 */
USTRUCT(BlueprintType)
struct FKhaaosStressTestReport
{
	GENERATED_BODY()

	/** Profile used for this test. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	EKhaaosStressTestProfile Profile = EKhaaosStressTestProfile::Profile_100;

	/** Test result (pass/fail/aborted). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	EKhaaosStressTestResult Result = EKhaaosStressTestResult::Fail;

	/** Final metrics snapshot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FKhaaosStressTestMetrics Metrics;

	/** Reason for failure (empty if passed). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FString FailureReason;

	/** Timestamp when the test started (ISO 8601). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FString StartedAt;

	/** Timestamp when the test ended (ISO 8601). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FString EndedAt;

	/** Build version that was tested. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FString BuildVersion;

	/** Region where the test was executed. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FString Region;

	/** JSON-formatted full report for export. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Report")
	FString JsonReport;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a stress test completes with the full report. */
DECLARE_DELEGATE_OneParam(FOnStressTestComplete, const FKhaaosStressTestReport&);

/** Broadcast when auto-stop criteria are triggered. */
DECLARE_DELEGATE_TwoParams(FOnAutoStopTriggered, const FString& /*Reason*/, const FKhaaosStressTestMetrics&);

/** Broadcast when a ramp-up step is completed. */
DECLARE_DELEGATE_TwoParams(FOnRampUpStep, int32 /*CurrentBots*/, int32 /*TargetBots*/);

// ─── Prometheus Metrics Integration ───────────────────────────────────────────

/**
 * FKhaaosPrometheusMetrics
 *
 * Configuration for pushing stress test metrics to Prometheus.
 */
USTRUCT(BlueprintType)
struct FKhaaosPrometheusMetrics
{
	GENERATED_BODY()

	/** Whether Prometheus push is enabled. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Prometheus")
	uint8 bEnabled : 1 = true;

	/** Prometheus push gateway URL. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Prometheus")
	FString PushGatewayUrl = TEXT("http://prometheus-pushgateway:9091");

	/** Metrics job name. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Prometheus")
	FString JobName = TEXT("khaaos_stress_test");

	/** Push interval in seconds. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest|Prometheus")
	float PushIntervalSeconds = 10.0f;
};

// ── Stress Test Config Data Asset ─────────────────────────────────────────────

/**
 * UKhaaosStressTestConfig
 *
 * Production stress test configuration extending the load test framework.
 *
 * Provides predefined test profiles for 100/500/1000/2000 players with
 * per-profile settings for spawn rate, action frequency, network simulation,
 * auto-stop criteria, and ramp-up strategies.
 *
 * Metrics are collected at high granularity with percentile RTT measurements
 * (p50/p95/p99), CPU/memory tracking, crash/desync counting, and
 * automatic pass/fail determination.
 *
 * Results are exported as JSON for CI/CD integration and pushed to
 * Prometheus for dashboard visualization.
 *
 * Usage:
 *   auto* Config = UKhaaosStressTestConfig::GetDefaultConfig();
 *   Config->RunStressTest(EKhaaosStressTestProfile::Profile_1000);
 *   // or with custom profile:
 *   Config->RunCustomStressTest(MyCustomProfile);
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(BlueprintType, meta=(DisplayName="Khaaos Stress Test Config"))
class KHAAOSRUN_API UKhaaosStressTestConfig : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:

	UKhaaosStressTestConfig();

	// ─── Predefined Profiles ────────────────────────────────────────────────

	/** Get the built-in profile config for a given profile enum. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|StressTest")
	FKhaaosStressTestProfileConfig GetProfileConfig(EKhaaosStressTestProfile Profile) const;

	/** Get all predefined profiles. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|StressTest")
	const TArray<FKhaaosStressTestProfileConfig>& GetAllProfiles() const;

	// ─── Test Execution ─────────────────────────────────────────────────────

	/**
	 * Run a stress test with a predefined profile.
	 * Uses the built-in profile configuration for the given player count.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StressTest")
	void RunStressTest(EKhaaosStressTestProfile Profile);

	/**
	 * Run a stress test with a custom profile configuration.
	 * Allows fine-tuned control over all test parameters.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StressTest")
	void RunCustomStressTest(const FKhaaosStressTestProfileConfig& CustomProfile);

	/** Stop the active stress test immediately. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StressTest")
	void StopStressTest();

	// ─── Metrics ────────────────────────────────────────────────────────────

	/** Get current real-time stress test metrics. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|StressTest")
	FKhaaosStressTestMetrics GetCurrentMetrics() const;

	/**
	 * Generate a comprehensive JSON report of the last test.
	 * Includes all metrics, pass/fail determination, and metadata.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StressTest")
	FString GenerateJsonReport() const;

	/**
	 * Push current metrics to Prometheus push gateway.
	 * Metrics are exposed as khaaos_stress_test_* gauges/counters.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StressTest")
	void PushToPrometheus();

	// ─── State ──────────────────────────────────────────────────────────────

	/** Whether a stress test is currently running. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest")
	uint8 bIsRunning : 1 = false;

	/** Current active profile. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest")
	EKhaaosStressTestProfile ActiveProfile = EKhaaosStressTestProfile::Profile_100;

	/** Last completed test report. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest")
	FKhaaosStressTestReport LastReport;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Predefined test profiles (100, 500, 1000, 2000). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest")
	TArray<FKhaaosStressTestProfileConfig> Profiles;

	/** Prometheus metrics integration. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest")
	FKhaaosPrometheusMetrics PrometheusConfig;

	/** Default bot behavior profile for stress tests. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|StressTest")
	FBotBehaviorProfile DefaultBotProfile;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when a stress test completes. */
	FOnStressTestComplete OnStressTestComplete;

	/** Broadcast when auto-stop criteria are triggered. */
	FOnAutoStopTriggered OnAutoStopTriggered;

	/** Broadcast during ramp-up as bots are added. */
	FOnRampUpStep OnRampUpStep;

private:

	/** Current test profile config (active or last used). */
	UPROPERTY()
	FKhaaosStressTestProfileConfig CurrentProfileConfig;

	/** Current metrics snapshot. */
	UPROPERTY()
	FKhaaosStressTestMetrics CurrentMetrics;

	/** RTT samples collected during the test (for percentile calc). */
	TArray<float> RttSamplesMs;

	/** Whether auto-stop has been triggered. */
	uint8 bAutoStopTriggered : 1 = false;

	// ─── Timers ─────────────────────────────────────────────────────────────

	/** Timer for overall test duration. */
	FTimerHandle TestDurationTimer;

	/** Timer for spawning bots during ramp-up. */
	FTimerHandle RampUpSpawnTimer;

	/** Timer for collecting metrics. */
	FTimerHandle MetricsCollectionTimer;

	/** Timer for pushing to Prometheus. */
	FTimerHandle PrometheusPushTimer;

	/** Timer for checking auto-stop criteria. */
	FTimerHandle AutoStopCheckTimer;

	// ─── Internal Methods ───────────────────────────────────────────────────

	/** Initialize predefined profiles with production-tested values. */
	void InitializeDefaultProfiles();

	/** Start the ramp-up phase for the current profile. */
	void BeginRampUp();

	/** Spawn a batch of bots for ramp-up (linear/exponential/step). */
	void RampUpSpawnBatch();

	/** Collect comprehensive metrics from the server. */
	void CollectStressTestMetrics();

	/** Check auto-stop criteria against current metrics. */
	void CheckAutoStopCriteria();

	/** Calculate percentile from RTT samples. */
	float CalculatePercentile(TArray<float>& Samples, float Percentile) const;

	/** Determine pass/fail for the test report. */
	EKhaaosStressTestResult DetermineResult() const;

	/** Build the failure reason string if the test failed. */
	FString BuildFailureReason() const;

	/** Handle test completion (natural or stopped). */
	void OnTestComplete();

	/** Handle test duration expiration. */
	void OnTestDurationExpired();

	/** Despawn all bots and clean up. */
	void CleanupTest();

	/** Get current ISO 8601 timestamp. */
	FString GetIsoTimestamp() const;

	/** Get build version string. */
	FString GetBuildVersion() const;

	/** Format RTT percentile metrics as JSON. */
	FString FormatRttJson() const;

	/** Format server resource metrics as JSON. */
	FString FormatResourceJson() const;

	/** Format stability metrics as JSON. */
	FString FormatStabilityJson() const;
};
