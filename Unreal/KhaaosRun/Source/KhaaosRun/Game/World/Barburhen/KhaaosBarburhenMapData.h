// ============================================================================
// Khaaos Run — W1/C1 Barburhen Map Data Asset (Fase 4)
// ============================================================================
// Data asset containing all map-specific data for Barburhen
// Including: spawn points, loot positions, ZEX locations, zone config,
// environment markers, and sector definitions.
//
// 12km x 12km map (larger than CIGKV's 10km)
// 5 sectors: Industrial(2/10), Residential(2/10), Military(3/10),
//            Wasteland(2/10), Port(1/10)
// 100 spawn points, 120 loot spawn points, 30 ZEX locations
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KhaaosBarburhenMapData.generated.h"

class AKhaaosLootPickup;

// ─── Sector Definition ───────────────────────────────────────────────────────

/** A sector of the Barburhen map (fraction of the total area) */
USTRUCT(BlueprintType)
struct FBarburhenSector
{
    GENERATED_BODY()

    /** Sector name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;

    /** Fraction of the total map */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MapFraction = 0.0f;

    /** Bounds min */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector BoundsMin = FVector::ZeroVector;

    /** Bounds max */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector BoundsMax = FVector::ZeroVector;

    /** Is this a neutral zone (no combat)? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsNeutralZone = false;
};

// ─── Spawn Point ─────────────────────────────────────────────────────────────

/** Player spawn point with metadata */
USTRUCT(BlueprintType)
struct FBarburhenSpawnPoint
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TeamIndex = -1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Priority = 0;
};

// ─── Loot Spawn Point ────────────────────────────────────────────────────────

/** Loot spawn point with rarity distribution */
USTRUCT(BlueprintType)
struct FBarburhenLootSpawnPoint
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;

    /** Rarity weights: Common=35%, Uncommon=25%, Rare=20%, Epic=12%, Legendary=8% */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<float> RarityWeights = { 0.35f, 0.25f, 0.20f, 0.12f, 0.08f };

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MinPhase = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bElevated = false;
};

// ─── Environment Marker ──────────────────────────────────────────────────────

/** Environment type for Barburhen */
UENUM(BlueprintType)
enum class EBarburhenEnvironmentType : uint8
{
    Bunker         UMETA(DisplayName = "Bunker (Plus+)"),
    SniperPoint    UMETA(DisplayName = "Sniper Point (Plus+)"),
    VehicleSpawn   UMETA(DisplayName = "Vehicle Spawn (Plus+)"),
    MedKit         UMETA(DisplayName = "Med Kit Station (Plus+)"),
    Armory         UMETA(DisplayName = "Armory Cache (Plus+)"),
    IcePatch       UMETA(DisplayName = "Ice Patch (Barburhen unique)"),
    AcidRain       UMETA(DisplayName = "Chuva Ácida (Plus-)"),
    Fog            UMETA(DisplayName = "Neblina (Plus-)"),
    Destruction    UMETA(DisplayName = "Destructible Building (Plus-)"),
    WaterHazard    UMETA(DisplayName = "Water Hazard (Plus-)"),
    Blizzard       UMETA(DisplayName = "Blizzard (Inverno hazard)"),
    Frostbite      UMETA(DisplayName = "Frostbite Zone (Inverno hazard)"),
};

USTRUCT(BlueprintType)
struct FBarburhenEnvironmentMarker
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EBarburhenEnvironmentType Type = EBarburhenEnvironmentType::Bunker;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EffectRadius = 500.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Intensity = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    uint8 ActivePhaseMask = 0xFF;
};

// ─── Map Data Asset ──────────────────────────────────────────────────────────

/**
 * UKhaaosBarburhenMapData
 * Primary data asset for the Barburhen (W1/C1) map.
 *
 * 12km x 12km map with 5 sectors.
 * 100 spawn points, 120 loot spawn points, 30 ZEX locations.
 */
UCLASS(BlueprintType)
class KHAAOSRUN_API UKhaaosBarburhenMapData : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:

    // ─── Map Metadata ────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Meta")
    FString MapName = TEXT("W1/C1 Barburhen");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Meta")
    FString MapDescription = TEXT("Primeiro mundo competitivo — Harsher ring, 100 players, 1.5h");

    /** Map size in cm (12km x 12km) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Meta")
    FVector MapSize = FVector(12000.0f, 12000.0f, 800.0f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Meta")
    int32 TargetPlayerCount = 100;

    // ─── Sectors (5 sectors) ─────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Sectors")
    TArray<FBarburhenSector> Sectors;

    // ─── Spawn Points ────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Spawns")
    TArray<FBarburhenSpawnPoint> PlayerSpawnPoints;

    // ─── Loot Points ─────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Loot")
    TArray<FBarburhenLootSpawnPoint> LootSpawnPoints;

    // ─── Environment ─────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|Environment")
    TArray<FBarburhenEnvironmentMarker> EnvironmentMarkers;

    // ─── ZEX Locations ───────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen|ZEX")
    TArray<FVector> ZEXLocations;

    // ─── Utility Functions ────────────────────────────────────────────────────

    /** Get N random loot spawn points within a zone */
    UFUNCTION(BlueprintCallable, Category = "Barburhen|Utility")
    TArray<FVector> GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const;

    /** Get a random point within the zone */
    UFUNCTION(BlueprintCallable, Category = "Barburhen|Utility")
    FVector GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const;

    /** Get all spawn points in a sector */
    UFUNCTION(BlueprintCallable, Category = "Barburhen|Utility")
    TArray<FBarburhenSpawnPoint> GetSpawnsInSector(const FString& SectorName) const;

    /** Get all loot points in a sector */
    UFUNCTION(BlueprintCallable, Category = "Barburhen|Utility")
    TArray<FBarburhenLootSpawnPoint> GetLootInSector(const FString& SectorName) const;

    /** Get environment markers of a specific type */
    UFUNCTION(BlueprintCallable, Category = "Barburhen|Utility")
    TArray<FBarburhenEnvironmentMarker> GetMarkersByType(EBarburhenEnvironmentType Type) const;

    /** Initialize with default Barburhen layout */
    UFUNCTION(BlueprintCallable, Category = "Barburhen|Utility")
    void InitializeDefaults();
};
