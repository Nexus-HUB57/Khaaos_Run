// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosGameplayEffects.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "GameplayEffect.h"
#include "GameplayEffectTypes.h"

// ─── Internal Helpers ──────────────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateBaseEffect(const FString& EffectName)
{
	UGameplayEffect* Effect = NewObject<UGameplayEffect>(GetTransientPackage(), FName(*EffectName));
	Effect->bCanStack = false;
	return Effect;
}

FGameplayTag UKhaaosGameplayEffects::GetAttributeTagForCost(EKhaaosCostType CostType)
{
	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();

	switch (CostType)
	{
	case EKhaaosCostType::Health:
		return FGameplayTag::RequestGameplayTag(FName("Attribute.Health"));
	case EKhaaosCostType::Energy:
		return FGameplayTag::RequestGameplayTag(FName("Attribute.Energy"));
	case EKhaaosCostType::Credits:
		return FGameplayTag::RequestGameplayTag(FName("Attribute.Credits"));
	default:
		return FGameplayTag();
	}
}

// ─── CreateCooldownEffect ─────────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateCooldownEffect(FGameplayTag CooldownTag, float Duration)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_Cooldown"));
	if (!Effect)
	{
		return nullptr;
	}

	// HasDuration policy
	FGameplayEffectSpecDurationSpec DurationSpec;
	DurationSpec.Duration = FScalableFloat(Duration);
	Effect->DurationPolicy = EGameplayEffectDurationType::HasDuration;
	Effect->DurationMagnitude = DurationSpec;

	// Grant the cooldown tag so GAS can query it
	FGameplayTagContainer GrantedTags;
	GrantedTags.AddTag(CooldownTag);
	Effect->GrantedTags = GrantedTags;

	return Effect;
}

// ─── CreateCostEffect ─────────────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateCostEffect(EKhaaosCostType Attribute, float Amount)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_Cost"));
	if (!Effect)
	{
		return nullptr;
	}

	// Instant policy — cost is applied immediately
	Effect->DurationPolicy = EGameplayEffectDurationType::Instant;

	// Modifier: subtract Amount from the attribute
	FGameplayModifierInfo ModifierInfo;
	ModifierInfo.Attribute = FGameplayAttribute(); // Set via tag lookup at apply time
	ModifierInfo.ModifierOp = EGameplayModOp::Additive;
	ModifierInfo.ModifierMagnitude = FScalableFloat(-Amount);

	Effect->Modifiers.Add(ModifierInfo);

	// Store attribute tag in GrantedTags for downstream resolution
	FGameplayTag AttributeTag = GetAttributeTagForCost(Attribute);
	if (AttributeTag.IsValid())
	{
		FGameplayTagContainer RequiredTags;
		RequiredTags.AddTag(AttributeTag);
		Effect->RequiredTags = RequiredTags;
	}

	return Effect;
}

// ─── CreateBuffEffect ─────────────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateBuffEffect(FGameplayTag BuffTag, float Duration, float Magnitude)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_Buff"));
	if (!Effect)
	{
		return nullptr;
	}

	// HasDuration policy
	FGameplayEffectSpecDurationSpec DurationSpec;
	DurationSpec.Duration = FScalableFloat(Duration);
	Effect->DurationPolicy = EGameplayEffectDurationType::HasDuration;
	Effect->DurationMagnitude = DurationSpec;

	// Grant the buff tag
	FGameplayTagContainer GrantedTags;
	GrantedTags.AddTag(BuffTag);
	Effect->GrantedTags = GrantedTags;

	// Modifier: additive buff magnitude
	FGameplayModifierInfo ModifierInfo;
	ModifierInfo.ModifierOp = EGameplayModOp::Additive;
	ModifierInfo.ModifierMagnitude = FScalableFloat(Magnitude);
	Effect->Modifiers.Add(ModifierInfo);

	// Allow stacking by duration for buffs
	Effect->StackingType = EGameplayEffectStackingType::StackByDuration;
	Effect->StackLimitCount = 5;
	Effect->bCanStack = true;

	return Effect;
}

// ─── CreateDebuffEffect ──────────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateDebuffEffect(FGameplayTag DebuffTag, float Duration, float Magnitude)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_Debuff"));
	if (!Effect)
	{
		return nullptr;
	}

	// HasDuration policy
	FGameplayEffectSpecDurationSpec DurationSpec;
	DurationSpec.Duration = FScalableFloat(Duration);
	Effect->DurationPolicy = EGameplayEffectDurationType::HasDuration;
	Effect->DurationMagnitude = DurationSpec;

	// Grant the debuff tag
	FGameplayTagContainer GrantedTags;
	GrantedTags.AddTag(DebuffTag);
	Effect->GrantedTags = GrantedTags;

	// Modifier: negative magnitude (subtractive debuff)
	FGameplayModifierInfo ModifierInfo;
	ModifierInfo.ModifierOp = EGameplayModOp::Additive;
	ModifierInfo.ModifierMagnitude = FScalableFloat(-Magnitude);
	Effect->Modifiers.Add(ModifierInfo);

	// Debuffs stack by adding duration
	Effect->StackingType = EGameplayEffectStackingType::StackByDuration;
	Effect->StackLimitCount = 10;
	Effect->bCanStack = true;

	return Effect;
}

// ─── CreateHealOverTimeEffect ─────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateHealOverTimeEffect(float TotalHeal, float Duration)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_HealOverTime"));
	if (!Effect)
	{
		return nullptr;
	}

	// HasDuration policy
	FGameplayEffectSpecDurationSpec DurationSpec;
	DurationSpec.Duration = FScalableFloat(Duration);
	Effect->DurationPolicy = EGameplayEffectDurationType::HasDuration;
	Effect->DurationMagnitude = DurationSpec;

	// Grant HealOverTime tag
	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	FGameplayTagContainer GrantedTags;
	GrantedTags.AddTag(Tags.Effect_Buff_HealOverTime);
	Effect->GrantedTags = GrantedTags;

	// Periodic modifier: heal per second
	const float HealPerSecond = TotalHeal / FMath::Max(Duration, KINDA_SMALL_NUMBER);

	FGameplayModifierInfo ModifierInfo;
	ModifierInfo.ModifierOp = EGameplayModOp::Additive;
	ModifierInfo.ModifierMagnitude = FScalableFloat(HealPerSecond);
	Effect->Modifiers.Add(ModifierInfo);

	// Period configuration
	Effect->Period = FScalableFloat(1.0f); // Apply every 1 second
	Effect->bExecutePeriodicEffectOnApplication = true;

	return Effect;
}

// ─── CreateDamageEffect ──────────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateDamageEffect(float Damage, FGameplayTag DamageType)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_Damage"));
	if (!Effect)
	{
		return nullptr;
	}

	// Instant policy — damage is applied immediately
	Effect->DurationPolicy = EGameplayEffectDurationType::Instant;

	// Grant the damage type tag
	FGameplayTagContainer GrantedTags;
	if (DamageType.IsValid())
	{
		GrantedTags.AddTag(DamageType);
	}
	Effect->GrantedTags = GrantedTags;

	// Modifier: subtract damage from Health
	FGameplayModifierInfo ModifierInfo;
	ModifierInfo.Attribute = UKhaaosAttributeSet::GetHealthAttribute();
	ModifierInfo.ModifierOp = EGameplayModOp::Additive;
	ModifierInfo.ModifierMagnitude = FScalableFloat(-Damage);
	Effect->Modifiers.Add(ModifierInfo);

	return Effect;
}

// ─── CreateZoneDamageEffect ──────────────────────────────────────────────────

UGameplayEffect* UKhaaosGameplayEffects::CreateZoneDamageEffect(float DamagePerHit)
{
	UGameplayEffect* Effect = CreateBaseEffect(TEXT("GE_ZoneDamage"));
	if (!Effect)
	{
		return nullptr;
	}

	// GameMode owns the tick; each application represents one instant hit.
	Effect->DurationPolicy = EGameplayEffectDurationType::Instant;

	// Grant zone damage tag
	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	FGameplayTagContainer GrantedTags;
	GrantedTags.AddTag(Tags.Effect_Damage_Zone);
	Effect->GrantedTags = GrantedTags;

	FGameplayEffectCue ZoneDamageCue;
	ZoneDamageCue.GameplayCueTag = Tags.GameplayCue_Damage_Zone;
	Effect->GameplayCues.Add(ZoneDamageCue);

	// Single modifier: subtract this tick's damage from Health.
	FGameplayModifierInfo ModifierInfo;
	ModifierInfo.Attribute = UKhaaosAttributeSet::GetHealthAttribute();
	ModifierInfo.ModifierOp = EGameplayModOp::Additive;
	ModifierInfo.ModifierMagnitude = FScalableFloat(-DamagePerHit);
	Effect->Modifiers.Add(ModifierInfo);

	return Effect;
}
