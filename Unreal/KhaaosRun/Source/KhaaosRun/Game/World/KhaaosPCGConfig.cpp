// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/World/KhaaosPCGConfig.h"
#include "Engine/DataTable.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosPCGConfigSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Default configuration for a standard Khaaos Run map
	CachedPCGRules.MapSize = 10000.0f;
	CachedPCGRules.WorldSeed = 42;
	CachedPCGRules.bUseSeed = true;

	// Default biome settings
	CachedPCGRules.BiomeSettings.SetNum(static_cast<int32>(EKhaaosBiomeType::Count));

	for (int32 i = 0; i < static_cast<int32>(EKhaaosBiomeType::Count); ++i)
	{
		FKhaaosBiomeConfig& Biome = CachedPCGRules.BiomeSettings[i];
		Biome.BiomeType = static_cast<EKhaaosBiomeType>(i);

		switch (Biome.BiomeType)
		{
		case EKhaaosBiomeType::Desert:
			Biome.LootSpawnDensity = 1.5f;
			Biome.HeightOffset = 0.0f;
			Biome.NoiseScale = 0.8f;
			Biome.Temperature = 45.0f;
			break;

		case EKhaaosBiomeType::Forest:
			Biome.LootSpawnDensity = 3.0f;
			Biome.HeightOffset = 100.0f;
			Biome.NoiseScale = 1.2f;
			Biome.Temperature = 20.0f;
			break;

		case EKhaaosBiomeType::Ruins:
			Biome.LootSpawnDensity = 4.0f;
			Biome.HeightOffset = 50.0f;
			Biome.NoiseScale = 1.0f;
			Biome.Temperature = 22.0f;
			break;

		case EKhaaosBiomeType::Urban:
			Biome.LootSpawnDensity = 5.0f;
			Biome.HeightOffset = 0.0f;
			Biome.NoiseScale = 0.5f;
			Biome.Temperature = 25.0f;
			break;

		case EKhaaosBiomeType::Volcanic:
			Biome.LootSpawnDensity = 2.0f;
			Biome.HeightOffset = 200.0f;
			Biome.NoiseScale = 2.0f;
			Biome.Temperature = 40.0f;
			break;

		default:
			Biome.LootSpawnDensity = 2.0f;
			break;
		}
	}

	// Default landscape settings
	CachedPCGRules.LandscapeSettings.MinHeight = -500.0f;
	CachedPCGRules.LandscapeSettings.MaxHeight = 2000.0f;
	CachedPCGRules.LandscapeSettings.NoiseScale = 0.001f;
	CachedPCGRules.LandscapeSettings.NoiseOctaves = 6;
	CachedPCGRules.LandscapeSettings.Resolution = 1024;

	// Default loot distribution (matching DefaultGame.ini rarity weights)
	CachedPCGRules.LootDistribution.TotalLootSpawns = 200;
	CachedPCGRules.LootDistribution.MinSpawnDistance = 500.0f;
	CachedPCGRules.LootDistribution.CommonWeight = 55.0f;
	CachedPCGRules.LootDistribution.UncommonWeight = 25.0f;
	CachedPCGRules.LootDistribution.RareWeight = 14.0f;
	CachedPCGRules.LootDistribution.EpicWeight = 5.0f;
	CachedPCGRules.LootDistribution.LegendaryWeight = 1.0f;
	CachedPCGRules.LootDistribution.POIMultiplier = 3.0f;

	// Default zone layout
	CachedPCGRules.ZoneLayout.InitialRadiusPercent = 0.5f;
	CachedPCGRules.ZoneLayout.CenterRandomOffset = 0.2f;
	CachedPCGRules.ZoneLayout.NumPhases = 5;
	CachedPCGRules.ZoneLayout.bEnableZoneMovement = true;

	// Attempt to load from DataTable if configured
	if (PCGRulesDataTable.IsValid() || PCGRulesDataTable.IsPending())
	{
		LoadPCGRules();
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosPCGConfigSubsystem: Initialized with %d biomes"),
		CachedPCGRules.BiomeSettings.Num());
}

void UKhaaosPCGConfigSubsystem::Deinitialize()
{
	CachedPCGRules.BiomeSettings.Empty();
	bRulesLoaded = false;
	Super::Deinitialize();
}

void UKhaaosPCGConfigSubsystem::Tick(float DeltaTime)
{
	// No continuous ticking needed — rules are loaded once
}

TStatId UKhaaosPCGConfigSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_STAT_ID(KhaaosPCGConfigSubsystem);
}

// ─── Rules Access ────────────────────────────────────────────────────────────

const FKhaaosBiomeConfig* UKhaaosPCGConfigSubsystem::GetBiomeConfig(EKhaaosBiomeType BiomeType) const
{
	for (const FKhaaosBiomeConfig& Biome : CachedPCGRules.BiomeSettings)
	{
		if (Biome.BiomeType == BiomeType)
		{
			return &Biome;
		}
	}
	return nullptr;
}

// ─── Data Table Loading ──────────────────────────────────────────────────────

void UKhaaosPCGConfigSubsystem::SetPCGRulesDataTable(TSoftObjectPtr<UDataTable> InDataTable)
{
	PCGRulesDataTable = InDataTable;
}

bool UKhaaosPCGConfigSubsystem::LoadPCGRules()
{
	if (!PCGRulesDataTable.IsValid() && !PCGRulesDataTable.IsPending())
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosPCGConfigSubsystem::LoadPCGRules: No DataTable configured"));
		return false;
	}

	UDataTable* DataTable = PCGRulesDataTable.LoadSynchronous();
	if (!DataTable)
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosPCGConfigSubsystem::LoadPCGRules: Failed to load DataTable"));
		return false;
	}

	// Find the first row (PCG rules are typically a single-row table)
	TArray<FKhaaosPCGRules*> AllRows;
	DataTable->GetAllRows<FKhaaosPCGRules>(TEXT("KhaaosPCGConfigSubsystem"), AllRows);

	if (AllRows.Num() > 0)
	{
		CachedPCGRules = *AllRows[0];
		bRulesLoaded = true;

		UE_LOG(LogTemp, Log, TEXT("KhaaosPCGConfigSubsystem: Loaded PCG rules from DataTable — %d biomes, MapSize=%.0f"),
			CachedPCGRules.BiomeSettings.Num(), CachedPCGRules.MapSize);
		return true;
	}

	UE_LOG(LogTemp, Warning, TEXT("KhaaosPCGConfigSubsystem::LoadPCGRules: DataTable has no rows"));
	return false;
}
