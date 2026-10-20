// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale | PhD-Level Loot Item DataAsset
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosLootItemDataAsset.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UNiagaraSystem;
class USoundBase;

// ─── Loot Type Enum ───────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosLootType : uint8
{
    Curativo    UMETA(DisplayName = "CURATIVO"),
    Defesa      UMETA(DisplayName = "DEFESA"),
    Utilidade   UMETA(DisplayName = "UTILIDADE"),
    Recurso     UMETA(DisplayName = "RECURSO")
};

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

// ─── Loot Combo Definition ────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosLootCombo
{
    GENERATED_BODY()

    /** Item ID that triggers the combo when used together. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Combo")
    FName TriggerItemID;

    /** Effect name when combo activates. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Combo")
    FName ComboEffect;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Combo")
    FText Description;
};

/**
 * UKhaaosLootItemDataAsset — PhD-Level PrimaryDataAsset for loot item definition.
 * PrimaryAssetId type: "KhaaosLootItem"
 *
 * Enhanced PhD-Level Fields:
 *   - LootTypeEnum / RarityEnum (type-safe instead of FName)
 *   - Cooldown: item use cooldown
 *   - Combo: item combination effects (e.g. Phoenix + Adrenalina = instant heal)
 *   - VFX: pickup effect, use effect (Niagara)
 *   - SFX: use sound
 *   - RarityGlowColor: emissive glow color based on rarity
 *   - WorldSpecific: spawn restrictions per world
 *   - Description: detailed item description
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosLootItemDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    // ─── Identity ───────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FName ItemID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    EKhaaosLootType LootType = EKhaaosLootType::Curativo;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    EKhaaosRarity Rarity = EKhaaosRarity::Comum;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FGameplayTag TypeTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FGameplayTag RarityTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FText Description;

    // ─── Stats ──────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    int32 HealAmount = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    int32 DefenseAmount = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    float UseTime = 0.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    uint8 bAutoRevive : 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    int32 StackMax = 5;

    // ─── PhD-Level: Cooldown ───────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    float Cooldown = 0.0f;

    // ─── PhD-Level: Combo ──────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Combo")
    FKhaaosLootCombo Combo;

    // ─── PhD-Level: VFX ────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|VFX")
    TSoftObjectPtr<UNiagaraSystem> PickupVFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|VFX")
    TSoftObjectPtr<UNiagaraSystem> UseVFX;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|SFX")
    TSoftObjectPtr<USoundBase> UseSFX;

    // ─── PhD-Level: Rarity Glow ────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Visual")
    FLinearColor RarityGlowColor;

    // ─── Economy ────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Economy")
    int32 Price = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    int32 RarityWeight = 55;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    float RarityMultiplier = 1.0f;

    // ─── World Restrictions ─────────────────────────────────────────────────

    /** Worlds where this item can spawn (empty = all worlds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Worlds")
    TArray<FName> WorldSpecific;

    // ─── Primary Asset ──────────────────────────────────────────────────────

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosLootItem"), ItemID);
    }

    // ─── Utility Functions ──────────────────────────────────────────────────

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsCurativo() const { return LootType == EKhaaosLootType::Curativo; }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsDefesa() const { return LootType == EKhaaosLootType::Defesa; }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsUtilidade() const { return LootType == EKhaaosLootType::Utilidade; }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsRecurso() const { return LootType == EKhaaosLootType::Recurso; }

    /** Check if this item can spawn in a specific world. */
    UFUNCTION(BlueprintPure, Category = "Loot")
    bool CanSpawnInWorld(FName WorldID) const
    {
        if (WorldSpecific.Num() == 0) return true;
        return WorldSpecific.Contains(WorldID);
    }

    /** Check if this item has a combo with another item. */
    UFUNCTION(BlueprintPure, Category = "Loot|Combo")
    bool HasComboWith(FName OtherItemID) const
    {
        return Combo.TriggerItemID == OtherItemID;
    }

    /** Check if this item is on cooldown. */
    UFUNCTION(BlueprintPure, Category = "Loot|Stats")
    bool HasCooldown() const { return Cooldown > 0.0f; }
};
