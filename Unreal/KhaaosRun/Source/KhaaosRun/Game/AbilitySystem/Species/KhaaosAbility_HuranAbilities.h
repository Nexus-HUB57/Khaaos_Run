// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Amphibious Species: Huran — 8 Unique Active Abilities
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_HuranAbilities.generated.h"

/**
 * UKhaaosAbility_TidalSurge
 *
 * Huran Amphibious active ability: Water wave AoE knockback
 * 8m radius AoE water wave that knocks back all enemies
 *
 * GameplayTag: Ability.Species.Huran.TidalSurge
 * Cooldown: 2.0s | EnergyCost: 15.0 | Damage: 40.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran TidalSurge"))
class UKhaaosAbility_TidalSurge : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_TidalSurge();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge")
	float Cooldown = 2.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge")
	float EnergyCost = 15.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge")
	float Damage = 40.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge")
	float Range = 800.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge")
	float KnockbackForce = 800.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TidalSurge")
	float AoERadius = 800.0f;
};

/**
 * UKhaaosAbility_AquaShield
 *
 * Huran Amphibious active ability: Water barrier absorbs damage
 * Water barrier that absorbs 50 damage for 10s
 *
 * GameplayTag: Ability.Species.Huran.AquaShield
 * Cooldown: 15.0s | EnergyCost: 25.0 | Damage: 0.0
 * Duration: 10.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran AquaShield"))
class UKhaaosAbility_AquaShield : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_AquaShield();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield")
	float Cooldown = 15.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield")
	float EnergyCost = 25.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield")
	float Duration = 10.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield")
	float ShieldAmount = 50.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|AquaShield")
	float ShieldDuration = 10.0f;
};

/**
 * UKhaaosAbility_DiveBomb
 *
 * Huran Amphibious active ability: Underwater dash + surface explosion
 * Dashes 20m underwater and explodes on surfacing for 30 dmg
 *
 * GameplayTag: Ability.Species.Huran.DiveBomb
 * Cooldown: 8.0s | EnergyCost: 30.0 | Damage: 30.0
 * Duration: 0.5s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran DiveBomb"))
class UKhaaosAbility_DiveBomb : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_DiveBomb();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float Cooldown = 8.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float EnergyCost = 30.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float Damage = 30.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float Range = 2000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float Duration = 0.5f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float DashDistance = 2000.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|DiveBomb")
	float ExplosionDamage = 30.0f;
};

/**
 * UKhaaosAbility_FloodZone
 *
 * Huran Amphibious active ability: Create temporary water zone
 * Creates a 5m radius water zone lasting 15s that slows enemies
 *
 * GameplayTag: Ability.Species.Huran.FloodZone
 * Cooldown: 30.0s | EnergyCost: 40.0 | Damage: 0.0
 * Duration: 15.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran FloodZone"))
class UKhaaosAbility_FloodZone : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_FloodZone();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone")
	float Cooldown = 30.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone")
	float EnergyCost = 40.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone")
	float Range = 500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone")
	float Duration = 15.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone")
	float ZoneRadius = 500.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|FloodZone")
	float ZoneDuration = 15.0f;
};

/**
 * UKhaaosAbility_PressureStrike
 *
 * Huran Amphibious active ability: Hydrostatic pressure punch
 * Melee hydrostatic pressure punch dealing 75 dmg + slow
 *
 * GameplayTag: Ability.Species.Huran.PressureStrike
 * Cooldown: 4.0s | EnergyCost: 20.0 | Damage: 75.0
 * Duration: 2.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran PressureStrike"))
class UKhaaosAbility_PressureStrike : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_PressureStrike();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float Cooldown = 4.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float EnergyCost = 20.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float Damage = 75.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float Range = 150.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float Duration = 2.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float MeleeDamage = 75.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|PressureStrike")
	float SlowDuration = 2.0f;
};

/**
 * UKhaaosAbility_GillsRegen
 *
 * Huran Amphibious active ability: Enhanced regen while in water
 * Toggle: 20 HP/s regeneration while in water
 *
 * GameplayTag: Ability.Species.Huran.GillsRegen
 * Cooldown: 5.0s | EnergyCost: 10.0 | Damage: 0.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran GillsRegen"))
class UKhaaosAbility_GillsRegen : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_GillsRegen();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|GillsRegen")
	float Cooldown = 5.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|GillsRegen")
	float EnergyCost = 10.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|GillsRegen|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|GillsRegen|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|GillsRegen")
	float RegenPerSecond = 20.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|GillsRegen")
	uint8 bRequiresWater : 1;
};

/**
 * UKhaaosAbility_Whirlpool
 *
 * Huran Amphibious active ability: Vortex trap that pulls and roots
 * Creates a whirlpool pulling enemies 3m and rooting 2s
 *
 * GameplayTag: Ability.Species.Huran.Whirlpool
 * Cooldown: 20.0s | EnergyCost: 35.0 | Damage: 15.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran Whirlpool"))
class UKhaaosAbility_Whirlpool : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Whirlpool();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float Cooldown = 20.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float EnergyCost = 35.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float Damage = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float Range = 600.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float PullDistance = 300.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|Whirlpool")
	float RootDuration = 2.0f;
};

/**
 * UKhaaosAbility_TsunamiRage
 *
 * Huran Amphibious active ability: Ultimate: massive wave
 * Sends a 15m wide massive wave dealing 150 dmg
 *
 * GameplayTag: Ability.Species.Huran.TsunamiRage
 * Cooldown: 120.0s | EnergyCost: 80.0 | Damage: 150.0
 * Duration: 3.0s
 * ULTIMATE ABILITY
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran TsunamiRage"))
class UKhaaosAbility_TsunamiRage : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_TsunamiRage();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float Cooldown = 120.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float EnergyCost = 80.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float Damage = 150.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float Range = 1500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float WaveWidth = 1500.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Huran|TsunamiRage")
	float WaveDamage = 150.0f;
};
