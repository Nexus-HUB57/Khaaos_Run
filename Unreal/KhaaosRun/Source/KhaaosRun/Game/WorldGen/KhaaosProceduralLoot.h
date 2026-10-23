// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/WorldGen/KhaaosWorldGenerator.h"
#include "Game/WorldGen/KhaaosProceduralLoot.generated.h"

// ─── Loot Tier Enum ──────────────────────────────────────────────────────────

/**
 * EKhaaosLootTier
 * Loot rarity tiers for procedural loot generation.
 * Extends the base EKhaaosRarity with INCOMUM tier.
 */
UENUM(BlueprintType)
enum class EKhaaosLootTier : uint8
{
	Comum	UMETA(DisplayName = "COMUM"),
	Incomum	UMETA(DisplayName = "INCOMUM"),
	Raro	UMETA(DisplayName = "RARO"),
	Epico	UMETA(DisplayName = "EPICO"),
	Lendario UMETA(DisplayName = "LENDARIO"),
	Mitico	UMETA(DisplayName = "MITICO")
};

// ─── Loot Spawn Rule ─────────────────────────────────────────────────────────

/**
 * FKhaaosLootSpawnRule
 * Configuration rule for procedural loot spawning within a zone.
 */
USTRUCT(BlueprintType)
struct FKhaaosLootSpawnRule
{
	GENERATED_BODY()

	/** Loot tier for this rule. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	EKhaaosLootTier LootTier = EKhaaosLootTier::Comum;

	/** Minimum distance from zone center (cm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	float MinDistance = 0.0f;

	/** Maximum distance from zone center (cm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	float MaxDistance = 100000.0f;

	/** Spawn weight (higher = more likely to spawn). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	float SpawnWeight = 1.0f;

	/** Maximum spawns per zone for this tier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	int32 MaxSpawnPerZone = 10;
};

// ─── Loot Spawn Result ───────────────────────────────────────────────────────

/**
 * FKhaaosLootSpawnResult
 * Result of a procedural loot spawn operation.
 */
USTRUCT(BlueprintType)
struct FKhaaosLootSpawnResult
{
	GENERATED_BODY()

	/** Spawned item class (soft reference for async loading). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	TSoftClassPtr<AActor> SpawnedItemClass;

	/** Spawn location in world space. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	FVector Location = FVector::ZeroVector;

	/** Loot tier of spawned item. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	EKhaaosLootTier Tier = EKhaaosLootTier::Comum;

	/** Whether the loot was picked up by a player. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	uint8 bWasPickedUp : 1;

	FKhaaosLootSpawnResult()
		: Location(FVector::ZeroVector)
		, Tier(EKhaaosLootTier::Comum)
		, bWasPickedUp(false)
	{}
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnLootSpawnedForZone, int32, ZoneId, EKhaaosBiomeType, Biome, int32, SpawnCount);

/**
 * UKhaaosProceduralLootComponent
 *
 * Procedural loot spawner integrated with the WorldGenerator.
 * Generates biome-aware loot distribution based on zone parameters
 * and configurable spawn rules per loot tier.
 *
 * Architecture:
 *   - Per-zone loot generation using FKhaaosBiomeConfig for density
 *   - Distance-based probability: closer to center = higher-tier loot
 *   - Weighted random selection across tiers
 *   - Seedable RNG for deterministic generation (replay/repro)
 *   - Soft class references for async item loading
 *
 * Integration:
 *   - WorldGenerator calls GenerateLootForZone() after terrain + POI placement
 *   - BiomeConfig.LootDensityMultiplier scales spawn counts
 *   - ClearLootForZone() called on zone cleanup/reset
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosProceduralLootComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	UKhaaosProceduralLootComponent();

	// ─── Loot Generation ───────────────────────────────────────────────────

	/** Generate loot for a zone based on biome, center, and radius. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Loot")
	TArray<FKhaaosLootSpawnResult> GenerateLootForZone(int32 ZoneId, EKhaaosBiomeType Biome, const FVector& Center, float Radius);

	/** Get spawn probability for a tier at a given distance from zone center. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen|Loot")
	float GetLootSpawnProbability(EKhaaosLootTier Tier, float Distance) const;

	/** Clear all spawned loot for a zone. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Loot")
	void ClearLootForZone(int32 ZoneId);

	/** Set the random seed for deterministic loot generation. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Loot")
	void SetLootSeed(int32 Seed);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Spawn rules per loot tier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	TArray<FKhaaosLootSpawnRule> SpawnRules;

	/** Base loot count per zone before biome multiplier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	int32 BaseLootPerZone = 25;

	/** Distance falloff exponent for tier probability (higher = steeper falloff). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Loot")
	float DistanceFalloffExponent = 1.5f;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when loot is spawned for a zone. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Loot")
	FOnLootSpawnedForZone OnLootSpawnedForZone;

private:

	/** Per-zone spawned loot results. */
	TMap<int32, TArray<FKhaaosLootSpawnResult>> ZoneLootMap;

	/** Current random seed. */
	int32 LootSeed = 0;

	/** Random stream for deterministic generation. */
	FRandomStream LootRNG;

	/** Get tier spawn weight from rules. */
	float GetTierWeight(EKhaaosLootTier Tier) const;

	/** Select a random loot tier based on weights and distance. */
	EKhaaosLootTier SelectWeightedTier(float Distance);

	/** Compute spawn count for a zone given biome config. */
	int32 ComputeSpawnCount(EKhaaosBiomeType Biome) const;
};
