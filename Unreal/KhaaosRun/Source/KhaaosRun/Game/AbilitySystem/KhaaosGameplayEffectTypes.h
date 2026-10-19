// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameplayTagContainer.h"
#include "KhaaosGameplayEffectTypes.generated.h"

// ─── Cost Type Enum ────────────────────────────────────────────────────────────

/** Attribute types that can be spent as ability costs. */
UENUM(BlueprintType)
enum class EKhaaosCostType : uint8
{
	Health    UMETA(DisplayName = "Health"),
	Energy    UMETA(DisplayName = "Energy"),
	Credits   UMETA(DisplayName = "Credits")
};

// ─── Buff Type Enum ────────────────────────────────────────────────────────────

/** Buff categories for GameplayEffect classification. */
UENUM(BlueprintType)
enum class EKhaaosBuffType : uint8
{
	SpeedBoost       UMETA(DisplayName = "SpeedBoost"),
	Shielded         UMETA(DisplayName = "Shielded"),
	HealOverTime     UMETA(DisplayName = "HealOverTime"),
	DamageReduction  UMETA(DisplayName = "DamageReduction")
};

// ─── Debuff Type Enum ──────────────────────────────────────────────────────────

/** Debuff categories for GameplayEffect classification. */
UENUM(BlueprintType)
enum class EKhaaosDebuffType : uint8
{
	Slowed   UMETA(DisplayName = "Slowed"),
	Burning  UMETA(DisplayName = "Burning"),
	Frozen   UMETA(DisplayName = "Frozen"),
	Poisoned UMETA(DisplayName = "Poisoned")
};

// ─── Effect Config Struct ──────────────────────────────────────────────────────

/** Configuration for a generic GameplayEffect (buff or debuff). */
USTRUCT(BlueprintType)
struct FKhaaosEffectConfig
{
	GENERATED_BODY()

	/** Tag identifying this effect (e.g., Effect.Buff.SpeedBoost). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Effect")
	FGameplayTag EffectTag;

	/** Duration in seconds (0 = instant, <0 = infinite). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Effect")
	float Duration = 5.0f;

	/** Magnitude of the modifier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Effect")
	float Magnitude = 1.0f;

	/** Stacking type for the effect. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Effect")
	EGameplayEffectStackingType StackingType = EGameplayEffectStackingType::NoStacking;

	/** Whether this is a buff (true) or debuff (false). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Effect")
	uint8 bIsBuff : 1;
};

// ─── Cooldown Config Struct ────────────────────────────────────────────────────

/** Configuration for a cooldown GameplayEffect. */
USTRUCT(BlueprintType)
struct FKhaaosCooldownConfig
{
	GENERATED_BODY()

	/** Cooldown tag (e.g., Cooldown.Sprint). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cooldown")
	FGameplayTag CooldownTag;

	/** Duration of cooldown in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cooldown")
	float Duration = 1.0f;

	/** Whether cooldown starts immediately on apply. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cooldown")
	uint8 bStartOnApply : 1;
};

// ─── Damage Config Struct ──────────────────────────────────────────────────────

/** Configuration for a damage GameplayEffect. */
USTRUCT(BlueprintType)
struct FKhaaosDamageConfig
{
	GENERATED_BODY()

	/** Base damage amount. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
	float BaseDamage = 10.0f;

	/** Damage type tag (e.g., Effect.Damage.Bullet). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
	FGameplayTag DamageType;

	/** Whether headshot is possible. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
	uint8 bCanHeadshot : 1;

	/** Headshot damage multiplier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
	float HeadshotMultiplier = 2.0f;

	/** Whether damage is radial (explosion). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
	uint8 bIsRadial : 1;

	/** Radius for radial damage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
	float RadialRadius = 0.0f;
};

// ─── Applied Effect Info Struct ────────────────────────────────────────────────

/** Runtime info about an applied GameplayEffect (for UI display). */
USTRUCT(BlueprintType)
struct FKhaaosAppliedEffectInfo
{
	GENERATED_BODY()

	/** Handle to the active GameplayEffect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Effect")
	FActiveGameplayEffectHandle EffectHandle;

	/** Remaining time (seconds). -1 if infinite. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Effect")
	float RemainingTime = 0.0f;

	/** Current stack count. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Effect")
	int32 StackCount = 1;

	/** Whether this is a buff (true) or debuff (false). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Effect")
	uint8 bIsBuff : 1;
};
