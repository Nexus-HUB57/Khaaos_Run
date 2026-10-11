// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "KhaaosAttributeSet.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when any attribute changes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnAttributeChanged, UKhaaosAttributeSet*, AttributeSet, const FString&, AttributeName, float, NewValue);

/**
 * UKhaaosAttributeSet
 *
 * Game attribute container following ActionRoguelike RogueAttributeSet pattern.
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
UCLASS(Abstract, BlueprintType, DefaultToInstanced)
class UKhaaosAttributeSet : public UObject
{
	GENERATED_BODY()

public:
	UKhaaosAttributeSet();

	// ─── Attributes ─────────────────────────────────────────────────────────

	/** Current health. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float Health;

	/** Maximum health (default 100, from schema.ts). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "1"))
	float MaxHealth;

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

	/** Attack range in map percentage. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Attributes", meta = (ClampMin = "0"))
	float AttackRange;

	// ─── Mutation Methods ───────────────────────────────────────────────────

	/**
	 * Apply damage to Health, reduced by DefenseRating.
	 * Clamps Health to [0, MaxHealth]. Returns actual damage dealt.
	 * Server-authoritative: clients never call this directly.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	float ApplyDamage(float DamageAmount, AActor* Instigator = nullptr);

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

	// ─── Delegate ───────────────────────────────────────────────────────────

	/** Broadcast when any attribute value changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Attributes")
	FOnAttributeChanged OnAttributeChanged;

protected:

	/** Internal setter that fires delegate. */
	void SetHealth(float NewHealth);

	/** Internal setter that fires delegate. */
	void SetEnergy(float NewEnergy);

	/** Default values (from schema.ts playerStats). */
	static constexpr float DefaultMaxHealth = 100.0f;
	static constexpr float DefaultMaxEnergy = 100.0f;
	static constexpr float DefaultSpeed = 1.0f;
	static constexpr int32 DefaultCredits = 0;
};
