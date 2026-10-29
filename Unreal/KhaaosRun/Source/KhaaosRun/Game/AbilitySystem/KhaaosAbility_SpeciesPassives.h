// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosAbility_SpeciesPassives.generated.h"

/**
 * UKhaaosAbility_ZheersPassive
 *
 * Zheers passive: Adaptabilidade
 * +10% resistencia ao ambiente local do mundo atual
 *
 * GameplayTag: Ability.Passive.Species.Zheers.Adaptabilidade
 * NetExecutionPolicy: ServerInitiated (server applies passive effects)
 *
 * Activation: Automatic on species assignment (KhaaosGameMode::AssignSpecies)
 * Duration: Persistent (infinite while species is active)
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Zheers Passive"))
class UKhaaosAbility_ZheersPassive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_ZheersPassive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Environment resistance bonus percentage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Zheers")
	float EnvironmentResistancePercent = 0.10f;

};

/**
 * UKhaaosAbility_OnithPassive
 *
 * Onith passive: Pele Escamosa
 * -15% dano recebido de projeteis e explosao
 *
 * GameplayTag: Ability.Passive.Species.Onith.PeleEscamosa
 * NetExecutionPolicy: ServerInitiated (server applies passive effects)
 *
 * Activation: Automatic on species assignment (KhaaosGameMode::AssignSpecies)
 * Duration: Persistent (infinite while species is active)
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Onith Passive"))
class UKhaaosAbility_OnithPassive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_OnithPassive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Projectile/explosion damage reduction percentage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Onith")
	float DamageReductionPercent = 0.15f;

};

/**
 * UKhaaosAbility_SkeetwPassive
 *
 * Skeetw passive: Voo Planador
 * Glide apos pulo — queda lenta por 3s, +20% speed no ar
 *
 * GameplayTag: Ability.Passive.Species.Skeetw.VooPlanador
 * NetExecutionPolicy: ServerInitiated (server applies passive effects)
 *
 * Activation: Automatic on species assignment (KhaaosGameMode::AssignSpecies)
 * Duration: Persistent (infinite while species is active)
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Skeetw Passive"))
class UKhaaosAbility_SkeetwPassive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_SkeetwPassive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Glide duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Skeetw")
	float GlideDuration = 3.0f;

	/** Air speed bonus percentage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Skeetw")
	float AirSpeedBonus = 0.20f;

};

/**
 * UKhaaosAbility_HuranPassive
 *
 * Huran passive: Regeneracao Aquatica
 * Regenera 2 HP/s quando dentro de agua ou apos curativo (+50% heal)
 *
 * GameplayTag: Ability.Passive.Species.Huran.RegeneracaoAquatica
 * NetExecutionPolicy: ServerInitiated (server applies passive effects)
 *
 * Activation: Automatic on species assignment (KhaaosGameMode::AssignSpecies)
 * Duration: Persistent (infinite while species is active)
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Huran Passive"))
class UKhaaosAbility_HuranPassive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_HuranPassive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** HP regeneration per second in water. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Huran")
	float WaterRegenPerSecond = 2.0f;

	/** Heal effectiveness bonus percentage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Huran")
	float HealBonusPercent = 0.50f;

};

/**
 * UKhaaosAbility_VenexPassive
 *
 * Venex passive: Overclock Neural
 * +15% fire rate e reload speed por 5s apos eliminacao
 *
 * GameplayTag: Ability.Passive.Species.Venex.OverclockNeural
 * NetExecutionPolicy: ServerInitiated (server applies passive effects)
 *
 * Activation: Automatic on species assignment (KhaaosGameMode::AssignSpecies)
 * Duration: Persistent (infinite while species is active)
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Venex Passive"))
class UKhaaosAbility_VenexPassive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_VenexPassive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Fire rate bonus percentage on elimination. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Venex")
	float OverclockFireRateBonus = 0.15f;

	/** Overclock duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Venex")
	float OverclockDuration = 5.0f;
	float OverclockReloadBonus = 0.15f;
	bool ApplyOverclockFromElimination(class UAbilitySystemComponent* ASC);
	static bool TryApplyOverclockOnASC(class UAbilitySystemComponent* ASC);

};

/**
 * UKhaaosAbility_KhaelPassive
 *
 * Khael passive: Canalizacao Mistica
 * Gasto de energia reduzido -20%, habilidades carregam +15% mais rapido
 *
 * GameplayTag: Ability.Passive.Species.Khael.CanalizacaoMistica
 * NetExecutionPolicy: ServerInitiated (server applies passive effects)
 *
 * Activation: Automatic on species assignment (KhaaosGameMode::AssignSpecies)
 * Duration: Persistent (infinite while species is active)
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Khael Passive"))
class UKhaaosAbility_KhaelPassive : public UKhaaosGameplayAbility
{
	GENERATED_BODY()

public:
	UKhaaosAbility_KhaelPassive();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

	/** Energy cost reduction percentage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Khael")
	float EnergyCostReduction = 0.20f;

	/** Cooldown reduction percentage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Passive|Khael")
	float CooldownReduction = 0.15f;

};
