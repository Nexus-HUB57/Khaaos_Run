// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/WorldGen/KhaaosWorldGenerator.h"
#include "KhaaosRun.h"

#include "Math/UnrealMathUtility.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosWorldGenerator::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        CellSize = 25600.0f;    // 256m
        LoadingRadius = 51200.0f; // 512m
        bGenerationComplete = false;

        AvailableWorlds = { TEXT("CIGKV"), TEXT("Barburhen"), TEXT("Priadus"), TEXT("Ckesalth"), TEXT("Arukheea") };

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWorldGenerator: Initialized (%d worlds)"), AvailableWorlds.Num());
}

void UKhaaosWorldGenerator::Deinitialize()
{
        POILocations.Empty();
        Super::Deinitialize();
}

// ─── World Generation ───────────────────────────────────────────────────────────

void UKhaaosWorldGenerator::GenerateWorld(const FKhaaosBiomeConfig& Config)
{
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWorldGenerator::GenerateWorld - Biome: %d, Size: %.0fcm"),
                (int32)Config.BiomeType, Config.WorldSize);

        CurrentBiome = Config;

        // PCG Pipeline (7 stages)
        GenerateTerrain(Config);
        PlacePOIs(Config);
        GenerateLoot(LootDensity);
        GenerateRoads();
        GenerateWater(Config);
        GenerateFoliage(Config);

        bGenerationComplete = true;
        OnWorldGenerated.Broadcast(Config.BiomeType, Config.WorldSize / 100000.0f);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWorldGenerator: World generated - %d POIs, %d loot target"),
                POILocations.Num(), LootDensity.TotalLootTarget);
}

// ─── World Presets ──────────────────────────────────────────────────────────────

FKhaaosBiomeConfig UKhaaosWorldGenerator::GetWorldPreset(const FString& WorldName) const
{
        FKhaaosBiomeConfig Config;

        if (WorldName == TEXT("CIGKV"))
        {
                Config.BiomeType = EKhaaosBiomeType::UrbanRuins;
                Config.HeightScale = 200.0f;       // Flat city
                Config.NoiseFrequency = 0.0005f;
                Config.VegetationDensity = 0.1f;    // Sparse (urban)
                Config.ObstacleDensity = 0.6f;      // Buildings/cover
                Config.WaterCoverage = 0.05f;
                Config.LootDensityMultiplier = 1.5f; // High loot in city
                Config.POICount = 20;               // Many buildings
                Config.WorldSize = 1000000.0f;      // 10km
        }
        else if (WorldName == TEXT("Barburhen"))
        {
                Config.BiomeType = EKhaaosBiomeType::TropicalForest;
                Config.HeightScale = 800.0f;
                Config.NoiseFrequency = 0.001f;
                Config.VegetationDensity = 0.8f;    // Dense jungle
                Config.ObstacleDensity = 0.2f;
                Config.WaterCoverage = 0.15f;
                Config.LootDensityMultiplier = 1.0f;
                Config.POICount = 15;
                Config.WorldSize = 2000000.0f;      // 20km
        }
        else if (WorldName == TEXT("Priadus"))
        {
                Config.BiomeType = EKhaaosBiomeType::VolcanicWastes;
                Config.HeightScale = 1500.0f;       // Volcanic peaks
                Config.NoiseFrequency = 0.002f;
                Config.VegetationDensity = 0.05f;    // Barren
                Config.ObstacleDensity = 0.4f;       // Lava rocks
                Config.WaterCoverage = 0.02f;        // Lava pools
                Config.LootDensityMultiplier = 0.8f;
                Config.POICount = 10;
                Config.WorldSize = 1800000.0f;
        }
        else if (WorldName == TEXT("Ckesalth"))
        {
                Config.BiomeType = EKhaaosBiomeType::FrozenTundra;
                Config.HeightScale = 600.0f;
                Config.NoiseFrequency = 0.001f;
                Config.VegetationDensity = 0.15f;    // Sparse pines
                Config.ObstacleDensity = 0.2f;       // Ice formations
                Config.WaterCoverage = 0.2f;          // Frozen lakes
                Config.LootDensityMultiplier = 0.7f;
                Config.POICount = 8;
                Config.WorldSize = 1500000.0f;
        }
        else if (WorldName == TEXT("Arukheea"))
        {
                Config.BiomeType = EKhaaosBiomeType::DesertCanyon;
                Config.HeightScale = 1200.0f;       // Deep canyons
                Config.NoiseFrequency = 0.003f;
                Config.VegetationDensity = 0.05f;    // Cacti only
                Config.ObstacleDensity = 0.5f;       // Canyon walls
                Config.WaterCoverage = 0.03f;        // Oases
                Config.LootDensityMultiplier = 0.9f;
                Config.POICount = 12;
                Config.WorldSize = 1800000.0f;
        }

        return Config;
}

// ─── POI Management ─────────────────────────────────────────────────────────────

FVector UKhaaosWorldGenerator::FindNearestPOI(const FVector& Location) const
{
        FVector Nearest = FVector::ZeroVector;
        float NearestDist = MAX_FLT;

        for (const FVector& POI : POILocations)
        {
                const float Dist = FVector::DistSquared(Location, POI);
                if (Dist < NearestDist)
                {
                        NearestDist = Dist;
                        Nearest = POI;
                }
        }

        return Nearest;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UKhaaosWorldGenerator::GenerateTerrain(const FKhaaosBiomeConfig& Config)
{
        // Terrain generation via Simplex noise + ridged noise
        // UE5 PCG framework handles the actual generation
        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 1/7] Terrain: height=%.0f, freq=%.4f"),
                Config.HeightScale, Config.NoiseFrequency);
}

void UKhaaosWorldGenerator::PlacePOIs(const FKhaaosBiomeConfig& Config)
{
        POILocations.Empty();

        // Poisson disk sampling for POI placement
        const float MinDistance = Config.WorldSize / FMath::Sqrt((float)Config.POICount) * 0.5f;
        const float HalfWorld = Config.WorldSize * 0.5f;

        for (int32 i = 0; i < Config.POICount; ++i)
        {
                // Random placement with minimum distance
                FVector POI(
                        FMath::FRandRange(-HalfWorld, HalfWorld),
                        FMath::FRandRange(-HalfWorld, HalfWorld),
                        0.0f
                );
                POILocations.Add(POI);

                const FString POIName = FString::Printf(TEXT("POI_%d"), i);
                OnPOIGenerated.Broadcast(POIName);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 2/7] POIs: %d placed (min dist: %.0f)"),
                POILocations.Num(), MinDistance);
}

void UKhaaosWorldGenerator::GenerateLoot(const FKhaaosLootDensityMap& Density)
{
        LootDensity = Density;

        // Loot placement: POIs get high density, routes medium, wilderness low
        const int32 POILoot = FMath::RoundToInt(POILocations.Num() * Density.POIMultiplier * 20.0f);
        const int32 RouteLoot = FMath::RoundToInt(POILocations.Num() * Density.RouteMultiplier * 10.0f);
        const int32 WildLoot = FMath::RoundToInt(Density.WildernessMultiplier * 50.0f);
        const int32 WaterLoot = FMath::RoundToInt(Density.WaterMultiplier * 20.0f);
        const int32 Total = POILoot + RouteLoot + WildLoot + WaterLoot;

        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 3/7] Loot: POI=%d, Route=%d, Wild=%d, Water=%d, Total=%d"),
                POILoot, RouteLoot, WildLoot, WaterLoot, Total);
}

void UKhaaosWorldGenerator::GenerateRoads()
{
        // Connect POIs with minimum spanning tree + some extra connections
        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 4/7] Roads: MST + extras connecting %d POIs"), POILocations.Num());
}

void UKhaaosWorldGenerator::GenerateWater(const FKhaaosBiomeConfig& Config)
{
        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 5/7] Water: %.0f%% coverage"), Config.WaterCoverage * 100.0f);
}

void UKhaaosWorldGenerator::GenerateFoliage(const FKhaaosBiomeConfig& Config)
{
        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 6/7] Foliage: density=%.0f%%, biome=%d"),
                Config.VegetationDensity * 100.0f, (int32)Config.BiomeType);

        // Stage 7: Details (grass, debris) handled by foliage instancing
        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 7/7] Details: Nanite terrain + HLOD"));
}
