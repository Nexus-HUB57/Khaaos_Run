// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/WorldGen/KhaaosProceduralLoot.h"
#include "KhaaosRun.h"

#include "Math/UnrealMathUtility.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosProceduralLootComponent::UKhaaosProceduralLootComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	PrimaryComponentTick.bStartWithTickEnabled = false;

	BaseLootPerZone = 25;
	DistanceFalloffExponent = 1.5f;
	LootSeed = 0;

	// Default spawn rules for all tiers
	SpawnRules = {
		FKhaaosLootSpawnRule{EKhaaosLootTier::Comum,    0.0f,     100000.0f, 55.0f, 15},
		FKhaaosLootSpawnRule{EKhaaosLootTier::Incomum,  0.0f,     80000.0f,  28.0f, 8},
		FKhaaosLootSpawnRule{EKhaaosLootTier::Raro,     0.0f,     60000.0f,  12.0f, 5},
		FKhaaosLootSpawnRule{EKhaaosLootTier::Epico,    0.0f,     40000.0f,  4.0f,  2},
		FKhaaosLootSpawnRule{EKhaaosLootTier::Lendario, 0.0f,     20000.0f,  1.5f,  1},
		FKhaaosLootSpawnRule{EKhaaosLootTier::Mitico,   0.0f,     10000.0f,  0.5f,  1}
	};
}

// ─── Loot Generation ───────────────────────────────────────────────────────────

TArray<FKhaaosLootSpawnResult> UKhaaosProceduralLootComponent::GenerateLootForZone(
	int32 ZoneId, EKhaaosBiomeType Biome, const FVector& Center, float Radius)
{
	TArray<FKhaaosLootSpawnResult> Results;

	// Compute spawn count based on biome
	const int32 SpawnCount = ComputeSpawnCount(Biome);

	UE_LOG(LogKhaaosRun, Log, TEXT("ProceduralLoot::GenerateLootForZone - Zone=%d, Biome=%d, Count=%d, Radius=%.0f"),
		ZoneId, (int32)Biome, SpawnCount, Radius);

	for (int32 i = 0; i < SpawnCount; ++i)
	{
		// Random position within zone radius
		const float Angle = LootRNG.FRandRange(0.0f, 2.0f * PI);
		const float Dist = LootRNG.FRandRange(0.0f, Radius);
		const FVector SpawnLocation(
			Center.X + Dist * FMath::Cos(Angle),
			Center.Y + Dist * FMath::Sin(Angle),
			Center.Z
		);

		// Select tier based on distance from center and weights
		const EKhaaosLootTier SelectedTier = SelectWeightedTier(Dist);

		// Check max spawn per zone for this tier
		int32 TierCount = 0;
		for (const FKhaaosLootSpawnResult& Existing : Results)
		{
			if (Existing.Tier == SelectedTier)
			{
				++TierCount;
			}
		}

		// Find rule for this tier
		int32 MaxForTier = 10;
		for (const FKhaaosLootSpawnRule& Rule : SpawnRules)
		{
			if (Rule.LootTier == SelectedTier)
			{
				MaxForTier = Rule.MaxSpawnPerZone;
				break;
			}
		}

		if (TierCount >= MaxForTier)
		{
			continue;
		}

		// Create spawn result
		FKhaaosLootSpawnResult Result;
		Result.Location = SpawnLocation;
		Result.Tier = SelectedTier;
		Result.bWasPickedUp = false;
		// SpawnedItemClass left null — populated by game-specific loot table lookup
		Results.Add(Result);
	}

	// Store in zone map
	ZoneLootMap.Add(ZoneId, Results);

	// Broadcast
	OnLootSpawnedForZone.Broadcast(ZoneId, Biome, Results.Num());

	UE_LOG(LogKhaaosRun, Log, TEXT("ProceduralLoot: Zone %d — spawned %d items (requested %d)"),
		ZoneId, Results.Num(), SpawnCount);

	return Results;
}

float UKhaaosProceduralLootComponent::GetLootSpawnProbability(EKhaaosLootTier Tier, float Distance) const
{
	// Find matching rule
	for (const FKhaaosLootSpawnRule& Rule : SpawnRules)
	{
		if (Rule.LootTier == Tier)
		{
			// Out of distance range → zero probability
			if (Distance < Rule.MinDistance || Distance > Rule.MaxDistance)
			{
				return 0.0f;
			}

			// Probability = weight * distance falloff
			// Higher tiers decay faster with distance (higher exponent for rarer items)
			const int32 TierIndex = static_cast<int32>(Tier);
			const float Falloff = FMath::Exp(-DistanceFalloffExponent * TierIndex * Distance / Rule.MaxDistance);

			return FMath::Clamp(Rule.SpawnWeight * Falloff, 0.0f, 1.0f);
		}
	}

	return 0.0f;
}

void UKhaaosProceduralLootComponent::ClearLootForZone(int32 ZoneId)
{
	const int32 Removed = ZoneLootMap.Remove(ZoneId);
	UE_LOG(LogKhaaosRun, Log, TEXT("ProceduralLoot::ClearLootForZone - Zone=%d, Removed=%d"), ZoneId, Removed);
}

void UKhaaosProceduralLootComponent::SetLootSeed(int32 Seed)
{
	LootSeed = Seed;
	LootRNG.Initialize(Seed);
	UE_LOG(LogKhaaosRun, Log, TEXT("ProceduralLoot::SetLootSeed - Seed=%d"), Seed);
}

// ─── Internal ───────────────────────────────────────────────────────────────────

float UKhaaosProceduralLootComponent::GetTierWeight(EKhaaosLootTier Tier) const
{
	for (const FKhaaosLootSpawnRule& Rule : SpawnRules)
	{
		if (Rule.LootTier == Tier)
		{
			return Rule.SpawnWeight;
		}
	}
	return 1.0f;
}

EKhaaosLootTier UKhaaosProceduralLootComponent::SelectWeightedTier(float Distance)
{
	// Compute probabilities for each tier at this distance
	float TotalWeight = 0.0f;
	float Probabilities[6] = {0.0f};

	for (int32 i = 0; i < 6; ++i)
	{
		const EKhaaosLootTier Tier = static_cast<EKhaaosLootTier>(i);
		Probabilities[i] = GetLootSpawnProbability(Tier, Distance);
		TotalWeight += Probabilities[i];
	}

	if (TotalWeight <= 0.0f)
	{
		return EKhaaosLootTier::Comum;
	}

	// Weighted random selection
	float Roll = LootRNG.FRandRange(0.0f, TotalWeight);
	float Accumulated = 0.0f;

	for (int32 i = 0; i < 6; ++i)
	{
		Accumulated += Probabilities[i];
		if (Roll <= Accumulated)
		{
			return static_cast<EKhaaosLootTier>(i);
		}
	}

	return EKhaaosLootTier::Comum;
}

int32 UKhaaosProceduralLootComponent::ComputeSpawnCount(EKhaaosBiomeType Biome) const
{
	// Use FKhaaosBiomeConfig from WorldGenerator for biome-aware scaling
	float Multiplier = 1.0f;

	switch (Biome)
	{
	case EKhaaosBiomeType::UrbanRuins:
		Multiplier = 1.5f;    // High loot in urban areas
		break;
	case EKhaaosBiomeType::TropicalForest:
		Multiplier = 1.0f;    // Standard loot in jungle
		break;
	case EKhaaosBiomeType::VolcanicWastes:
		Multiplier = 0.8f;    // Reduced loot in volcanic
		break;
	case EKhaaosBiomeType::FrozenTundra:
		Multiplier = 0.7f;    // Sparse loot in tundra
		break;
	case EKhaaosBiomeType::DesertCanyon:
		Multiplier = 0.9f;    // Moderate loot in desert
		break;
	case EKhaaosBiomeType::OceanArchipel:
		Multiplier = 0.5f;    // Low loot in ocean
		break;
	case EKhaaosBiomeType::Underground:
		Multiplier = 1.2f;    // Good loot in caves
		break;
	case EKhaaosBiomeType::SkyIslands:
		Multiplier = 1.3f;    // High-value loot on sky islands
		break;
	default:
		Multiplier = 1.0f;
		break;
	}

	return FMath::RoundToInt(BaseLootPerZone * Multiplier);
}
