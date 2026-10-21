// ============================================================================
// Khaaos Run — CIGKV World Partition Configuration (Fase 1)
// ============================================================================
// World Partition setup for the CIGKV map (10km x 10km)
// Enables level streaming, HLOD, and data layers for large map support.
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/WorldPartition.h"
#include "WorldPartition/WorldPartitionSubsystem.h"
#include "KhaaosCIGKVWorldPartition.generated.h"

// ─── Partition Cell Configuration ────────────────────────────────────────────

/** Configuration for a single partition cell (loading region) */
USTRUCT(BlueprintType)
struct FKhaaosPartitionCell
{
    GENERATED_BODY()

    /** Cell bounds (world space) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FBox CellBounds = FBox(ForceInit);

    /** Loading radius around player */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float LoadingRadius = 3000.0f;

    /** Unloading radius (hysteresis to prevent thrashing) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float UnloadingRadius = 4500.0f;

    /** Priority for loading (lower = higher priority) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 LoadingPriority = 0;

    /** Data layers active in this cell */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FName> ActiveDataLayers;
};

// ─── HLOD Configuration ──────────────────────────────────────────────────────

/** Hierarchical Level of Detail configuration */
USTRUCT(BlueprintType)
struct FKhaaosHLODConfig
{
    GENERATED_BODY()

    /** HLOD level (0 = highest detail, 3 = lowest) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 HLODLevel = 0;

    /** Merge distance for this HLOD level */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MergeDistance = 5000.0f;

    /** Screen size threshold for switching to this HLOD */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ScreenSize = 0.25f;

    /** Maximum number of static meshes to merge per cluster */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxMeshesPerCluster = 64;

    /** Should this HLOD level use impostor (billboard)? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bUseImpostor = false;
};

// ─── Data Layer Configuration ────────────────────────────────────────────────

/** Data layer for CIGKV — enables sector-based streaming */
UENUM(BlueprintType)
enum class ECIGKVDataLayer : uint8
{
    ArmoryHub           UMETA(DisplayName = "Armory Hub (1/8)"),
    ProvingGrounds      UMETA(DisplayName = "Proving Grounds (3/8)"),
    AbandonedPark       UMETA(DisplayName = "Abandoned Park (4/8)"),
    Underground         UMETA(DisplayName = "Underground Tunnels"),
    ZEX_Network         UMETA(DisplayName = "ZEX Network (15 points)"),
    EnvironmentEffects  UMETA(DisplayName = "Environment Effects (VFX)"),
    CinematicZu         UMETA(DisplayName = "Zu Cinematic Sequences"),
};

// ─── World Partition Config ──────────────────────────────────────────────────

/**
 * UKhaaosCIGKVWorldPartition
 * World Partition configuration for the CIGKV map.
 *
 * Enables:
 *   - Cell-based level streaming (only load what's near players)
 *   - HLOD for distant geometry (4 levels)
 *   - Data layers for sector-based streaming
 *   - Source control friendly (one file per actor)
 *
 * World Partition is UE5's replacement for World Composition.
 * No sub-levels needed — all actors live in one partitioned world.
 */
UCLASS(BlueprintType, Config=Engine, defaultconfig)
class KHAAOSRUN_API UKhaaosCIGKVWorldPartition : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:

    // ─── Map Grid ────────────────────────────────────────────────────────────

    /** Total map size in world units */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    FVector2D MapSize = FVector2D(10000.0f, 10000.0f);

    /** Partition cell size (smaller = more granular streaming) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    float CellSize = 2000.0f;

    /** Number of cells in X */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 CellsX = 5;

    /** Number of cells in Y */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 CellsY = 5;

    // ─── Loading ─────────────────────────────────────────────────────────────

    /** Default loading radius around player */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    float DefaultLoadingRadius = 3000.0f;

    /** Unloading radius (must be > LoadingRadius to prevent thrashing) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    float DefaultUnloadingRadius = 4500.0f;

    /** Loading priority for cells containing player spawn points */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 SpawnCellPriority = -100;

    /** Loading priority for cells containing ZEX */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 ZEXCellPriority = -50;

    // ─── HLOD ────────────────────────────────────────────────────────────────

    /** Enable HLOD generation */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    bool bEnableHLOD = true;

    /** HLOD levels (0=highest detail, 3=lowest/billboard) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    TArray<FKhaaosHLODConfig> HLODLevels;

    // ─── Data Layers ─────────────────────────────────────────────────────────

    /** Data layers for CIGKV */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    TArray<ECIGKVDataLayer> ActiveDataLayers;

    /** Initially loaded data layers (always in memory) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    TArray<ECIGKVDataLayer> InitiallyLoadedLayers;

    // ─── Performance ─────────────────────────────────────────────────────────

    /** Max concurrent cell loading operations */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 MaxConcurrentLoads = 4;

    /** Enable async loading (non-blocking) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    bool bAsyncLoading = true;

    /** Memory budget for streaming (MB) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 StreamingMemoryBudgetMB = 512;

    // ─── Initialization ──────────────────────────────────────────────────────

    UKhaaosCIGKVWorldPartition();

    /** Initialize with default CIGKV World Partition config */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldPartition")
    void InitializeDefaults();

    /** Get partition cells for a given player position */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldPartition")
    TArray<FName> GetCellsToLoad(const FVector& PlayerPosition, float LoadingRadius) const;

    /** Get data layers that should be active for a position */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldPartition")
    TArray<ECIGKVDataLayer> GetActiveDataLayersForPosition(const FVector& Position) const;
};
