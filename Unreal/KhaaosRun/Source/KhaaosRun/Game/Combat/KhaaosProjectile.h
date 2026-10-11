// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosProjectile.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UProjectileMovementComponent;
class USphereComponent;
class UKhaaosAttributeSet;

/**
 * AKhaaosProjectile
 *
 * Pooled projectile actor following ActionRoguelike pattern.
 *
 * Design:
 *   - Server-only physics simulation
 *   - Client receives interpolated position via replication
 *   - Object pooling: reuse instances instead of spawn/destroy
 *   - Damage application on hit via AttributeSet
 *   - Configurable damage, speed, max range, lifetime
 */
UCLASS(Abstract)
class AKhaaosProjectile : public AActor
{
	GENERATED_BODY()

public:
	AKhaaosProjectile();

	// ─── Components ─────────────────────────────────────────────────────────

	/** Collision sphere for hit detection. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
	TObjectPtr<USphereComponent> CollisionComponent;

	/** Projectile movement component (server-only simulation). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
	TObjectPtr<UProjectileMovementComponent> MovementComponent;

	/** Visual mesh (static or skeletal). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
	TObjectPtr<UStaticMeshComponent> MeshComponent;

	// ─── Replicated State ───────────────────────────────────────────────────

	/** Replicated transform for client interpolation. */
	UPROPERTY(ReplicatedUsing = OnRep_ReplicatedTransform, BlueprintReadOnly, Category = "Khaaos|Projectile")
	FVector_NetQuantize ReplicatedLocation;

	/** Whether this projectile is currently in flight. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Projectile")
	uint8 bIsActive : 1;

	/** Instigator (who fired this projectile). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Projectile")
	TObjectPtr<AActor> InstigatorActor;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Damage dealt on impact. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float Damage;

	/** Initial speed of the projectile. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float InitialSpeed;

	/** Maximum range before auto-deactivate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float MaxRange;

	/** Lifetime before auto-deactivate (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float Lifetime;

	/** Whether this projectile should bounce. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	uint8 bShouldBounce : 1;

	/** Radius of the damage on impact (0 = single target). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float DamageRadius;

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void LifeSpanExpired() override;

	// ─── Pooling Interface ──────────────────────────────────────────────────

	/**
	 * Activate this projectile from the pool.
	 * Sets initial position, direction, velocity, instigator.
	 * Returns false if already active.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Projectile")
	bool Activate(const FVector& Position, const FVector& Direction, AActor* InInstigator, float InDamage = -1.0f);

	/**
	 * Deactivate and return to pool.
	 * Hides projectile, disables collision, stops movement.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Projectile")
	void Deactivate();

	/** Check if this projectile is available for pooling. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Projectile")
	bool IsAvailableForPool() const;

	// ─── RepNotify ──────────────────────────────────────────────────────────

	UFUNCTION()
	void OnRep_ReplicatedTransform();

	// ─── Collision Handling ─────────────────────────────────────────────────

protected:

	/** Called when projectile hits something. */
	UFUNCTION()
	virtual void OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit);

	/** Called when projectile overlaps something. */
	UFUNCTION()
	virtual void OnOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	/** Apply damage to hit actor. */
	virtual void ApplyDamageToActor(AActor* Target, const FHitResult& Hit);

	/** Spawn impact effects (client only). */
	UFUNCTION(Client, Unreliable)
	void ClientSpawnImpactFX(const FHitResult& Hit);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

private:

	/** Distance traveled from spawn point. */
	float DistanceTraveled;

	/** Time since activation. */
	float TimeAlive;

	/** Spawn position (for range tracking). */
	FVector SpawnPosition;

	/** Whether this projectile is currently pooled (inactive). */
	uint8 bIsPooled : 1;
};
