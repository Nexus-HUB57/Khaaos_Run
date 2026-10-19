// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale | PhD-Level Weapon DataAsset
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosWeaponDataAsset.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UNiagaraSystem;
class USoundBase;
class UAnimMontage;

// ─── Fire Mode Enum ───────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EWeaponFireMode : uint8
{
    Semi        UMETA(DisplayName = "SEMI"),
    Auto        UMETA(DisplayName = "AUTO"),
    Burst       UMETA(DisplayName = "BURST"),
    Melee       UMETA(DisplayName = "MELEE"),
    Charge      UMETA(DisplayName = "CHARGE")
};

// ─── Rarity Enum (shared) ─────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosRarity : uint8
{
    Comum       UMETA(DisplayName = "COMUM"),
    Raro        UMETA(DisplayName = "RARO"),
    Epico       UMETA(DisplayName = "EPICO"),
    Lendario    UMETA(DisplayName = "LENDARIO"),
    Mitico      UMETA(DisplayName = "MITICO")
};

// ─── Ballistic Configuration ──────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosBallisticConfig
{
    GENERATED_BODY()

    /** Muzzle velocity in m/s. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Ballistic")
    float MuzzleVelocityMs = 900.0f;

    /** Aerodynamic drag coefficient. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Ballistic")
    float DragCoefficient = 0.01f;

    /** Gravity influence scale (1.0 = normal, 0 = no drop). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Ballistic")
    float GravityScale = 1.0f;

    /** Max penetration depth in cm (0 = no penetration). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Ballistic")
    float PenetrationDepthCm = 20.0f;
};

// ─── Damage Falloff ───────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosDamageFalloff
{
    GENERATED_BODY()

    /** Range where full damage is applied. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Falloff")
    float NearRangeM = 20.0f;

    /** Range where falloff reaches minimum. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Falloff")
    float FarRangeM = 80.0f;

    /** Falloff curve type: "linear", "exponential", "none". */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Falloff")
    FName FalloffCurve = FName("linear");

    /** Minimum damage as percentage of base at max range. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Falloff")
    float MinDamagePercent = 0.3f;
};

// ─── Recoil Configuration ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosRecoilConfig
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Recoil")
    float PitchPerShot = 0.5f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Recoil")
    float YawRange = 0.2f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Recoil")
    float RecoverySpeed = 5.0f;

    /** Per-shot recoil scale pattern (1.0 = full recoil, decreasing = settling). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Recoil")
    TArray<float> Pattern;
};

// ─── Weapon VFX ───────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosWeaponVFX
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|VFX")
    TSoftObjectPtr<UNiagaraSystem> MuzzleFlash;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|VFX")
    TSoftObjectPtr<UNiagaraSystem> Tracer;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|VFX")
    TSoftObjectPtr<UNiagaraSystem> ShellEject;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|VFX")
    TSoftObjectPtr<UNiagaraSystem> ImpactDefault;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|VFX")
    TSoftObjectPtr<UNiagaraSystem> ImpactFlesh;
};

// ─── Weapon SFX ───────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosWeaponSFX
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> FireSound;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> FireSuppressed;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> ReloadMagOut;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> ReloadMagIn;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> ReloadCharge;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> DryFire;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    TSoftObjectPtr<USoundBase> EquipSound;
};

// ─── Attachment Slot ──────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosWeaponAttachment
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachment")
    FName AttachmentID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachment")
    FText DisplayName;

    /** Stat modifiers (key=stat name, value=modifier). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachment")
    TMap<FName, float> StatModifiers;
};

// ─── Attachment Slots Collection ──────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosAttachmentSlots
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    TArray<FKhaaosWeaponAttachment> Optic;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    TArray<FKhaaosWeaponAttachment> Barrel;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    TArray<FKhaaosWeaponAttachment> Foregrip;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    TArray<FKhaaosWeaponAttachment> Stock;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    TArray<FKhaaosWeaponAttachment> Magazine;
};

/**
 * UKhaaosWeaponDataAsset — PhD-Level PrimaryDataAsset for weapon definition.
 * PrimaryAssetId type: "KhaaosWeapon"
 *
 * Architecture: JSON → CSV → UE5 DataTable → UPrimaryDataAsset → Gameplay
 *
 * Enhanced PhD-Level Fields:
 *   - BallisticConfig: muzzle velocity, drag, gravity, penetration
 *   - DamageFalloff: near/far range, curve type, min damage %
 *   - RecoilConfig: pitch/yaw/recovery + per-shot pattern array
 *   - WeaponVFX: muzzle flash, tracer, shell eject, impact (Niagara)
 *   - WeaponSFX: fire, suppressed, reload chain, dry fire, equip
 *   - AttachmentSlots: optic/barrel/foregrip/stock/magazine with stat mods
 *   - Economy: price, KRC cost, craft materials
 *   - Codename, Rarity enum, RarityTag
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosWeaponDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    // ─── Identity ───────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName WeaponID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName Codename;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName Slot;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName Category;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FGameplayTag CategoryTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    EKhaaosRarity Rarity = EKhaaosRarity::Comum;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FGameplayTag RarityTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    EWeaponFireMode FireMode = EWeaponFireMode::Auto;

    // ─── Stats ──────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 Damage = 30;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 FireRate = 600;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 Accuracy = 70;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 Range = 50;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 MagazineSize = 30;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    float ReloadTime = 2.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    float HeadshotMultiplier = 2.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    float SpeedModifier = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 BurstCount = 3;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 PelletCount = 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    FName AmmoType;

    // ─── PhD-Level: Ballistic ──────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Ballistic")
    FKhaaosBallisticConfig Ballistic;

    // ─── PhD-Level: Damage Falloff ─────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Falloff")
    FKhaaosDamageFalloff DamageFalloff;

    // ─── PhD-Level: Recoil ─────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Recoil")
    FKhaaosRecoilConfig Recoil;

    // ─── PhD-Level: VFX ────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|VFX")
    FKhaaosWeaponVFX WeaponVFX;

    // ─── PhD-Level: SFX ────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|SFX")
    FKhaaosWeaponSFX WeaponSFX;

    // ─── PhD-Level: Attachments ────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    FKhaaosAttachmentSlots AttachmentSlots;

    // ─── Economy ────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Economy")
    int32 Price = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Economy")
    int64 KRCCost = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Economy")
    TMap<FName, int32> CraftMaterials;

    // ─── Meta ───────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Meta")
    FName DesignTier;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Meta")
    float BalanceVersion = 2.0f;

    // ─── Primary Asset ──────────────────────────────────────────────────────

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosWeapon"), WeaponID);
    }

    // ─── Utility Functions ──────────────────────────────────────────────────

    /** Calculate damage at distance with configurable falloff (linear, exponential, none). */
    UFUNCTION(BlueprintPure, Category = "Weapon|Stats")
    float CalculateDamageAtDistance(float Distance) const
    {
        if (Distance <= 0.0f || Range <= 0) return static_cast<float>(Damage);
        if (Distance >= static_cast<float>(Range))
            return static_cast<float>(Damage) * DamageFalloff.MinDamagePercent;

        const float NearDist = DamageFalloff.NearRangeM;
        const float FarDist = DamageFalloff.FarRangeM;

        if (Distance <= NearDist) return static_cast<float>(Damage);

        const float FalloffRatio = FMath::Clamp((Distance - NearDist) / (FarDist - NearDist), 0.0f, 1.0f);
        const float MinPct = DamageFalloff.MinDamagePercent;

        // Support all 3 curve types: linear, exponential, none
        float Falloff = 1.0f;
        const FString CurveStr = DamageFalloff.FalloffCurve.ToString().ToLower();

        if (CurveStr == TEXT("exponential"))
        {
            // Exponential falloff: steeper drop at close range, gradual at long range
            // e^(-3 * ratio) maps [0,1] → [1, ~0.05]
            Falloff = MinPct + (1.0f - MinPct) * FMath::Exp(-3.0f * FalloffRatio);
        }
        else if (CurveStr == TEXT("none"))
        {
            // No falloff: full damage at all ranges
            Falloff = 1.0f;
        }
        else
        {
            // Default: linear falloff between near and far
            Falloff = 1.0f - (1.0f - MinPct) * FalloffRatio;
        }

        return static_cast<float>(Damage) * Falloff;
    }

    /** Calculate DPS (Damage Per Second). */
    UFUNCTION(BlueprintPure, Category = "Weapon|Stats")
    float CalculateDPS() const
    {
        if (FireRate <= 0) return static_cast<float>(Damage);
        return static_cast<float>(Damage * PelletCount) * (static_cast<float>(FireRate) / 60.0f);
    }

    /** Calculate time to empty a magazine. */
    UFUNCTION(BlueprintPure, Category = "Weapon|Stats")
    float TimeToEmptyMagazine() const
    {
        if (FireRate <= 0) return 0.0f;
        return static_cast<float>(MagazineSize) / (static_cast<float>(FireRate) / 60.0f);
    }

    /** Get damage per magazine (full mag dump). */
    UFUNCTION(BlueprintPure, Category = "Weapon|Stats")
    float DamagePerMagazine() const
    {
        return static_cast<float>(Damage * MagazineSize * PelletCount);
    }

    /** Get muzzle velocity in cm/s (UE5 uses cm). */
    UFUNCTION(BlueprintPure, Category = "Weapon|Ballistic")
    float GetMuzzleVelocityCmPerSec() const
    {
        return Ballistic.MuzzleVelocityMs * 100.0f;
    }

    /** Calculate bullet drop at distance (meters). */
    UFUNCTION(BlueprintPure, Category = "Weapon|Ballistic")
    float CalculateBulletDropM(float DistanceM) const
    {
        if (Ballistic.MuzzleVelocityMs <= 0.0f) return 0.0f;
        const float TimeOfFlight = DistanceM / Ballistic.MuzzleVelocityMs;
        return 0.5f * 980.0f * Ballistic.GravityScale * TimeOfFlight * TimeOfFlight;
    }

    /** Get total attachment count. */
    UFUNCTION(BlueprintPure, Category = "Weapon|Attachments")
    int32 GetTotalAttachmentCount() const
    {
        return AttachmentSlots.Optic.Num() + AttachmentSlots.Barrel.Num() +
               AttachmentSlots.Foregrip.Num() + AttachmentSlots.Stock.Num() +
               AttachmentSlots.Magazine.Num();
    }
};
