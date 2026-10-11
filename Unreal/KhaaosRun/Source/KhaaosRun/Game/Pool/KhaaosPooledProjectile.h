// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/ProjectileMovementComponent.h"
#include "KhaaosPooledProjectile.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class USphereComponent;
class UKhaaosActorPool;

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when this projectile is deactivated (returned to pool). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnProjectilePooled, AKhaaosPooledProjectile*, Projectile);

/**
 * AKhaaosPooledProjectile
 *
 * Pooled projectile actor implementing the Activate/Deactivate lifecycle.
 * Designed for use with UKhaaosActorPool — never destroyed, only recycled.
 *
 * Lifecycle:
 *   1. Activate(Transform, Velocity, Owner) — check out from pool
 *   2. Projectile flies via UProjectileMovementComponent
 *   3. OnHit / MaxLifetime expired → Deactivate() → return to pool
 *
 * Design:
 *   - Server-authoritative physics
 *   - Client receives interpolated position
 *   - MaxLifetime auto-deactivates to prevent leaked projectiles
 *   - Implements IPooledActor pattern (Activate/Deactivate)
 */
UCLASS(Abstract)
class AKhaaosPooledProjectile : public AActor
{
	GENERATED_BODY()

public:

	AKhaaosPooledProjectile();

	// ─── Components ─────────────────────────────────────────────────────────────

	/** Collision sphere for hit detection. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
	TObjectPtr<USphereComponent> CollisionComponent;

	/** Projectile movement component (server-only simulation). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
	TObjectPtr<UProjectileMovementComponent> MovementComponent;

	// ─── Pool Lifecycle ────────────────────────────────────────────────────────

	/**
	 * Activate this projectile from the pool.
	 * Sets initial transform, velocity, and ownership.
	 * Returns false if already active.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Projectile")
	virtual bool Activate(const FTransform& StartTransform, FVector Velocity, AActor* Owner);

	/**
	 * Deactivate and return to pool.
	 * Hides projectile, disables collision, stops movement.
	 * Broadcasts OnProjectilePooled delegate.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Projectile")
	virtual void Deactivate();

	/** Whether this projectile is currently active. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Projectile")
	bool IsActive() const { return bIsActive; }

	// ─── Configuration ─────────────────────────────────────────────────────────

	/** Damage dealt on impact. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float Damage = 10.0f;

	/** Maximum lifetime before auto-deactivate (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float MaxLifetime = 5.0f;

	/** Initial speed of the projectile. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float InitialSpeed = 3000.0f;

	/** Whether this projectile should bounce. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	uint8 bShouldBounce : 1;

	/** Radius for radial damage (0 = single target). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
	float DamageRadius = 0.0f;

	// ─── Delegate ──────────────────────────────────────────────────────────────

	/** Broadcast when this projectile is deactivated (returned to pool). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Projectile")
	FOnProjectilePooled OnProjectilePooled;

	// ─── Actor Lifecycle ───────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void LifeSpanExpired() override;

protected:

	/** Whether this projectile is currently active. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Projectile")
	uint8 bIsActive : 1;

	/** Time since activation. */
	float CurrentLifetime;

	/** Timer handle for max lifetime. */
	FTimerHandle LifetimeTimer;

	/** Called when projectile hits something. */
	UFUNCTION()
	virtual void OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit);

	/** Apply damage to hit actor. */
	virtual void ApplyDamageToActor(AActor* Target, const FHitResult& Hit);

	/** Called when lifetime expires. */
	void OnLifetimeExpired();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
