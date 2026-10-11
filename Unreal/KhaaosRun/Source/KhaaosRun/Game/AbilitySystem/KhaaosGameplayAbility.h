// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Abilities/Tasks/AbilityTask_NetworkSyncPoint.h"
#include "AbilitySystemComponent.h"
#include "Abilities/GameplayAbility.h"
#include "GameplayTagContainer.h"
#include "KhaaosGameplayAbility.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when an ability activates. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKhaaosAbilityActivated, class UKhaaosGameplayAbility*, Ability, const FGameplayTagContainer&, ActivatedTags);

/** Broadcast when an ability ends. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKhaaosAbilityEnded, class UKhaaosGameplayAbility*, Ability, bool, bWasCancelled);

/**
 * UKhaaosGameplayAbility
 *
 * Base gameplay ability class for Khaaos Run.
 * Inherits from UGameplayAbility with InstancedPerActor instancing policy
 * and ServerInitiated net execution policy by default.
 *
 * Design:
 *   - BlockedTags: prevent activation if any of these tags are present
 *   - RequiredTags: require all of these tags to be present for activation
 *   - CooldownDuration: gameplay effect cooldown duration
 *   - bIsToggleAbility: abilities that stay active until explicitly cancelled
 *   - bCancelOnMovement: cancel when the owner moves (e.g., heal, shield)
 *   - Custom ApplyCost for energy/credit-based cost logic
 *
 * InstancingPolicy  = InstancedPerActor  (one instance per actor)
 * NetExecutionPolicy = ServerInitiated    (server executes, client gets RPC)
 */
UCLASS(Abstract, Blueprintable, EditInlineNew)
class UKhaaosGameplayAbility : public UGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosGameplayAbility();

        // ─── Ability Lifecycle Overrides ────────────────────────────────────────

        /**
         * CanActivateAbility override.
         * Checks BlockedTags (must NOT be present) and RequiredTags (must ALL be present).
         * Returns false if any blocker exists or any required tag is missing.
         */
        virtual bool CanActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayTagContainer* SourceTags = nullptr,
                const FGameplayTagContainer* TargetTags = nullptr,
                OUT FGameplayTagContainer* OptionalRelevantTags = nullptr) const override;

        /**
         * ActivateAbility override.
         * Commits cost/cooldown, then applies gameplay effects.
         * Subclasses override to add ability-specific logic.
         */
        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        /**
         * EndAbility override.
         * Cleans up active effects, removes applied tags, broadcasts end.
         */
        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        /**
         * ApplyCost override.
         * Custom cost logic: energy drain, credit cost, etc.
         * Server-only execution.
         */
        virtual void ApplyCost(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo) const override;

        // ─── Activation Conditions ──────────────────────────────────────────────

        /** Tags that prevent this ability from activating (if ANY are present). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Activation")
        FGameplayTagContainer BlockedTags;

        /** Tags required for activation (ALL must be present). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Activation")
        FGameplayTagContainer RequiredTags;

        // ─── Cooldown & Cost ────────────────────────────────────────────────────

        /** Cooldown duration in seconds. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Cooldown")
        float CooldownDuration;

        /** Gameplay effect class applied for cooldown. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Cooldown")
        TSubclassOf<UGameplayEffect> CooldownGameplayEffectClass;

        /** Cost gameplay effect class (energy/credit drain). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Cost")
        TSubclassOf<UGameplayEffect> CostGameplayEffectClass;

        /** Energy cost to activate. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Cost")
        float EnergyCost;

        /** Credit cost to activate (0 = free). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Cost")
        int32 CreditCost;

        // ─── Behavior Flags ─────────────────────────────────────────────────────

        /** Ability stays active until explicitly cancelled (toggle-on/off). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Behavior")
        uint8 bIsToggleAbility : 1;

        /** Cancel this ability when the owner starts moving. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Behavior")
        uint8 bCancelOnMovement : 1;

        /** Cancel this ability when the owner takes damage. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Behavior")
        uint8 bCancelOnDamage : 1;

        // ─── Delegates ──────────────────────────────────────────────────────────

        /** Broadcast when this ability activates. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability")
        FOnKhaaosAbilityActivated OnAbilityActivated;

        /** Broadcast when this ability ends. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability")
        FOnKhaaosAbilityEnded OnAbilityEnded;

protected:

        /** Gameplay effects applied while this ability is active. */
        UPROPERTY()
        TArray<FActiveGameplayEffectHandle> ActiveEffectHandles;

        /** Whether cooldown was successfully committed. */
        uint8 bCooldownCommitted : 1;
};
