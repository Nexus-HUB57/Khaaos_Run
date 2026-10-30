// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// AvianFog Species: Skeetw — 8 Unique Active Abilities
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_SkeetwAbilities.generated.h"

/**
 * UKhaaosAbility_FogCloud
 *
 * Skeetw AvianFog active ability: Deploy blinding fog
 * Deploys an 8m fog cloud blinding enemies for 6s
 *
 * GameplayTag: Ability.Species.Skeetw.FogCloud
 * Cooldown: 10.0s | EnergyCost: 15.0 | Damage: 0.0
 * Duration: 6.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw FogCloud"))
class UKhaaosAbility_FogCloud : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_FogCloud();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud")
	float Cooldown = 10.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud")
	float EnergyCost = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud")
	float Range = 800.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud")
	float Duration = 6.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud")
	float FogRadius = 800.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FogCloud")
	float BlindDuration = 6.0f;
};

/**
 * UKhaaosAbility_SkyDive
 *
 * Skeetw AvianFog active ability: Aerial dive attack
 * Aerial dive from above dealing 70 dmg in 15m range
 *
 * GameplayTag: Ability.Species.Skeetw.SkyDive
 * Cooldown: 8.0s | EnergyCost: 25.0 | Damage: 70.0
 * Duration: 1.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw SkyDive"))
class UKhaaosAbility_SkyDive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_SkyDive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float Cooldown = 8.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float EnergyCost = 25.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float Damage = 70.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float Range = 1500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float Duration = 1.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float DiveDamage = 70.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|SkyDive")
	float DiveRange = 1500.0f;
};

/**
 * UKhaaosAbility_TalonStrike
 *
 * Skeetw AvianFog active ability: Enhanced melee with bleed
 * Enhanced melee dealing 50 dmg + 5dmg/s bleed for 3s
 *
 * GameplayTag: Ability.Species.Skeetw.TalonStrike
 * Cooldown: 3.0s | EnergyCost: 10.0 | Damage: 50.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw TalonStrike"))
class UKhaaosAbility_TalonStrike : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_TalonStrike();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float Cooldown = 3.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float EnergyCost = 10.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float Damage = 50.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float Range = 200.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float StrikeDamage = 50.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|TalonStrike")
	float BleedPerSecond = 5.0f;
};

/**
 * UKhaaosAbility_WindGust
 *
 * Skeetw AvianFog active ability: Cone knockback
 * Wind gust in 8m cone knocking enemies back
 *
 * GameplayTag: Ability.Species.Skeetw.WindGust
 * Cooldown: 6.0s | EnergyCost: 15.0 | Damage: 10.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw WindGust"))
class UKhaaosAbility_WindGust : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_WindGust();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust")
	float Cooldown = 6.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust")
	float EnergyCost = 15.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust")
	float Damage = 10.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust")
	float Range = 800.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust")
	float GustRange = 800.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|WindGust")
	float KnockbackForce = 600.0f;
};

/**
 * UKhaaosAbility_FeatherFlurry
 *
 * Skeetw AvianFog active ability: 5 feather projectiles
 * Launches 5 feather projectiles each dealing 15 dmg
 *
 * GameplayTag: Ability.Species.Skeetw.FeatherFlurry
 * Cooldown: 4.0s | EnergyCost: 15.0 | Damage: 15.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw FeatherFlurry"))
class UKhaaosAbility_FeatherFlurry : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_FeatherFlurry();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry")
	float Cooldown = 4.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry")
	float EnergyCost = 15.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry")
	float Damage = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry")
	float Range = 1500.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry")
	float FeatherDamage = 15.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|FeatherFlurry")
	int32 FeatherCount = 5;
};

/**
 * UKhaaosAbility_Camouflage
 *
 * Skeetw AvianFog active ability: Fog stealth
 * Enters fog-based stealth for 4s
 *
 * GameplayTag: Ability.Species.Skeetw.Camouflage
 * Cooldown: 25.0s | EnergyCost: 20.0 | Damage: 0.0
 * Duration: 4.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw Camouflage"))
class UKhaaosAbility_Camouflage : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Camouflage();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage")
	float Cooldown = 25.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage")
	float EnergyCost = 20.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage")
	float Duration = 4.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage")
	float StealthDuration = 4.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|Camouflage")
	uint8 bFogBasedStealth : 1;
};

/**
 * UKhaaosAbility_ScoutEye
 *
 * Skeetw AvianFog active ability: Reveal and mark enemies
 * Reveals and marks enemies in 25m for 5s
 *
 * GameplayTag: Ability.Species.Skeetw.ScoutEye
 * Cooldown: 12.0s | EnergyCost: 15.0 | Damage: 0.0
 * Duration: 5.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw ScoutEye"))
class UKhaaosAbility_ScoutEye : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_ScoutEye();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye")
	float Cooldown = 12.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye")
	float EnergyCost = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye")
	float Range = 2500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye")
	float Duration = 5.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye")
	float RevealRadius = 2500.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|ScoutEye")
	float MarkDuration = 5.0f;
};

/**
 * UKhaaosAbility_StormCall
 *
 * Skeetw AvianFog active ability: Ultimate: lightning storm
 * Calls a lightning storm in 10m dealing 25dmg/s for 4s
 *
 * GameplayTag: Ability.Species.Skeetw.StormCall
 * Cooldown: 120.0s | EnergyCost: 80.0 | Damage: 25.0
 * Duration: 4.0s
 * ULTIMATE ABILITY
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw StormCall"))
class UKhaaosAbility_StormCall : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_StormCall();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float Cooldown = 120.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float EnergyCost = 80.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float Damage = 25.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float Range = 1000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float Duration = 4.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float StormRadius = 1000.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Skeetw|StormCall")
	float DamagePerSecond = 25.0f;
};
