// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "KhaaosSpeciesDataAsset.generated.h"

/** Skin definition for a species. */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesSkin
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FName SkinID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FName Rarity;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FLinearColor ColorPrimary;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FLinearColor ColorAccent;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skin")
    FName UnlockRank;
};

/** Animation reference for a species. */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesAnimation
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    FName AnimationID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    FName AnimationName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animation")
    TSoftObjectPtr<UAnimSequence> AnimationAsset;
};

/**
 * UKhaaosSpeciesDataAsset — PrimaryDataAsset for species definition.
 * PrimaryAssetId type: "KhaaosSpecies"
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosSpeciesDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName SpeciesID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName SpeciesType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 BaseHealth = 100;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 BaseEnergy = 100;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    float BaseSpeed = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 HeightCm = 180;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Stats")
    int32 WeightKg = 75;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName Skeleton;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FText PassiveAbilityDescription;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Skins")
    TArray<FKhaaosSpeciesSkin> Skins;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species|Animations")
    TArray<FKhaaosSpeciesAnimation> Animations;

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosSpecies"), SpeciesID);
    }
};
