// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Toxic Species: Onith — 8 Unique Active Abilities
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_OnithAbilities.generated.h"

/**
 * UKhaaosAbility_VenomSpit
 *
 * Onith Toxic active ability: Toxic projectile with DoT
 * Spits venom dealing 25 dmg + 5dmg/s DoT for 4s
 *
 * GameplayTag: Ability.Species.Onith.VenomSpit
 * Cooldown: 3.0s | EnergyCost: 10.0 | Damage: 25.0
 * Duration: 4.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith VenomSpit"))
class UKhaaosAbility_VenomSpit : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_VenomSpit();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float Cooldown = 3.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float EnergyCost = 10.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float Damage = 25.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float Range = 2000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float Duration = 4.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float InitialDamage = 25.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float DoTPerSecond = 5.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|VenomSpit")
	float DoTDuration = 4.0f;
};

/**
 * UKhaaosAbility_NoxiousGas
 *
 * Onith Toxic active ability: Poison gas cloud
 * Deploys a 6m gas cloud dealing 3dmg/s for 6s
 *
 * GameplayTag: Ability.Species.Onith.NoxiousGas
 * Cooldown: 12.0s | EnergyCost: 20.0 | Damage: 3.0
 * Duration: 6.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith NoxiousGas"))
class UKhaaosAbility_NoxiousGas : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_NoxiousGas();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float Cooldown = 12.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float EnergyCost = 20.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float Damage = 3.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float Range = 600.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float Duration = 6.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float GasRadius = 600.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|NoxiousGas")
	float DamagePerSecond = 3.0f;
};

/**
 * UKhaaosAbility_PlagueTouch
 *
 * Onith Toxic active ability: Melee infection
 * Melee infection dealing 40 dmg + 8dmg/s DoT for 3s
 *
 * GameplayTag: Ability.Species.Onith.PlagueTouch
 * Cooldown: 4.0s | EnergyCost: 15.0 | Damage: 40.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith PlagueTouch"))
class UKhaaosAbility_PlagueTouch : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_PlagueTouch();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float Cooldown = 4.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float EnergyCost = 15.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float Damage = 40.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float Range = 150.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float MeleeDamage = 40.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|PlagueTouch")
	float InfectionDoT = 8.0f;
};

/**
 * UKhaaosAbility_ToxicHusk
 *
 * Onith Toxic active ability: Poison armor reflects damage
 * Toxic armor reflecting 10 dmg on hit for 8s
 *
 * GameplayTag: Ability.Species.Onith.ToxicHusk
 * Cooldown: 18.0s | EnergyCost: 25.0 | Damage: 10.0
 * Duration: 8.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith ToxicHusk"))
class UKhaaosAbility_ToxicHusk : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_ToxicHusk();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk")
	float Cooldown = 18.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk")
	float EnergyCost = 25.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk")
	float Damage = 10.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk")
	float Duration = 8.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk")
	float ReflectDamage = 10.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ToxicHusk")
	float HuskDuration = 8.0f;
};

/**
 * UKhaaosAbility_Contaminate
 *
 * Onith Toxic active ability: Ground poison zone
 * Contaminates 4m ground zone dealing 8dmg/s for 5s
 *
 * GameplayTag: Ability.Species.Onith.Contaminate
 * Cooldown: 15.0s | EnergyCost: 25.0 | Damage: 8.0
 * Duration: 5.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith Contaminate"))
class UKhaaosAbility_Contaminate : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Contaminate();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float Cooldown = 15.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float EnergyCost = 25.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float Damage = 8.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float Range = 400.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float Duration = 5.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float ContaminateRadius = 400.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Contaminate")
	float DamagePerSecond = 8.0f;
};

/**
 * UKhaaosAbility_ParasiteDrain
 *
 * Onith Toxic active ability: Life steal beam
 * Parasitic beam dealing 30 dmg and healing 30 HP
 *
 * GameplayTag: Ability.Species.Onith.ParasiteDrain
 * Cooldown: 10.0s | EnergyCost: 20.0 | Damage: 30.0
 * Duration: 1.5s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith ParasiteDrain"))
class UKhaaosAbility_ParasiteDrain : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_ParasiteDrain();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float Cooldown = 10.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float EnergyCost = 20.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float Damage = 30.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float Range = 800.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float Duration = 1.5f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float DrainDamage = 30.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|ParasiteDrain")
	float HealAmount = 30.0f;
};

/**
 * UKhaaosAbility_BioMimic
 *
 * Onith Toxic active ability: Stealth + poison burst on break
 * Enter stealth for 3s; breaking stealth triggers poison burst
 *
 * GameplayTag: Ability.Species.Onith.BioMimic
 * Cooldown: 20.0s | EnergyCost: 30.0 | Damage: 25.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith BioMimic"))
class UKhaaosAbility_BioMimic : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_BioMimic();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float Cooldown = 20.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float EnergyCost = 30.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float Damage = 25.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float Range = 400.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float StealthDuration = 3.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|BioMimic")
	float BurstDamage = 25.0f;
};

/**
 * UKhaaosAbility_Pandemic
 *
 * Onith Toxic active ability: Ultimate: global DoT
 * Spreads pandemic in 10m dealing 15dmg/s for 5s
 *
 * GameplayTag: Ability.Species.Onith.Pandemic
 * Cooldown: 120.0s | EnergyCost: 80.0 | Damage: 15.0
 * Duration: 5.0s
 * ULTIMATE ABILITY
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith Pandemic"))
class UKhaaosAbility_Pandemic : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Pandemic();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float Cooldown = 120.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float EnergyCost = 80.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float Damage = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float Range = 1000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float Duration = 5.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float PandemicRadius = 1000.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Onith|Pandemic")
	float DoTPerSecond = 15.0f;
};
