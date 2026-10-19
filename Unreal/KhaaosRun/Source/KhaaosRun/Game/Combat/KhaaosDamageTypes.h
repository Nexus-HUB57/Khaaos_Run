// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/DamageType.h"
#include "Curves/CurveFloat.h"
#include "KhaaosDamageTypes.generated.h"

// ─── Melee Attack Type ────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosMeleeAttackType : uint8
{
    Slash   UMETA(DisplayName = "SLASH"),
    Stab    UMETA(DisplayName = "STAB"),
    Blunt   UMETA(DisplayName = "BLUNT")
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Bullet
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bullet damage type with headshot multiplier and distance falloff.
 *
 * Free Fire Parity:
 *   - Headshot multiplier varies per weapon (sniper 2.5x, AR 2.0x, pistol 1.5x)
 *   - Distance falloff curve for realistic bullet damage drop
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Bullet : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Bullet();

    /** Headshot damage multiplier. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float HeadshotMultiplier;

    /** Distance falloff curve (X=distance in meters, Y=damage fraction 0-1). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    UCurveFloat* FalloffCurve;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Explosion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Explosion damage type with radial falloff and knockback.
 *
 * Free Fire Parity:
 *   - Grenade radius ~5m, inner radius ~1m for full damage
 *   - Knockback magnitude applies impulse to hit actors
 *   - Falloff exponent controls radial damage curve (2.0 = quadratic)
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Explosion : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Explosion();

    /** Outer radius of explosion damage. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float Radius;

    /** Inner radius (full damage zone). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float InnerRadius;

    /** Knockback magnitude applied to hit actors. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float KnockbackMagnitude;

    /** Falloff exponent for radial damage (1=linear, 2=quadratic). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float FalloffExponent;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Zone
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Zone (safe zone / storm) damage type with phase escalation.
 *
 * Free Fire Parity:
 *   - Zone damage increases with each phase
 *   - DamagePerTick applied every tick interval
 *   - PhaseIndex tracks current zone shrink phase
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Zone : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Zone();

    /** Current zone phase index (0=first, 1=second, etc.). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    int32 PhaseIndex;

    /** Damage applied per tick. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float DamagePerTick;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Melee
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Melee damage type with attack variant and execution support.
 *
 * Free Fire Parity:
 *   - Slash: katana, machete — wider arc, moderate damage
 *   - Stab: knife — narrow, high damage, can trigger execution
 *   - Blunt: baseball bat — knockback, stun
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Melee : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Melee();

    /** Type of melee attack. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    EKhaaosMeleeAttackType AttackType;

    /** Whether this attack can trigger an execution (finisher). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    uint8 bCanExecute : 1;

    /** Knockback magnitude (for blunt attacks). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float KnockbackMagnitude;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Bleed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bleed (DoT) damage type with tick rate and duration.
 *
 * Free Fire Parity:
 *   - Applied by certain weapon perks and abilities
 *   - DamagePerTick applied every TickRate seconds for Duration seconds
 *   - Can be cleansed by healing items
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Bleed : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Bleed();

    /** Time between damage ticks (seconds). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float TickRate;

    /** Total duration of the bleed effect (seconds). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float Duration;

    /** Damage applied per tick. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float DamagePerTick;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Pulso
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pulso (pulse/energy) damage type with rarity-based boost.
 *
 * Free Fire Parity:
 *   - Species-specific energy damage (e.g., Khaaos species abilities)
 *   - RarityBoost multiplier scales with weapon rarity
 *   - Can interact with shields differently than bullet damage
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Pulso : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Pulso();

    /** Rarity boost multiplier (scales damage based on weapon rarity). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float RarityBoost;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Fall
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fall damage type with distance and velocity tracking.
 *
 * Free Fire Parity:
 *   - No fall damage in most BR modes (disabled by default)
 *   - Enabled in specific modes / custom lobbies
 *   - MinFallDistance threshold before damage applies
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Fall : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Fall();

    /** Minimum fall distance to trigger damage. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float MinFallDistance;

    /** Fall distance of the impact. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float FallDistance;

    /** Velocity at impact (cm/s). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float VelocityAtImpact;
};

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDamageType_Ability
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ability damage type with cooldown interaction.
 *
 * Free Fire Parity:
 *   - Species ability damage (e.g., air strike, drone, shield deploy)
 *   - AbilityID links to the ability system for cooldown queries
 *   - CooldownReductionPct: some abilities reduce other cooldowns on hit
 */
UCLASS(BlueprintType, Blueprintable, ClassGroup=(Khaaos))
class UKhaaosDamageType_Ability : public UDamageType
{
    GENERATED_BODY()

public:
    UKhaaosDamageType_Ability();

    /** ID of the ability that caused this damage. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    FName AbilityID;

    /** Cooldown reduction percentage applied on hit (0.0 = none, 0.5 = 50%). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Damage")
    float CooldownReductionPct;
};
