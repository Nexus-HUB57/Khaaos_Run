// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Cybernetic Species: Venex — 8 Unique Active Abilities
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_VenexAbilities.generated.h"

/**
 * UKhaaosAbility_PulseBlast
 *
 * Venex Cybernetic active ability: EMP blast disables shields
 * EMP blast disabling shields for 3s in 6m radius
 *
 * GameplayTag: Ability.Species.Venex.PulseBlast
 * Cooldown: 8.0s | EnergyCost: 20.0 | Damage: 15.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex PulseBlast"))
class UKhaaosAbility_PulseBlast : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_PulseBlast();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float Cooldown = 8.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float EnergyCost = 20.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float Damage = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float Range = 600.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float EMPRadius = 600.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|PulseBlast")
	float DisableDuration = 3.0f;
};

/**
 * UKhaaosAbility_Overclock
 *
 * Venex Cybernetic active ability: Boost fire rate and speed
 * Overclocks systems for +40% fire rate and speed for 5s
 *
 * GameplayTag: Ability.Species.Venex.Overclock
 * Cooldown: 20.0s | EnergyCost: 30.0 | Damage: 0.0
 * Duration: 5.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex Overclock"))
class UKhaaosAbility_Overclock : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Overclock();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock")
	float Cooldown = 20.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock")
	float EnergyCost = 30.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock")
	float Duration = 5.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock")
	float FireRateBonus = 0.4f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overclock")
	float SpeedBonus = 0.4f;
};

/**
 * UKhaaosAbility_TargetLock
 *
 * Venex Cybernetic active ability: Auto-aim for next shots
 * Locks onto target for auto-aim on next 3 shots for 2s
 *
 * GameplayTag: Ability.Species.Venex.TargetLock
 * Cooldown: 15.0s | EnergyCost: 25.0 | Damage: 0.0
 * Duration: 2.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex TargetLock"))
class UKhaaosAbility_TargetLock : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_TargetLock();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock")
	float Cooldown = 15.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock")
	float EnergyCost = 25.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock")
	float Range = 2000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock")
	float Duration = 2.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock")
	int32 LockShots = 3;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|TargetLock")
	float LockDuration = 2.0f;
};

/**
 * UKhaaosAbility_NaniteRepair
 *
 * Venex Cybernetic active ability: Self-repair over time
 * Nanite self-repair healing 5 HP/s for 8s
 *
 * GameplayTag: Ability.Species.Venex.NaniteRepair
 * Cooldown: 25.0s | EnergyCost: 30.0 | Damage: 0.0
 * Duration: 8.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex NaniteRepair"))
class UKhaaosAbility_NaniteRepair : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_NaniteRepair();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair")
	float Cooldown = 25.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair")
	float EnergyCost = 30.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair")
	float Duration = 8.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair")
	float HealPerSecond = 5.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|NaniteRepair")
	float RepairDuration = 8.0f;
};

/**
 * UKhaaosAbility_CyberDash
 *
 * Venex Cybernetic active ability: Blink teleport
 * Blink teleports 10m forward
 *
 * GameplayTag: Ability.Species.Venex.CyberDash
 * Cooldown: 6.0s | EnergyCost: 15.0 | Damage: 0.0
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex CyberDash"))
class UKhaaosAbility_CyberDash : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_CyberDash();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash")
	float Cooldown = 6.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash")
	float EnergyCost = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash")
	float Range = 1000.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash")
	float DashDistance = 1000.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|CyberDash")
	uint8 bBlinkTeleport : 1;
};

/**
 * UKhaaosAbility_ScannerSweep
 *
 * Venex Cybernetic active ability: Reveal nearby enemies
 * Scans and reveals all enemies in 20m for 4s
 *
 * GameplayTag: Ability.Species.Venex.ScannerSweep
 * Cooldown: 10.0s | EnergyCost: 15.0 | Damage: 0.0
 * Duration: 4.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex ScannerSweep"))
class UKhaaosAbility_ScannerSweep : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_ScannerSweep();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep")
	float Cooldown = 10.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep")
	float EnergyCost = 15.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep")
	float Range = 2000.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep")
	float Duration = 4.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep")
	float ScanRadius = 2000.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|ScannerSweep")
	float RevealDuration = 4.0f;
};

/**
 * UKhaaosAbility_StasisField
 *
 * Venex Cybernetic active ability: Temporary invulnerability
 * Activates stasis field granting 3s invulnerability
 *
 * GameplayTag: Ability.Species.Venex.StasisField
 * Cooldown: 30.0s | EnergyCost: 40.0 | Damage: 0.0
 * Duration: 3.0s
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex StasisField"))
class UKhaaosAbility_StasisField : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_StasisField();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField")
	float Cooldown = 30.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField")
	float EnergyCost = 40.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField")
	float Duration = 3.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField")
	float StasisDuration = 3.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|StasisField")
	uint8 bImmuneToDamage : 1;
};

/**
 * UKhaaosAbility_Overload
 *
 * Venex Cybernetic active ability: Ultimate: massive EMP
 * Massive EMP in 15m disabling for 5s + 100 dmg
 *
 * GameplayTag: Ability.Species.Venex.Overload
 * Cooldown: 120.0s | EnergyCost: 80.0 | Damage: 100.0
 * Duration: 5.0s
 * ULTIMATE ABILITY
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex Overload"))
class UKhaaosAbility_Overload : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_Overload();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Cooldown duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float Cooldown = 120.0f;

	/** Energy cost to activate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float EnergyCost = 80.0f;

	/** Base damage dealt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float Damage = 100.0f;

	/** Ability range in cm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float Range = 1500.0f;

	/** Effect duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float Duration = 5.0f;

	/** VFX Niagara system for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload|VFX")
	TSoftObjectPtr<UNiagaraSystem> VFX;

	/** SFX sound for this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload|SFX")
	TSoftObjectPtr<USoundBase> SFX;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float EMPRadius = 1500.0f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Venex|Overload")
	float EMPDamage = 100.0f;
};
