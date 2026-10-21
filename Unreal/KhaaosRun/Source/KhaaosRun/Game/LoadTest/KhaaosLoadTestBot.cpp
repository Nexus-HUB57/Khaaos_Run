// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/LoadTest/KhaaosLoadTestBot.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "KismetMathHelpers.h"

int32 AKhaaosLoadTestBot::NextBotId = 0;

AKhaaosLoadTestBot::AKhaaosLoadTestBot()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	// Disable unnecessary features for server-side bots
	bReplicates = false;
	bHidden = true;
	SetActorEnableCollision(false);
}

void AKhaaosLoadTestBot::BeginPlay()
{
	Super::BeginPlay();
}

void AKhaaosLoadTestBot::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// Clean up timers
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(MoveTimerHandle);
		World->GetTimerManager().ClearTimer(ShootTimerHandle);
		World->GetTimerManager().ClearTimer(LootTimerHandle);
	}

	Super::EndPlay(EndPlayReason);
}

void AKhaaosLoadTestBot::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bIsActive)
	{
		return;
	}

	// Apply simulated movement
	if (!SimulatedVelocity.IsNearlyZero())
	{
		SimulatedLocation += SimulatedVelocity * DeltaSeconds;
		SetActorLocation(SimulatedLocation);
	}
}

bool AKhaaosLoadTestBot::SpawnBot(FTransform Location, FBotBehaviorProfile Profile)
{
	if (bIsActive)
	{
		return false; // Already active
	}

	BotId = NextBotId++;
	BehaviorProfile = Profile;
	bIsActive = true;
	Health = 100.0f;
	Eliminations = 0;

	SimulatedLocation = Location.GetTranslation();
	SetActorLocation(SimulatedLocation);
	SimulatedVelocity = FVector::ZeroVector;

	// Generate initial wander target
	WanderTarget = GenerateRandomWanderTarget();

	UWorld* World = GetWorld();
	if (!World)
	{
		return false;
	}

	// ── Start Action Timers ─────────────────────────────────────────────────
	// Move: random interval 0.5-2.0s
	float MoveInterval = FMath::RandRange(0.5f, 2.0f);
	World->GetTimerManager().SetTimer(MoveTimerHandle, this, &AKhaaosLoadTestBot::PerformMovement,
		MoveInterval, true);

	// Shoot: based on fire rate with jitter
	float ShootInterval = BehaviorProfile.FireRate + FMath::RandRange(-0.5f, 0.5f);
	ShootInterval = FMath::Max(0.5f, ShootInterval);
	World->GetTimerManager().SetTimer(ShootTimerHandle, this, &AKhaaosLoadTestBot::PerformShot,
		ShootInterval, true);

	// Loot: check every 1-3s
	float LootInterval = FMath::RandRange(1.0f, 3.0f);
	World->GetTimerManager().SetTimer(LootTimerHandle, this, &AKhaaosLoadTestBot::PerformLootPickup,
		LootInterval, true);

	UE_LOG(LogTemp, Verbose, TEXT("[LoadTestBot] Bot %d spawned at %s"), BotId, *SimulatedLocation.ToString());
	return true;
}

void AKhaaosLoadTestBot::DeactivateBot()
{
	bIsActive = false;
	SimulatedVelocity = FVector::ZeroVector;

	UWorld* World = GetWorld();
	if (World)
	{
		World->GetTimerManager().ClearTimer(MoveTimerHandle);
		World->GetTimerManager().ClearTimer(ShootTimerHandle);
		World->GetTimerManager().ClearTimer(LootTimerHandle);
	}

	UE_LOG(LogTemp, Verbose, TEXT("[LoadTestBot] Bot %d deactivated"), BotId);
}

void AKhaaosLoadTestBot::PerformMovement()
{
	if (!bIsActive)
	{
		return;
	}

	if (BehaviorProfile.bWanderRandomly)
	{
		// Check if we've reached the wander target (within tolerance)
		float DistToTarget = FVector::Dist(SimulatedLocation, WanderTarget);
		if (DistToTarget < 100.0f)
		{
			// Pick a new wander target
			WanderTarget = GenerateRandomWanderTarget();
		}

		// Move toward wander target
		FVector Direction = (WanderTarget - SimulatedLocation);
		if (!Direction.IsNearlyZero())
		{
			Direction.Normalize();
			SimulatedVelocity = Direction * BehaviorProfile.MoveSpeed;
		}
	}

	// If staying in zone is enabled, periodically move toward zone center
	if (BehaviorProfile.bStayInZone)
	{
		MoveTowardZone();
	}
}

void AKhaaosLoadTestBot::PerformShot()
{
	if (!bIsActive || !BehaviorProfile.bEngageEnemies)
	{
		return;
	}

	// Simulated shot: log for metrics but no actual projectile spawn
	// The LoadTestManager tracks shot counts for metrics
	UE_LOG(LogTemp, VeryVerbose, TEXT("[LoadTestBot] Bot %d performed shot"), BotId);
}

void AKhaaosLoadTestBot::PerformLootPickup()
{
	if (!bIsActive || !BehaviorProfile.bPickupLoot)
	{
		return;
	}

	// Check for nearby loot items (simplified: log attempt)
	UE_LOG(LogTemp, VeryVerbose, TEXT("[LoadTestBot] Bot %d checking for loot"), BotId);
}

void AKhaaosLoadTestBot::MoveTowardZone()
{
	// In a full implementation, this would query the SafeZone actor
	// and move toward zone center if outside. For load testing,
	// we keep bots roughly centered.
	FVector ZoneCenter = FVector(0.0f, 0.0f, SimulatedLocation.Z);
	float DistToCenter = FVector::DistXY(SimulatedLocation, ZoneCenter);

	// If bot is far from center, bias movement toward center
	if (DistToCenter > 3000.0f)
	{
		FVector ToCenter = (ZoneCenter - SimulatedLocation);
		ToCenter.Z = 0.0f;
		if (!ToCenter.IsNearlyZero())
		{
			ToCenter.Normalize();
			// Blend zone-seeking with current movement
			SimulatedVelocity = FMath::Lerp(SimulatedVelocity, ToCenter * BehaviorProfile.MoveSpeed, 0.5f);
		}
	}
}

FVector AKhaaosLoadTestBot::GenerateRandomWanderTarget() const
{
	// Random point within 5000 units of current location
	float Radius = 5000.0f;
	float Angle = FMath::RandRange(0.0f, 2.0f * PI);
	float Distance = FMath::RandRange(0.0f, Radius);

	return SimulatedLocation + FVector(
		Distance * FMath::Cos(Angle),
		Distance * FMath::Sin(Angle),
		0.0f // Keep on ground plane
	);
}
