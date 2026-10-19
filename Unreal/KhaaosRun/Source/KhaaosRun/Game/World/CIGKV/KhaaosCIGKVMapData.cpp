// ============================================================================
// Khaaos Run — CIGKV Map Data Implementation (Fase 1)
// ============================================================================

#include "Game/World/CIGKV/KhaaosCIGKVMapData.h"
#include "Game/World/CIGKV/CIGKVLootRules.h"
#include "Kismet/GameplayStatics.h"
#include "Math/UnrealMathUtility.h"

// ─── Utility Functions ────────────────────────────────────────────────────────

TArray<FCIGKVLootSpawnPoint> UKhaaosCIGKVMapData::GetRandomLootSpawnEntries(
    int32 Count, FVector ZoneCenter, float ZoneRadius, int32 PhaseIndex) const
{
    TArray<FCIGKVLootSpawnPoint> Result;
    if (Count <= 0)
    {
        return Result;
    }

    // Keep each eligible entry intact so the level can apply its weights/rotation.
    TArray<const FCIGKVLootSpawnPoint*> ValidPoints;
    for (const FCIGKVLootSpawnPoint& Point : LootSpawnPoints)
    {
        const float DistanceSquared = FVector::DistSquared2D(Point.Location, ZoneCenter);
        if (KhaaosCIGKVRules::IsLootPointEligible(Point.MinPhase, PhaseIndex, DistanceSquared, ZoneRadius))
        {
            ValidPoints.Add(&Point);
        }
    }

    // Shuffle and pick Count points
    int32 NumToPick = FMath::Min(Count, ValidPoints.Num());
    TArray<int32> Indices;
    for (int32 i = 0; i < ValidPoints.Num(); i++) Indices.Add(i);

    // Fisher-Yates shuffle
    for (int32 i = Indices.Num() - 1; i > 0; i--)
    {
        int32 j = FMath::RandRange(0, i);
        Indices.Swap(i, j);
    }

    for (int32 i = 0; i < NumToPick; i++)
    {
        Result.Add(*ValidPoints[Indices[i]]);
    }

    return Result;
}

TArray<FVector> UKhaaosCIGKVMapData::GetRandomLootSpawnPoints(
    int32 Count, FVector ZoneCenter, float ZoneRadius, int32 PhaseIndex) const
{
    TArray<FVector> Result;
    const TArray<FCIGKVLootSpawnPoint> Entries = GetRandomLootSpawnEntries(Count, ZoneCenter, ZoneRadius, PhaseIndex);
    Result.Reserve(Entries.Num());
    for (const FCIGKVLootSpawnPoint& Entry : Entries)
    {
        Result.Add(Entry.Location);
    }
    return Result;
}

FVector UKhaaosCIGKVMapData::GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const
{
    // Random point within circle using rejection sampling
    float X, Y;
    do
    {
        X = FMath::FRandRange(-1.0f, 1.0f);
        Y = FMath::FRandRange(-1.0f, 1.0f);
    } while (X * X + Y * Y > 1.0f);

    return ZoneCenter + FVector(X * ZoneRadius, Y * ZoneRadius, 0.0f);
}

TArray<FCIGKVSpawnPoint> UKhaaosCIGKVMapData::GetSpawnsInSector(const FString& SectorName) const
{
    TArray<FCIGKVSpawnPoint> Result;
    for (const FCIGKVSpawnPoint& Spawn : PlayerSpawnPoints)
    {
        if (Spawn.SectorName == SectorName)
        {
            Result.Add(Spawn);
        }
    }
    return Result;
}

TArray<FCIGKVLootSpawnPoint> UKhaaosCIGKVMapData::GetLootInSector(const FString& SectorName) const
{
    TArray<FCIGKVLootSpawnPoint> Result;
    for (const FCIGKVLootSpawnPoint& Point : LootSpawnPoints)
    {
        if (Point.SectorName == SectorName)
        {
            Result.Add(Point);
        }
    }
    return Result;
}

TArray<FCIGKVEnvironmentMarker> UKhaaosCIGKVMapData::GetMarkersByType(ECIGKVEnvironmentType Type) const
{
    TArray<FCIGKVEnvironmentMarker> Result;
    for (const FCIGKVEnvironmentMarker& Marker : EnvironmentMarkers)
    {
        if (Marker.Type == Type)
        {
            Result.Add(Marker);
        }
    }
    return Result;
}

void UKhaaosCIGKVMapData::InitializeDefaults()
{
    // ─── Sectors ─────────────────────────────────────────────────────────────

    // Armory Hub (1/8 of map) — neutral zone
    ArmoryHub.SectorName = TEXT("ArmoryHub");
    ArmoryHub.MapFraction = 0.125f;
    ArmoryHub.BoundsMin = FVector(-5000.0f, -5000.0f, 0.0f);
    ArmoryHub.BoundsMax = FVector(-1875.0f, 5000.0f, 500.0f);
    ArmoryHub.bIsNeutralZone = true;

    // Proving Grounds (3/8 of map) — urban dense
    ProvingGrounds.SectorName = TEXT("ProvingGrounds");
    ProvingGrounds.MapFraction = 0.375f;
    ProvingGrounds.BoundsMin = FVector(-1875.0f, -5000.0f, 0.0f);
    ProvingGrounds.BoundsMax = FVector(3750.0f, 5000.0f, 500.0f);
    ProvingGrounds.bIsNeutralZone = false;

    // Abandoned Park (4/8 of map) — vegetation
    AbandonedPark.SectorName = TEXT("Park");
    AbandonedPark.MapFraction = 0.5f;
    AbandonedPark.BoundsMin = FVector(3750.0f, -5000.0f, 0.0f);
    AbandonedPark.BoundsMax = FVector(10000.0f, 5000.0f, 500.0f);
    AbandonedPark.bIsNeutralZone = false;

    // ─── Player Spawn Points (50+) ──────────────────────────────────────────

    PlayerSpawnPoints.Empty();

    // 15 spawns in Armory Hub
    for (int32 i = 0; i < 15; i++)
    {
        FCIGKVSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(-4500.0f, -2000.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            100.0f
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("ArmoryHub");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 10;
        PlayerSpawnPoints.Add(Spawn);
    }

    // 20 spawns in Proving Grounds
    for (int32 i = 0; i < 20; i++)
    {
        FCIGKVSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(-1500.0f, 3500.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            FMath::RandRange(0.0f, 300.0f)  // Multi-story buildings
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("ProvingGrounds");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 5;
        PlayerSpawnPoints.Add(Spawn);
    }

    // 15 spawns in Park
    for (int32 i = 0; i < 15; i++)
    {
        FCIGKVSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(4000.0f, 9500.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            100.0f
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("Park");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 3;
        PlayerSpawnPoints.Add(Spawn);
    }

    // ─── Loot Spawn Points (60+) ─────────────────────────────────────────────

    LootSpawnPoints.Empty();

    // 10 loot points in Armory Hub
    for (int32 i = 0; i < 10; i++)
    {
        FCIGKVLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(-4500.0f, -2000.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            0.0f
        );
        Loot.SectorName = TEXT("ArmoryHub");
        Loot.MinPhase = 0;
        Loot.bElevated = false;
        LootSpawnPoints.Add(Loot);
    }

    // 25 loot points in Proving Grounds (denser urban loot)
    for (int32 i = 0; i < 25; i++)
    {
        FCIGKVLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(-1500.0f, 3500.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            FMath::RandBool() ? FMath::RandRange(100.0f, 300.0f) : 0.0f
        );
        Loot.SectorName = TEXT("ProvingGrounds");
        Loot.MinPhase = 0;
        Loot.bElevated = (Loot.Location.Z > 50.0f);
        // Higher rarity in buildings
        if (Loot.bElevated)
        {
            Loot.RarityWeights = { 0.20f, 0.30f, 0.25f, 0.15f, 0.10f };
        }
        LootSpawnPoints.Add(Loot);
    }

    // 25 loot points in Park
    for (int32 i = 0; i < 25; i++)
    {
        FCIGKVLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(4000.0f, 9500.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            0.0f
        );
        Loot.SectorName = TEXT("Park");
        Loot.MinPhase = 0;
        Loot.bElevated = false;
        LootSpawnPoints.Add(Loot);
    }

    // ─── Environment Markers ─────────────────────────────────────────────────

    EnvironmentMarkers.Empty();

    // Plus+ markers (advantages)

    // Bunkers in Proving Grounds
    for (int32 i = 0; i < 4; i++)
    {
        FCIGKVEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-1000.0f, 3000.0f),
            FMath::RandRange(-3000.0f, 3000.0f),
            0.0f
        );
        Marker.Type = ECIGKVEnvironmentType::Bunker;
        Marker.EffectRadius = 300.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Sniper points (elevated positions)
    for (int32 i = 0; i < 6; i++)
    {
        FCIGKVEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-1500.0f, 3500.0f),
            FMath::RandRange(-4000.0f, 4000.0f),
            FMath::RandRange(150.0f, 300.0f)
        );
        Marker.Type = ECIGKVEnvironmentType::SniperPoint;
        Marker.EffectRadius = 200.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Med kit stations
    for (int32 i = 0; i < 5; i++)
    {
        FCIGKVEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-4000.0f, 9000.0f),
            FMath::RandRange(-4000.0f, 4000.0f),
            0.0f
        );
        Marker.Type = ECIGKVEnvironmentType::MedKit;
        Marker.EffectRadius = 150.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Plus- markers (hazards)

    // Destructible buildings
    for (int32 i = 0; i < 8; i++)
    {
        FCIGKVEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-1500.0f, 3500.0f),
            FMath::RandRange(-4000.0f, 4000.0f),
            0.0f
        );
        Marker.Type = ECIGKVEnvironmentType::Destruction;
        Marker.EffectRadius = 500.0f;
        Marker.Intensity = FMath::RandRange(0.5f, 1.0f);
        Marker.ActivePhaseMask = 0x0E; // Phases 1-3 only
        EnvironmentMarkers.Add(Marker);
    }

    // Fog in Park
    for (int32 i = 0; i < 3; i++)
    {
        FCIGKVEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(5000.0f, 9000.0f),
            FMath::RandRange(-3000.0f, 3000.0f),
            0.0f
        );
        Marker.Type = ECIGKVEnvironmentType::Fog;
        Marker.EffectRadius = 1000.0f;
        Marker.Intensity = 0.8f;
        Marker.ActivePhaseMask = 0x0C; // Phases 2-3
        EnvironmentMarkers.Add(Marker);
    }

    // Water hazards in Park
    {
        FCIGKVEnvironmentMarker Marker;
        Marker.Location = FVector(7000.0f, 0.0f, 0.0f);
        Marker.Type = ECIGKVEnvironmentType::WaterHazard;
        Marker.EffectRadius = 800.0f;
        Marker.Intensity = 0.5f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }
}
