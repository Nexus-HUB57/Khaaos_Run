// ============================================================================
// Khaaos Run — W1/C1 Barburhen Map Data Implementation (Fase 4)
// ============================================================================

#include "Game/World/Barburhen/KhaaosBarburhenMapData.h"
#include "Kismet/GameplayStatics.h"
#include "Math/UnrealMathUtility.h"

// ─── Utility Functions ────────────────────────────────────────────────────────

TArray<FVector> UKhaaosBarburhenMapData::GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const
{
    TArray<FVector> Result;

    // Filter loot points within the zone
    TArray<const FBarburhenLootSpawnPoint*> ValidPoints;
    for (const FBarburhenLootSpawnPoint& Point : LootSpawnPoints)
    {
        float Dist = FVector::Dist(Point.Location, ZoneCenter);
        if (Dist <= ZoneRadius)
        {
            ValidPoints.Add(&Point);
        }
    }

    // Fisher-Yates shuffle
    int32 NumToPick = FMath::Min(Count, ValidPoints.Num());
    TArray<int32> Indices;
    for (int32 i = 0; i < ValidPoints.Num(); i++) Indices.Add(i);

    for (int32 i = Indices.Num() - 1; i > 0; i--)
    {
        int32 j = FMath::RandRange(0, i);
        Indices.Swap(i, j);
    }

    for (int32 i = 0; i < NumToPick; i++)
    {
        Result.Add(ValidPoints[Indices[i]]->Location);
    }

    return Result;
}

FVector UKhaaosBarburhenMapData::GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const
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

TArray<FBarburhenSpawnPoint> UKhaaosBarburhenMapData::GetSpawnsInSector(const FString& SectorName) const
{
    TArray<FBarburhenSpawnPoint> Result;
    for (const FBarburhenSpawnPoint& Spawn : PlayerSpawnPoints)
    {
        if (Spawn.SectorName == SectorName)
        {
            Result.Add(Spawn);
        }
    }
    return Result;
}

TArray<FBarburhenLootSpawnPoint> UKhaaosBarburhenMapData::GetLootInSector(const FString& SectorName) const
{
    TArray<FBarburhenLootSpawnPoint> Result;
    for (const FBarburhenLootSpawnPoint& Point : LootSpawnPoints)
    {
        if (Point.SectorName == SectorName)
        {
            Result.Add(Point);
        }
    }
    return Result;
}

TArray<FBarburhenEnvironmentMarker> UKhaaosBarburhenMapData::GetMarkersByType(EBarburhenEnvironmentType Type) const
{
    TArray<FBarburhenEnvironmentMarker> Result;
    for (const FBarburhenEnvironmentMarker& Marker : EnvironmentMarkers)
    {
        if (Marker.Type == Type)
        {
            Result.Add(Marker);
        }
    }
    return Result;
}

void UKhaaosBarburhenMapData::InitializeDefaults()
{
    // ─── Sectors (12km x 12km = 12000 x 12000) ──────────────────────────────

    Sectors.Empty();

    // Industrial (2/10 = 20%)
    FBarburhenSector Industrial;
    Industrial.SectorName = TEXT("Industrial");
    Industrial.MapFraction = 0.20f;
    Industrial.BoundsMin = FVector(-6000.0f, -6000.0f, 0.0f);
    Industrial.BoundsMax = FVector(-2400.0f, 6000.0f, 800.0f);
    Industrial.bIsNeutralZone = false;
    Sectors.Add(Industrial);

    // Residential (2/10 = 20%)
    FBarburhenSector Residential;
    Residential.SectorName = TEXT("Residential");
    Residential.MapFraction = 0.20f;
    Residential.BoundsMin = FVector(-2400.0f, -6000.0f, 0.0f);
    Residential.BoundsMax = FVector(1200.0f, 6000.0f, 600.0f);
    Residential.bIsNeutralZone = false;
    Sectors.Add(Residential);

    // Military (3/10 = 30%)
    FBarburhenSector Military;
    Military.SectorName = TEXT("Military");
    Military.MapFraction = 0.30f;
    Military.BoundsMin = FVector(1200.0f, -6000.0f, 0.0f);
    Military.BoundsMax = FVector(6000.0f, 6000.0f, 800.0f);
    Military.bIsNeutralZone = false;
    Sectors.Add(Military);

    // Wasteland (2/10 = 20%)
    FBarburhenSector Wasteland;
    Wasteland.SectorName = TEXT("Wasteland");
    Wasteland.MapFraction = 0.20f;
    Wasteland.BoundsMin = FVector(6000.0f, -6000.0f, 0.0f);
    Wasteland.BoundsMax = FVector(10800.0f, 6000.0f, 400.0f);
    Wasteland.bIsNeutralZone = false;
    Sectors.Add(Wasteland);

    // Port (1/10 = 10%)
    FBarburhenSector Port;
    Port.SectorName = TEXT("Port");
    Port.MapFraction = 0.10f;
    Port.BoundsMin = FVector(10800.0f, -6000.0f, 0.0f);
    Port.BoundsMax = FVector(12000.0f, 6000.0f, 200.0f);
    Port.bIsNeutralZone = false;
    Sectors.Add(Port);

    // ─── Player Spawn Points (100) ───────────────────────────────────────────

    PlayerSpawnPoints.Empty();

    // 20 spawns in Industrial
    for (int32 i = 0; i < 20; i++)
    {
        FBarburhenSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(-5500.0f, -2600.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            100.0f
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("Industrial");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 8;
        PlayerSpawnPoints.Add(Spawn);
    }

    // 20 spawns in Residential
    for (int32 i = 0; i < 20; i++)
    {
        FBarburhenSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(-2200.0f, 1000.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            FMath::RandRange(0.0f, 400.0f)
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("Residential");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 6;
        PlayerSpawnPoints.Add(Spawn);
    }

    // 30 spawns in Military
    for (int32 i = 0; i < 30; i++)
    {
        FBarburhenSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(1600.0f, 5500.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            FMath::RandRange(0.0f, 500.0f)
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("Military");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 10;
        PlayerSpawnPoints.Add(Spawn);
    }

    // 20 spawns in Wasteland
    for (int32 i = 0; i < 20; i++)
    {
        FBarburhenSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(6500.0f, 10500.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            100.0f
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("Wasteland");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 4;
        PlayerSpawnPoints.Add(Spawn);
    }

    // 10 spawns in Port
    for (int32 i = 0; i < 10; i++)
    {
        FBarburhenSpawnPoint Spawn;
        Spawn.Location = FVector(
            FMath::RandRange(11000.0f, 11800.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            50.0f
        );
        Spawn.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        Spawn.SectorName = TEXT("Port");
        Spawn.TeamIndex = -1;
        Spawn.Priority = 3;
        PlayerSpawnPoints.Add(Spawn);
    }

    // ─── Loot Spawn Points (120) ─────────────────────────────────────────────

    LootSpawnPoints.Empty();

    // 24 loot in Industrial
    for (int32 i = 0; i < 24; i++)
    {
        FBarburhenLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(-5500.0f, -2600.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            FMath::RandBool() ? FMath::RandRange(100.0f, 600.0f) : 0.0f
        );
        Loot.SectorName = TEXT("Industrial");
        Loot.MinPhase = 0;
        Loot.bElevated = (Loot.Location.Z > 50.0f);
        if (Loot.bElevated)
        {
            Loot.RarityWeights = { 0.20f, 0.25f, 0.25f, 0.18f, 0.12f };
        }
        LootSpawnPoints.Add(Loot);
    }

    // 24 loot in Residential
    for (int32 i = 0; i < 24; i++)
    {
        FBarburhenLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(-2200.0f, 1000.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            FMath::RandBool() ? FMath::RandRange(100.0f, 400.0f) : 0.0f
        );
        Loot.SectorName = TEXT("Residential");
        Loot.MinPhase = 0;
        Loot.bElevated = (Loot.Location.Z > 50.0f);
        LootSpawnPoints.Add(Loot);
    }

    // 36 loot in Military (densest)
    for (int32 i = 0; i < 36; i++)
    {
        FBarburhenLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(1600.0f, 5500.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            FMath::RandBool() ? FMath::RandRange(100.0f, 600.0f) : 0.0f
        );
        Loot.SectorName = TEXT("Military");
        Loot.MinPhase = 0;
        Loot.bElevated = (Loot.Location.Z > 50.0f);
        if (Loot.bElevated)
        {
            Loot.RarityWeights = { 0.15f, 0.20f, 0.25f, 0.22f, 0.18f };
        }
        LootSpawnPoints.Add(Loot);
    }

    // 24 loot in Wasteland
    for (int32 i = 0; i < 24; i++)
    {
        FBarburhenLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(6500.0f, 10500.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            0.0f
        );
        Loot.SectorName = TEXT("Wasteland");
        Loot.MinPhase = 0;
        Loot.bElevated = false;
        LootSpawnPoints.Add(Loot);
    }

    // 12 loot in Port
    for (int32 i = 0; i < 12; i++)
    {
        FBarburhenLootSpawnPoint Loot;
        Loot.Location = FVector(
            FMath::RandRange(11000.0f, 11800.0f),
            FMath::RandRange(-5500.0f, 5500.0f),
            0.0f
        );
        Loot.SectorName = TEXT("Port");
        Loot.MinPhase = 0;
        Loot.bElevated = false;
        // Port has higher rarity (smuggler's goods)
        Loot.RarityWeights = { 0.15f, 0.20f, 0.25f, 0.22f, 0.18f };
        LootSpawnPoints.Add(Loot);
    }

    // ─── ZEX Locations (30) ──────────────────────────────────────────────────

    ZEXLocation.Empty();
    for (int32 i = 0; i < 30; i++)
    {
        FVector Loc = FVector(
            FMath::RandRange(-5000.0f, 11000.0f),
            FMath::RandRange(-5000.0f, 5000.0f),
            0.0f
        );
        ZEXLocation.Add(Loc);
    }

    // ─── Environment Markers ─────────────────────────────────────────────────

    EnvironmentMarkers.Empty();

    // Bunkers in Military sector
    for (int32 i = 0; i < 6; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(1600.0f, 5500.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::Bunker;
        Marker.EffectRadius = 350.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Sniper points (elevated)
    for (int32 i = 0; i < 8; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-5000.0f, 10000.0f),
            FMath::RandRange(-5000.0f, 5000.0f),
            FMath::RandRange(200.0f, 700.0f)
        );
        Marker.Type = EBarburhenEnvironmentType::SniperPoint;
        Marker.EffectRadius = 250.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Armory caches
    for (int32 i = 0; i < 4; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-5000.0f, 10000.0f),
            FMath::RandRange(-5000.0f, 5000.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::Armory;
        Marker.EffectRadius = 200.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Ice patches (Barburhen unique)
    for (int32 i = 0; i < 10; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-5000.0f, 10000.0f),
            FMath::RandRange(-5000.0f, 5000.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::IcePatch;
        Marker.EffectRadius = 400.0f;
        Marker.Intensity = FMath::RandRange(0.5f, 1.0f);
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    // Blizzard zones (Inverno hazard)
    for (int32 i = 0; i < 4; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-4000.0f, 8000.0f),
            FMath::RandRange(-4000.0f, 4000.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::Blizzard;
        Marker.EffectRadius = 1500.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0x0C; // Phases 2-3
        EnvironmentMarkers.Add(Marker);
    }

    // Frostbite zones (Inverno damage)
    for (int32 i = 0; i < 3; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-3000.0f, 6000.0f),
            FMath::RandRange(-3000.0f, 3000.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::Frostbite;
        Marker.EffectRadius = 800.0f;
        Marker.Intensity = 0.8f;
        Marker.ActivePhaseMask = 0x0E; // Phases 1-3
        EnvironmentMarkers.Add(Marker);
    }

    // Destructible buildings in Military
    for (int32 i = 0; i < 10; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(1600.0f, 5500.0f),
            FMath::RandRange(-4500.0f, 4500.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::Destruction;
        Marker.EffectRadius = 500.0f;
        Marker.Intensity = FMath::RandRange(0.5f, 1.0f);
        Marker.ActivePhaseMask = 0x0E;
        EnvironmentMarkers.Add(Marker);
    }

    // Med kit stations
    for (int32 i = 0; i < 6; i++)
    {
        FBarburhenEnvironmentMarker Marker;
        Marker.Location = FVector(
            FMath::RandRange(-5000.0f, 11000.0f),
            FMath::RandRange(-5000.0f, 5000.0f),
            0.0f
        );
        Marker.Type = EBarburhenEnvironmentType::MedKit;
        Marker.EffectRadius = 150.0f;
        Marker.Intensity = 1.0f;
        Marker.ActivePhaseMask = 0xFF;
        EnvironmentMarkers.Add(Marker);
    }

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Map defaults: %d sectors, %d spawns, %d loot, %d ZEX, %d env markers"),
        Sectors.Num(), PlayerSpawnPoints.Num(), LootSpawnPoints.Num(),
        ZEXLocation.Num(), EnvironmentMarkers.Num());
}
