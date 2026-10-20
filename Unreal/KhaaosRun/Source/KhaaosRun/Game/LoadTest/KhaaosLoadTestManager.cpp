// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/LoadTest/KhaaosLoadTestManager.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "TimerManager.h"
#include "KismetMathHelpers.h"
#include "HAL/PlatformMemory.h"

UKhaaosLoadTestManager::UKhaaosLoadTestManager()
{
}

void UKhaaosLoadTestManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Initialized"));
}

void UKhaaosLoadTestManager::Deinitialize()
{
	StopLoadTest();
	Super::Deinitialize();
	UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Deinitialized"));
}

void UKhaaosLoadTestManager::StartLoadTest(int32 BotCount, float DurationSeconds, FBotBehaviorProfile DefaultProfile)
{
	if (bIsRunning)
	{
		UE_LOG(LogTemp, Warning, TEXT("[LoadTestManager] Load test already running — stop first"));
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		UE_LOG(LogTemp, Error, TEXT("[LoadTestManager] No world available"));
		return;
	}

	bIsRunning = true;
	TestProfile = DefaultProfile;
	TestDurationRemaining = DurationSeconds;
	BotsRemaining = FMath::Min(BotCount, Config.MaxBots);

	// Reset metrics
	CurrentMetrics = FLoadTestMetrics();

	UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Starting load test: %d bots, %.1fs duration"), BotsRemaining, DurationSeconds);

	// ── Start Timers ────────────────────────────────────────────────────────

	// Spawn timer: spawn bots at configured interval
	World->GetTimerManager().SetTimer(SpawnTimer, this, &UKhaaosLoadTestManager::SpawnSingleBot,
		Config.SpawnInterval, true);

	// Test duration timer
	World->GetTimerManager().SetTimer(TestTimer, this, &UKhaaosLoadTestManager::OnTestDurationExpired,
		DurationSeconds, false);

	// Metrics collection timer (every 5 seconds)
	if (Config.bReportMetrics)
	{
		World->GetTimerManager().SetTimer(MetricsTimer, this, &UKhaaosLoadTestManager::CollectMetrics,
			5.0f, true);
	}
}

void UKhaaosLoadTestManager::StopLoadTest()
{
	if (!bIsRunning)
	{
		return;
	}

	bIsRunning = false;

	UWorld* World = GetWorld();
	if (World)
	{
		World->GetTimerManager().ClearTimer(SpawnTimer);
		World->GetTimerManager().ClearTimer(TestTimer);
		World->GetTimerManager().ClearTimer(MetricsTimer);
	}

	// Collect final metrics
	CollectMetrics();

	// Despawn all bots
	DespawnAllBots();

	UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Load test stopped — ActiveBots: %d, TotalSpawned: %d, Eliminations: %d"),
		CurrentMetrics.ActiveBots, CurrentMetrics.TotalSpawned, CurrentMetrics.Eliminations);

	// Broadcast completion
	OnLoadTestComplete.ExecuteIfBound(CurrentMetrics);
}

void UKhaaosLoadTestManager::SpawnWave(int32 Count)
{
	if (!bIsRunning)
	{
		UE_LOG(LogTemp, Warning, TEXT("[LoadTestManager] Cannot spawn wave — no test running"));
		return;
	}

	int32 ActualCount = FMath::Min(Count, Config.MaxBots - static_cast<int32>(ActiveBots.Num()));
	BotsRemaining += ActualCount;

	UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Spawning wave of %d bots"), ActualCount);
}

void UKhaaosLoadTestManager::SpawnSingleBot()
{
	if (BotsRemaining <= 0 || !bIsRunning)
	{
		UWorld* World = GetWorld();
		if (World)
		{
			World->GetTimerManager().ClearTimer(SpawnTimer);
		}
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Random spawn location within configured radius
	float Angle = FMath::RandRange(0.0f, 2.0f * PI);
	float Distance = FMath::RandRange(0.0f, Config.SpawnRadius);
	FVector SpawnLocation(Distance * FMath::Cos(Angle), Distance * FMath::Sin(Angle), 0.0f);
	FTransform SpawnTransform(SpawnLocation);

	// Choose behavior profile
	FBotBehaviorProfile Profile = Config.bRandomizeBehavior ? GenerateRandomProfile() : TestProfile;

	// Spawn the bot actor
	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	AKhaaosLoadTestBot* Bot = World->SpawnActor<AKhaaosLoadTestBot>(AKhaaosLoadTestBot::StaticClass(),
		SpawnTransform, SpawnParams);

	if (Bot && Bot->SpawnBot(SpawnTransform, Profile))
	{
		ActiveBots.Add(Bot);
		CurrentMetrics.TotalSpawned++;
		CurrentMetrics.ActiveBots = ActiveBots.Num();
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("[LoadTestManager] Failed to spawn bot"));
	}

	BotsRemaining--;
}

FLoadTestMetrics UKhaaosLoadTestManager::GetCurrentMetrics() const
{
	return CurrentMetrics;
}

void UKhaaosLoadTestManager::CollectMetrics()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Update active bot count (remove null/destroyed)
	ActiveBots.RemoveAll([](const TObjectPtr<AKhaaosLoadTestBot>& Bot)
	{
		return !Bot || !Bot->bIsActive;
	});

	CurrentMetrics.ActiveBots = ActiveBots.Num();

	// Sum eliminations from all active bots
	CurrentMetrics.Eliminations = 0;
	for (const TObjectPtr<AKhaaosLoadTestBot>& Bot : ActiveBots)
	{
		if (Bot && Bot->bIsActive)
		{
			CurrentMetrics.Eliminations += Bot->Eliminations;
		}
	}

	// Server FPS from engine
	CurrentMetrics.ServerFPS = 1.0f / FMath::Max(World->GetDeltaSeconds(), KINDA_SMALL_NUMBER);

	// Memory usage (approximate)
	CurrentMetrics.MemoryUsageMB = static_cast<float>(FPlatformMemory::GetStats().TotalAllocated) / (1024.0f * 1024.0f);

	// Replicated actors count
	CurrentMetrics.ReplicatedActors = 0;
	if (World->GetNetDriver())
	{
		// Count replicated actors from net driver
		for (FConstActorIterator It = World->GetActorIterator(); It; ++It)
		{
			if ((*It)->GetIsReplicated())
			{
				CurrentMetrics.ReplicatedActors++;
			}
		}
	}

	if (Config.bReportMetrics)
	{
		UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Metrics — Bots: %d, FPS: %.1f, Memory: %.1fMB, RepActors: %d"),
			CurrentMetrics.ActiveBots, CurrentMetrics.ServerFPS,
			CurrentMetrics.MemoryUsageMB, CurrentMetrics.ReplicatedActors);
	}
}

void UKhaaosLoadTestManager::OnTestDurationExpired()
{
	UE_LOG(LogTemp, Log, TEXT("[LoadTestManager] Test duration expired"));
	StopLoadTest();
}

void UKhaaosLoadTestManager::DespawnAllBots()
{
	UWorld* World = GetWorld();

	for (TObjectPtr<AKhaaosLoadTestBot>& Bot : ActiveBots)
	{
		if (Bot)
		{
			Bot->DeactivateBot();
			if (World)
			{
				World->DestroyActor(Bot);
			}
		}
	}

	ActiveBots.Empty();
	CurrentMetrics.ActiveBots = 0;
}

FString UKhaaosLoadTestManager::GenerateTestReport()
{
	CollectMetrics(); // Fresh snapshot

	FString Report;
	Report += TEXT("{\n");
	Report += FString::Printf(TEXT("  \"activeBots\": %d,\n"), CurrentMetrics.ActiveBots);
	Report += FString::Printf(TEXT("  \"totalSpawned\": %d,\n"), CurrentMetrics.TotalSpawned);
	Report += FString::Printf(TEXT("  \"eliminations\": %d,\n"), CurrentMetrics.Eliminations);
	Report += FString::Printf(TEXT("  \"serverFPS\": %.2f,\n"), CurrentMetrics.ServerFPS);
	Report += FString::Printf(TEXT("  \"avgRTT\": %.2f,\n"), CurrentMetrics.AvgRTT);
	Report += FString::Printf(TEXT("  \"memoryUsageMB\": %.2f,\n"), CurrentMetrics.MemoryUsageMB);
	Report += FString::Printf(TEXT("  \"replicatedActors\": %d\n"), CurrentMetrics.ReplicatedActors);
	Report += TEXT("}");

	return Report;
}

FBotBehaviorProfile UKhaaosLoadTestManager::GenerateRandomProfile() const
{
	FBotBehaviorProfile Profile = TestProfile;

	// Randomize movement speed ±30%
	Profile.MoveSpeed = TestProfile.MoveSpeed * FMath::RandRange(0.7f, 1.3f);

	// Randomize fire rate ±50%
	Profile.FireRate = TestProfile.FireRate * FMath::RandRange(0.5f, 1.5f);
	Profile.FireRate = FMath::Max(0.5f, Profile.FireRate);

	// Randomize reaction delay ±50%
	Profile.ReactionDelayMs = TestProfile.ReactionDelayMs * FMath::RandRange(0.5f, 1.5f);

	// Randomly toggle some behaviors
	Profile.bWanderRandomly = FMath::RandBool();
	Profile.bEngageEnemies = FMath::RandBool();
	Profile.bPickupLoot = FMath::RandHelper(100) < 70; // 70% chance

	return Profile;
}
