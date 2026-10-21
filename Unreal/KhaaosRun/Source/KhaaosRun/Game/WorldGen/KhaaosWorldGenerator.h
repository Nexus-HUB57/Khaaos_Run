// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Game/WorldGen/KhaaosWorldGenerator.generated.h"

// ─── World Biome Types ──────────────────────────────────────────────────────────

/**
 * EKhaaosBiomeType
 * Biome types per world. Each world has a dominant + secondary biome.
 */
UENUM(BlueprintType)
enum class EKhaaosBiomeType : uint8
{
        TropicalForest  UMETA(DisplayName = "TROPICAL_FOREST"),  // Barburhen — dense jungle
        VolcanicWastes  UMETA(DisplayName = "VOLCANIC_WASTES"),  // Priadus — lava fields
        FrozenTundra    UMETA(DisplayName = "FROZEN_TUNDRA"),     // Ckesalth — ice/snow
        DesertCanyon    UMETA(DisplayName = "DESERT_CANYON"),     // Arukheea — sand/canyon
        UrbanRuins      UMETA(DisplayName = "URBAN_RUINS"),       // CIGKV — post-apoc city
        OceanArchipel   UMETA(DisplayName = "OCEAN_ARCHIPEL"),    // Coastal islands
        Underground     UMETA(DisplayName = "UNDERGROUND"),       // Caves/tunnels
        SkyIslands      UMETA(DisplayName = "SKY_ISLANDS")        // Floating platforms
};

/**
 * FKhaaosBiomeConfig
 * Configuration for a biome's generation parameters.
 */
USTRUCT(BlueprintType)
struct FKhaaosBiomeConfig
{
        GENERATED_BODY()

        /** Biome type. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        EKhaaosBiomeType BiomeType = EKhaaosBiomeType::TropicalForest;

        /** Terrain height scale (cm). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float HeightScale = 1000.0f;

        /** Terrain noise frequency. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float NoiseFrequency = 0.001f;

        /** Vegetation density 0-1. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float VegetationDensity = 0.5f;

        /** Rock/obstacle density 0-1. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float ObstacleDensity = 0.3f;

        /** Water coverage 0-1. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float WaterCoverage = 0.1f;

        /** Loot spawn density multiplier. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float LootDensityMultiplier = 1.0f;

        /** POI count (points of interest: buildings, compounds). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        int32 POICount = 15;

        /** World size (cm × cm). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Biome")
        float WorldSize = 2000000.0f; // 20km × 20km
};

/**
 * FKhaaosLootDensityMap
 * Loot density configuration per area type.
 */
USTRUCT(BlueprintType)
struct FKhaaosLootDensityMap
{
        GENERATED_BODY()

        /** POI loot multiplier (buildings/compounds have high loot). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
        float POIMultiplier = 3.0f;

        /** Route multiplier (paths between POIs). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
        float RouteMultiplier = 1.0f;

        /** Wilderness multiplier (sparse areas). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
        float WildernessMultiplier = 0.3f;

        /** Water loot multiplier (underwater loot). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
        float WaterMultiplier = 0.5f;

        /** Total loot items for this world. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
        int32 TotalLootTarget = 500;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnWorldGenerated, EKhaaosBiomeType, Biome, float, WorldSizeKm);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnPOIGenerated, const FString&, POIName);

/**
 * UKhaaosWorldGenerator
 *
 * Procedural world generation system using PCG framework for terrain,
 * vegetation, loot placement, and POI layout. Each of the 5 worlds
 * has unique biome configuration and generation rules.
 *
 * World Biome Map:
 *   CIGKV    → UrbanRuins (50p lobby, post-apoc city)
 *   Barburhen → TropicalForest (100p, dense jungle)
 *   Priadus  → VolcanicWastes (75p, lava fields)
 *   Ckesalth → FrozenTundra (60p, ice/snow)
 *   Arukheea → DesertCanyon (80p, sand/canyon)
 *
 * PCG Pipeline:
 *   1. Terrain: Height map from noise (Simplex + ridged)
 *   2. Biome: Apply biome rules (vegetation, water, obstacles)
 *   3. POIs: Place points of interest (villages, compounds, towers)
 *   4. Loot: Density-based placement (POI-heavy, route-sparse)
 *   5. Roads: Connect POIs with paths
 *   6. Water: Rivers, lakes, ocean edges
 *   7. Details: Grass, foliage, debris, ambient
 *
 * World Partition:
 *   - Loading cell size: 256m × 256m
 *   - Data layers: Terrain, Foliage, Loot, Collision
 *   - Spatial loading: Players load cells within 512m radius
 *   - Server: All cells loaded, client: spatial loading only
 *
 * Console Optimization:
 *   - PS5/XSX: Max 4km draw distance, 2km foliage
 *   - Switch2: Max 2km draw distance, 1km foliage, reduced density
 *   - HLOD: Hierarchical LOD for distant terrain
 *   - Nanite: Virtual geometry for terrain meshes
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosWorldGenerator : public UWorldSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── World Generation ─────────────────────────────────────────────────

        /** Generate world with biome config. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen")
        void GenerateWorld(const FKhaaosBiomeConfig& Config);

        /** Get current biome config. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen")
        const FKhaaosBiomeConfig& GetCurrentBiome() const { return CurrentBiome; }

        /** Get loot density map. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen")
        const FKhaaosLootDensityMap& GetLootDensity() const { return LootDensity; }

        // ─── World Presets ────────────────────────────────────────────────────

        /** Get biome config for a specific world. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen")
        FKhaaosBiomeConfig GetWorldPreset(const FString& WorldName) const;

        /** Available world presets. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen")
        TArray<FString> AvailableWorlds;

        // ─── POI Management ───────────────────────────────────────────────────

        /** Get generated POI locations. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen")
        TArray<FVector> GetPOILocations() const { return POILocations; }

        /** Find nearest POI to a location. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen")
        FVector FindNearestPOI(const FVector& Location) const;

        // ─── World Partition ──────────────────────────────────────────────────

        /** Loading cell size (cm). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|WorldGen|Partition")
        float CellSize;

        /** Spatial loading radius (cm). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|WorldGen|Partition")
        float LoadingRadius;

        /** Is generation complete? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen")
        uint8 bGenerationComplete : 1;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen")
        FOnWorldGenerated OnWorldGenerated;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen")
        FOnPOIGenerated OnPOIGenerated;

private:

        /** Current biome configuration. */
        FKhaaosBiomeConfig CurrentBiome;

        /** Loot density map. */
        FKhaaosLootDensityMap LootDensity;

        /** Generated POI locations. */
        TArray<FVector> POILocations;

        /** Generate terrain height map. */
        void GenerateTerrain(const FKhaaosBiomeConfig& Config);

        /** Place POIs using Poisson disk sampling. */
        void PlacePOIs(const FKhaaosBiomeConfig& Config);

        /** Generate loot placement based on density map. */
        void GenerateLoot(const FKhaaosLootDensityMap& Density);

        /** Generate roads connecting POIs. */
        void GenerateRoads();

        /** Generate water features. */
        void GenerateWater(const FKhaaosBiomeConfig& Config);

        /** Generate foliage and details. */
        void GenerateFoliage(const FKhaaosBiomeConfig& Config);
};
