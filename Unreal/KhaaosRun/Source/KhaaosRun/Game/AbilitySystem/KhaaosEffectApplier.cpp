// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosEffectApplier.h"
#include "Game/AbilitySystem/KhaaosGameplayEffects.h"
#include "AbilitySystemComponent.h"
#include "GameplayEffect.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosEffectApplier::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogTemp, Log, TEXT("KhaaosEffectApplier: Initialized"));
}

void UKhaaosEffectApplier::Deinitialize()
{
	UE_LOG(LogTemp, Log, TEXT("KhaaosEffectApplier: Deinitialized"));
	Super::Deinitialize();
}

// ─── Internal Helper ──────────────────────────────────────────────────────────

FActiveGameplayEffectHandle UKhaaosEffectApplier::ApplyEffectCDO(UAbilitySystemComponent* ASC, UGameplayEffect* EffectCDO)
{
	if (!ASC || !EffectCDO)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEffectApplier::ApplyEffectCDO - Invalid ASC or EffectCDO"));
		return FActiveGameplayEffectHandle();
	}

	const FGameplayEffectSpecHandle SpecHandle = ASC->MakeOutgoingSpec(
		EffectCDO->GetClass(),
		1.0f,
		ASC->MakeEffectContext()
	);

	if (!SpecHandle.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEffectApplier::ApplyEffectCDO - Failed to create spec"));
		return FActiveGameplayEffectHandle();
	}

	return ASC->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data);
}

// ─── Apply Cooldown ───────────────────────────────────────────────────────────

FActiveGameplayEffectHandle UKhaaosEffectApplier::ApplyCooldown(UAbilitySystemComponent* ASC, FGameplayTag CooldownTag, float Duration)
{
	if (!CooldownTag.IsValid() || Duration <= 0.0f)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEffectApplier::ApplyCooldown - Invalid tag or duration"));
		return FActiveGameplayEffectHandle();
	}

	UGameplayEffect* CooldownGE = UKhaaosGameplayEffects::CreateCooldownEffect(CooldownTag, Duration);
	return ApplyEffectCDO(ASC, CooldownGE);
}

// ─── Apply Cost ───────────────────────────────────────────────────────────────

FActiveGameplayEffectHandle UKhaaosEffectApplier::ApplyCost(UAbilitySystemComponent* ASC, EKhaaosCostType CostType, float Amount)
{
	if (Amount <= 0.0f)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEffectApplier::ApplyCost - Amount must be positive"));
		return FActiveGameplayEffectHandle();
	}

	UGameplayEffect* CostGE = UKhaaosGameplayEffects::CreateCostEffect(CostType, Amount);
	return ApplyEffectCDO(ASC, CostGE);
}

// ─── Apply Buff ───────────────────────────────────────────────────────────────

FActiveGameplayEffectHandle UKhaaosEffectApplier::ApplyBuff(UAbilitySystemComponent* ASC, FGameplayTag BuffTag, float Duration, float Magnitude)
{
	if (!BuffTag.IsValid() || Duration <= 0.0f)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEffectApplier::ApplyBuff - Invalid tag or duration"));
		return FActiveGameplayEffectHandle();
	}

	UGameplayEffect* BuffGE = UKhaaosGameplayEffects::CreateBuffEffect(BuffTag, Duration, Magnitude);
	return ApplyEffectCDO(ASC, BuffGE);
}

// ─── Apply Debuff ─────────────────────────────────────────────────────────────

FActiveGameplayEffectHandle UKhaaosEffectApplier::ApplyDebuff(UAbilitySystemComponent* ASC, FGameplayTag DebuffTag, float Duration, float Magnitude)
{
	if (!DebuffTag.IsValid() || Duration <= 0.0f)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEffectApplier::ApplyDebuff - Invalid tag or duration"));
		return FActiveGameplayEffectHandle();
	}

	UGameplayEffect* DebuffGE = UKhaaosGameplayEffects::CreateDebuffEffect(DebuffTag, Duration, Magnitude);
	return ApplyEffectCDO(ASC, DebuffGE);
}

// ─── Remove Effect ────────────────────────────────────────────────────────────

bool UKhaaosEffectApplier::RemoveEffectByTag(UAbilitySystemComponent* ASC, FGameplayTag Tag)
{
	if (!ASC || !Tag.IsValid())
	{
		return false;
	}

	FGameplayTagContainer TagContainer;
	TagContainer.AddTag(Tag);

	TArray<FActiveGameplayEffectHandle> HandlesToRemove;
	ASC->GetActiveEffects(HandlesToRemove, TagContainer);

	if (HandlesToRemove.Num() == 0)
	{
		return false;
	}

	for (const FActiveGameplayEffectHandle& Handle : HandlesToRemove)
	{
		ASC->RemoveActiveGameplayEffect(Handle);
	}

	return true;
}

// ─── Has Active Effect ────────────────────────────────────────────────────────

bool UKhaaosEffectApplier::HasActiveEffect(UAbilitySystemComponent* ASC, FGameplayTag Tag) const
{
	if (!ASC || !Tag.IsValid())
	{
		return false;
	}

	return ASC->HasMatchingGameplayTag(Tag);
}

// ─── Get Remaining Time ──────────────────────────────────────────────────────

float UKhaaosEffectApplier::GetEffectRemainingTime(UAbilitySystemComponent* ASC, FGameplayTag Tag) const
{
	if (!ASC || !Tag.IsValid())
	{
		return 0.0f;
	}

	FGameplayTagContainer TagContainer;
	TagContainer.AddTag(Tag);

	TArray<FActiveGameplayEffectHandle> ActiveHandles;
	ASC->GetActiveEffects(ActiveHandles, TagContainer);

	if (ActiveHandles.Num() == 0)
	{
		return 0.0f;
	}

	// Return remaining time for the first matching effect
	const FActiveGameplayEffect* ActiveEffect = ASC->GetActiveGameplayEffect(ActiveHandles[0]);
	if (ActiveEffect)
	{
		return ActiveEffect->GetTimeRemaining(ASC->GetWorld()->GetTimeSeconds());
	}

	return 0.0f;
}
