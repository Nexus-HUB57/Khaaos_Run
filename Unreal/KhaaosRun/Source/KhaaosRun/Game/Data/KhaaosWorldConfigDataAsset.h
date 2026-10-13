// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "KhaaosWorldConfigDataAsset.generated.h"

/** Spawn point definition. */
USTRUCT(BlueprintType)
struct FKhaaosSpawnPoint
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Spawn")
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Spawn")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Spawn")
    FName Team;
};

/** Loot point definition. */
USTRUCT(BlueprintType)
struct FKhaaosLootPoint
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Loot")
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Loot")
    FName LootPool;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Loot")
    float SpawnWeight = 1.0f;
};

/** Pulso Khaaos event configuration. */
USTRUCT(BlueprintType)
struct FKhaaosPulsoConfig
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    float Radius = 500.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    float DurationSeconds = 60.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    float RarityBoostMultiplier = 2.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    int32 MaxLootDrops = 10;
};

/**
 * UKhaaosWorldConfigDataAsset — PrimaryDataAsset for world configuration.
 * PrimaryAssetId type: "KhaaosWorldConfig"
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosWorldConfigDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FName WorldID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    int32 MaxPlayers = 50;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FName RequiredRank;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Spawn")
    TArray<FKhaaosSpawnPoint> SpawnPoints;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Loot")
    TArray<FKhaaosLootPoint> LootPoints;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    FKhaaosPulsoConfig PulsoConfig;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    TArray<FName> LootTableIDs;

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosWorldConfig"), WorldID);
    }
};
