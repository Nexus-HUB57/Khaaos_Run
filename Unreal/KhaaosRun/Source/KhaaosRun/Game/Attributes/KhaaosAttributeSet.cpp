// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"
#include "AbilitySystemComponent.h"
#include "GameplayEffectExtension.h"
#include "Net/UnrealNetwork.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosAttributeSet::UKhaaosAttributeSet()
{
        InitFromSchemaDefaults();
}

// ─── Mutation Methods ───────────────────────────────────────────────────────────

float UKhaaosAttributeSet::CalculateSpeciesMitigatedDamage(
	float DamageAmount,
	const FGameplayTag& DamageType,
	float ProjectileReduction,
	float ExplosionReduction)
{
	if (DamageAmount <= 0.0f)
	{
		return 0.0f;
	}

	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	float Reduction = 0.0f;
	if (DamageType.IsValid() && DamageType == Tags.Effect_Damage_Bullet)
	{
		Reduction = ProjectileReduction;
	}
	else if (DamageType.IsValid() && DamageType == Tags.Effect_Damage_Explosion)
	{
		Reduction = ExplosionReduction;
	}

	return DamageAmount * (1.0f - FMath::Clamp(Reduction, 0.0f, 1.0f));
}

float UKhaaosAttributeSet::ApplyDamage(float DamageAmount, AActor* Instigator)
{
	return ApplyDamageOfType(DamageAmount, Instigator, FGameplayTag());
}

float UKhaaosAttributeSet::ApplyDamageOfType(
	float DamageAmount,
	AActor* Instigator,
	const FGameplayTag& DamageType)
{
	if (UAbilitySystemComponent* OwnerASC = GetOwningAbilitySystemComponent())
	{
		if (AActor* OwnerActor = OwnerASC->GetOwnerActor(); OwnerActor && !OwnerActor->HasAuthority()) return 0.0f;
	}
        if (DamageAmount <= 0.0f)
        {
                return 0.0f;
        }

	DamageAmount = CalculateSpeciesMitigatedDamage(
		DamageAmount,
		DamageType,
		GetOnithProjectileDamageReduction(),
		GetOnithExplosionDamageReduction());
	if (DamageAmount <= 0.0f)
	{
		return 0.0f;
	}

        // Reduce damage by defense rating (diminishing returns)
        float EffectiveDamage = DamageAmount;
        if (GetDefenseRating() > 0.0f)
        {
                // Defense formula: effectiveDamage = damage * (1 - defense / (defense + 100))
                // This gives diminishing returns — 50 defense = 33% reduction, 100 = 50%, 200 = 66%
                float ReductionFactor = GetDefenseRating() / (GetDefenseRating() + 100.0f);
                EffectiveDamage = DamageAmount * (1.0f - ReductionFactor);
        }

        // Shield absorbs post-mitigation damage before the health pool.
        const float OldShield = GetShield();
        const float ShieldDamage = FMath::Min(OldShield, EffectiveDamage);
        SetShield(FMath::Clamp(OldShield - ShieldDamage, 0.0f, GetMaxShield()));
        const float HealthDamage = FMath::Max(0.0f, EffectiveDamage - ShieldDamage);
        const float OldHealth = GetHealth();
        SetHealth(FMath::Clamp(OldHealth - HealthDamage, 0.0f, GetMaxHealth()));

        const float ActualDamage = (OldShield - GetShield()) + (OldHealth - GetHealth());
        if (GetHealth() <= 0.0f && !bOutOfHealthAlreadyBroadcast)
        {
                UAbilitySystemComponent* ASC = GetOwningAbilitySystemComponent();
                AActor* OwnerActor = ASC ? ASC->GetOwnerActor() : nullptr;
                if (OwnerActor && OwnerActor->HasAuthority())
                {
                        bOutOfHealthAlreadyBroadcast = true;
                        OnOutOfHealth.Broadcast(OwnerActor, ASC->GetAvatarActor(), Instigator);
                }
        }

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAttributeSet::ApplyDamage - %.2f raw → %.2f effective (defense=%.1f)"),
                DamageAmount, ActualDamage, GetDefenseRating());

        return ActualDamage;
}

float UKhaaosAttributeSet::Heal(float HealAmount)
{
	if (UAbilitySystemComponent* OwnerASC = GetOwningAbilitySystemComponent())
	{
		if (AActor* OwnerActor = OwnerASC->GetOwnerActor(); OwnerActor && !OwnerActor->HasAuthority()) return 0.0f;
	}
        if (HealAmount <= 0.0f)
        {
                return 0.0f;
        }

        const float OldHealth = GetHealth();
        SetHealth(FMath::Clamp(GetHealth() + HealAmount, 0.0f, GetMaxHealth()));

        const float ActualHeal = GetHealth() - OldHealth;
        if (GetHealth() > 0.0f)
        {
                bOutOfHealthAlreadyBroadcast = false;
        }
        return ActualHeal;
}

int32 UKhaaosAttributeSet::GrantCredits(int32 Amount)
{
	if (UAbilitySystemComponent* OwnerASC = GetOwningAbilitySystemComponent())
	{
		if (AActor* OwnerActor = OwnerASC->GetOwnerActor(); OwnerActor && !OwnerActor->HasAuthority()) return Credits;
	}
        Credits = FMath::Max(0, Credits + Amount);

        OnAttributeChanged.Broadcast(this, TEXT("Credits"), static_cast<float>(Credits));

        return Credits;
}

bool UKhaaosAttributeSet::ConsumeEnergy(float Amount)
{
	if (UAbilitySystemComponent* OwnerASC = GetOwningAbilitySystemComponent())
	{
		if (AActor* OwnerActor = OwnerASC->GetOwnerActor(); OwnerActor && !OwnerActor->HasAuthority()) return false;
	}
        if (Amount <= 0.0f)
        {
                return true;
        }

        if (GetEnergy() < Amount)
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAttributeSet::ConsumeEnergy - Not enough energy (%.2f/%.2f)"),
                        GetEnergy(), Amount);
                return false;
        }

        SetEnergy(GetEnergy() - Amount);
        return true;
}

void UKhaaosAttributeSet::RegenerateEnergy(float Amount)
{
	if (UAbilitySystemComponent* OwnerASC = GetOwningAbilitySystemComponent())
	{
		if (AActor* OwnerActor = OwnerASC->GetOwnerActor(); OwnerActor && !OwnerActor->HasAuthority()) return;
	}
        if (Amount <= 0.0f)
        {
                return;
        }

        SetEnergy(FMath::Clamp(GetEnergy() + Amount, 0.0f, GetMaxEnergy()));
}

bool UKhaaosAttributeSet::IsAlive() const
{
        return GetHealth() > 0.0f;
}

bool UKhaaosAttributeSet::IsFullHealth() const
{
        return FMath::IsNearlyEqual(GetHealth(), GetMaxHealth());
}

void UKhaaosAttributeSet::ResetToDefaults()
{
        InitFromSchemaDefaults();
}

void UKhaaosAttributeSet::InitFromSchemaDefaults()
{
        // Defaults from schema.ts playerStats
        InitHealth(DefaultMaxHealth);
        InitMaxHealth(DefaultMaxHealth);
        InitShield(0.0f);
        InitMaxShield(0.0f);
        InitEnergy(DefaultMaxEnergy);
        InitMaxEnergy(DefaultMaxEnergy);
        Credits          = DefaultCredits;
        Speed            = DefaultSpeed;
        DamageMultiplier = 1.0f;
        InitDefenseRating(0.0f);
        InitOnithProjectileDamageReduction(0.0f);
        InitOnithExplosionDamageReduction(0.0f);
	InitAirSpeedBonus(0.0f);
	InitWaterRegenPerSecond(0.0f);
	InitHealBonusPercent(0.0f);
	InitFireRateBonus(0.0f);
	InitReloadSpeedBonus(0.0f);
        AttackRange      = 15.0f;  // 15% of map
}

void UKhaaosAttributeSet::InitializeCombatProfile(
        float InHealth, float InMaxHealth, float InShield, float InMaxShield,
        float InEnergy, float InMaxEnergy, float InSpeed)
{
        const float SafeMaxHealth = FMath::Max(InMaxHealth, 1.0f);
        const float SafeMaxShield = FMath::Max(InMaxShield, 0.0f);
        InitMaxHealth(SafeMaxHealth);
        InitHealth(FMath::Clamp(InHealth, 0.0f, SafeMaxHealth));
        InitMaxShield(SafeMaxShield);
        InitShield(FMath::Clamp(InShield, 0.0f, SafeMaxShield));
        const float SafeMaxEnergy = FMath::Max(InMaxEnergy, 0.0f);
        InitMaxEnergy(SafeMaxEnergy);
        InitEnergy(FMath::Clamp(InEnergy, 0.0f, SafeMaxEnergy));
        Speed = FMath::Max(InSpeed, 0.0f);
}

// ─── GAS Attribute callbacks and replication ────────────────────────────────────

void UKhaaosAttributeSet::PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue)
{
	Super::PreAttributeChange(Attribute, NewValue);
	if (Attribute == GetHealthAttribute()) NewValue = FMath::Clamp(NewValue, 0.0f, GetMaxHealth());
	else if (Attribute == GetMaxHealthAttribute()) NewValue = FMath::Max(NewValue, 1.0f);
	else if (Attribute == GetShieldAttribute()) NewValue = FMath::Clamp(NewValue, 0.0f, GetMaxShield());
	else if (Attribute == GetMaxShieldAttribute()) NewValue = FMath::Max(NewValue, 0.0f);
	else if (Attribute == GetEnergyAttribute()) NewValue = FMath::Clamp(NewValue, 0.0f, GetMaxEnergy());
	else if (Attribute == GetMaxEnergyAttribute()) NewValue = FMath::Max(NewValue, 0.0f);
	else if (Attribute == GetDefenseRatingAttribute()) NewValue = FMath::Max(NewValue, 0.0f);
}

void UKhaaosAttributeSet::PostAttributeChange(const FGameplayAttribute& Attribute, float OldValue, float NewValue)
{
	Super::PostAttributeChange(Attribute, OldValue, NewValue);
	if (FMath::IsNearlyEqual(OldValue, NewValue)) return;
	if (Attribute == GetMaxHealthAttribute())
	{
		if (GetHealth() > NewValue) SetHealth(NewValue);
		OnAttributeChanged.Broadcast(this, TEXT("MaxHealth"), NewValue);
	}
	else if (Attribute == GetMaxShieldAttribute())
	{
		if (GetShield() > NewValue) SetShield(NewValue);
		OnAttributeChanged.Broadcast(this, TEXT("MaxShield"), NewValue);
	}
	else if (Attribute == GetHealthAttribute())
	{
		if (NewValue > 0.0f) bOutOfHealthAlreadyBroadcast = false;
		OnAttributeChanged.Broadcast(this, TEXT("Health"), NewValue);
	}
	else if (Attribute == GetShieldAttribute())
	{
		OnAttributeChanged.Broadcast(this, TEXT("Shield"), NewValue);
	}
	else if (Attribute == GetMaxEnergyAttribute())
	{
		if (GetEnergy() > NewValue) SetEnergy(NewValue);
		OnAttributeChanged.Broadcast(this, TEXT("MaxEnergy"), NewValue);
	}
	else if (Attribute == GetEnergyAttribute())
	{
		OnAttributeChanged.Broadcast(this, TEXT("Energy"), NewValue);
	}
	else if (Attribute == GetDefenseRatingAttribute())
	{
		OnAttributeChanged.Broadcast(this, TEXT("DefenseRating"), NewValue);
	}
}

void UKhaaosAttributeSet::PostGameplayEffectExecute(const FGameplayEffectModCallbackData& Data)
{
        Super::PostGameplayEffectExecute(Data);

        const FGameplayAttribute& ModifiedAttribute = Data.EvaluatedData.Attribute;
        if (ModifiedAttribute == GetMaxHealthAttribute() || ModifiedAttribute == GetMaxShieldAttribute() || ModifiedAttribute == GetShieldAttribute())
        {
                return;
        }

        if (ModifiedAttribute != GetHealthAttribute())
        {
                return;
        }

        if (GetHealth() > 0.0f)
        {
                bOutOfHealthAlreadyBroadcast = false;
                return;
        }

        UAbilitySystemComponent* ASC = GetOwningAbilitySystemComponent();
        AActor* OwnerActor = ASC ? ASC->GetOwnerActor() : nullptr;
        if (!OwnerActor || !OwnerActor->HasAuthority() || bOutOfHealthAlreadyBroadcast)
        {
                return;
        }

        bOutOfHealthAlreadyBroadcast = true;
        const FGameplayEffectContextHandle& EffectContext = Data.EffectSpec.GetContext();
        OnOutOfHealth.Broadcast(
                OwnerActor,
                ASC->GetAvatarActor(),
                EffectContext.GetEffectCauser());
}

void UKhaaosAttributeSet::OnRep_Health(const FGameplayAttributeData& OldHealth)
{
        GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, Health, OldHealth);
        OnAttributeChanged.Broadcast(this, TEXT("Health"), GetHealth());
}

void UKhaaosAttributeSet::OnRep_MaxHealth(const FGameplayAttributeData& OldMaxHealth)
{
        GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, MaxHealth, OldMaxHealth);
        OnAttributeChanged.Broadcast(this, TEXT("MaxHealth"), GetMaxHealth());
}

void UKhaaosAttributeSet::OnRep_Shield(const FGameplayAttributeData& OldShield)
{
        GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, Shield, OldShield);
        OnAttributeChanged.Broadcast(this, TEXT("Shield"), GetShield());
}

void UKhaaosAttributeSet::OnRep_MaxShield(const FGameplayAttributeData& OldMaxShield)
{
        GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, MaxShield, OldMaxShield);
        OnAttributeChanged.Broadcast(this, TEXT("MaxShield"), GetMaxShield());
}

void UKhaaosAttributeSet::OnRep_Energy(const FGameplayAttributeData& OldEnergy)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, Energy, OldEnergy);
	OnAttributeChanged.Broadcast(this, TEXT("Energy"), GetEnergy());
}

void UKhaaosAttributeSet::OnRep_MaxEnergy(const FGameplayAttributeData& OldMaxEnergy)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, MaxEnergy, OldMaxEnergy);
	OnAttributeChanged.Broadcast(this, TEXT("MaxEnergy"), GetMaxEnergy());
}

void UKhaaosAttributeSet::OnRep_DefenseRating(const FGameplayAttributeData& OldDefenseRating)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, DefenseRating, OldDefenseRating);
	OnAttributeChanged.Broadcast(this, TEXT("DefenseRating"), GetDefenseRating());
}

void UKhaaosAttributeSet::OnRep_OnithProjectileDamageReduction(const FGameplayAttributeData& OldReduction)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, OnithProjectileDamageReduction, OldReduction);
	OnAttributeChanged.Broadcast(this, TEXT("OnithProjectileDamageReduction"), GetOnithProjectileDamageReduction());
}

void UKhaaosAttributeSet::OnRep_OnithExplosionDamageReduction(const FGameplayAttributeData& OldReduction)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UKhaaosAttributeSet, OnithExplosionDamageReduction, OldReduction);
	OnAttributeChanged.Broadcast(this, TEXT("OnithExplosionDamageReduction"), GetOnithExplosionDamageReduction());
}

void UKhaaosAttributeSet::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, Health, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, MaxHealth, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, Shield, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, MaxShield, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, Energy, COND_OwnerOnly, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, MaxEnergy, COND_OwnerOnly, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, DefenseRating, COND_OwnerOnly, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, OnithProjectileDamageReduction, COND_OwnerOnly, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosAttributeSet, OnithExplosionDamageReduction, COND_OwnerOnly, REPNOTIFY_Always);
}
