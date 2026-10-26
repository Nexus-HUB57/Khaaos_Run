// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Radiation Species: Zheers — 8 Unique Active Abilities
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_ZheersAbilities.generated.h"

/**
 * UKhaaosAbility_RadBurst
 *
 * Zheers Radiation active ability: Gamma flash with blind
 * Gamma flash dealing 30 dmg + 1s blind in 6m
 *
 * GameplayTag: Ability.Species.Zheers.RadBurst
 * Cooldown: 8.0s | EnergyCost: 20.0 | Damage: 30.0
 * Duration: 1.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers RadBurst"))
class UKhaaosAbility_RadBurst : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_RadBurst();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float Cooldown = 8.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float EnergyCost = 20.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float Damage = 30.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float Range = 600.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float Duration = 1.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float BurstDamage = 30.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadBurst")
	float BlindDuration = 1.0f;
};

/**
 * UKhaaosAbility_MutateForm
 *
 * Zheers Radiation active ability: Temporary mutation buff
 * Mutates form granting +50 HP and +20% dmg for 8s
 *
 * GameplayTag: Ability.Species.Zheers.MutateForm
 * Cooldown: 25.0s | EnergyCost: 30.0 | Damage: 0.0
 * Duration: 8.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers MutateForm"))
class UKhaaosAbility_MutateForm : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_MutateForm();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm")
	float Cooldown = 25.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm")
	float EnergyCost = 30.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm")
	float Duration = 8.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm")
	float BonusHealth = 50.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|MutateForm")
	float DamageBonus = 0.2f;
};

/**
 * UKhaaosAbility_FissionShot
 *
 * Zheers Radiation active ability: Splitting projectile
 * Fires a splitting projectile dealing 20 dmg x 3 fragments
 *
 * GameplayTag: Ability.Species.Zheers.FissionShot
 * Cooldown: 5.0s | EnergyCost: 15.0 | Damage: 20.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers FissionShot"))
class UKhaaosAbility_FissionShot : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_FissionShot();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot")
	float Cooldown = 5.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot")
	float EnergyCost = 15.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot")
	float Damage = 20.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot")
	float Range = 2500.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot")
	float FragmentDamage = 20.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|FissionShot")
	int32 FragmentCount = 3;
};

/**
 * UKhaaosAbility_RadAura
 *
 * Zheers Radiation active ability: Passive AoE radiation toggle
 * Toggle: 3m radiation aura dealing 5dmg/s to nearby enemies
 *
 * GameplayTag: Ability.Species.Zheers.RadAura
 * Cooldown: 15.0s | EnergyCost: 10.0 | Damage: 5.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers RadAura"))
class UKhaaosAbility_RadAura : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_RadAura();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura")
	float Cooldown = 15.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura")
	float EnergyCost = 10.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura")
	float Damage = 5.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura")
	float Range = 300.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura")
	float AuraRadius = 300.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|RadAura")
	float DamagePerSecond = 5.0f;
};

/**
 * UKhaaosAbility_ChernobylCharge
 *
 * Zheers Radiation active ability: Irradiated dash
 * Irradiated dash 12m leaving 40 dmg radiation trail
 *
 * GameplayTag: Ability.Species.Zheers.ChernobylCharge
 * Cooldown: 10.0s | EnergyCost: 25.0 | Damage: 40.0
 * Duration: 1.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers ChernobylCharge"))
class UKhaaosAbility_ChernobylCharge : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_ChernobylCharge();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float Cooldown = 10.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float EnergyCost = 25.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float Damage = 40.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float Range = 1200.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float Duration = 1.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float DashDistance = 1200.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|ChernobylCharge")
	float TrailDamage = 40.0f;
};

/**
 * UKhaaosAbility_DegenField
 *
 * Zheers Radiation active ability: Armor decay zone
 * Deploys a 5m decay zone reducing armor 30% for 6s
 *
 * GameplayTag: Ability.Species.Zheers.DegenField
 * Cooldown: 18.0s | EnergyCost: 25.0 | Damage: 0.0
 * Duration: 6.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers DegenField"))
class UKhaaosAbility_DegenField : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_DegenField();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField")
	float Cooldown = 18.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField")
	float EnergyCost = 25.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField")
	float Range = 500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField")
	float Duration = 6.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField")
	float ArmorReductionPercent = 0.3f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|DegenField")
	float FieldRadius = 500.0f;
};

/**
 * UKhaaosAbility_HalfLife
 *
 * Zheers Radiation active ability: Delayed explosion
 * Places a delayed explosion: 3s fuse, 60 dmg in 8m
 *
 * GameplayTag: Ability.Species.Zheers.HalfLife
 * Cooldown: 12.0s | EnergyCost: 20.0 | Damage: 60.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers HalfLife"))
class UKhaaosAbility_HalfLife : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_HalfLife();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float Cooldown = 12.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float EnergyCost = 20.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float Damage = 60.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float Range = 800.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float FuseTime = 3.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|HalfLife")
	float ExplosionDamage = 60.0f;
};

/**
 * UKhaaosAbility_Meltdown
 *
 * Zheers Radiation active ability: Ultimate: nuclear explosion
 * Nuclear meltdown dealing 200 dmg in 20m radius
 *
 * GameplayTag: Ability.Species.Zheers.Meltdown
 * Cooldown: 120.0s | EnergyCost: 80.0 | Damage: 200.0
 * Duration: 2.0s
 * ULTIMATE ABILITY
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers Meltdown"))
class UKhaaosAbility_Meltdown : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Meltdown();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float Cooldown = 120.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float EnergyCost = 80.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float Damage = 200.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float Range = 2000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float Duration = 2.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float NukeRadius = 2000.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Zheers|Meltdown")
	float NukeDamage = 200.0f;
};
