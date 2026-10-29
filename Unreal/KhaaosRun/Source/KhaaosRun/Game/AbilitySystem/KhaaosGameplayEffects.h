// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameplayEffect.h"
#include "GameplayTagContainer.h"
#include "Game/AbilitySystem/KhaaosGameplayEffectTypes.h"
#include "KhaaosGameplayEffects.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UAbilitySystemComponent;

// ─── Effect Spec Struct ───────────────────────────────────────────────────────

/** Lightweight wrapper around a GameplayEffectSpecHandle with a prediction key. */
USTRUCT(BlueprintType)
struct FKhaaosEffectSpec
{
        GENERATED_BODY()

        /** The gameplay effect spec handle. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Effect")
        FGameplayEffectSpecHandle SpecHandle;

        /** Prediction key for client-predicted effects. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Effect")
        int16 PredictionKey = -1;

        /** Whether this spec is valid. */
        bool IsValid() const { return SpecHandle.IsValid(); }
};

/**
 * UKhaaosGameplayEffects
 *
 * Central factory for constructing transient UGameplayEffect instances at runtime.
 * Each static method builds a fully configured GameplayEffect with
 * correct DurationPolicy, Modifiers, GrantedTags, and StackingType.
 *
 * Usage:
 *   UGameplayEffect* Cooldown = UKhaaosGameplayEffects::CreateCooldownEffect(Tag, 2.0f);
 *   FGameplayEffectSpec Spec(Cooldown, ASC->MakeEffectContext(), 1.0f);
 */
UCLASS(BlueprintType, Abstract)
class UKhaaosGameplayEffects : public UObject
{
        GENERATED_BODY()

public:

        // ─── Cooldown ──────────────────────────────────────────────────────────────

        /**
         * Create a cooldown GameplayEffect with HasDuration policy.
         * Grants the CooldownTag so GAS blocks abilities with matching CooldownTag.
         * Duration = seconds before the cooldown expires.
         */
        static UGameplayEffect* CreateCooldownEffect(FGameplayTag CooldownTag, float Duration);

        // ─── Cost ──────────────────────────────────────────────────────────────────

        /**
         * Create an instant cost GameplayEffect that subtracts from an attribute.
         * Attribute: Health, Energy, or Credits (mapped via EKhaaosCostType).
         * Amount is subtracted (additive, negative magnitude).
         */
        static UGameplayEffect* CreateCostEffect(EKhaaosCostType Attribute, float Amount);

        // ─── Buff ──────────────────────────────────────────────────────────────────

        /**
         * Create a buff GameplayEffect with HasDuration policy.
         * Applies a modifier with the given magnitude and grants BuffTag.
         * Stacks by duration if StackingType is set.
         */
        static UGameplayEffect* CreateBuffEffect(FGameplayTag BuffTag, float Duration, float Magnitude);

        // ─── Debuff ────────────────────────────────────────────────────────────────

        /**
         * Create a debuff GameplayEffect with HasDuration policy.
         * Applies a negative modifier and grants DebuffTag.
         */
        static UGameplayEffect* CreateDebuffEffect(FGameplayTag DebuffTag, float Duration, float Magnitude);

        // ─── Heal Over Time ───────────────────────────────────────────────────────

        /**
         * Create a HealOverTime buff GameplayEffect.
         * Duration-based, applies periodic healing via modifier.
         * TotalHeal is divided across Duration for per-second magnitude.
         */
        static UGameplayEffect* CreateHealOverTimeEffect(float TotalHeal, float Duration);

        // ─── Instant Damage ───────────────────────────────────────────────────────

        /**
         * Create an instant damage GameplayEffect.
         * Instant policy, subtracts Damage from Health.
         * DamageType tag is granted for damage-type filtering.
         */
        static UGameplayEffect* CreateDamageEffect(float Damage, FGameplayTag DamageType);

        /** Create the persistent Onith passive effect; Reduction is a fraction in [0, 1]. */
        static UGameplayEffect* CreateOnithPassiveEffect(float Reduction);
        static UGameplayEffect* CreateVenexOverclockEffect(float FireRateBonus, float ReloadSpeedBonus, float DurationSeconds);
        static UGameplayEffect* CreateSkeetwPassiveEffect(float AirSpeedBonus);
        static UGameplayEffect* CreateHuranPassiveEffect(float HealBonus, float WaterRegen);

        // ─── Instant SafeZone Damage ─────────────────────────────────────────────

        /**
         * Create a single instant zone-damage hit.
         * The authoritative GameMode owns the tick and applies this once per tick.
         */
        static UGameplayEffect* CreateZoneDamageEffect(float DamagePerHit);

        // ─── Tag Grant (ex.: proteção da chuva ácida de Barburhen) ─────────────

        /**
         * Create a GameplayEffect that GRANTS a tag while active — o caminho
         * canônico GAS para estados de equipamento (colete/máscara contra a
         * chuva ácida de Barburhen: tag World.Barburhen.AcidProtection).
         * Duration > 0 → HasDuration (expira sozinho); Duration <= 0 → Infinite
         * (remove explicitamente via RemoveActiveGameplayEffect).
         */
        static UGameplayEffect* CreateTagGrantEffect(FGameplayTag Tag, float Duration);

private:

        /** Internal helper: create a base GameplayEffect CDO. */
        static UGameplayEffect* CreateBaseEffect(const FString& EffectName);

        /** Map EKhaaosCostType to the appropriate GameplayTag for the attribute. */
        static FGameplayTag GetAttributeTagForCost(EKhaaosCostType CostType);
};
