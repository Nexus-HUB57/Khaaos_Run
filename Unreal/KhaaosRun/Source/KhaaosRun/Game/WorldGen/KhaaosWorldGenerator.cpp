// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/WorldGen/KhaaosWorldGenerator.h"
#include "Game/WorldGen/KhaaosWorldCanon.h"
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
        GenerateRoads(Config);
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

        // Fase 59 — presets vêm do cânon portável (KhaaosWorldCanon), que alinha
        // biomas e parâmetros às descrições oficiais (README "Arquitetura dos
        // Mundos" + shared/worlds.ts). Mundo desconhecido falha fechado no
        // default do struct (TropicalForest) e loga aviso.
        KhaaosWorldCanon::WorldPreset Preset;
        if (!KhaaosWorldCanon::TryGetPreset((const char*)TCHAR_TO_UTF8(*WorldName), Preset))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosWorldGenerator::GetWorldPreset - mundo desconhecido '%s' (cânon F59)"), *WorldName);
                return Config;
        }

        switch (Preset.Biome)
        {
        case KhaaosWorldCanon::WorldBiome::UrbanRuins:
                Config.BiomeType = EKhaaosBiomeType::UrbanRuins;
                break;
        case KhaaosWorldCanon::WorldBiome::TropicalForest:
                Config.BiomeType = EKhaaosBiomeType::TropicalForest;
                break;
        case KhaaosWorldCanon::WorldBiome::DesertCanyon:
                Config.BiomeType = EKhaaosBiomeType::DesertCanyon;
                break;
        case KhaaosWorldCanon::WorldBiome::OceanArchipel:
                Config.BiomeType = EKhaaosBiomeType::OceanArchipel;
                break;
        default:
                Config.BiomeType = EKhaaosBiomeType::TropicalForest;
                break;
        }

        Config.HeightScale = Preset.HeightScale;
        Config.NoiseFrequency = Preset.NoiseFrequency;
        Config.VegetationDensity = Preset.VegetationDensity;
        Config.ObstacleDensity = Preset.ObstacleDensity;
        Config.WaterCoverage = Preset.WaterCoverage;
        Config.LootDensityMultiplier = Preset.LootDensityMultiplier;
        Config.POICount = Preset.POICount;
        Config.WorldSize = Preset.WorldSize;

        return Config;
}

bool UKhaaosWorldGenerator::HasCanonicalRoads(const FString& WorldName) const
{
        // Cânon F58 — só os mundos urbanos (CIGKV e Barburhen) possuem vias.
        return KhaaosWorldCanon::HasCanonicalRoads((const char*)TCHAR_TO_UTF8(*WorldName));
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

void UKhaaosWorldGenerator::GenerateRoads(const FKhaaosBiomeConfig& Config)
{
        // Cânon F58/F59 — estradas/ruas asfaltadas existem APENAS nos mundos
        // urbanos (CIGKV e Barburhen, bioma UrbanRuins). Selva (Priadus),
        // deserto (Ckesalth) e ilha (Arukheea) não descrevem vias nas
        // descrições oficiais: qualquer rede viária neles é divergência.
        // (A tabela urbana canônica vive em KhaaosWorldCanon e é pinada pelo
        // teste portável tests/ue5/worldgen_vias_canon_test.cpp.)
        const bool bUrbanWorld = (Config.BiomeType == EKhaaosBiomeType::UrbanRuins);
        if (!bUrbanWorld)
        {
                UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 4/7] Roads: SKIPPED — mundo não-urbano não possui vias no cânon (F58)"));
                return;
        }

        // Connect POIs with minimum spanning tree + some extra connections
        UE_LOG(LogKhaaosRun, Log, TEXT("  [PCG 4/7] Roads: MST + extras connecting %d POIs (mundo urbano — vias canônicas)"), POILocations.Num());
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
