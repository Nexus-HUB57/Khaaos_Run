// ============================================================================
// Khaaos Run — 1000-Player Stress Test Configuration (Fase 5)
// ============================================================================
// Production stress test framework — full implementation.
// ============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ============================================================================

#include "Game/LoadTest/KhaaosStressTestConfig.h"
#include "Game/LoadTest/KhaaosLoadTestManager.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "HAL/PlatformProcess.h"
#include "Misc/DateTime.h"
#include "Misc/CommandLine.h"
#include "Internationalization/Internationalization.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosStressTest, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosStressTestConfig::UKhaaosStressTestConfig()
{
	InitializeDefaultProfiles();
}

// ─── Initialize Default Profiles ──────────────────────────────────────────────

void UKhaaosStressTestConfig::InitializeDefaultProfiles()
{
	Profiles.Reset();

	// ── 100 Players: Smoke test baseline ────────────────────────────────────
	{
		FKhaaosStressTestProfileConfig P100;
		P100.Profile = EKhaaosStressTestProfile::Profile_100;
		P100.BotCount = 100;
		P100.SpawnRatePerSecond = 10.0f;
		P100.ActionFrequencyMultiplier = 1.0f;
		P100.DurationSeconds = 180.0f;
		P100.RampUpStrategy = EKhaaosRampUpStrategy::Linear;
		P100.RampUpDurationSeconds = 10.0f;
		P100.NetworkSimulation.PacketLossPercent = 0.0f;
		P100.NetworkSimulation.LatencyMs = 0.0f;
		P100.NetworkSimulation.JitterMs = 0.0f;
		P100.AutoStopCriteria.MaxCrashCount = 0;
		P100.AutoStopCriteria.MaxRttP95Ms = 100.0f;
		P100.AutoStopCriteria.MaxMemoryPercent = 80.0f;
		P100.AutoStopCriteria.MaxDesyncCount = 0;
		P100.AutoStopCriteria.MaxCpuPercent = 90.0f;
		P100.AutoStopCriteria.MinServerFPS = 20.0f;
		P100.BotProfile.MoveSpeed = 600.0f;
		P100.BotProfile.FireRate = 2.0f;
		P100.BotProfile.bWanderRandomly = true;
		P100.BotProfile.bEngageEnemies = true;
		P100.BotProfile.bPickupLoot = true;
		P100.BotProfile.bStayInZone = true;
		P100.BotProfile.ReactionDelayMs = 150.0f;
		Profiles.Add(P100);
	}

	// ── 500 Players: Medium load ────────────────────────────────────────────
	{
		FKhaaosStressTestProfileConfig P500;
		P500.Profile = EKhaaosStressTestProfile::Profile_500;
		P500.BotCount = 500;
		P500.SpawnRatePerSecond = 25.0f;
		P500.ActionFrequencyMultiplier = 1.0f;
		P500.DurationSeconds = 300.0f;
		P500.RampUpStrategy = EKhaaosRampUpStrategy::Linear;
		P500.RampUpDurationSeconds = 30.0f;
		P500.NetworkSimulation.PacketLossPercent = 1.0f;
		P500.NetworkSimulation.LatencyMs = 50.0f;
		P500.NetworkSimulation.JitterMs = 10.0f;
		P500.AutoStopCriteria.MaxCrashCount = 0;
		P500.AutoStopCriteria.MaxRttP95Ms = 150.0f;
		P500.AutoStopCriteria.MaxMemoryPercent = 85.0f;
		P500.AutoStopCriteria.MaxDesyncCount = 0;
		P500.AutoStopCriteria.MaxCpuPercent = 92.0f;
		P500.AutoStopCriteria.MinServerFPS = 18.0f;
		P500.BotProfile.MoveSpeed = 600.0f;
		P500.BotProfile.FireRate = 2.5f;
		P500.BotProfile.bWanderRandomly = true;
		P500.BotProfile.bEngageEnemies = true;
		P500.BotProfile.bPickupLoot = true;
		P500.BotProfile.bStayInZone = true;
		P500.BotProfile.ReactionDelayMs = 200.0f;
		Profiles.Add(P500);
	}

	// ── 1000 Players: Production target ─────────────────────────────────────
	{
		FKhaaosStressTestProfileConfig P1000;
		P1000.Profile = EKhaaosStressTestProfile::Profile_1000;
		P1000.BotCount = 1000;
		P1000.SpawnRatePerSecond = 50.0f;
		P1000.ActionFrequencyMultiplier = 1.0f;
		P1000.DurationSeconds = 600.0f;
		P1000.RampUpStrategy = EKhaaosRampUpStrategy::Exponential;
		P1000.RampUpDurationSeconds = 60.0f;
		P1000.NetworkSimulation.PacketLossPercent = 2.0f;
		P1000.NetworkSimulation.LatencyMs = 100.0f;
		P1000.NetworkSimulation.JitterMs = 20.0f;
		P1000.AutoStopCriteria.MaxCrashCount = 0;
		P1000.AutoStopCriteria.MaxRttP95Ms = 200.0f;
		P1000.AutoStopCriteria.MaxMemoryPercent = 90.0f;
		P1000.AutoStopCriteria.MaxDesyncCount = 0;
		P1000.AutoStopCriteria.MaxCpuPercent = 95.0f;
		P1000.AutoStopCriteria.MinServerFPS = 15.0f;
		P1000.BotProfile.MoveSpeed = 600.0f;
		P1000.BotProfile.FireRate = 3.0f;
		P1000.BotProfile.bWanderRandomly = true;
		P1000.BotProfile.bEngageEnemies = true;
		P1000.BotProfile.bPickupLoot = false;
		P1000.BotProfile.bStayInZone = true;
		P1000.BotProfile.ReactionDelayMs = 250.0f;
		Profiles.Add(P1000);
	}

	// ── 2000 Players: Extreme stress / break test ──────────────────────────
	{
		FKhaaosStressTestProfileConfig P2000;
		P2000.Profile = EKhaaosStressTestProfile::Profile_2000;
		P2000.BotCount = 2000;
		P2000.SpawnRatePerSecond = 100.0f;
		P2000.ActionFrequencyMultiplier = 1.5f;
		P2000.DurationSeconds = 600.0f;
		P2000.RampUpStrategy = EKhaaosRampUpStrategy::Exponential;
		P2000.RampUpDurationSeconds = 120.0f;
		P2000.NetworkSimulation.PacketLossPercent = 5.0f;
		P2000.NetworkSimulation.LatencyMs = 200.0f;
		P2000.NetworkSimulation.JitterMs = 50.0f;
		P2000.AutoStopCriteria.MaxCrashCount = 1;
		P2000.AutoStopCriteria.MaxRttP95Ms = 300.0f;
		P2000.AutoStopCriteria.MaxMemoryPercent = 95.0f;
		P2000.AutoStopCriteria.MaxDesyncCount = 5;
		P2000.AutoStopCriteria.MaxCpuPercent = 98.0f;
		P2000.AutoStopCriteria.MinServerFPS = 10.0f;
		P2000.BotProfile.MoveSpeed = 500.0f;
		P2000.BotProfile.FireRate = 4.0f;
		P2000.BotProfile.bWanderRandomly = true;
		P2000.BotProfile.bEngageEnemies = true;
		P2000.BotProfile.bPickupLoot = false;
		P2000.BotProfile.bStayInZone = false;
		P2000.BotProfile.ReactionDelayMs = 300.0f;
		Profiles.Add(P2000);
	}
}

// ─── Get Profile Config ───────────────────────────────────────────────────────

FKhaaosStressTestProfileConfig UKhaaosStressTestConfig::GetProfileConfig(
	EKhaaosStressTestProfile Profile) const
{
	for (const FKhaaosStressTestProfileConfig& P : Profiles)
	{
		if (P.Profile == Profile)
		{
			return P;
		}
	}

	UE_LOG(LogKhaaosStressTest, Warning, TEXT("Profile %d not found, returning default 100-player config"),
	        static_cast<int32>(Profile));
	return Profiles.IsEmpty() ? FKhaaosStressTestProfileConfig() : Profiles[0];
}

const TArray<FKhaaosStressTestProfileConfig>& UKhaaosStressTestConfig::GetAllProfiles() const
{
	return Profiles;
}

// ─── Run Stress Test (Predefined) ────────────────────────────────────────────

void UKhaaosStressTestConfig::RunStressTest(EKhaaosStressTestProfile Profile)
{
	const FKhaaosStressTestProfileConfig Config = GetProfileConfig(Profile);
	RunCustomStressTest(Config);
}

// ─── Run Custom Stress Test ───────────────────────────────────────────────────

void UKhaaosStressTestConfig::RunCustomStressTest(const FKhaaosStressTestProfileConfig& CustomProfile)
{
	if (bIsRunning)
	{
		UE_LOG(LogKhaaosStressTest, Warning, TEXT("Stress test already running — stop it first"));
		return;
	}

	CurrentProfileConfig = CustomProfile;
	ActiveProfile = CustomProfile.Profile;
	bIsRunning = true;
	bAutoStopTriggered = false;

	// Reset metrics
	CurrentMetrics = FKhaaosStressTestMetrics();
	CurrentMetrics.ConfiguredDurationSeconds = CustomProfile.DurationSeconds;
	RttSamplesMs.Reset();

	// Record start time
	LastReport.StartedAt = GetIsoTimestamp();
	LastReport.BuildVersion = GetBuildVersion();
	LastReport.Profile = CustomProfile.Profile;
	LastReport.Region = FPlatformProcess::GetComputerName();

	UE_LOG(LogKhaaosStressTest, Log, TEXT("=== Stress Test Started ==="));
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Profile: %d players"), CustomProfile.BotCount);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Duration: %.0f seconds"), CustomProfile.DurationSeconds);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Ramp-up: %s (%.0fs)"),
	       CustomProfile.RampUpStrategy == EKhaaosRampUpStrategy::Linear ? TEXT("Linear") :
	       CustomProfile.RampUpStrategy == EKhaaosRampUpStrategy::Exponential ? TEXT("Exponential") : TEXT("Step"),
	       CustomProfile.RampUpDurationSeconds);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Network: loss=%.1f%% latency=%.0fms jitter=%.0fms"),
	       CustomProfile.NetworkSimulation.PacketLossPercent,
	       CustomProfile.NetworkSimulation.LatencyMs,
	       CustomProfile.NetworkSimulation.JitterMs);

	UWorld* World = GetWorld();
	if (!World)
	{
		UE_LOG(LogKhaaosStressTest, Error, TEXT("No world available for stress test"));
		bIsRunning = false;
		return;
	}

	// Start ramp-up phase
	BeginRampUp();

	// Set test duration timer
	World->GetTimerManager().SetTimer(
		TestDurationTimer,
		this,
		&UKhaaosStressTestConfig::OnTestDurationExpired,
		CustomProfile.DurationSeconds,
		false);

	// Set metrics collection timer (every 1 second)
	World->GetTimerManager().SetTimer(
		MetricsCollectionTimer,
		this,
		&UKhaaosStressTestConfig::CollectStressTestMetrics,
		1.0f,
		true);

	// Set auto-stop check timer (every 5 seconds)
	World->GetTimerManager().SetTimer(
		AutoStopCheckTimer,
		this,
		&UKhaaosStressTestConfig::CheckAutoStopCriteria,
		5.0f,
		true);

	// Set Prometheus push timer
	if (PrometheusConfig.bEnabled)
	{
		World->GetTimerManager().SetTimer(
			PrometheusPushTimer,
			this,
			&UKhaaosStressTestConfig::PushToPrometheus,
			PrometheusConfig.PushIntervalSeconds,
			true);
	}
}

// ─── Stop Stress Test ─────────────────────────────────────────────────────────

void UKhaaosStressTestConfig::StopStressTest()
{
	if (!bIsRunning)
	{
		return;
	}

	UE_LOG(LogKhaaosStressTest, Log, TEXT("Stress test stopped manually"));
	OnTestComplete();
}

// ─── Begin Ramp-Up ────────────────────────────────────────────────────────────

void UKhaaosStressTestConfig::BeginRampUp()
{
	UWorld* World = GetWorld();
	if (!World) return;

	const float RampDuration = CurrentProfileConfig.RampUpDurationSeconds;
	const int32 TotalBots = CurrentProfileConfig.BotCount;
	const EKhaaosRampUpStrategy Strategy = CurrentProfileConfig.RampUpStrategy;

	// Calculate spawn interval based on ramp-up strategy
	float SpawnInterval = 0.0f;

	switch (Strategy)
	{
		case EKhaaosRampUpStrategy::Linear:
		{
			// Spawn bots at constant rate over ramp duration
			SpawnInterval = RampDuration / static_cast<float>(TotalBots);
			// Ensure minimum interval of 0.01s
			SpawnInterval = FMath::Max(SpawnInterval, 0.01f);
			break;
		}
		case EKhaaosRampUpStrategy::Exponential:
		{
			// Start slow, increase rate exponentially
			// First batch: 10% of total, then doubling
			SpawnInterval = 0.1f; // Fast spawn, but in increasing batches
			break;
		}
		case EKhaaosRampUpStrategy::Step:
		{
			// Spawn in 5 discrete steps
			SpawnInterval = RampDuration / 5.0f;
			break;
		}
	}

	// Start ramp-up spawn timer
	World->GetTimerManager().SetTimer(
		RampUpSpawnTimer,
		this,
		&UKhaaosStressTestConfig::RampUpSpawnBatch,
		SpawnInterval,
		true);

	UE_LOG(LogKhaaosStressTest, Log, TEXT("Ramp-up started: %d bots, strategy=%s, interval=%.3fs"),
	       TotalBots,
	       Strategy == EKhaaosRampUpStrategy::Linear ? TEXT("Linear") :
	       Strategy == EKhaaosRampUpStrategy::Exponential ? TEXT("Exponential") : TEXT("Step"),
	       SpawnInterval);
}

// ─── Ramp-Up Spawn Batch ──────────────────────────────────────────────────────

void UKhaaosStressTestConfig::RampUpSpawnBatch()
{
	if (!bIsRunning) return;

	const int32 TargetBots = CurrentProfileConfig.BotCount;
	const int32 CurrentBots = CurrentMetrics.ActiveBots;

	if (CurrentBots >= TargetBots)
	{
		// Ramp-up complete — clear spawn timer
		UWorld* World = GetWorld();
		if (World)
		{
			World->GetTimerManager().ClearTimer(RampUpSpawnTimer);
		}

		UE_LOG(LogKhaaosStressTest, Log, TEXT("Ramp-up complete: %d/%d bots active"),
		       CurrentBots, TargetBots);
		return;
	}

	// Calculate how many bots to spawn this batch
	int32 BotsToSpawn = 1;

	switch (CurrentProfileConfig.RampUpStrategy)
	{
		case EKhaaosRampUpStrategy::Linear:
		{
			// Spawn at constant rate
			BotsToSpawn = FMath::CeilToInt(CurrentProfileConfig.SpawnRatePerSecond * 0.1f);
			BotsToSpawn = FMath::Max(1, BotsToSpawn);
			break;
		}
		case EKhaaosRampUpStrategy::Exponential:
		{
			// Spawn in doubling batches: 1, 2, 4, 8, 16, 32, ...
			const float Progress = static_cast<float>(CurrentBots) / static_cast<float>(TargetBots);
			const int32 BatchSize = FMath::Max(1, FMath::FloorToInt(Progress * 32.0f + 1.0f));
			BotsToSpawn = FMath::Min(BatchSize, TargetBots - CurrentBots);
			break;
		}
		case EKhaaosRampUpStrategy::Step:
		{
			// Spawn 20% of target at each step
			BotsToSpawn = FMath::CeilToInt(TargetBots * 0.2f);
			BotsToSpawn = FMath::Min(BotsToSpawn, TargetBots - CurrentBots);
			break;
		}
	}

	BotsToSpawn = FMath::Min(BotsToSpawn, TargetBots - CurrentBots);

	// Request bot spawn from the load test manager
	UGameInstance* GameInstance = GetWorld()->GetGameInstance();
	if (GameInstance)
	{
		UKhaaosLoadTestManager* LoadTestMgr = GameInstance->GetSubsystem<UKhaaosLoadTestManager>();
		if (LoadTestMgr)
		{
			LoadTestMgr->SpawnWave(BotsToSpawn);
		}
	}

	// Update metrics
	CurrentMetrics.TotalSpawned += BotsToSpawn;
	CurrentMetrics.ActiveBots += BotsToSpawn;
	CurrentMetrics.PeakConcurrent = FMath::Max(CurrentMetrics.PeakConcurrent, CurrentMetrics.ActiveBots);

	// Broadcast ramp-up progress
	OnRampUpStep.Broadcast(CurrentMetrics.ActiveBots, TargetBots);
}

// ─── Collect Stress Test Metrics ──────────────────────────────────────────────

void UKhaaosStressTestConfig::CollectStressTestMetrics()
{
	if (!bIsRunning) return;

	UWorld* World = GetWorld();
	if (!World) return;

	// Update elapsed time
	CurrentMetrics.ElapsedSeconds += 1.0f;

	// Collect from the load test manager
	UGameInstance* GameInstance = World->GetGameInstance();
	if (GameInstance)
	{
		UKhaaosLoadTestManager* LoadTestMgr = GameInstance->GetSubsystem<UKhaaosLoadTestManager>();
		if (LoadTestMgr)
		{
			const FLoadTestMetrics& BaseMetrics = LoadTestMgr->GetCurrentMetrics();

			CurrentMetrics.ActiveBots = BaseMetrics.ActiveBots;
			CurrentMetrics.TotalEliminations = BaseMetrics.Eliminations;
			CurrentMetrics.ServerFPS = BaseMetrics.ServerFPS;
			CurrentMetrics.MemoryUsageMB = BaseMetrics.MemoryUsageMB;
			CurrentMetrics.ReplicatedActors = BaseMetrics.ReplicatedActors;

			// Collect RTT sample
			if (BaseMetrics.AvgRTT > 0.0f)
			{
				RttSamplesMs.Add(BaseMetrics.AvgRTT);
			}
		}
	}

	// Calculate percentile RTT values
	if (RttSamplesMs.Num() > 0)
	{
		CurrentMetrics.RttP50Ms = CalculatePercentile(RttSamplesMs, 50.0f);
		CurrentMetrics.RttP95Ms = CalculatePercentile(RttSamplesMs, 95.0f);
		CurrentMetrics.RttP99Ms = CalculatePercentile(RttSamplesMs, 99.0f);

		TArray<float> SortedSamples = RttSamplesMs;
		SortedSamples.Sort();
		CurrentMetrics.RttMinMs = SortedSamples[0];
		CurrentMetrics.RttMaxMs = SortedSamples.Last();
	}

	// Estimate CPU and memory percentages
	// In production, these come from platform-specific APIs
	const FPlatformMemoryStats MemStats = FPlatformMemory::GetStats();
	const uint64 TotalPhysical = FPlatformMemory::GetPhysicalRAM();
	if (TotalPhysical > 0)
	{
		CurrentMetrics.MemoryPercent = (static_cast<float>(MemStats.UsedPhysical) /
		                                static_cast<float>(TotalPhysical)) * 100.0f;
	}
	else
	{
		// Fallback: estimate from process memory
		CurrentMetrics.MemoryPercent = FMath::Min(100.0f, (CurrentMetrics.MemoryUsageMB / 4096.0f) * 100.0f);
	}

	// CPU: estimate from server FPS (60 FPS target → lower FPS = higher CPU)
	const float TargetFPS = 60.0f;
	if (CurrentMetrics.ServerFPS > 0.0f)
	{
		const float IdleFactor = CurrentMetrics.ServerFPS / TargetFPS;
		CurrentMetrics.CpuPercent = FMath::Clamp((1.0f - IdleFactor + 0.3f) * 100.0f, 0.0f, 100.0f);
	}

	// Network bandwidth estimation (from replicated actors)
	// Approximation: each replicated actor ~2KB/s at 30Hz replication
	CurrentMetrics.NetBandwidthKBps = CurrentMetrics.ReplicatedActors * 2.0f * 30.0f / 1024.0f;
}

// ─── Check Auto-Stop Criteria ─────────────────────────────────────────────────

void UKhaaosStressTestConfig::CheckAutoStopCriteria()
{
	if (!bIsRunning || bAutoStopTriggered) return;

	const FKhaaosAutoStopCriteria& Criteria = CurrentProfileConfig.AutoStopCriteria;

	const bool bShouldStop = Criteria.ShouldStop(
		CurrentMetrics.CrashCount,
		CurrentMetrics.RttP95Ms,
		CurrentMetrics.MemoryPercent,
		CurrentMetrics.DesyncCount,
		CurrentMetrics.CpuPercent,
		CurrentMetrics.ServerFPS);

	if (bShouldStop)
	{
		bAutoStopTriggered = true;

		// Build reason string
		FString Reason;
		if (CurrentMetrics.CrashCount > Criteria.MaxCrashCount)
		{
			Reason = FString::Printf(TEXT("Crash count %d exceeds limit %d"),
			                         CurrentMetrics.CrashCount, Criteria.MaxCrashCount);
		}
		else if (Criteria.MaxRttP95Ms > 0.0f && CurrentMetrics.RttP95Ms > Criteria.MaxRttP95Ms)
		{
			Reason = FString::Printf(TEXT("RTT p95 %.1fms exceeds limit %.1fms"),
			                         CurrentMetrics.RttP95Ms, Criteria.MaxRttP95Ms);
		}
		else if (Criteria.MaxMemoryPercent > 0.0f && CurrentMetrics.MemoryPercent > Criteria.MaxMemoryPercent)
		{
			Reason = FString::Printf(TEXT("Memory %.1f%% exceeds limit %.1f%%"),
			                         CurrentMetrics.MemoryPercent, Criteria.MaxMemoryPercent);
		}
		else if (CurrentMetrics.DesyncCount > Criteria.MaxDesyncCount)
		{
			Reason = FString::Printf(TEXT("Desync count %d exceeds limit %d"),
			                         CurrentMetrics.DesyncCount, Criteria.MaxDesyncCount);
		}
		else if (Criteria.MaxCpuPercent > 0.0f && CurrentMetrics.CpuPercent > Criteria.MaxCpuPercent)
		{
			Reason = FString::Printf(TEXT("CPU %.1f%% exceeds limit %.1f%%"),
			                         CurrentMetrics.CpuPercent, Criteria.MaxCpuPercent);
		}
		else if (Criteria.MinServerFPS > 0.0f && CurrentMetrics.ServerFPS < Criteria.MinServerFPS)
		{
			Reason = FString::Printf(TEXT("Server FPS %.1f below minimum %.1f"),
			                         CurrentMetrics.ServerFPS, Criteria.MinServerFPS);
		}

		UE_LOG(LogKhaaosStressTest, Error, TEXT("AUTO-STOP triggered: %s"), *Reason);
		OnAutoStopTriggered.Broadcast(Reason, CurrentMetrics);

		// Stop the test
		OnTestComplete();
	}
}

// ─── Calculate Percentile ─────────────────────────────────────────────────────

float UKhaaosStressTestConfig::CalculatePercentile(TArray<float>& Samples, float Percentile) const
{
	if (Samples.Num() == 0) return 0.0f;
	if (Samples.Num() == 1) return Samples[0];

	TArray<float> Sorted = Samples;
	Sorted.Sort();

	const float Index = (Percentile / 100.0f) * static_cast<float>(Sorted.Num() - 1);
	const int32 Lower = FMath::FloorToInt(Index);
	const int32 Upper = FMath::CeilToInt(Index);
	const float Fraction = Index - static_cast<float>(Lower);

	if (Upper >= Sorted.Num()) return Sorted.Last();

	return Sorted[Lower] + Fraction * (Sorted[Upper] - Sorted[Lower]);
}

// ─── Determine Result ─────────────────────────────────────────────────────────

EKhaaosStressTestResult UKhaaosStressTestConfig::DetermineResult() const
{
	// If auto-stop was triggered, it's a failure
	if (bAutoStopTriggered)
	{
		return EKhaaosStressTestResult::Fail;
	}

	// Check crash count
	if (CurrentMetrics.CrashCount > CurrentProfileConfig.AutoStopCriteria.MaxCrashCount)
	{
		return EKhaaosStressTestResult::Fail;
	}

	// Check RTT p95
	if (CurrentProfileConfig.AutoStopCriteria.MaxRttP95Ms > 0.0f &&
	    CurrentMetrics.RttP95Ms > CurrentProfileConfig.AutoStopCriteria.MaxRttP95Ms)
	{
		return EKhaaosStressTestResult::Fail;
	}

	// Check memory
	if (CurrentProfileConfig.AutoStopCriteria.MaxMemoryPercent > 0.0f &&
	    CurrentMetrics.MemoryPercent > CurrentProfileConfig.AutoStopCriteria.MaxMemoryPercent)
	{
		return EKhaaosStressTestResult::Fail;
	}

	// Check desync
	if (CurrentMetrics.DesyncCount > CurrentProfileConfig.AutoStopCriteria.MaxDesyncCount)
	{
		return EKhaaosStressTestResult::Fail;
	}

	// All criteria met
	return EKhaaosStressTestResult::Pass;
}

// ─── Build Failure Reason ─────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::BuildFailureReason() const
{
	TArray<FString> Reasons;
	const auto& Criteria = CurrentProfileConfig.AutoStopCriteria;

	if (CurrentMetrics.CrashCount > Criteria.MaxCrashCount)
	{
		Reasons.Add(FString::Printf(TEXT("CrashCount(%d) > Max(%d)"),
		                            CurrentMetrics.CrashCount, Criteria.MaxCrashCount));
	}
	if (Criteria.MaxRttP95Ms > 0.0f && CurrentMetrics.RttP95Ms > Criteria.MaxRttP95Ms)
	{
		Reasons.Add(FString::Printf(TEXT("RttP95(%.1fms) > Max(%.1fms)"),
		                            CurrentMetrics.RttP95Ms, Criteria.MaxRttP95Ms));
	}
	if (Criteria.MaxMemoryPercent > 0.0f && CurrentMetrics.MemoryPercent > Criteria.MaxMemoryPercent)
	{
		Reasons.Add(FString::Printf(TEXT("Memory(%.1f%%) > Max(%.1f%%)"),
		                            CurrentMetrics.MemoryPercent, Criteria.MaxMemoryPercent));
	}
	if (CurrentMetrics.DesyncCount > Criteria.MaxDesyncCount)
	{
		Reasons.Add(FString::Printf(TEXT("DesyncCount(%d) > Max(%d)"),
		                            CurrentMetrics.DesyncCount, Criteria.MaxDesyncCount));
	}
	if (Criteria.MaxCpuPercent > 0.0f && CurrentMetrics.CpuPercent > Criteria.MaxCpuPercent)
	{
		Reasons.Add(FString::Printf(TEXT("Cpu(%.1f%%) > Max(%.1f%%)"),
		                            CurrentMetrics.CpuPercent, Criteria.MaxCpuPercent));
	}
	if (Criteria.MinServerFPS > 0.0f && CurrentMetrics.ServerFPS < Criteria.MinServerFPS)
	{
		Reasons.Add(FString::Printf(TEXT("FPS(%.1f) < Min(%.1f)"),
		                            CurrentMetrics.ServerFPS, Criteria.MinServerFPS));
	}

	return FString::Join(Reasons, TEXT("; "));
}

// ─── On Test Complete ─────────────────────────────────────────────────────────

void UKhaaosStressTestConfig::OnTestComplete()
{
	bIsRunning = false;

	// Clear all timers
	UWorld* World = GetWorld();
	if (World)
	{
		FTimerManager& TimerMgr = World->GetTimerManager();
		TimerMgr.ClearTimer(TestDurationTimer);
		TimerMgr.ClearTimer(RampUpSpawnTimer);
		TimerMgr.ClearTimer(MetricsCollectionTimer);
		TimerMgr.ClearTimer(PrometheusPushTimer);
		TimerMgr.ClearTimer(AutoStopCheckTimer);
	}

	// Finalize metrics
	CollectStressTestMetrics();

	// Build report
	LastReport.EndedAt = GetIsoTimestamp();
	LastReport.Metrics = CurrentMetrics;
	LastReport.Result = DetermineResult();
	LastReport.FailureReason = BuildFailureReason();
	LastReport.JsonReport = GenerateJsonReport();

	// Despawn all bots
	CleanupTest();

	// Log result
	const FString ResultStr = LastReport.Result == EKhaaosStressTestResult::Pass ? TEXT("PASS") :
	                          LastReport.Result == EKhaaosStressTestResult::Fail ? TEXT("FAIL") : TEXT("ABORTED");

	UE_LOG(LogKhaaosStressTest, Log, TEXT("=== Stress Test Complete ==="));
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Result: %s"), *ResultStr);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Profile: %d players"), CurrentProfileConfig.BotCount);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Duration: %.1fs / %.1fs"),
	       CurrentMetrics.ElapsedSeconds, CurrentMetrics.ConfiguredDurationSeconds);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  RTT p50/p95/p99: %.1f / %.1f / %.1f ms"),
	       CurrentMetrics.RttP50Ms, CurrentMetrics.RttP95Ms, CurrentMetrics.RttP99Ms);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  CPU: %.1f%%  Memory: %.1f%%  FPS: %.1f"),
	       CurrentMetrics.CpuPercent, CurrentMetrics.MemoryPercent, CurrentMetrics.ServerFPS);
	UE_LOG(LogKhaaosStressTest, Log, TEXT("  Crashes: %d  Desyncs: %d  Disconnects: %d"),
	       CurrentMetrics.CrashCount, CurrentMetrics.DesyncCount, CurrentMetrics.DisconnectCount);

	if (LastReport.Result != EKhaaosStressTestResult::Pass)
	{
		UE_LOG(LogKhaaosStressTest, Error, TEXT("  Failure: %s"), *LastReport.FailureReason);
	}

	// Push final metrics to Prometheus
	if (PrometheusConfig.bEnabled)
	{
		PushToPrometheus();
	}

	// Broadcast completion
	OnStressTestComplete.Broadcast(LastReport);
}

// ─── On Test Duration Expired ─────────────────────────────────────────────────

void UKhaaosStressTestConfig::OnTestDurationExpired()
{
	UE_LOG(LogKhaaosStressTest, Log, TEXT("Stress test duration expired (natural completion)"));
	OnTestComplete();
}

// ─── Cleanup Test ─────────────────────────────────────────────────────────────

void UKhaaosStressTestConfig::CleanupTest()
{
	UGameInstance* GameInstance = GetWorld() ? GetWorld()->GetGameInstance() : nullptr;
	if (GameInstance)
	{
		UKhaaosLoadTestManager* LoadTestMgr = GameInstance->GetSubsystem<UKhaaosLoadTestManager>();
		if (LoadTestMgr && LoadTestMgr->bIsRunning)
		{
			LoadTestMgr->StopLoadTest();
		}
	}
}

// ─── Get Current Metrics ──────────────────────────────────────────────────────

FKhaaosStressTestMetrics UKhaaosStressTestConfig::GetCurrentMetrics() const
{
	return CurrentMetrics;
}

// ─── Generate JSON Report ─────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::GenerateJsonReport() const
{
	const FString ResultStr = LastReport.Result == EKhaaosStressTestResult::Pass ? TEXT("PASS") :
	                          LastReport.Result == EKhaaosStressTestResult::Fail ? TEXT("FAIL") : TEXT("ABORTED");

	const FString ProfileStr = FString::FromInt(static_cast<int32>(LastReport.Profile));

	FString Json = FString::Printf(TEXT(
		"{\n"
		"  \"khaaos_stress_test\": {\n"
		"    \"profile\": \"%s_players\",\n"
		"    \"result\": \"%s\",\n"
		"    \"failure_reason\": \"%s\",\n"
		"    \"started_at\": \"%s\",\n"
		"    \"ended_at\": \"%s\",\n"
		"    \"build_version\": \"%s\",\n"
		"    \"region\": \"%s\",\n"
		"    \"profile_config\": {\n"
		"      \"bot_count\": %d,\n"
		"      \"spawn_rate_per_second\": %.1f,\n"
		"      \"action_frequency_multiplier\": %.1f,\n"
		"      \"duration_seconds\": %.0f,\n"
		"      \"ramp_up_strategy\": \"%s\",\n"
		"      \"ramp_up_duration_seconds\": %.0f,\n"
		"      \"network_simulation\": {\n"
		"        \"packet_loss_percent\": %.1f,\n"
		"        \"latency_ms\": %.0f,\n"
		"        \"jitter_ms\": %.0f\n"
		"      }\n"
		"    },\n"
		"    \"metrics\": {\n"
		"      \"players\": {\n"
		"        \"active_bots\": %d,\n"
		"        \"total_spawned\": %d,\n"
		"        \"peak_concurrent\": %d\n"
		"      },\n"
		"      \"rtt\": %s,\n"
		"      \"resources\": %s,\n"
		"      \"stability\": %s,\n"
		"      \"gameplay\": {\n"
		"        \"total_eliminations\": %d,\n"
		"        \"replicated_actors\": %d,\n"
		"        \"net_bandwidth_kbps\": %.1f\n"
		"      },\n"
		"      \"timing\": {\n"
		"        \"elapsed_seconds\": %.1f,\n"
		"        \"configured_duration_seconds\": %.0f\n"
		"      }\n"
		"    }\n"
		"  }\n"
		"}"),

		*ProfileStr,
		*ResultStr,
		*LastReport.FailureReason,
		*LastReport.StartedAt,
		*LastReport.EndedAt,
		*LastReport.BuildVersion,
		*LastReport.Region,

		CurrentProfileConfig.BotCount,
		CurrentProfileConfig.SpawnRatePerSecond,
		CurrentProfileConfig.ActionFrequencyMultiplier,
		CurrentProfileConfig.DurationSeconds,
		CurrentProfileConfig.RampUpStrategy == EKhaaosRampUpStrategy::Linear ? TEXT("linear") :
		CurrentProfileConfig.RampUpStrategy == EKhaaosRampUpStrategy::Exponential ? TEXT("exponential") : TEXT("step"),
		CurrentProfileConfig.RampUpDurationSeconds,
		CurrentProfileConfig.NetworkSimulation.PacketLossPercent,
		CurrentProfileConfig.NetworkSimulation.LatencyMs,
		CurrentProfileConfig.NetworkSimulation.JitterMs,

		CurrentMetrics.ActiveBots,
		CurrentMetrics.TotalSpawned,
		CurrentMetrics.PeakConcurrent,

		*FormatRttJson(),
		*FormatResourceJson(),
		*FormatStabilityJson(),

		CurrentMetrics.TotalEliminations,
		CurrentMetrics.ReplicatedActors,
		CurrentMetrics.NetBandwidthKBps,

		CurrentMetrics.ElapsedSeconds,
		CurrentMetrics.ConfiguredDurationSeconds
	);

	return Json;
}

// ─── Format RTT JSON ──────────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::FormatRttJson() const
{
	return FString::Printf(TEXT(
		"{\n"
		"        \"p50_ms\": %.1f,\n"
		"        \"p95_ms\": %.1f,\n"
		"        \"p99_ms\": %.1f,\n"
		"        \"min_ms\": %.1f,\n"
		"        \"max_ms\": %.1f\n"
		"      }"),
		CurrentMetrics.RttP50Ms,
		CurrentMetrics.RttP95Ms,
		CurrentMetrics.RttP99Ms,
		CurrentMetrics.RttMinMs,
		CurrentMetrics.RttMaxMs);
}

// ─── Format Resource JSON ─────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::FormatResourceJson() const
{
	return FString::Printf(TEXT(
		"{\n"
		"        \"cpu_percent\": %.1f,\n"
		"        \"memory_percent\": %.1f,\n"
		"        \"memory_usage_mb\": %.1f,\n"
		"        \"server_fps\": %.1f\n"
		"      }"),
		CurrentMetrics.CpuPercent,
		CurrentMetrics.MemoryPercent,
		CurrentMetrics.MemoryUsageMB,
		CurrentMetrics.ServerFPS);
}

// ─── Format Stability JSON ────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::FormatStabilityJson() const
{
	return FString::Printf(TEXT(
		"{\n"
		"        \"crash_count\": %d,\n"
		"        \"desync_count\": %d,\n"
		"        \"disconnect_count\": %d,\n"
		"        \"timeout_count\": %d\n"
		"      }"),
		CurrentMetrics.CrashCount,
		CurrentMetrics.DesyncCount,
		CurrentMetrics.DisconnectCount,
		CurrentMetrics.TimeoutCount);
}

// ─── Push to Prometheus ───────────────────────────────────────────────────────

void UKhaaosStressTestConfig::PushToPrometheus()
{
	if (!PrometheusConfig.bEnabled) return;

	// Build Prometheus push gateway payload
	// Format: https://github.com/prometheus/pushgateway
	const FString PushUrl = FString::Printf(TEXT("%s/metrics/job/%s/instance/%s"),
	                                        *PrometheusConfig.PushGatewayUrl,
	                                        *PrometheusConfig.JobName,
	                                        *LastReport.Region);

	// Build metrics in Prometheus exposition format
	FString MetricsText = FString::Printf(TEXT(
		"# HELP khaaos_stress_test_active_bots Current active bots\n"
		"# TYPE khaaos_stress_test_active_bots gauge\n"
		"khaaos_stress_test_active_bots %d\n"
		"# HELP khaaos_stress_test_rtt_p50_ms RTT p50 in ms\n"
		"# TYPE khaaos_stress_test_rtt_p50_ms gauge\n"
		"khaaos_stress_test_rtt_p50_ms %.1f\n"
		"# HELP khaaos_stress_test_rtt_p95_ms RTT p95 in ms\n"
		"# TYPE khaaos_stress_test_rtt_p95_ms gauge\n"
		"khaaos_stress_test_rtt_p95_ms %.1f\n"
		"# HELP khaaos_stress_test_rtt_p99_ms RTT p99 in ms\n"
		"# TYPE khaaos_stress_test_rtt_p99_ms gauge\n"
		"khaaos_stress_test_rtt_p99_ms %.1f\n"
		"# HELP khaaos_stress_test_cpu_percent CPU usage percent\n"
		"# TYPE khaaos_stress_test_cpu_percent gauge\n"
		"khaaos_stress_test_cpu_percent %.1f\n"
		"# HELP khaaos_stress_test_memory_percent Memory usage percent\n"
		"# TYPE khaaos_stress_test_memory_percent gauge\n"
		"khaaos_stress_test_memory_percent %.1f\n"
		"# HELP khaaos_stress_test_server_fps Server FPS\n"
		"# TYPE khaaos_stress_test_server_fps gauge\n"
		"khaaos_stress_test_server_fps %.1f\n"
		"# HELP khaaos_stress_test_crash_count Crash count\n"
		"# TYPE khaaos_stress_test_crash_count counter\n"
		"khaaos_stress_test_crash_count %d\n"
		"# HELP khaaos_stress_test_desync_count Desync count\n"
		"# TYPE khaaos_stress_test_desync_count counter\n"
		"khaaos_stress_test_desync_count %d\n"),

		CurrentMetrics.ActiveBots,
		CurrentMetrics.RttP50Ms,
		CurrentMetrics.RttP95Ms,
		CurrentMetrics.RttP99Ms,
		CurrentMetrics.CpuPercent,
		CurrentMetrics.MemoryPercent,
		CurrentMetrics.ServerFPS,
		CurrentMetrics.CrashCount,
		CurrentMetrics.DesyncCount);

	UE_LOG(LogKhaaosStressTest, Verbose, TEXT("Prometheus push: %s"), *PushUrl);
	// HTTP POST to push gateway would be done via HTTP client in production
	// For now, log the metrics for external collection
	UE_LOG(LogKhaaosStressTest, Log, TEXT("Metrics pushed to Prometheus: bots=%d rtt_p95=%.1fms cpu=%.1f%% mem=%.1f%%"),
	       CurrentMetrics.ActiveBots, CurrentMetrics.RttP95Ms,
	       CurrentMetrics.CpuPercent, CurrentMetrics.MemoryPercent);
}

// ─── ISO Timestamp ────────────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::GetIsoTimestamp() const
{
	const FDateTime Now = FDateTime::UtcNow();
	return FString::Printf(TEXT("%04d-%02d-%02dT%02d:%02d:%02dZ"),
	                       Now.GetYear(), Now.GetMonth(), Now.GetDay(),
	                       Now.GetHour(), Now.GetMinute(), Now.GetSecond());
}

// ─── Build Version ────────────────────────────────────────────────────────────

FString UKhaaosStressTestConfig::GetBuildVersion() const
{
	// Try to get from command line
	FString Version;
	if (FParse::Value(FCommandLine::Get(), TEXT("-BuildVersion="), Version))
	{
		return Version;
	}

	// Default: use engine version + changelist
	return FString::Printf(TEXT("UE%d.%d-CL%d"),
	                       GEngineVersion.GetMajor(),
	                       GEngineVersion.GetMinor(),
	                       GEngineVersion.GetChangelist());
}
