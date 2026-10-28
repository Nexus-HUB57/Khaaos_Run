// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "AbilitySystemComponent.h"
#include "AttributeSet.h"
#include "KhaaosAttributeSet.generated.h"

class AActor;
class UAbilitySystemComponent;
class UKhaaosAttributeSet;

#define KHAOOS_ATTRIBUTE_ACCESSORS(ClassName, PropertyName) \
	GAMEPLAYATTRIBUTE_PROPERTY_GETTER(ClassName, PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_GETTER(PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_SETTER(PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_INITTER(PropertyName)

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when any attribute changes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnAttributeChanged, UKhaaosAttributeSet*, AttributeSet, const FString&, AttributeName, float, NewValue);
DECLARE_MULTICAST_DELEGATE_ThreeParams(FOnKhaaosOutOfHealth, AActor*, AActor*, AActor*);

/**
 * UKhaaosAttributeSet
 *
 * Gameplay AttributeSet for Health/MaxHealth, with project-side attributes
 * retained for compatibility with existing gameplay systems.
 * Also maps to schema.ts playerStats columns.
 *
 * Attributes:
 *   - Health / MaxHealth  (from playerStats.health / maxHealth)
 *   - Energy / MaxEnergy  (from playerStats.energy / maxEnergy)
 *   - Credits             (from playerStats → bank accounts)
 *   - Speed               (movement modifier)
 *
 * Methods:
 *   - ApplyDamage:  reduce Health, clamp to [0, MaxHealth]
 *   - Heal:         increase Health, clamp to MaxHealth
 *   - GrantCredits: add credits (positive or negative)
 *
 * All mutations fire OnAttributeChanged for UI binding.
 */
UCLASS(BlueprintType)
class UKhaaosAttributeSet : public UAttributeSet
{
	GENERATED_BODY()

public:
	UKhaaosAttributeSet();

	// ─── Attributes ─────────────────────────────────────────────────────────

	/** Current health. */
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_Health, Category = "Khaaos|Attributes")
	FGameplayAttributeData Health;
	KHAOOS_ATTRIBUTE_ACCESSORS(UKhaaosAttributeSet, Health)

	/** Maximum health (default 100, from schema.ts). */
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_MaxHealth, Category = "Khaaos|Attributes")
	FGameplayAttributeData MaxHealth;
	KHAOOS_ATTRIBUTE_ACCESSORS(UKhaaosAttributeSet, MaxHealth)

	/** Current shield pool consumed before health. */
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_Shield, Category = "Khaaos|Attributes|Combat")
	FGameplayAttributeData Shield;
	KHAOOS_ATTRIBUTE_ACCESSORS(UKhaaosAttributeSet, Shield)

	/** Maximum shield pool. */
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_MaxShield, Category = "Khaaos|Attributes|Combat")
	FGameplayAttributeData MaxShield;
	KHAOOS_ATTRIBUTE_ACCESSORS(UKhaaosAttributeSet, MaxShield)

	/** Current energy (for abilities). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float Energy;

	/** Maximum energy (default 100, from schema.ts). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "1"))
	float MaxEnergy;

	/** Currency credits (KRC). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes")
	int32 Credits;

	/** Movement speed multiplier (base = 1.0). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float Speed;

	/** Damage multiplier from equipped weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float DamageMultiplier;

	/** Defense rating from equipped armor. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float DefenseRating;

	/** Onith passive reduction against projectile damage, applied by an infinite GameplayEffect. */
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_OnithProjectileDamageReduction, Category = "Khaaos|Attributes|Species")
	FGameplayAttributeData OnithProjectileDamageReduction;
	KHAOOS_ATTRIBUTE_ACCESSORS(UKhaaosAttributeSet, OnithProjectileDamageReduction)

	/** Onith passive reduction against explosion damage, applied by an infinite GameplayEffect. */
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_OnithExplosionDamageReduction, Category = "Khaaos|Attributes|Species")
	FGameplayAttributeData OnithExplosionDamageReduction;
	KHAOOS_ATTRIBUTE_ACCESSORS(UKhaaosAttributeSet, OnithExplosionDamageReduction)

	/** Attack range in map percentage. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float AttackRange;

	// ─── Mutation Methods ───────────────────────────────────────────────────

	/**
	 * Apply untyped damage to Health; typed callers use ApplyDamageOfType.
	 * Clamps Health to [0, MaxHealth]. Returns actual damage dealt.
	 * Server-authoritative: clients never call this directly.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	float ApplyDamage(float DamageAmount, AActor* Instigator = nullptr);

	/** Apply typed damage so damage-specific species passives can be evaluated. */
	float ApplyDamageOfType(float DamageAmount, AActor* Instigator, const FGameplayTag& DamageType);

	/** Apply species mitigation to raw damage before armor/defense. */
	static float CalculateSpeciesMitigatedDamage(
		float DamageAmount,
		const FGameplayTag& DamageType,
		float ProjectileReduction,
		float ExplosionReduction);

	/**
	 * Heal Health by amount. Clamps to MaxHealth.
	 * Returns actual healing applied.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	float Heal(float HealAmount);

	/**
	 * Grant credits (positive or negative).
	 * Returns new credit balance.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	int32 GrantCredits(int32 Amount);

	/**
	 * Consume energy for ability activation.
	 * Returns true if enough energy was available.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	bool ConsumeEnergy(float Amount);

	/**
	 * Regenerate energy over time.
	 * Clamps to MaxEnergy.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	void RegenerateEnergy(float Amount);

	/** Check if this entity is alive (Health > 0). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Attributes")
	bool IsAlive() const;

	/** Check if this entity is at full health. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Attributes")
	bool IsFullHealth() const;

	/** Reset all attributes to defaults. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	void ResetToDefaults();

	/** Initialize from schema defaults (Health=100, MaxHealth=100, etc.). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	void InitFromSchemaDefaults();

	/** Apply an authoritative operative profile before combat begins. */
	void InitializeCombatProfile(float InHealth, float InMaxHealth, float InShield, float InMaxShield,
		float InEnergy, float InMaxEnergy, float InSpeed);

	// ─── Delegate ───────────────────────────────────────────────────────────

	/** Broadcast when any attribute value changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Attributes")
	FOnAttributeChanged OnAttributeChanged;

	/** Broadcast once on the server when authoritative Health reaches zero. */
	FOnKhaaosOutOfHealth OnOutOfHealth;

	virtual void PostGameplayEffectExecute(const FGameplayEffectModCallbackData& Data) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	UFUNCTION()
	void OnRep_Health(const FGameplayAttributeData& OldHealth);

	UFUNCTION()
	void OnRep_MaxHealth(const FGameplayAttributeData& OldMaxHealth);

	UFUNCTION()
	void OnRep_Shield(const FGameplayAttributeData& OldShield);

	UFUNCTION()
	void OnRep_MaxShield(const FGameplayAttributeData& OldMaxShield);

	UFUNCTION()
	void OnRep_OnithProjectileDamageReduction(const FGameplayAttributeData& OldReduction);

	UFUNCTION()
	void OnRep_OnithExplosionDamageReduction(const FGameplayAttributeData& OldReduction);

protected:

	/** Internal setter for the legacy Energy value. */
	void SetEnergy(float NewEnergy);

	/** Default values (from schema.ts playerStats). */
	static constexpr float DefaultMaxHealth = 100.0f;
	static constexpr float DefaultMaxEnergy = 100.0f;
	static constexpr float DefaultSpeed = 1.0f;
	static constexpr int32 DefaultCredits = 0;

	bool bOutOfHealthAlreadyBroadcast = false;
};

#undef KHAOOS_ATTRIBUTE_ACCESSORS
