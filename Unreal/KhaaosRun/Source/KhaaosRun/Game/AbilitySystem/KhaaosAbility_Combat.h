// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_Combat.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosProjectile;

/**
 * UKhaaosAbility_Shoot
 *
 * Shoot ability: line trace from camera, apply damage, muzzle flash VFX, recoil.
 * ServerInitiated: server does line trace and damage, client gets VFX RPC.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Shoot"))
class UKhaaosAbility_Shoot : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Shoot();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        // ─── Shoot Configuration ──────────────────────────────────────────────

        /** Base damage per shot. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shoot")
        float BaseDamage;

        /** Maximum trace distance. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shoot")
        float TraceDistance;

        /** Headshot damage multiplier. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shoot")
        float HeadshotMultiplier;

        /** Recoil pitch per shot. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shoot")
        float RecoilPitch;

        /** Recoil yaw random range per shot. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shoot")
        float RecoilYawRange;

        /** Energy cost per shot. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shoot")
        float ShootEnergyCost;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Perform line trace and apply damage. */
        UFUNCTION(Server, Reliable)
        void ServerShoot(const FVector& TraceStart, const FVector& TraceEnd);

        // ─── Client RPC (VFX only) ────────────────────────────────────────────

        /** Client: Spawn muzzle flash VFX. */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnMuzzleFlash(const FVector& MuzzleLocation, const FRotator& MuzzleRotation);

        /** Client: Spawn impact VFX at hit location. */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnImpactVFX(const FVector& ImpactLocation, const FVector& ImpactNormal);

        /** Client: Apply recoil to controller. */
        UFUNCTION(Client, Unreliable)
        void ClientApplyRecoil(float PitchRecoil, float YawRecoil);

private:

        /** Perform the line trace and return hit result. */
        bool PerformLineTrace(const FVector& Start, const FVector& End, FHitResult& OutHit) const;
};

/**
 * UKhaaosAbility_Reload
 *
 * Reload ability: play reload animation, refill magazine from reserve, delay.
 * ServerInitiated: server manages ammo state, client gets anim notify.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Reload"))
class UKhaaosAbility_Reload : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Reload();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Reload Configuration ─────────────────────────────────────────────

        /** Reload time in seconds. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Reload")
        float ReloadTime;

        /** Magazine size (max ammo in clip). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Reload")
        int32 MagazineSize;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Refill magazine from reserve ammo. */
        UFUNCTION(Server, Reliable)
        void ServerRefillMagazine();

        // ─── Client RPC ───────────────────────────────────────────────────────

        /** Client: Play reload animation. */
        UFUNCTION(Client, Reliable)
        void ClientPlayReloadAnim();

private:

        /** Timer handle for reload duration. */
        FTimerHandle ReloadTimerHandle;
};

/**
 * UKhaaosAbility_Melee
 *
 * Melee ability: sphere trace, apply melee damage, knockback.
 * ServerInitiated: server does trace and damage.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Melee"))
class UKhaaosAbility_Melee : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Melee();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        // ─── Melee Configuration ──────────────────────────────────────────────

        /** Melee damage. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Melee")
        float MeleeDamage;

        /** Sphere trace radius. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Melee")
        float TraceRadius;

        /** Sphere trace distance. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Melee")
        float TraceDistance;

        /** Knockback impulse magnitude. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Melee")
        float KnockbackMagnitude;

        /** Energy cost for melee. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Melee")
        float MeleeEnergyCost;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Perform melee trace and apply damage + knockback. */
        UFUNCTION(Server, Reliable)
        void ServerMeleeAttack(const FVector& TraceStart, const FVector& TraceEnd);

        // ─── Client RPC ───────────────────────────────────────────────────────

        /** Client: Spawn melee swing VFX. */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnMeleeVFX(const FVector& Origin);
};

/**
 * UKhaaosAbility_Throw
 *
 * Throw ability: spawn throwable projectile, arc calculation.
 * ServerInitiated: server spawns projectile with authority.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Throw"))
class UKhaaosAbility_Throw : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Throw();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        // ─── Throw Configuration ──────────────────────────────────────────────

        /** Throwable projectile class. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Throw")
        TSubclassOf<AActor> ThrowableClass;

        /** Throw initial speed. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Throw")
        float ThrowSpeed;

        /** Throw angle offset from aim direction (degrees). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Throw")
        float ThrowAngleOffset;

        /** Energy cost for throw. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Throw")
        float ThrowEnergyCost;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Spawn throwable projectile with arc. */
        UFUNCTION(Server, Reliable)
        void ServerSpawnThrowable(const FVector& Origin, const FVector& Direction);

        // ─── Client RPC ───────────────────────────────────────────────────────

        /** Client: Spawn throw arm animation VFX. */
        UFUNCTION(Client, Unreliable)
        void ClientPlayThrowAnim();
};

/**
 * UKhaaosAbility_Ultimate
 *
 * Ultimate ability: area effect, apply damage in radius, VFX, long cooldown.
 * ServerInitiated: server applies area damage, client gets VFX RPC.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Ultimate"))
class UKhaaosAbility_Ultimate : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Ultimate();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        // ─── Ultimate Configuration ───────────────────────────────────────────

        /** Damage dealt in the area. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Ultimate")
        float UltimateDamage;

        /** Damage radius. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Ultimate")
        float DamageRadius;

        /** Delay before damage application (for VFX wind-up). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Ultimate")
        float DamageDelay;

        /** Energy cost for ultimate. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Ultimate")
        float UltimateEnergyCost;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Apply area damage at location. */
        UFUNCTION(Server, Reliable)
        void ServerApplyAreaDamage(const FVector& Center, float Radius, float Damage);

        // ─── Client RPC ───────────────────────────────────────────────────────

        /** Client: Spawn ultimate VFX at location. */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnUltimateVFX(const FVector& Center, float Radius);

private:

        /** Timer handle for damage delay. */
        FTimerHandle DamageDelayHandle;

        /** Cached center for delayed damage. */
        FVector CachedDamageCenter;
};
