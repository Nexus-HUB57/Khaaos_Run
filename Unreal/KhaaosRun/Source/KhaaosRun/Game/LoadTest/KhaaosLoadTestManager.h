// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/LoadTest/KhaaosLoadTestBot.h"
#include "KhaaosLoadTestManager.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosServerConfig;

// ─── Load Test Configuration ──────────────────────────────────────────────────

/**
 * FLoadTestConfig
 *
 * Configuration for a load test session.
 */
USTRUCT(BlueprintType)
struct FLoadTestConfig
{
	GENERATED_BODY()

	/** Maximum number of bots that can be active simultaneously. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 MaxBots = 100;

	/** Time between bot spawns (seconds). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float SpawnInterval = 0.5f;

	/** Radius around spawn center for random placement. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float SpawnRadius = 5000.0f;

	/** Whether to randomize behavior profiles across bots. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bRandomizeBehavior : 1 = true;

	/** Whether to report metrics during the test. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bReportMetrics : 1 = true;
};

// ─── Load Test Metrics ─────────────────────────────────────────────────────────

/**
 * FLoadTestMetrics
 *
 * Real-time metrics collected during a load test.
 */
USTRUCT(BlueprintType)
struct FLoadTestMetrics
{
	GENERATED_BODY()

	/** Currently active bots. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 ActiveBots = 0;

	/** Total bots spawned since test start. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 TotalSpawned = 0;

	/** Total eliminations by all bots. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 Eliminations = 0;

	/** Current server FPS. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float ServerFPS = 0.0f;

	/** Average round-trip time (ms). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float AvgRTT = 0.0f;

	/** Server memory usage in MB. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float MemoryUsageMB = 0.0f;

	/** Number of replicated actors on the server. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 ReplicatedActors = 0;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

/** Broadcast when a load test completes with final metrics. */
DECLARE_DELEGATE_OneParam(FOnLoadTestComplete, const FLoadTestMetrics&);

// ── Load Test Manager Subsystem ────────────────────────────────────────────────

/**
 * UKhaaosLoadTestManager
 *
 * Orchestration subsystem for server load testing.
 *
 * Spawns AI bots in configurable waves to stress-test the
 * dedicated server: replication bandwidth, tick performance,
 * memory usage, and net driver throughput.
 *
 * Usage:
 *   StartLoadTest(50, 120.0f, DefaultProfile)  // 50 bots for 2 minutes
 *   StopLoadTest()                               // Early termination
 *   GenerateTestReport()                          // JSON metrics report
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(meta=(DisplayName="Khaaos Load Test Manager"))
class UKhaaosLoadTestManager : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosLoadTestManager();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Test Control ───────────────────────────────────────────────────────

	/**
	 * Start a load test with the specified number of bots and duration.
	 * Bots are spawned in waves at the configured interval.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LoadTest")
	void StartLoadTest(int32 BotCount, float DurationSeconds, FBotBehaviorProfile DefaultProfile);

	/** Stop the active load test and despawn all bots. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LoadTest")
	void StopLoadTest();

	/**
	 * Spawn an additional wave of bots during an active test.
	 * Useful for ramping up load incrementally.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LoadTest")
	void SpawnWave(int32 Count);

	// ─── Metrics ────────────────────────────────────────────────────────────

	/** Get current real-time metrics. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LoadTest")
	FLoadTestMetrics GetCurrentMetrics() const;

	/**
	 * Generate a JSON-formatted test report with all metrics.
	 * Suitable for export to monitoring systems (Prometheus, Grafana).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LoadTest")
	FString GenerateTestReport();

	// ─── State ──────────────────────────────────────────────────────────────

	/** Whether a load test is currently running. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bIsRunning : 1 = false;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Load test configuration. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	FLoadTestConfig Config;

	/** Default behavior profile for spawned bots. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	FBotBehaviorProfile DefaultBotProfile;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when the load test completes (naturally or stopped). */
	FOnLoadTestComplete OnLoadTestComplete;

private:

	/** Active bot actors. */
	UPROPERTY()
	TArray<TObjectPtr<AKhaaosLoadTestBot>> ActiveBots;

	/** Current metrics snapshot. */
	UPROPERTY()
	FLoadTestMetrics CurrentMetrics;

	/** Number of bots remaining to spawn. */
	int32 BotsRemaining = 0;

	/** Test duration remaining (seconds). */
	float TestDurationRemaining = 0.0f;

	/** Default profile for current test. */
	FBotBehaviorProfile TestProfile;

	// ─── Timers ─────────────────────────────────────────────────────────────

	/** Timer for overall test duration. */
	FTimerHandle TestTimer;

	/** Timer for spawning bots at intervals. */
	FTimerHandle SpawnTimer;

	/** Timer for collecting metrics. */
	FTimerHandle MetricsTimer;

	// ─── Internal Methods ───────────────────────────────────────────────────

	/** Spawn a single bot at a random location. */
	void SpawnSingleBot();

	/** Collect metrics from the server. */
	void CollectMetrics();

	/** Timer callback: test duration expired. */
	void OnTestDurationExpired();

	/** Despawn all active bots and clean up. */
	void DespawnAllBots();

	/** Generate a random behavior profile (for bRandomizeBehavior). */
	FBotBehaviorProfile GenerateRandomProfile() const;
};
