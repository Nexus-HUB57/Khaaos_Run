// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Combat/KhaaosDamageTypes.h"
#include "KhaaosRun.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Bullet
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Bullet::UKhaaosDamageType_Bullet()
    : Super()
    , HeadshotMultiplier(2.0f)
    , FalloffCurve(nullptr)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Bullet: Constructed (Headshot=%.1fx)"), HeadshotMultiplier);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Explosion
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Explosion::UKhaaosDamageType_Explosion()
    : Super()
    , Radius(500.0f)
    , InnerRadius(100.0f)
    , KnockbackMagnitude(1000.0f)
    , FalloffExponent(2.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Explosion: Constructed (Radius=%.0f Inner=%.0f Knockback=%.0f)"),
        Radius, InnerRadius, KnockbackMagnitude);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Zone
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Zone::UKhaaosDamageType_Zone()
    : Super()
    , PhaseIndex(0)
    , DamagePerTick(1.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Zone: Constructed (Phase=%d DPT=%.1f)"), PhaseIndex, DamagePerTick);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Melee
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Melee::UKhaaosDamageType_Melee()
    : Super()
    , AttackType(EKhaaosMeleeAttackType::Slash)
    , bCanExecute(false)
    , KnockbackMagnitude(300.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Melee: Constructed (Type=%d Knockback=%.0f)"),
        static_cast<int32>(AttackType), KnockbackMagnitude);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Bleed
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Bleed::UKhaaosDamageType_Bleed()
    : Super()
    , TickRate(0.5f)
    , Duration(5.0f)
    , DamagePerTick(2.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Bleed: Constructed (TickRate=%.1f Duration=%.1f DPT=%.1f)"),
        TickRate, Duration, DamagePerTick);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Pulso
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Pulso::UKhaaosDamageType_Pulso()
    : Super()
    , RarityBoost(2.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Pulso: Constructed (RarityBoost=%.1f)"), RarityBoost);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Fall
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Fall::UKhaaosDamageType_Fall()
    : Super()
    , MinFallDistance(500.0f)
    , FallDistance(0.0f)
    , VelocityAtImpact(0.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Fall: Constructed (MinDist=%.0f)"), MinFallDistance);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Ability
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDamageType_Ability::UKhaaosDamageType_Ability()
    : Super()
    , AbilityID(NAME_None)
    , CooldownReductionPct(0.0f)
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDamageType_Ability: Constructed (CDR=%.0f%%)"), CooldownReductionPct * 100.0f);
}
