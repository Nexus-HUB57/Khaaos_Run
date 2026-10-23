// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayTagContainer.h"
#include "KhaaosDamageManager.generated.h"

// ─── Damage Type Enum ──────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosDamageType : uint8
{
    Bullet      UMETA(DisplayName = "BULLET"),
    Explosion   UMETA(DisplayName = "EXPLOSION"),
    Zone        UMETA(DisplayName = "ZONE"),
    Ability     UMETA(DisplayName = "ABILITY"),
    Melee       UMETA(DisplayName = "MELEE"),
    Fall        UMETA(DisplayName = "FALL"),
    Bleed       UMETA(DisplayName = "BLEED"),
    Pulso       UMETA(DisplayName = "PULSO")
};

// ─── Hit Result Struct ─────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosHitResult
{
    GENERATED_BODY()

    /** Victim player state. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    FString VictimId;

    /** Instigator player state (empty for zone/environment). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    FString InstigatorId;

    /** Damage amount after all modifiers. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    float DamageAmount = 0.0f;

    /** Type of damage. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    EKhaaosDamageType DamageType = EKhaaosDamageType::Bullet;

    /** Whether this hit was a headshot. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    uint8 bIsHeadshot : 1;

    /** Weapon used (empty for non-weapon damage). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    FName WeaponID;

    /** Distance between instigator and victim in meters. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    float DistanceM = 0.0f;

    /** Server timestamp of the hit. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Damage")
    float Timestamp = 0.0f;

    FKhaaosHitResult()
        : DamageAmount(0.0f)
        , DamageType(EKhaaosDamageType::Bullet)
        , bIsHeadshot(false)
        , DistanceM(0.0f)
        , Timestamp(0.0f)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnDamageProcessed, const FKhaaosHitResult&, HitResult, float, ActualDamageApplied);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnPlayerKilled, const FString&, VictimId, const FString&, KillerId, const FName&, WeaponID);

/**
 * UKhaaosDamageManagerComponent
 *
 * PhD-Level central damage processing system.
 *
 * Architecture:
 *   - All damage flows through ProcessDamage() — no direct ApplyDamage calls
 *   - Headshot detection: bone name check → weapon headshot multiplier
 *   - Damage validation: rate limiting, max caps per type, sanity checks
 *   - Kill tracking: auto-detects kills and broadcasts OnPlayerKilled
 *   - Damage logging: every hit logged for anti-cheat analysis
 *   - Type-specific modifiers: explosion falloff, zone escalation, etc.
 *
 * Free Fire / Fortnite Parity:
 *   - Headshot multiplier per weapon (2.0x default, sniper 2.5x)
 *   - Damage numbers float up on client (via OnDamageProcessed delegate)
 *   - Kill feed entry generated automatically
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosDamageManagerComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosDamageManagerComponent();

    // ─── Damage Processing ──────────────────────────────────────────────────

    /** Process a hit result. Validates and applies damage. Returns actual damage applied. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Damage")
    float ProcessDamage(const FKhaaosHitResult& Hit);

    /** Check if a bone name represents a headshot. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Damage")
    static bool IsHeadshotBone(const FName& BoneName);

    /** Map the combat enum to its canonical damage GameplayTag (invalid for untyped damage). */
    static FGameplayTag GetGameplayTagForDamageType(EKhaaosDamageType DamageType);

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Maximum damage events per second per instigator (anti-cheat rate limit). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage|AntiCheat")
    float MaxDamageEventsPerSecond = 30.0f;

    /** Maximum single-hit damage (prevents modified client damage). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage|AntiCheat")
    float MaxSingleHitDamage = 500.0f;

    /** Default headshot multiplier when weapon doesn't specify. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage")
    float DefaultHeadshotMultiplier = 2.0f;

    /** Maximum distance for a valid hit (rejects impossible shots). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Damage|AntiCheat")
    float MaxHitDistance = 1000.0f;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Damage")
    FOnDamageProcessed OnDamageProcessed;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Damage")
    FOnPlayerKilled OnPlayerKilled;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Rate Limiting ──────────────────────────────────────────────────────

    /** Timestamps of recent damage events per instigator (for rate limiting). */
    TMap<FString, TArray<float>> InstigatorDamageTimestamps;

    /** Validate a hit result before processing. Returns true if valid. */
    bool ValidateHit(const FKhaaosHitResult& Hit) const;

    /** Check rate limit for an instigator. Returns true if within limit. */
    bool CheckRateLimit(const FString& InstigatorId, float CurrentTime);

    /** Clean up old timestamps (called periodically in Tick). */
    void CleanupOldTimestamps(float CurrentTime);

    /** Seconds to keep rate-limit timestamps. */
    static constexpr float RateLimitWindowSeconds = 2.0f;

private:

    float TimeSinceLastCleanup = 0.0f;
};
