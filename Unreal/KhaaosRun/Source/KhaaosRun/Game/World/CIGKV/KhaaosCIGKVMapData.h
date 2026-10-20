// ============================================================================
// Khaaos Run — CIGKV Map Data Asset (Fase 1)
// ============================================================================
// Data asset containing all map-specific data for CIGKV (Khaaos Ville)
// Including: spawn points, loot positions, ZEX locations, zone config,
// environment markers, and sector definitions.
//
// This is the single source of truth for CIGKV map layout.
// Loaded by AKhaaosCIGKVLevel at BeginPlay.
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KhaaosCIGKVMapData.generated.h"

// ─── Forward Declarations ────────────────────────────────────────────────────

class AKhaaosLootPickup;

// ─── Sector Definition ───────────────────────────────────────────────────────

/** A sector of the CIGKV map (fraction of the total perimeter) */
USTRUCT(BlueprintType)
struct FCIGKVSector
{
    GENERATED_BODY()

    /** Sector name (e.g., "ArmoryHub", "ProvingGrounds", "Park") */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;

    /** Fraction of the total map (e.g., 0.125 = 1/8) */
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
struct FCIGKVSpawnPoint
{
    GENERATED_BODY()

    /** World position */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    /** Rotation */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator Rotation = FRotator::ZeroRotator;

    /** Which sector this spawn belongs to */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;

    /** Team index (for team-based modes, -1 = FFA) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TeamIndex = -1;

    /** Priority (higher = more likely to be used) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Priority = 0;
};

// ─── Loot Spawn Point ────────────────────────────────────────────────────────

/** Loot spawn point with rarity distribution */
USTRUCT(BlueprintType)
struct FCIGKVLootSpawnPoint
{
    GENERATED_BODY()

    /** World position */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    /** Rotation (for oriented loot like weapons) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator Rotation = FRotator::ZeroRotator;

    /** Sector */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;

    /** Rarity weights: Common=40%, Uncommon=25%, Rare=20%, Epic=10%, Legendary=5% */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<float> RarityWeights = { 0.40f, 0.25f, 0.20f, 0.10f, 0.05f };

    /** Minimum spawn phase (0 = always, 2 = only after phase 2) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MinPhase = 0;

    /** Is this a ground spawn or elevated (roof/ledge)? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bElevated = false;
};

// ─── Environment Marker ──────────────────────────────────────────────────────

/** Environmental feature marker (Plus+ / Plus-) */
UENUM(BlueprintType)
enum class ECIGKVEnvironmentType : uint8
{
    Bunker         UMETA(DisplayName = "Bunker (Plus+)"),
    SniperPoint    UMETA(DisplayName = "Sniper Point (Plus+)"),
    VehicleSpawn   UMETA(DisplayName = "Vehicle Spawn (Plus+)"),
    MedKit         UMETA(DisplayName = "Med Kit Station (Plus+)"),
    AcidRain       UMETA(DisplayName = "Chuva Ácida (Plus-)"),
    Fog            UMETA(DisplayName = "Neblina Alucinógena (Plus-)"),
    Destruction    UMETA(DisplayName = "Destructible Building (Plus-)"),
    WaterHazard    UMETA(DisplayName = "Water Hazard (Plus-)"),
    FloraCarnivora UMETA(DisplayName = "Flora Carnívora (Plus-)"),
};

USTRUCT(BlueprintType)
struct FCIGKVEnvironmentMarker
{
    GENERATED_BODY()

    /** World position */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    /** Environment type */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ECIGKVEnvironmentType Type = ECIGKVEnvironmentType::Bunker;

    /** Radius of effect */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EffectRadius = 500.0f;

    /** Intensity (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Intensity = 1.0f;

    /** Active phase mask (bitfield: phase 0=1, phase 1=2, etc.) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    uint8 ActivePhaseMask = 0xFF;
};

// ─── Map Data Asset ──────────────────────────────────────────────────────────

/**
 * UKhaaosCIGKVMapData
 * Primary data asset for the CIGKV (Khaaos Ville) map.
 *
 * Contains ALL map layout data needed for the Level Script Actor
 * to function. This is the "database" for the map — the LSA is the "logic".
 *
 * Design document reference: Mundos.md — CIGKV section
 */
UCLASS(BlueprintType)
class KHAAOSRUN_API UKhaaosCIGKVMapData : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:

    // ─── Map Metadata ────────────────────────────────────────────────────────

    /** Map display name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Meta")
    FString MapName = TEXT("CIGKV — Khaaos Ville");

    /** Map description */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Meta")
    FString MapDescription = TEXT("Campo de Instrução de Guerra Khaaos Ville — Pre-launch training ring");

    /** Map size (world units) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Meta")
    FVector MapSize = FVector(10000.0f, 10000.0f, 500.0f);

    /** Target player count */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Meta")
    int32 TargetPlayerCount = 50;

    // ─── Sectors (3 sectors per CIGKV design) ────────────────────────────────

    /** Pátio de Armamento (Armory Hub) — 1/8 of map, neutral zone */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Sectors")
    FCIGKVSector ArmoryHub;

    /** Setor de Testes (Proving Grounds) — 3/8 of map, urban dense */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Sectors")
    FCIGKVSector ProvingGrounds;

    /** Parque Abandonado — 4/8 of map, vegetation, rivers, ambushes */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Sectors")
    FCIGKVSector AbandonedPark;

    // ─── Spawn Points ────────────────────────────────────────────────────────

    /** Player spawn points (at least 50 for CIGKV) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Spawns")
    TArray<FCIGKVSpawnPoint> PlayerSpawnPoints;

    // ─── Loot Points ─────────────────────────────────────────────────────────

    /** Loot spawn points (20+ per phase minimum) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Loot")
    TArray<FCIGKVLootSpawnPoint> LootSpawnPoints;

    // ─── Environment ─────────────────────────────────────────────────────────

    /** Environmental markers (Plus+ and Plus-) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "CIGKV|Environment")
    TArray<FCIGKVEnvironmentMarker> EnvironmentMarkers;

    // ─── Utility Functions ────────────────────────────────────────────────────

    /** Get N full loot spawn entries within a zone, preserving weights and rotation. */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    TArray<FCIGKVLootSpawnPoint> GetRandomLootSpawnEntries(int32 Count, FVector ZoneCenter, float ZoneRadius, int32 PhaseIndex = 0) const;

    /** Get N random loot spawn locations within a zone that are unlocked for the phase. */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    TArray<FVector> GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius, int32 PhaseIndex = 0) const;

    /** Get a random point within the zone (for Pulso drops) */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    FVector GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const;

    /** Get all spawn points in a sector */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    TArray<FCIGKVSpawnPoint> GetSpawnsInSector(const FString& SectorName) const;

    /** Get all loot points in a sector */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    TArray<FCIGKVLootSpawnPoint> GetLootInSector(const FString& SectorName) const;

    /** Get environment markers of a specific type */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    TArray<FCIGKVEnvironmentMarker> GetMarkersByType(ECIGKVEnvironmentType Type) const;

    /** Initialize with default CIGKV layout */
    UFUNCTION(BlueprintCallable, Category = "CIGKV|Utility")
    void InitializeDefaults();
};
