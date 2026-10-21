// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosActorPool.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AActor;

// ─── Pool Stats Struct ─────────────────────────────────────────────────────────

/** Statistics for a specific actor class pool. */
USTRUCT(BlueprintType)
struct FPoolStats
{
	GENERATED_BODY()

	/** Available (inactive) actors in pool. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pool")
	int32 Available = 0;

	/** Currently active (checked out) actors. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pool")
	int32 Active = 0;

	/** Peak active count (high watermark). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pool")
	int32 Peak = 0;

	/** Total actors ever created (including destroyed for stats). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pool")
	int32 TotalCreated = 0;
};

// ─── Pool Exhausted Delegate ───────────────────────────────────────────────────

/** Broadcast when a pool is exhausted and bAutoExpand is false. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPoolExhausted, TSubclassOf<AActor>, ActorClass, int32, CurrentSize);

/**
 * UKhaaosActorPool
 *
 * Generic actor pool subsystem following ActionRoguelike pooling pattern.
 * Pre-spawns actors and reuses them via Activate/Deactivate lifecycle
 * instead of expensive SpawnActor/DestroyActor cycles.
 *
 * Design:
 *   - TMap<TSubclassOf<AActor>, TArray<AActor*>> for O(1) class lookup
 *   - WarmPool: pre-spawn N instances at load time
 *   - GetPooledActor: check out an instance (auto-expand if needed)
 *   - ReturnToPool: return an instance (never destroy)
 *   - DrainPool: force-clear a pool (only on level transition)
 *   - bAutoExpand: create new instance if pool exhausted (default: true)
 *   - MaxPoolSize: per-class cap (default: 500)
 *
 * Usage:
 *   UKhaaosActorPool* Pool = GetGameInstance()->GetSubsystem<UKhaaosActorPool>();
 *   Pool->WarmPool(AKhaaosPooledProjectile::StaticClass(), 50, World);
 *   AActor* Proj = Pool->GetPooledActor(AKhaaosPooledProjectile::StaticClass(), SpawnTransform);
 *   // ... use projectile ...
 *   Pool->ReturnToPool(Proj);
 */
UCLASS(BlueprintType)
class UKhaaosActorPool : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Pool Operations ──────────────────────────────────────────────────────

	/**
	 * Get a pooled actor. Returns an inactive instance if available,
	 * or creates a new one if bAutoExpand is true and pool is not at max.
	 *
	 * @param ActorClass     Class of actor to get
	 * @param SpawnTransform Initial transform for newly created actors
	 * @return Pooled actor instance, or nullptr if pool exhausted
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Pool", meta = (DeterministicOutput = "ActorClass"))
	AActor* GetPooledActor(TSubclassOf<AActor> ActorClass, const FTransform& SpawnTransform);

	/**
	 * Return an actor to the pool. Deactivates it (hides, disables collision/tick).
	 * Never destroys the actor.
	 *
	 * @param Actor Actor to return
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Pool")
	void ReturnToPool(AActor* Actor);

	/**
	 * Pre-warm a pool by spawning N actors of the given class.
	 * Call during loading screens or level initialization.
	 *
	 * @param ActorClass Class to warm
	 * @param Count      Number of instances to pre-spawn
	 * @param World      World context for spawning
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Pool")
	void WarmPool(TSubclassOf<AActor> ActorClass, int32 Count, UWorld* World);

	/**
	 * Drain (clear) a pool. Destroys all pooled actors.
	 * Only call during level transitions or shutdown.
	 *
	 * @param ActorClass Class to drain
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Pool")
	void DrainPool(TSubclassOf<AActor> ActorClass);

	// ─── Stats ────────────────────────────────────────────────────────────────

	/** Get pool statistics for a given class. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Pool")
	FPoolStats GetPoolStats(TSubclassOf<AActor> ActorClass) const;

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Whether to auto-expand the pool when exhausted. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Pool")
	uint8 bAutoExpand : 1;

	/** Maximum pool size per class. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Pool")
	int32 MaxPoolSize;

	// ─── Delegate ─────────────────────────────────────────────────────────────

	/** Broadcast when pool is exhausted and cannot provide an actor. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Pool")
	FOnPoolExhausted OnPoolExhausted;

private:

	/** Pool storage: class → array of inactive actors. */
	TMap<TSubclassOf<AActor>, TArray<TObjectPtr<AActor>>> PoolMap;

	/** Active actors: class → array of checked-out actors. */
	TMap<TSubclassOf<AActor>, TArray<TObjectPtr<AActor>>> ActiveMap;

	/** Per-class peak active count. */
	TMap<TSubclassOf<AActor>, int32> PeakMap;

	/** Per-class total created count. */
	TMap<TSubclassOf<AActor>, int32> TotalCreatedMap;

	/** Deactivate an actor for pooling (hide, disable collision, stop tick). */
	void DeactivateActor(AActor* Actor);

	/** Reactivate an actor from the pool. */
	void ReactivateActor(AActor* Actor, const FTransform& SpawnTransform);

	/** Internal: create a new pooled actor instance. */
	AActor* CreatePooledActor(TSubclassOf<AActor> ActorClass, const FTransform& SpawnTransform);
};
