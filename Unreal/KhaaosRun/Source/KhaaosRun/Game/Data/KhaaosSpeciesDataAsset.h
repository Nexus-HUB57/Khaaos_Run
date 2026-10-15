// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale | PhD-Level Species DataAsset
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosSpeciesDataAsset.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UAnimSequence;
class UNiagaraSystem;
class USoundBase;

// ─── Rarity Enum ──────────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosRarity : uint8
{
    Comum       UMETA(DisplayName = "COMUM"),
    Raro        UMETA(DisplayName = "RARO"),
    Epico       UMETA(DisplayName = "EPICO"),
    Lendario    UMETA(DisplayName = "LENDARIO"),
    Mitico      UMETA(DisplayName = "MITICO")
};

// ─── Skin Definition (Enhanced PhD) ──────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosSpeciesSkin
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FName SkinID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    EKhaaosRarity Rarity = EKhaaosRarity::Comum;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FLinearColor ColorPrimary;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FLinearColor ColorSecondary;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FLinearColor ColorAccent;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FLinearColor ColorEmissive;

    /** Material override for this skin (None = use default species material). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    TSoftObjectPtr<UMaterialInterface> MaterialOverride;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FName UnlockRank;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FText Description;
};

// ─── Animation Reference (Enhanced) ──────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosSpeciesAnimation
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    FName AnimationID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    FName AnimationName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    float Duration = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    uint8 bLoop : 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    TSoftObjectPtr<UAnimSequence> AnimationAsset;
};

// ─── Blend Space Reference ───────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosBlendSpaceRef
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|BlendSpace")
    FName BlendSpaceID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|BlendSpace")
    int32 Dimensions = 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|BlendSpace")
    TArray<FName> AxisNames;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|BlendSpace")
    int32 SampleCount = 5;
};

// ─── IK Settings ──────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosIKSettings
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|IK")
    uint8 bFootIKEnabled : 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|IK")
    float FootIKTraceDistance = 50.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|IK")
    uint8 bHandIKEnabled : 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|IK")
    float HandIKReachRadius = 40.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|IK")
    float FullBodyIKBlend = 0.8f;
};

// ─── Clothing Physics Config ──────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosClothingPhysics
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Cloth")
    uint8 bClothSimEnabled : 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Cloth")
    float WindScale = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Cloth")
    float Damping = 0.3f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Cloth")
    float Stiffness = 0.7f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Cloth")
    TArray<FName> LooseParts;
};

// ─── Passive Ability Mechanic ─────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosPassiveMechanic
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    FName Trigger;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    FName Effect;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    float Value = 0.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    float Duration = 0.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    int32 MaxStacks = 1;
};

// ─── Active Ability Definition ────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosActiveAbility
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability")
    FName AbilityName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability")
    FGameplayTag AbilityTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability")
    float Cooldown = 10.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability")
    float EnergyCost = 20.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability")
    float Duration = 0.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability")
    FText Description;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability|VFX")
    TSoftObjectPtr<UNiagaraSystem> VFXAsset;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Ability|SFX")
    TSoftObjectPtr<USoundBase> SFXAsset;
};

// ─── VFX/Audio References ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosSpeciesVFX
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    TSoftObjectPtr<UNiagaraSystem> PassiveIndicator;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    TSoftObjectPtr<UNiagaraSystem> Ability1VFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    TSoftObjectPtr<UNiagaraSystem> Ability2VFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    TSoftObjectPtr<UNiagaraSystem> UltimateVFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    TSoftObjectPtr<UNiagaraSystem> DeathVFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    TSoftObjectPtr<UNiagaraSystem> SpawnVFX;
};

/**
 * UKhaaosSpeciesDataAsset — PhD-Level PrimaryDataAsset for species definition.
 * PrimaryAssetId type: "KhaaosSpecies"
 *
 * Architecture: JSON → CSV → UE5 DataTable → UPrimaryDataAsset → Gameplay
 *
 * Enhanced PhD-Level Fields:
 *   - BaseStamina, ArmorBase, ShieldCapacity
 *   - RegenHealth/Energy/Stamina per second
 *   - CritChance, CritMultiplier
 *   - StatCurves (per-level progression arrays)
 *   - IKSettings (foot/hand IK, full body blend)
 *   - ClothingPhysics (cloth sim, wind, damping, stiffness)
 *   - MorphTargets (character shape variants)
 *   - PassiveMechanics (trigger/effect/value/duration/stacks)
 *   - ActiveAbilities (3 per species: ability + ability + ultimate)
 *   - BlendSpaces (2D movement, 1D aim offset, special)
 *   - SpeciesVFX (passive/ability/ultimate/death/spawn Niagara)
 *   - SpeciesAudio (footsteps per surface, voice lines, ambient)
 *   - Lore (origin, culture, motivation, relationship_with_khaaos)
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosSpeciesDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    // ─── Identity ───────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName SpeciesID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName SpeciesType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName Codename;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FGameplayTag SpeciesTag;

    // ─── Lore ───────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Lore")
    FText LoreOrigin;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Lore")
    FText LoreCulture;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Lore")
    FText LoreMotivation;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Lore")
    FText LoreKhaaosRelationship;

    // ─── Base Stats ─────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 BaseHealth = 100;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 BaseEnergy = 100;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    float BaseSpeed = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 BaseStamina = 100;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 ArmorBase = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 ShieldCapacity = 0;

    // ─── Regen Rates ────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats|Regen")
    float RegenHealthPerSec = 0.5f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats|Regen")
    float RegenEnergyPerSec = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats|Regen")
    float RegenStaminaPerSec = 2.0f;

    // ─── Crit ───────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats|Crit")
    float CritChance = 0.05f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats|Crit")
    float CritMultiplier = 1.5f;

    // ─── Stat Curves (per level, 10 levels) ─────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Curves")
    TArray<int32> HealthPerLevel;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Curves")
    TArray<int32> EnergyPerLevel;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Curves")
    TArray<float> SpeedPerLevel;

    // ─── Physical ───────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Physical")
    int32 HeightCm = 180;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Physical")
    int32 WeightKg = 75;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Physical")
    FName Skeleton;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Physical")
    TArray<FName> MorphTargets;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Physical")
    FKhaaosIKSettings IKSettings;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Physical")
    FKhaaosClothingPhysics ClothingPhysics;

    // ─── Passive Ability ────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    FText PassiveName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    FText PassiveDescription;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    FGameplayTag PassiveAbilityTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    FName PassiveAbilityClassName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Passive")
    TArray<FKhaaosPassiveMechanic> PassiveMechanics;

    // ─── Active Abilities (3 per species) ───────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Abilities")
    TArray<FKhaaosActiveAbility> ActiveAbilities;

    // ─── Collections ────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skins")
    TArray<FKhaaosSpeciesSkin> Skins;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animations")
    TArray<FKhaaosSpeciesAnimation> Animations;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|BlendSpaces")
    TArray<FKhaaosBlendSpaceRef> BlendSpaces;

    // ─── VFX/Audio ──────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|VFX")
    FKhaaosSpeciesVFX SpeciesVFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Audio")
    TMap<FName, TSoftObjectPtr<USoundBase>> FootstepSounds;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Audio")
    TSoftObjectPtr<USoundBase> AmbientEmitter;

    // ─── Worlds ─────────────────────────────────────────────────────────────

    /** Worlds this species can enter (empty = all worlds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Worlds")
    TArray<FName> AvailableWorlds;

    // ─── Meta ───────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Meta")
    FName DesignTier;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Meta")
    float BalanceVersion = 2.0f;

    // ─── Primary Asset ──────────────────────────────────────────────────────

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosSpecies"), SpeciesID);
    }

    // ─── Utility Functions ──────────────────────────────────────────────────

    /** Check if this species can enter a specific world. */
    UFUNCTION(BlueprintPure, Category = "Species")
    bool CanEnterWorld(FName WorldID) const
    {
        if (AvailableWorlds.Num() == 0) return true;
        return AvailableWorlds.Contains(WorldID);
    }

    /** Get health at a given level (1-indexed, clamped to curve). */
    UFUNCTION(BlueprintPure, Category = "Species|Curves")
    int32 GetHealthAtLevel(int32 Level) const
    {
        const int32 Idx = FMath::Clamp(Level - 1, 0, HealthPerLevel.Num() - 1);
        return HealthPerLevel.IsValidIndex(Idx) ? HealthPerLevel[Idx] : BaseHealth;
    }

    /** Get energy at a given level. */
    UFUNCTION(BlueprintPure, Category = "Species|Curves")
    int32 GetEnergyAtLevel(int32 Level) const
    {
        const int32 Idx = FMath::Clamp(Level - 1, 0, EnergyPerLevel.Num() - 1);
        return EnergyPerLevel.IsValidIndex(Idx) ? EnergyPerLevel[Idx] : BaseEnergy;
    }

    /** Get speed at a given level. */
    UFUNCTION(BlueprintPure, Category = "Species|Curves")
    float GetSpeedAtLevel(int32 Level) const
    {
        const int32 Idx = FMath::Clamp(Level - 1, 0, SpeedPerLevel.Num() - 1);
        return SpeedPerLevel.IsValidIndex(Idx) ? SpeedPerLevel[Idx] : BaseSpeed;
    }

    /** Check if this species has a specific morph target. */
    UFUNCTION(BlueprintPure, Category = "Species|Physical")
    bool HasMorphTarget(FName TargetName) const
    {
        return MorphTargets.Contains(TargetName);
    }

    /** Get the ultimate ability (last in ActiveAbilities array). */
    UFUNCTION(BlueprintPure, Category = "Species|Abilities")
    FKhaaosActiveAbility GetUltimateAbility() const
    {
        if (ActiveAbilities.Num() > 0) return ActiveAbilities.Last();
        return FKhaaosActiveAbility();
    }
};
