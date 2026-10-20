// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale | PhD-Level World Config DataAsset
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosWorldConfigDataAsset.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class USoundBase;

// ─── Spawn Point ──────────────────────────────────────────────────────────────

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

// ─── Loot Point ───────────────────────────────────────────────────────────────

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

// ─── Pulso Khaaos Config ──────────────────────────────────────────────────────

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

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    float DamagePerSecond = 5.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    float ShrinkRate = 10.0f;
};

// ─── Biome Definition (PhD) ──────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosBiomeConfig
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    FName BiomeType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    FText Description;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    FLinearColor SkyColor;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    FLinearColor FogColor;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    float FogDensity = 0.02f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    float AmbientTemperature = 20.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    float AmbientHumidity = 0.5f;
};

// ─── Weather Event (PhD) ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosWeatherEvent
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    FName WeatherType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    float Frequency = 0.3f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    float Intensity = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    float VisibilityModifier = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    float SpeedModifier = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    float DamagePerSecond = 0.0f;
};

// ─── POI Marker (PhD) ─────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosPOIMarker
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|POI")
    FName POIName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|POI")
    FName POIType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|POI")
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|POI")
    FName LootTier;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|POI")
    int32 DangerLevel = 1;
};

// ─── Ambient Audio Zone (PhD) ─────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosAudioZone
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Audio")
    FName ZoneID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Audio")
    TSoftObjectPtr<USoundBase> AmbientSound;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Audio")
    float Radius = 500.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Audio")
    float Volume = 1.0f;
};

/**
 * UKhaaosWorldConfigDataAsset — PhD-Level PrimaryDataAsset for world configuration.
 * PrimaryAssetId type: "KhaaosWorldConfig"
 *
 * Enhanced PhD-Level Fields:
 *   - BiomeConfig: biome type, colors, fog, temperature, humidity
 *   - WeatherEvents: dynamic weather with gameplay effects
 *   - POIMarkers: points of interest with loot tier and danger level
 *   - AmbientAudioZones: spatial audio zones
 *   - MaterialLayers: terrain material assignments
 *   - Codename, WorldTag
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosWorldConfigDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    // ─── Identity ───────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FName WorldID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FName Codename;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FGameplayTag WorldTag;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    int32 MaxPlayers = 50;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FName RequiredRank;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    FName NextWorldID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    uint8 bIsFinalWorld : 1;

    // ─── Map ────────────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Map")
    float MapBounds = 2000.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Map")
    int32 SectorCount = 8;

    // ─── PhD: Biome ─────────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Biome")
    FKhaaosBiomeConfig Biome;

    // ─── PhD: Weather ───────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Weather")
    TArray<FKhaaosWeatherEvent> WeatherEvents;

    // ─── PhD: POI Markers ──────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|POI")
    TArray<FKhaaosPOIMarker> POIMarkers;

    // ─── PhD: Audio Zones ──────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Audio")
    TArray<FKhaaosAudioZone> AmbientAudioZones;

    // ─── PhD: Material Layers ──────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Terrain")
    TArray<FName> MaterialLayers;

    // ─── Spawn / Loot ──────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Spawn")
    TArray<FKhaaosSpawnPoint> SpawnPoints;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Loot")
    TArray<FKhaaosLootPoint> LootPoints;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Pulso")
    FKhaaosPulsoConfig PulsoConfig;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World")
    TArray<FName> LootTableIDs;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "World|Species")
    TArray<FName> AvailableSpecies;

    // ─── Primary Asset ──────────────────────────────────────────────────────

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosWorldConfig"), WorldID);
    }

    // ─── Utility Functions ──────────────────────────────────────────────────

    UFUNCTION(BlueprintPure, Category = "World")
    bool IsFinalWorld() const { return bIsFinalWorld; }

    UFUNCTION(BlueprintPure, Category = "World")
    bool HasNextWorld() const { return !NextWorldID.IsNone(); }

    /** Get POI markers by type. */
    UFUNCTION(BlueprintPure, Category = "World|POI")
    TArray<FKhaaosPOIMarker> GetPOIsByType(FName POIType) const
    {
        TArray<FKhaaosPOIMarker> Result;
        for (const auto& POI : POIMarkers)
        {
            if (POI.POIType == POIType) Result.Add(POI);
        }
        return Result;
    }

    /** Get total loot point count. */
    UFUNCTION(BlueprintPure, Category = "World|Loot")
    int32 GetTotalLootPointCount() const { return LootPoints.Num(); }

    /** Get weather event by type. */
    UFUNCTION(BlueprintPure, Category = "World|Weather")
    FKhaaosWeatherEvent GetWeatherEvent(FName WeatherType) const
    {
        for (const auto& W : WeatherEvents)
        {
            if (W.WeatherType == WeatherType) return W;
        }
        return FKhaaosWeatherEvent();
    }
};
