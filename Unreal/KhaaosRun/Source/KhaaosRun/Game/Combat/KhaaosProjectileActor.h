// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "Game/Combat/KhaaosDamageManager.h"
#include "KhaaosProjectileActor.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class USphereComponent;
class UNiagaraComponent;

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FOnProjectileHit, AKhaaosProjectileActor*, Projectile, AActor*, HitActor, float, DamageApplied, const FHitResult&, HitResult);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnProjectileBounce, AKhaaosProjectileActor*, Projectile, const FHitResult&, HitResult, const FVector&, VelocityAfterBounce);

/**
 * AKhaaosProjectileActor
 *
 * Enhanced projectile actor with ballistic trajectory, bounce support,
 * and actor pool integration.
 *
 * Architecture:
 *   - USphereComponent: collision detection
 *   - UProjectileMovementComponent: ballistic physics (gravity, drag)
 *   - UNiagaraComponent: trail VFX attached to projectile
 *   - Server-authoritative: only server spawns and validates impacts
 *   - Pooled: bIsPooled flag for actor pool integration
 *   - Bounce: configurable bounce count with velocity reflection
 *   - Impact: OnHit → ProcessHit → DamageManager → impact VFX/SFX
 *
 * Ballistic:
 *   - GravityScale: 0.0 = hitscan-like, 0.5 = arced, 1.0 = full gravity
 *   - DragCoefficient: air resistance (0 = none)
 *   - InitialSpeed / MaxSpeed: velocity bounds
 *
 * Free Fire Parity:
 *   - Sniper: fast, low gravity, no bounce
 *   - Grenade launcher: slower, high gravity, 1 bounce
 *   - Crossbow: medium speed, medium gravity, no bounce
 */
UCLASS(Abstract, ClassGroup=(Khaaos))
class AKhaaosProjectileActor : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosProjectileActor();

    // ─── Components ─────────────────────────────────────────────────────────

    /** Collision sphere for hit detection. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
    TObjectPtr<USphereComponent> CollisionComponent;

    /** Projectile movement component with ballistic support. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
    TObjectPtr<UProjectileMovementComponent> MovementComponent;

    /** Trail VFX (Niagara particle trail behind projectile). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Projectile")
    TObjectPtr<UNiagaraComponent> TrailVFX;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Damage dealt on impact. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
    float DamageAmount;

    /** Type of damage this projectile deals. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
    EKhaaosDamageType DamageType;

    /** Instigator ID string (for damage tracking). */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Projectile")
    FString InstigatorId;

    /** Weapon that fired this projectile. */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Projectile")
    FName WeaponID;

    /** Maximum range before auto-destroy (cm). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
    float MaxRange;

    /** Whether this projectile should bounce off surfaces. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
    uint8 bShouldBounce : 1;

    /** Maximum number of bounces before destroy. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
    int32 BounceCount;

    /** Gravity scale for ballistic trajectory (0=flat, 0.5=arced, 1=full). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile|Ballistic")
    float GravityScale;

    /** Air drag coefficient (0=no drag). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile|Ballistic")
    float DragCoefficient;

    /** Initial speed (cm/s). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile|Ballistic")
    float InitialSpeed;

    /** Maximum speed cap (cm/s). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile|Ballistic")
    float MaxSpeed;

    /** Lifetime before auto-destroy (seconds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Projectile")
    float Lifetime;

    // ─── Pooling ────────────────────────────────────────────────────────────

    /** Whether this projectile is pooled (for actor pool integration). */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Projectile|Pool")
    uint8 bIsPooled : 1;

    /** Whether this projectile is currently active (in flight). */
    UPROPERTY(ReplicatedUsing = OnRep_IsActive, BlueprintReadOnly, Category = "Khaaos|Projectile|Pool")
    uint8 bIsActive : 1;

    // ─── RepNotify ──────────────────────────────────────────────────────────

    UFUNCTION()
    void OnRep_IsActive();

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast when projectile hits a target. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Projectile")
    FOnProjectileHit OnProjectileHit;

    /** Broadcast when projectile bounces off a surface. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Projectile")
    FOnProjectileBounce OnProjectileBounce;

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void LifeSpanExpired() override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    // ─── Pooling Interface ──────────────────────────────────────────────────

    /**
     * Activate this projectile from the pool.
     * Sets position, direction, velocity, instigator, weapon.
     * Returns false if already active.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Projectile")
    bool ActivateProjectile(const FVector& Position, const FVector& Direction,
        AActor* InInstigator, const FName& InWeaponID, float InDamage = -1.0f);

    /**
     * Return to pool (deactivate instead of destroy).
     * Hides projectile, disables collision, stops movement.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Projectile")
    void ReturnToPool();

    /** Check if available for pool reuse. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Projectile")
    bool IsAvailableForPool() const;

protected:

    // ─── Collision Handling ─────────────────────────────────────────────────

    /** Called when projectile hits something (blocking hit). */
    UFUNCTION()
    virtual void OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor,
        UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit);

    // ─── Impact Processing ─────────────────────────────────────────────────

    /** Process a hit: create FKhaaosHitResult, call DamageManager, spawn impact effects. */
    virtual void ProcessHit(AActor* HitActor, const FHitResult& Hit);

    /** Apply damage through the DamageManager system. */
    virtual void ApplyDamageToActor(AActor* Target, const FHitResult& Hit);

    /** Spawn impact VFX and SFX (client only). */
    UFUNCTION(Client, Unreliable)
    void ClientSpawnImpactFX(const FHitResult& Hit);

    // ─── Bounce Logic ───────────────────────────────────────────────────────

    /** Handle bounce: decrement count, reflect velocity, broadcast. */
    virtual void HandleBounce(const FHitResult& Hit, const FVector& VelocityAfterBounce);

private:

    /** Distance traveled from spawn point (for range tracking). */
    float DistanceTraveled;

    /** Time since activation (for lifetime tracking). */
    float TimeAlive;

    /** Spawn position (for range tracking). */
    FVector SpawnPosition;

    /** Remaining bounce count (decremented on each bounce). */
    int32 RemainingBounces;

    /** Cached instigator actor (weak ref). */
    TWeakObjectPtr<AActor> CachedInstigator;
};
