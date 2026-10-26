// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Cryogenic Species: Khael — 8 Unique Active Abilities
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_KhaelAbilities.generated.h"

/**
 * UKhaaosAbility_FrostBolt
 *
 * Khael Cryogenic active ability: Ice projectile with freeze
 * Launches an ice projectile dealing 40 dmg + 2s freeze
 *
 * GameplayTag: Ability.Species.Khael.FrostBolt
 * Cooldown: 3.0s | EnergyCost: 15.0 | Damage: 40.0
 * Duration: 2.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael FrostBolt"))
class UKhaaosAbility_FrostBolt : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_FrostBolt();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float Cooldown = 3.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float EnergyCost = 15.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float Damage = 40.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float Range = 3000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float Duration = 2.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float ProjectileDamage = 40.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrostBolt")
	float FreezeDuration = 2.0f;
};

/**
 * UKhaaosAbility_CryoWall
 *
 * Khael Cryogenic active ability: Ice barrier wall
 * Creates a 100 HP ice wall lasting 6s
 *
 * GameplayTag: Ability.Species.Khael.CryoWall
 * Cooldown: 12.0s | EnergyCost: 30.0 | Damage: 0.0
 * Duration: 6.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael CryoWall"))
class UKhaaosAbility_CryoWall : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_CryoWall();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall")
	float Cooldown = 12.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall")
	float EnergyCost = 30.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall")
	float Range = 500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall")
	float Duration = 6.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall")
	float WallHealth = 100.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|CryoWall")
	float WallDuration = 6.0f;
};

/**
 * UKhaaosAbility_Blizzard
 *
 * Khael Cryogenic active ability: AoE slow zone
 * Creates an 8m blizzard zone with 50% slow for 4s
 *
 * GameplayTag: Ability.Species.Khael.Blizzard
 * Cooldown: 15.0s | EnergyCost: 35.0 | Damage: 10.0
 * Duration: 4.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael Blizzard"))
class UKhaaosAbility_Blizzard : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Blizzard();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float Cooldown = 15.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float EnergyCost = 35.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float Damage = 10.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float Range = 800.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float Duration = 4.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float SlowPercent = 0.5f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Blizzard")
	float BlizzardRadius = 800.0f;
};

/**
 * UKhaaosAbility_FrozenArmor
 *
 * Khael Cryogenic active ability: Ice armor damage reduction
 * Encases in ice granting +30% dmg reduction for 8s
 *
 * GameplayTag: Ability.Species.Khael.FrozenArmor
 * Cooldown: 20.0s | EnergyCost: 25.0 | Damage: 0.0
 * Duration: 8.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael FrozenArmor"))
class UKhaaosAbility_FrozenArmor : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_FrozenArmor();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor")
	float Cooldown = 20.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor")
	float EnergyCost = 25.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor")
	float Duration = 8.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor")
	float DamageReductionPercent = 0.3f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|FrozenArmor")
	float ArmorDuration = 8.0f;
};

/**
 * UKhaaosAbility_Avalanche
 *
 * Khael Cryogenic active ability: Downhill ice slide dash
 * Ice dash 15m leaving a 60 dmg frost trail
 *
 * GameplayTag: Ability.Species.Khael.Avalanche
 * Cooldown: 10.0s | EnergyCost: 30.0 | Damage: 60.0
 * Duration: 1.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael Avalanche"))
class UKhaaosAbility_Avalanche : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Avalanche();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float Cooldown = 10.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float EnergyCost = 30.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float Damage = 60.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float Range = 1500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float Duration = 1.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float DashDistance = 1500.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Avalanche")
	float TrailDamage = 60.0f;
};

/**
 * UKhaaosAbility_Frostbite
 *
 * Khael Cryogenic active ability: Melee freeze attack
 * Melee strike dealing 30 dmg + 1s freeze
 *
 * GameplayTag: Ability.Species.Khael.Frostbite
 * Cooldown: 3.0s | EnergyCost: 10.0 | Damage: 30.0
 * Duration: 1.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael Frostbite"))
class UKhaaosAbility_Frostbite : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Frostbite();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float Cooldown = 3.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float EnergyCost = 10.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float Damage = 30.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float Range = 150.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float Duration = 1.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float MeleeDamage = 30.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|Frostbite")
	float FreezeDuration = 1.0f;
};

/**
 * UKhaaosAbility_IceClone
 *
 * Khael Cryogenic active ability: Decoy ice clone that explodes
 * Spawns an ice clone decoy that explodes for 40 dmg when destroyed
 *
 * GameplayTag: Ability.Species.Khael.IceClone
 * Cooldown: 18.0s | EnergyCost: 25.0 | Damage: 40.0
 * Duration: 8.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael IceClone"))
class UKhaaosAbility_IceClone : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_IceClone();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float Cooldown = 18.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float EnergyCost = 25.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float Damage = 40.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float Range = 300.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float Duration = 8.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float CloneExplosionDamage = 40.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|IceClone")
	float CloneDuration = 8.0f;
};

/**
 * UKhaaosAbility_AbsoluteZero
 *
 * Khael Cryogenic active ability: Ultimate: freeze all in range
 * Freezes all enemies in 12m for 3s dealing 80 dmg
 *
 * GameplayTag: Ability.Species.Khael.AbsoluteZero
 * Cooldown: 120.0s | EnergyCost: 80.0 | Damage: 80.0
 * Duration: 3.0s
 * ULTIMATE ABILITY
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael AbsoluteZero"))
class UKhaaosAbility_AbsoluteZero : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_AbsoluteZero();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float Cooldown = 120.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float EnergyCost = 80.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float Damage = 80.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float Range = 1200.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float FreezeRadius = 1200.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Khael|AbsoluteZero")
	float FreezeDamage = 80.0f;
};
