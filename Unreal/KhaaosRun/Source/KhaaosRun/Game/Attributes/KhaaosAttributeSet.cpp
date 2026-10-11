// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Attributes/KhaaosAttributeSet.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosAttributeSet::UKhaaosAttributeSet()
{
        InitFromSchemaDefaults();
}

// ─── Mutation Methods ───────────────────────────────────────────────────────────

float UKhaaosAttributeSet::ApplyDamage(float DamageAmount, AActor* Instigator)
{
        if (DamageAmount <= 0.0f)
        {
                return 0.0f;
        }

        // Reduce damage by defense rating (diminishing returns)
        float EffectiveDamage = DamageAmount;
        if (DefenseRating > 0.0f)
        {
                // Defense formula: effectiveDamage = damage * (1 - defense / (defense + 100))
                // This gives diminishing returns — 50 defense = 33% reduction, 100 = 50%, 200 = 66%
                float ReductionFactor = DefenseRating / (DefenseRating + 100.0f);
                EffectiveDamage = DamageAmount * (1.0f - ReductionFactor);
        }

        // Apply damage multiplier from instigator (via weapon)
        EffectiveDamage *= DamageMultiplier;

        float OldHealth = Health;
        SetHealth(FMath::Clamp(Health - EffectiveDamage, 0.0f, MaxHealth));

        float ActualDamage = OldHealth - Health;

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAttributeSet::ApplyDamage - %.2f raw → %.2f effective (defense=%.1f)"),
                DamageAmount, ActualDamage, DefenseRating);

        return ActualDamage;
}

float UKhaaosAttributeSet::Heal(float HealAmount)
{
        if (HealAmount <= 0.0f)
        {
                return 0.0f;
        }

        float OldHealth = Health;
        SetHealth(FMath::Clamp(Health + HealAmount, 0.0f, MaxHealth));

        float ActualHeal = Health - OldHealth;
        return ActualHeal;
}

int32 UKhaaosAttributeSet::GrantCredits(int32 Amount)
{
        Credits = FMath::Max(0, Credits + Amount);

        OnAttributeChanged.Broadcast(this, TEXT("Credits"), static_cast<float>(Credits));

        return Credits;
}

bool UKhaaosAttributeSet::ConsumeEnergy(float Amount)
{
        if (Amount <= 0.0f)
        {
                return true;
        }

        if (Energy < Amount)
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAttributeSet::ConsumeEnergy - Not enough energy (%.2f/%.2f)"),
                        Energy, Amount);
                return false;
        }

        SetEnergy(Energy - Amount);
        return true;
}

void UKhaaosAttributeSet::RegenerateEnergy(float Amount)
{
        if (Amount <= 0.0f)
        {
                return;
        }

        SetEnergy(FMath::Clamp(Energy + Amount, 0.0f, MaxEnergy));
}

bool UKhaaosAttributeSet::IsAlive() const
{
        return Health > 0.0f;
}

bool UKhaaosAttributeSet::IsFullHealth() const
{
        return FMath::IsNearlyEqual(Health, MaxHealth);
}

void UKhaaosAttributeSet::ResetToDefaults()
{
        InitFromSchemaDefaults();
}

void UKhaaosAttributeSet::InitFromSchemaDefaults()
{
        // Defaults from schema.ts playerStats
        Health           = DefaultMaxHealth;
        MaxHealth        = DefaultMaxHealth;
        Energy           = DefaultMaxEnergy;
        MaxEnergy        = DefaultMaxEnergy;
        Credits          = DefaultCredits;
        Speed            = DefaultSpeed;
        DamageMultiplier = 1.0f;
        DefenseRating    = 0.0f;
        AttackRange      = 15.0f;  // 15% of map
}

// ─── Internal Setters ───────────────────────────────────────────────────────────

void UKhaaosAttributeSet::SetHealth(float NewHealth)
{
        float OldHealth = Health;
        Health = NewHealth;

        if (!FMath::IsNearlyEqual(OldHealth, Health))
        {
                OnAttributeChanged.Broadcast(this, TEXT("Health"), Health);
        }
}

void UKhaaosAttributeSet::SetEnergy(float NewEnergy)
{
        float OldEnergy = Energy;
        Energy = NewEnergy;

        if (!FMath::IsNearlyEqual(OldEnergy, Energy))
        {
                OnAttributeChanged.Broadcast(this, TEXT("Energy"), Energy);
        }
}
