// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "NiagaraSystem.h"
#include "KhaaosAbility_Defense.generated.h"

/**
 * UKhaaosAbility_Shield
 *
 * Shield ability: activate shield barrier, absorb damage, duration-based,
 * visual shield VFX.
 *
 * NetExecutionPolicy = ServerInitiated (shield state is server-authoritative).
 * Toggle ability: stays active until duration expires or manually cancelled.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Shield"))
class UKhaaosAbility_Shield : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Shield();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Shield Configuration ─────────────────────────────────────────────

        /** Shield health (damage absorbed before breaking). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        float ShieldHealth;

        /** Shield duration in seconds (0 = infinite until cancelled). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        float ShieldDuration;

        /** Damage absorption percent (1.0 = full absorb, 0.5 = 50% absorb). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        float AbsorptionPercent;

        /** Energy cost per second while shield is active. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        float ShieldEnergyDrainPerSecond;

        /** Energy cost to activate shield. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        float ShieldEnergyCost;

        // ─── VFX References ─────────────────────────────────────────────────

        /** Shield barrier Niagara VFX. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield|VFX")
        TSoftObjectPtr<UNiagaraSystem> ShieldBarrierVFX;

        /** Shield break Niagara VFX. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Shield|VFX")
        TSoftObjectPtr<UNiagaraSystem> ShieldBreakVFX;

        // ─── Replicated State ─────────────────────────────────────────────────

        /** Current shield health remaining. */
        UPROPERTY(ReplicatedUsing = OnRep_ShieldHealthRemaining, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        float ShieldHealthRemaining;

        /** Whether the shield is currently active. */
        UPROPERTY(ReplicatedUsing = OnRep_bShieldActive, BlueprintReadOnly, Category = "Khaaos|Ability|Shield")
        uint8 bShieldActive : 1;

        // ─── RepNotify ────────────────────────────────────────────────────────

        UFUNCTION()
        void OnRep_ShieldHealthRemaining();

        UFUNCTION()
        void OnRep_bShieldActive();

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Apply shield barrier. */
        UFUNCTION(Server, Reliable)
        void ServerActivateShield();

        /** Server: Deactivate shield barrier. */
        UFUNCTION(Server, Reliable)
        void ServerDeactivateShield();

        // ─── Client RPC (VFX only) ────────────────────────────────────────────

        /** Client: Spawn shield VFX (barrier sphere, etc.). */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnShieldVFX();

        /** Client: Remove shield VFX. */
        UFUNCTION(Client, Unreliable)
        void ClientRemoveShieldVFX();

        /** Client: Shield break VFX (when shield is destroyed by damage). */
        UFUNCTION(Client, Unreliable)
        void ClientShieldBreakVFX();

        // ─── Delegates ────────────────────────────────────────────────────────

        /** Broadcast when shield absorbs damage. */
        DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnShieldAbsorbedDamage, float, DamageAbsorbed, float, ShieldRemaining);
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability|Shield")
        FOnShieldAbsorbedDamage OnShieldAbsorbedDamage;

        /** Broadcast when shield breaks. */
        DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnShieldBroken);
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability|Shield")
        FOnShieldBroken OnShieldBroken;

private:

        /** Timer handle for shield duration. */
        FTimerHandle ShieldDurationHandle;

        /** Timer handle for energy drain tick. */
        FTimerHandle ShieldEnergyDrainHandle;

        /** Tick for energy drain while shield is active. */
        void OnShieldEnergyDrainTick(float DeltaTime);

        virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};

/**
 * UKhaaosAbility_Heal
 *
 * Heal ability: heal over time, interrupt on damage, particle VFX.
 *
 * NetExecutionPolicy = ServerInitiated (heal amount is server-authoritative).
 * Cancels on damage (bCancelOnDamage = true).
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Heal"))
class UKhaaosAbility_Heal : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Heal();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Heal Configuration ───────────────────────────────────────────────

        /** Total heal amount. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Heal")
        float HealAmount;

        /** Heal duration in seconds (heal over time). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Heal")
        float HealDuration;

        /** Heal tick interval (seconds between heal applications). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Heal")
        float HealTickInterval;

        /** Energy cost to activate heal. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Heal")
        float HealEnergyCost;

        // ─── VFX References ─────────────────────────────────────────────────

        /** Heal particle Niagara VFX. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Heal|VFX")
        TSoftObjectPtr<UNiagaraSystem> HealParticleVFX;

        // ─── Replicated State ─────────────────────────────────────────────────

        /** Current heal remaining (for UI progress bar). */
        UPROPERTY(ReplicatedUsing = OnRep_HealRemaining, BlueprintReadOnly, Category = "Khaaos|Ability|Heal")
        float HealRemaining;

        // ─── RepNotify ────────────────────────────────────────────────────────

        UFUNCTION()
        void OnRep_HealRemaining();

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Apply heal tick. */
        UFUNCTION(Server, Reliable)
        void ServerApplyHealTick(float HealPerTick);

        // ─── Client RPC (VFX only) ────────────────────────────────────────────

        /** Client: Spawn heal VFX (particles, glow, etc.). */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnHealVFX();

        /** Client: Remove heal VFX. */
        UFUNCTION(Client, Unreliable)
        void ClientRemoveHealVFX();

        // ─── Delegates ────────────────────────────────────────────────────────

        /** Broadcast when a heal tick is applied. */
        DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnHealTick, float, HealApplied, float, TotalRemaining);
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability|Heal")
        FOnHealTick OnHealTick;

private:

        /** Timer handle for heal tick. */
        FTimerHandle HealTickHandle;

        /** Heal per tick (calculated from HealAmount / (HealDuration / TickInterval)). */
        float HealPerTick;

        /** Tick for heal over time application. */
        void OnHealTickCallback();

        virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
