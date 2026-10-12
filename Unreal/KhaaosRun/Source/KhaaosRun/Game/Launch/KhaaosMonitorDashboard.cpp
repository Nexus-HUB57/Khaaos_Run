// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Launch/KhaaosMonitorDashboard.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "TimerManager.h"
#include "HAL/PlatformTime.h"
#include "HAL/PlatformMemory.h"

UKhaaosMonitorDashboard::UKhaaosMonitorDashboard()
{
}

void UKhaaosMonitorDashboard::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	ServerStartTime = FPlatformTime::Seconds();

	// Start periodic metrics collection
	if (bIsMonitoring)
	{
		UWorld* World = GetWorld();
		if (World)
		{
			World->GetTimerManager().SetTimer(MetricsTimer, this,
				&UKhaaosMonitorDashboard::OnMetricsTimer,
				MetricsCollectionIntervalSeconds, true);
		}
	}

	UE_LOG(LogTemp, Log, TEXT("[MonitorDashboard] Initialized — Interval: %.1fs, Monitoring: %s"),
		MetricsCollectionIntervalSeconds, bIsMonitoring ? TEXT("true") : TEXT("false"));
}

void UKhaaosMonitorDashboard::Deinitialize()
{
	UWorld* World = GetWorld();
	if (World)
	{
		World->GetTimerManager().ClearTimer(MetricsTimer);
	}

	Super::Deinitialize();
	UE_LOG(LogTemp, Log, TEXT("[MonitorDashboard] Deinitialized"));
}

FServerHealthMetrics UKhaaosMonitorDashboard::CollectServerHealth()
{
	FServerHealthMetrics Health;

	// CPU usage — approximate from frame time
	UWorld* World = GetWorld();
	if (World)
	{
		float DeltaSeconds = World->GetDeltaSeconds();
		Health.ServerFPS = 1.0f / FMath::Max(DeltaSeconds, KINDA_SMALL_NUMBER);
		Health.CPU_Usage = FMath::Min(100.0f, (DeltaSeconds / (1.0f / 60.0f)) * 100.0f);
	}

	// Memory usage
	FPlatformMemoryStats MemStats = FPlatformMemory::GetStats();
	Health.Memory_UsageMB = static_cast<float>(MemStats.TotalAllocated) / (1024.0f * 1024.0f);

	// Active players
	if (World)
	{
		Health.ActivePlayers = World->GetGameState() ?
			World->GetGameState()->PlayerArray.Num() : 0;
	}

	// Network throughput — from net driver stats
	if (World && World->GetNetDriver())
	{
		UNetDriver* NetDriver = World->GetNetDriver();
		if (NetDriver->GetNetConnection())
		{
			// Approximate from connection stats
			Health.NetworkIn_KBps = 0.0f;
			Health.NetworkOut_KBps = 0.0f;
		}
	}

	// Uptime
	Health.UptimeSeconds = static_cast<float>(FPlatformTime::Seconds() - ServerStartTime);

	return Health;
}

FGameHealthMetrics UKhaaosMonitorDashboard::CollectGameHealth()
{
	FGameHealthMetrics Game;

	UWorld* World = GetWorld();
	if (!World)
	{
		return Game;
	}

	// Match count and duration (simplified)
	Game.MatchCount = World->GetAuthGameMode() ? 1 : 0;
	Game.AverageMatchDuration = 0.0f; // Would be populated from match history

	// Active zones — count SafeZone actors
	Game.ActiveZones = 0;
	Game.LootSpawned = 0;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if ((*It)->GetClass()->GetName().Contains(TEXT("SafeZone")))
		{
			Game.ActiveZones++;
		}
		if ((*It)->GetClass()->GetName().Contains(TEXT("LootPickup")))
		{
			Game.LootSpawned++;
		}
	}

	// Pool hit rate and relevancy efficiency would come from subsystems
	Game.PoolHitRate = 0.0f;
	Game.RelevancyEfficiency = 0.0f;

	return Game;
}

FSecurityMetrics UKhaaosMonitorDashboard::CollectSecurity()
{
	FSecurityMetrics Security;

	// These values would be queried from the respective subsystems
	// For now, use the cached counters
	Security.CheatDetections = TotalCheatDetections;
	Security.RateLimitBlocks = TotalRateLimitBlocks;

	return Security;
}

FDashboardSnapshot UKhaaosMonitorDashboard::CollectAllMetrics()
{
	FDashboardSnapshot Snapshot;
	Snapshot.ServerHealth = CollectServerHealth();
	Snapshot.GameHealth = CollectGameHealth();
	Snapshot.Security = CollectSecurity();
	Snapshot.Timestamp = FPlatformTime::Seconds();

	return Snapshot;
}

FString UKhaaosMonitorDashboard::ExportMetricsAsJSON()
{
	FDashboardSnapshot Snapshot = CollectAllMetrics();

	FString JSON;
	JSON += TEXT("{\n");

	// Server Health
	JSON += TEXT("  \"server\": {\n");
	JSON += FString::Printf(TEXT("    \"cpu_usage\": %.2f,\n"), Snapshot.ServerHealth.CPU_Usage);
	JSON += FString::Printf(TEXT("    \"memory_mb\": %.2f,\n"), Snapshot.ServerHealth.Memory_UsageMB);
	JSON += FString::Printf(TEXT("    \"active_players\": %d,\n"), Snapshot.ServerHealth.ActivePlayers);
	JSON += FString::Printf(TEXT("    \"fps\": %.2f,\n"), Snapshot.ServerHealth.ServerFPS);
	JSON += FString::Printf(TEXT("    \"net_in_kbps\": %.2f,\n"), Snapshot.ServerHealth.NetworkIn_KBps);
	JSON += FString::Printf(TEXT("    \"net_out_kbps\": %.2f,\n"), Snapshot.ServerHealth.NetworkOut_KBps);
	JSON += FString::Printf(TEXT("    \"uptime_seconds\": %.1f\n"), Snapshot.ServerHealth.UptimeSeconds);
	JSON += TEXT("  },\n");

	// Game Health
	JSON += TEXT("  \"game\": {\n");
	JSON += FString::Printf(TEXT("    \"match_count\": %d,\n"), Snapshot.GameHealth.MatchCount);
	JSON += FString::Printf(TEXT("    \"avg_match_duration\": %.1f,\n"), Snapshot.GameHealth.AverageMatchDuration);
	JSON += FString::Printf(TEXT("    \"active_zones\": %d,\n"), Snapshot.GameHealth.ActiveZones);
	JSON += FString::Printf(TEXT("    \"loot_spawned\": %d,\n"), Snapshot.GameHealth.LootSpawned);
	JSON += FString::Printf(TEXT("    \"pool_hit_rate\": %.3f,\n"), Snapshot.GameHealth.PoolHitRate);
	JSON += FString::Printf(TEXT("    \"relevancy_efficiency\": %.3f\n"), Snapshot.GameHealth.RelevancyEfficiency);
	JSON += TEXT("  },\n");

	// Security
	JSON += TEXT("  \"security\": {\n");
	JSON += FString::Printf(TEXT("    \"ddos_blocks\": %d,\n"), Snapshot.Security.ActiveDDoSBlocks);
	JSON += FString::Printf(TEXT("    \"cheat_detections\": %d,\n"), Snapshot.Security.CheatDetections);
	JSON += FString::Printf(TEXT("    \"rate_limit_blocks\": %d,\n"), Snapshot.Security.RateLimitBlocks);
	JSON += FString::Printf(TEXT("    \"suspicious_players\": %d\n"), Snapshot.Security.SuspiciousPlayers);
	JSON += TEXT("  },\n");

	// Timestamp
	JSON += FString::Printf(TEXT("  \"timestamp\": %.3f\n"), Snapshot.Timestamp);
	JSON += TEXT("}");

	return JSON;
}

void UKhaaosMonitorDashboard::OnMetricsTimer()
{
	if (!bIsMonitoring)
	{
		return;
	}

	FDashboardSnapshot Snapshot = CollectAllMetrics();

	// Broadcast to subscribers
	OnMetricsUpdated.ExecuteIfBound(Snapshot);

	// Periodic log (every 30s = every 6th tick at 5s interval)
	static int32 TickCount = 0;
	TickCount++;
	if (TickCount % 6 == 0)
	{
		UE_LOG(LogTemp, Log, TEXT("[Monitor] FPS: %.1f | Players: %d | Memory: %.1fMB | Uptime: %.0fs"),
			Snapshot.ServerHealth.ServerFPS,
			Snapshot.ServerHealth.ActivePlayers,
			Snapshot.ServerHealth.Memory_UsageMB,
			Snapshot.ServerHealth.UptimeSeconds);
	}
}
