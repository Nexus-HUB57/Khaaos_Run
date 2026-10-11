// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Engine/DataTable.h"
#include "KhaaosPCGConfig.generated.h"

/**
 * EKhaaosBiomeType — Biome types for procedural world generation.
 * Each biome defines distinct ground materials, foliage, and VFX.
 */
UENUM(BlueprintType)
enum class EKhaaosBiomeType : uint8
{
	Desert		UMETA(DisplayName = "Desert"),
	Forest		UMETA(DisplayName = "Forest"),
	Ruins		UMETA(DisplayName = "Ruins"),
	Urban		UMETA(DisplayName = "Urban"),
	Volcanic	UMETA(DisplayName = "Volcanic"),
	Count		UMETA(Hidden)
};

/**
 * FKhaaosBiomeConfig — Configuration for a single biome in the PCG world.
 */
USTRUCT(BlueprintType)
struct FKhaaosBiomeConfig
{
	GENERATED_BODY()

	/** Biome type identifier. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome")
	EKhaaosBiomeType BiomeType = EKhaaosBiomeType::Desert;

	/** Soft reference to ground material for this biome. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome")
	TSoftObjectPtr<UMaterialInterface> GroundMaterial;

	/** Foliage types (PCG tags) to spawn in this biome. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome")
	TArray<FName> FoliageTypes;

	/** Ambient VFX Niagara system for this biome. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome")
	TSoftObjectPtr<class UNiagaraSystem> AmbientVFX;

	/** Loot spawn density (items per 1000x1000 units). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float LootSpawnDensity = 2.0f;

	/** World height offset for this biome. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome")
	float HeightOffset = 0.0f;

	/** Noise scale multiplier for terrain variation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome", meta = (ClampMin = "0.001"))
	float NoiseScale = 1.0f;

	/** Temperature value for this biome (affects VFX/loot). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Biome", meta = (ClampMin = "-50.0", ClampMax = "50.0"))
	float Temperature = 25.0f;
};

/**
 * FKhaaosLandscapeSettings — Landscape height and noise configuration.
 */
USTRUCT(BlueprintType)
struct FKhaaosLandscapeSettings
{
	GENERATED_BODY()

	/** Minimum landscape height. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Landscape")
	float MinHeight = -500.0f;

	/** Maximum landscape height. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Landscape")
	float MaxHeight = 2000.0f;

	/** Global noise scale for terrain variation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Landscape", meta = (ClampMin = "0.001"))
	float NoiseScale = 0.001f;

	/** Number of noise octaves for terrain detail. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Landscape", meta = (ClampMin = "1", ClampMax = "12"))
	int32 NoiseOctaves = 6;

	/** Height map resolution. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Landscape", meta = (ClampMin = "64"))
	int32 Resolution = 1024;
};

/**
 * FKhaaosZoneLayout — Safe zone layout configuration for PCG generation.
 */
USTRUCT(BlueprintType)
struct FKhaaosZoneLayout
{
	GENERATED_BODY()

	/** Initial safe zone radius as percentage of map size. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Zone", meta = (ClampMin = "0.1", ClampMax = "1.0"))
	float InitialRadiusPercent = 0.5f;

	/** Random offset for zone center from map center (0 = centered). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Zone", meta = (ClampMin = "0.0", ClampMax = "0.5"))
	float CenterRandomOffset = 0.2f;

	/** Number of zone shrink phases. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Zone", meta = (ClampMin = "1"))
	int32 NumPhases = 5;

	/** Whether zone movement is enabled (not just shrink-in-place). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Zone")
	bool bEnableZoneMovement = true;
};

/**
 * FKhaaosLootDistribution — Loot distribution rules for PCG spawning.
 */
USTRUCT(BlueprintType)
struct FKhaaosLootDistribution
{
	GENERATED_BODY()

	/** Total number of loot spawns across the map. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0"))
	int32 TotalLootSpawns = 200;

	/** Minimum distance between loot spawns. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0.0"))
	float MinSpawnDistance = 500.0f;

	/** Weight for Common rarity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0.0"))
	float CommonWeight = 55.0f;

	/** Weight for Uncommon rarity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0.0"))
	float UncommonWeight = 25.0f;

	/** Weight for Rare rarity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0.0"))
	float RareWeight = 14.0f;

	/** Weight for Epic rarity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0.0"))
	float EpicWeight = 5.0f;

	/** Weight for Legendary rarity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "0.0"))
	float LegendaryWeight = 1.0f;

	/** POI multiplier — loot density multiplier at points of interest. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG|Loot", meta = (ClampMin = "1.0"))
	float POIMultiplier = 3.0f;
};

/**
 * FKhaaosPCGRules — Complete PCG rules for procedural world generation.
 * Loaded from a DataTable at runtime by UKhaaosPCGConfigSubsystem.
 */
USTRUCT(BlueprintType)
struct FKhaaosPCGRules : public FTableRowBase
{
	GENERATED_BODY()

	/** Biome configurations. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG")
	TArray<FKhaaosBiomeConfig> BiomeSettings;

	/** Landscape height and noise settings. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG")
	FKhaaosLandscapeSettings LandscapeSettings;

	/** Loot distribution configuration. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG")
	FKhaaosLootDistribution LootDistribution;

	/** Safe zone layout configuration. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG")
	FKhaaosZoneLayout ZoneLayout;

	/** Map size in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG", meta = (ClampMin = "1000.0"))
	float MapSize = 10000.0f;

	/** World seed for deterministic generation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG")
	int32 WorldSeed = 42;

	/** Whether to use the seed for deterministic generation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PCG")
	bool bUseSeed = true;
};

/**
 * UKhaaosPCGConfigSubsystem — Tickable world subsystem that loads and provides
 * PCG rules for procedural world generation. Rules are loaded from a DataTable
 * asset and cached for fast access.
 */
UCLASS(Abstract, BlueprintType, Config = Game, defaultconfig)
class UKhaaosPCGConfigSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	// ─── Subsystem Lifecycle ──────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	// ─── Rules Access ────────────────────────────────────────────────────

	/** Get the current PCG rules (const reference). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PCG")
	const FKhaaosPCGRules& GetPCGRules() const { return CachedPCGRules; }

	/** Get biome config by type. Returns nullptr if not found. */
	const FKhaaosBiomeConfig* GetBiomeConfig(EKhaaosBiomeType BiomeType) const;

	/** Get all biome configs. */
	const TArray<FKhaaosBiomeConfig>& GetBiomeConfigs() const { return CachedPCGRules.BiomeSettings; }

	/** Get landscape settings. */
	const FKhaaosLandscapeSettings& GetLandscapeSettings() const { return CachedPCGRules.LandscapeSettings; }

	/** Get loot distribution. */
	const FKhaaosLootDistribution& GetLootDistribution() const { return CachedPCGRules.LootDistribution; }

	/** Get zone layout. */
	const FKhaaosZoneLayout& GetZoneLayout() const { return CachedPCGRules.ZoneLayout; }

	// ─── Data Table Loading ──────────────────────────────────────────────

	/** Set the data table asset to load PCG rules from. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|PCG")
	void SetPCGRulesDataTable(TSoftObjectPtr<UDataTable> InDataTable);

	/** Load PCG rules from the configured DataTable. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|PCG")
	bool LoadPCGRules();

	/** Check if rules are loaded and valid. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PCG")
	bool AreRulesLoaded() const { return bRulesLoaded; }

private:
	/** Soft reference to the PCG rules DataTable asset. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|PCG")
	TSoftObjectPtr<UDataTable> PCGRulesDataTable;

	/** Cached PCG rules (loaded from DataTable). */
	FKhaaosPCGRules CachedPCGRules;

	/** Whether rules have been successfully loaded. */
	bool bRulesLoaded = false;
};
