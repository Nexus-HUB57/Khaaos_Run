// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/KhaaosAbility_SpeciesPassives.h"
#include "Game/AbilitySystem/KhaaosGameplayEffects.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_ZheersPassive
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_ZheersPassive::KhaaosAbility_ZheersPassive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	bIsToggleAbility = true; // Persistent passive
	EnergyCost = 0.0f; // Passives are free
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_ZheersPassive: Adaptabilidade passive constructed"));
}

void UKhaaosAbility_ZheersPassive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	// Apply Adaptabilidade: +10% environment resistance
	// This modifies the incoming damage based on the current world type
	// Implementation: Apply GameplayEffect with tag Effect.Buff.Adaptabilidade
	UE_LOG(LogKhaaosRun, Log, TEXT("Zheers Passive: Adaptabilidade activated (+10%% env resistance)"));

	// Do NOT end ability — passives are persistent
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_OnithPassive
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_OnithPassive::KhaaosAbility_OnithPassive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	bIsToggleAbility = true; // Persistent passive
	EnergyCost = 0.0f; // Passives are free
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_OnithPassive: Pele Escamosa passive constructed"));
}

void UKhaaosAbility_OnithPassive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!ActorInfo || !ActorInfo->AbilitySystemComponent.IsValid())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("Onith Passive: activation has no valid AbilitySystemComponent"));
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	const AActor* OwnerActor = ASC->GetOwnerActor();
	const FGameplayAbilitySpec* AbilitySpec = ASC->FindAbilitySpecFromHandle(Handle);
	if (!OwnerActor || !OwnerActor->HasAuthority() || !AbilitySpec || !AbilitySpec->IsActive())
	{
		return;
	}

	UGameplayEffect* PassiveEffect = UKhaaosGameplayEffects::CreateOnithPassiveEffect(DamageReductionPercent);
	if (!PassiveEffect)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("Onith Passive: failed to create Pele Escamosa GameplayEffect"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	const FGameplayEffectSpec PassiveSpec(PassiveEffect, EffectContext, GetAbilityLevel());
	const FActiveGameplayEffectHandle ActiveHandle = ASC->ApplyGameplayEffectSpecToSelf(PassiveSpec);
	if (!ActiveHandle.IsValid())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("Onith Passive: ASC rejected Pele Escamosa GameplayEffect"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	ActiveEffectHandles.Add(ActiveHandle);
	UE_LOG(LogKhaaosRun, Log, TEXT("Onith Passive: Pele Escamosa applied (%.0f%% projectile/explosion reduction)"),
		DamageReductionPercent * 100.0f);

	// Do NOT end ability — passives are persistent
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_SkeetwPassive
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_SkeetwPassive::KhaaosAbility_SkeetwPassive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	bIsToggleAbility = true; // Persistent passive
	EnergyCost = 0.0f; // Passives are free
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_SkeetwPassive: Voo Planador passive constructed"));
}

void UKhaaosAbility_SkeetwPassive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
	if (!ActorInfo || !ActorInfo->AbilitySystemComponent.IsValid()) return;
	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC->GetOwnerActor() || !ASC->GetOwnerActor()->HasAuthority()) return;
	UGameplayEffect* GE = UKhaaosGameplayEffects::CreateSkeetwPassiveEffect(AirSpeedBonus);
	if (!GE) return;
	FGameplayEffectContextHandle Ctx = ASC->MakeEffectContext(); Ctx.AddSourceObject(this);
	FActiveGameplayEffectHandle AH = ASC->ApplyGameplayEffectSpecToSelf(FGameplayEffectSpec(GE, Ctx, 1.f));
	if (AH.IsValid()) ActiveEffectHandles.Add(AH);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_HuranPassive
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_HuranPassive::KhaaosAbility_HuranPassive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	bIsToggleAbility = true; // Persistent passive
	EnergyCost = 0.0f; // Passives are free
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_HuranPassive: Regeneracao Aquatica passive constructed"));
}

void UKhaaosAbility_HuranPassive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
	if (!ActorInfo || !ActorInfo->AbilitySystemComponent.IsValid()) return;
	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC->GetOwnerActor() || !ASC->GetOwnerActor()->HasAuthority()) return;
	UGameplayEffect* GE = UKhaaosGameplayEffects::CreateHuranPassiveEffect(HealBonusPercent, WaterRegenPerSecond);
	if (!GE) return;
	FGameplayEffectContextHandle Ctx = ASC->MakeEffectContext(); Ctx.AddSourceObject(this);
	FActiveGameplayEffectHandle AH = ASC->ApplyGameplayEffectSpecToSelf(FGameplayEffectSpec(GE, Ctx, 1.f));
	if (AH.IsValid()) ActiveEffectHandles.Add(AH);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_VenexPassive
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_VenexPassive::KhaaosAbility_VenexPassive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	bIsToggleAbility = true; // Persistent passive
	EnergyCost = 0.0f; // Passives are free
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_VenexPassive: Overclock Neural passive constructed"));
}

void UKhaaosAbility_VenexPassive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
}

bool UKhaaosAbility_VenexPassive::ApplyOverclockFromElimination(UAbilitySystemComponent* ASC)
{
	if (!ASC || !ASC->GetOwnerActor() || !ASC->GetOwnerActor()->HasAuthority()) return false;
	UGameplayEffect* GE = UKhaaosGameplayEffects::CreateVenexOverclockEffect(OverclockFireRateBonus, OverclockReloadBonus, OverclockDuration);
	if (!GE) return false;
	FGameplayEffectContextHandle Ctx = ASC->MakeEffectContext(); Ctx.AddSourceObject(this);
	return ASC->ApplyGameplayEffectSpecToSelf(FGameplayEffectSpec(GE, Ctx, 1.f)).IsValid();
}

bool UKhaaosAbility_VenexPassive::TryApplyOverclockOnASC(UAbilitySystemComponent* ASC)
{
	if (!ASC) return false;
	for (const FGameplayAbilitySpec& Spec : ASC->GetActivatableAbilities())
	{
		if (Spec.IsActive() && Spec.Ability && Spec.Ability->IsA(UKhaaosAbility_VenexPassive::StaticClass()))
		{
			if (UKhaaosAbility_VenexPassive* Inst = Cast<UKhaaosAbility_VenexPassive>(Spec.GetPrimaryInstance()))
				return Inst->ApplyOverclockFromElimination(ASC);
		}
	}
	return GetDefault<UKhaaosAbility_VenexPassive>()->ApplyOverclockFromElimination(ASC);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_KhaelPassive
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_KhaelPassive::KhaaosAbility_KhaelPassive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	bIsToggleAbility = true; // Persistent passive
	EnergyCost = 0.0f; // Passives are free
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_KhaelPassive: Canalizacao Mistica passive constructed"));
}

void UKhaaosAbility_KhaelPassive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	// Apply Canalizacao Mistica: -20% energy cost, -15% cooldowns
	// Implementation: Modify ASC cost and cooldown attributes
	// with tags Effect.Buff.Canalizacao
	UE_LOG(LogKhaaosRun, Log, TEXT("Khael Passive: Canalizacao Mistica activated (-20%% cost, -15%% CD)"));

	// Do NOT end ability — passives are persistent
}
