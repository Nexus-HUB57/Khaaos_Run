// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "Game/AbilitySystem/KhaaosGameplayEffectTypes.h"
#include "KhaaosEffectApplier.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UAbilitySystemComponent;
class UGameplayEffect;

/**
 * UKhaaosEffectApplier
 *
 * GameInstanceSubsystem that provides convenience wrappers for applying,
 * removing, and querying GameplayEffects via UKhaaosGameplayEffects factory.
 *
 * Centralizes the pattern:
 *   1. Create a transient GE instance via UKhaaosGameplayEffects::CreateXxx()
 *   2. Build a spec from that instance and attach its source context
 *   3. Apply spec to ASC
 *
 * Usage:
 *   UKhaaosEffectApplier* Applier = GetGameInstance()->GetSubsystem<UKhaaosEffectApplier>();
 *   Applier->ApplyCooldown(ASC, CooldownTag, 2.0f);
 */
UCLASS(BlueprintType)
class UKhaaosEffectApplier : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Apply Cooldown ───────────────────────────────────────────────────────

	/** Apply a cooldown effect with the given tag and duration. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Effect")
	FActiveGameplayEffectHandle ApplyCooldown(UAbilitySystemComponent* ASC, FGameplayTag CooldownTag, float Duration);

	// ─── Apply Cost ───────────────────────────────────────────────────────────

	/** Apply an instant cost effect (Health/Energy/Credits). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Effect")
	FActiveGameplayEffectHandle ApplyCost(UAbilitySystemComponent* ASC, EKhaaosCostType CostType, float Amount);

	// ─── Apply Buff ───────────────────────────────────────────────────────────

	/** Apply a timed buff effect. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Effect")
	FActiveGameplayEffectHandle ApplyBuff(UAbilitySystemComponent* ASC, FGameplayTag BuffTag, float Duration, float Magnitude);

	// ─── Apply Debuff ─────────────────────────────────────────────────────────

	/** Apply a timed debuff effect. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Effect")
	FActiveGameplayEffectHandle ApplyDebuff(UAbilitySystemComponent* ASC, FGameplayTag DebuffTag, float Duration, float Magnitude);

	/** Apply one instant SafeZone hit with the zone actor recorded as the effect causer. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Effect")
	FActiveGameplayEffectHandle ApplyZoneDamage(UAbilitySystemComponent* ASC, float Damage, AActor* EffectCauser);

	/** Apply an instant damage effect with optional source and effect-causer context. */
	FActiveGameplayEffectHandle ApplyDamage(
		UAbilitySystemComponent* ASC,
		float Damage,
		FGameplayTag DamageType,
		AActor* Instigator,
		AActor* EffectCauser);

	// ─── Remove Effect ────────────────────────────────────────────────────────

	/** Remove all active effects that grant the specified tag. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Effect")
	bool RemoveEffectByTag(UAbilitySystemComponent* ASC, FGameplayTag Tag);

	// ─── Query Active Effect ──────────────────────────────────────────────────

	/** Check if an effect with the given tag is currently active. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Effect")
	bool HasActiveEffect(UAbilitySystemComponent* ASC, FGameplayTag Tag) const;

	// ─── Get Remaining Time ───────────────────────────────────────────────────

	/** Get remaining duration for the first active effect matching the tag. Returns 0 if not found. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Effect")
	float GetEffectRemainingTime(UAbilitySystemComponent* ASC, FGameplayTag Tag) const;

private:

	/** Apply a generated GameplayEffect instance with an explicit source context. */
	FActiveGameplayEffectHandle ApplyEffectInstance(
		UAbilitySystemComponent* ASC,
		UGameplayEffect* Effect,
		AActor* Instigator = nullptr,
		AActor* EffectCauser = nullptr);
};
