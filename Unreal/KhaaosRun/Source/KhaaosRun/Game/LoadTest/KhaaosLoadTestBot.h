// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosLoadTestBot.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosPlayerState;

// ─── Bot Behavior Profile ─────────────────────────────────────────────────────

/**
 * FBotBehaviorProfile
 *
 * Configurable behavior profile for a load test bot.
 * Controls movement, combat, looting, and zone compliance.
 */
USTRUCT(BlueprintType)
struct FBotBehaviorProfile
{
	GENERATED_BODY()

	/** Movement speed (units/sec). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float MoveSpeed = 600.0f;

	/** Time between shots (seconds). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float FireRate = 2.0f;

	/** Whether to wander randomly around the map. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bWanderRandomly : 1 = true;

	/** Whether to engage enemies when in range. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bEngageEnemies : 1 = true;

	/** Whether to pick up nearby loot items. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bPickupLoot : 1 = true;

	/** Whether to stay inside the safe zone. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bStayInZone : 1 = true;

	/** Simulated reaction delay in milliseconds. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float ReactionDelayMs = 150.0f;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

/** Broadcast when a bot is eliminated. */
DECLARE_DELEGATE_TwoParams(FOnBotEliminated, int32 /*BotId*/, int32 /*EliminatorId*/);

// ── Load Test Bot Actor ────────────────────────────────────────────────────────

/**
 * AKhaaosLoadTestBot
 *
 * Simulated player actor for load/stress testing the dedicated server.
 * Mimics real player behavior: movement, shooting, looting, zone compliance.
 *
 * Designed for server-side execution only (no client rendering).
 * Used by UKhaaosLoadTestManager to spawn waves of bots for
 * measuring server performance under load.
 *
 * Thread safety: All state is game-thread only (timer callbacks).
 */
UCLASS(Abstract, NotBlueprintable, HideCategories=(Rendering,Replication,Input,Actor,Collision))
class AKhaaosLoadTestBot : public AActor
{
	GENERATED_BODY()

public:
	AKhaaosLoadTestBot();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

	// ─── Spawning ───────────────────────────────────────────────────────────

	/**
	 * Spawn and initialize this bot at the given location with a behavior profile.
	 * Returns true if successfully activated.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LoadTest")
	bool SpawnBot(FTransform Location, FBotBehaviorProfile Profile);

	/** Deactivate and prepare this bot for despawn/cleanup. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LoadTest")
	void DeactivateBot();

	// ─── State ──────────────────────────────────────────────────────────────

	/** Whether this bot is currently active and simulating. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	uint8 bIsActive : 1 = false;

	/** Unique bot identifier. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 BotId = -1;

	/** Current behavior profile. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	FBotBehaviorProfile BehaviorProfile;

	/** Simulated health for the bot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	float Health = 100.0f;

	/** Number of eliminations this bot has scored. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	int32 Eliminations = 0;

	/** Current simulated world position. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	FVector SimulatedLocation;

	/** Current simulated velocity. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|LoadTest")
	FVector SimulatedVelocity;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when this bot is eliminated. */
	FOnBotEliminated OnBotEliminated;

private:

	// ─── Action Timers ──────────────────────────────────────────────────────

	/** Timer for periodic movement decisions. */
	FTimerHandle MoveTimerHandle;

	/** Timer for periodic shooting. */
	FTimerHandle ShootTimerHandle;

	/** Timer for loot pickup attempts. */
	FTimerHandle LootTimerHandle;

	/** Target destination for wander movement. */
	FVector WanderTarget;

	// ─── Action Methods ─────────────────────────────────────────────────────

	/** Decide and execute a movement step. */
	void PerformMovement();

	/** Attempt to shoot at a nearby enemy. */
	void PerformShot();

	/** Attempt to pick up nearby loot. */
	void PerformLootPickup();

	/** Move toward the safe zone center when outside the zone. */
	void MoveTowardZone();

	/** Generate a random wander target within spawn radius. */
	FVector GenerateRandomWanderTarget() const;

	/** Next available bot ID counter (shared across all bots). */
	static int32 NextBotId;
};
