// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "KhaaosLootItemDataAsset.generated.h"

/**
 * UKhaaosLootItemDataAsset — PrimaryDataAsset for loot item definition.
 * PrimaryAssetId type: "KhaaosLootItem"
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosLootItemDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FName ItemID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FName LootType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    FName Rarity;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    int32 HealAmount = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    int32 DefenseAmount = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Stats")
    bool bAutoRevive = false;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot|Economy")
    int32 Price = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    int32 RarityWeight = 55;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loot")
    float RarityMultiplier = 1.0f;

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosLootItem"), ItemID);
    }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsCurativo() const { return LootType == FName("Curativo"); }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsDefesa() const { return LootType == FName("Defesa"); }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsUtilidade() const { return LootType == FName("Utilidade"); }

    UFUNCTION(BlueprintPure, Category = "Loot|Type")
    bool IsRecurso() const { return LootType == FName("Recurso"); }
};
