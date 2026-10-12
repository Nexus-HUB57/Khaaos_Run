// ============================================================================
// Khaaos Run — W2/C2 Priadus Map Data Implementation (Fase 4)
// ============================================================================

#include "Game/World/Priadus/KhaaosPriadusMapData.h"
#include "Math/UnrealMathUtility.h"

TArray<FVector> UKhaaosPriadusMapData::GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const
{
    TArray<FVector> Result;
    TArray<const FPriadusLootSpawnPoint*> ValidPoints;
    for (const FPriadusLootSpawnPoint& Point : LootSpawnPoints)
    {
        if (FVector::Dist(Point.Location, ZoneCenter) <= ZoneRadius)
        {
            ValidPoints.Add(&Point);
        }
    }
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
        Result.Add(ValidPoints[Indices[i]]->Location);
    }
    return Result;
}

FVector UKhaaosPriadusMapData::GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const
{
    float X, Y;
    do { X = FMath::FRandRange(-1.0f, 1.0f); Y = FMath::FRandRange(-1.0f, 1.0f); }
    while (X * X + Y * Y > 1.0f);
    return ZoneCenter + FVector(X * ZoneRadius, Y * ZoneRadius, 0.0f);
}

TArray<FPriadusSpawnPoint> UKhaaosPriadusMapData::GetSpawnsInSector(const FString& SectorName) const
{
    TArray<FPriadusSpawnPoint> Result;
    for (const FPriadusSpawnPoint& S : PlayerSpawnPoints)
    {
        if (S.SectorName == SectorName) Result.Add(S);
    }
    return Result;
}

TArray<FPriadusEnvironmentMarker> UKhaaosPriadusMapData::GetMarkersByType(EPriadusEnvironmentType Type) const
{
    TArray<FPriadusEnvironmentMarker> Result;
    for (const FPriadusEnvironmentMarker& M : EnvironmentMarkers)
    {
        if (M.Type == Type) Result.Add(M);
    }
    return Result;
}

void UKhaaosPriadusMapData::InitializeDefaults()
{
    // ─── Sectors (8km x 8km) ─────────────────────────────────────────────────
    Sectors.Empty();

    FPriadusSector Archipelago;
    Archipelago.SectorName = TEXT("Archipelago"); Archipelago.MapFraction = 0.4f;
    Archipelago.BoundsMin = FVector(-4000.0f, -4000.0f, 0.0f);
    Archipelago.BoundsMax = FVector(800.0f, 4000.0f, 200.0f);
    Archipelago.bIsIsland = true; Archipelago.WaterLevel = 0.0f;
    Sectors.Add(Archipelago);

    FPriadusSector Reef;
    Reef.SectorName = TEXT("Reef"); Reef.MapFraction = 0.2f;
    Reef.BoundsMin = FVector(800.0f, -2000.0f, -100.0f);
    Reef.BoundsMax = FVector(3200.0f, 2000.0f, 50.0f);
    Reef.bIsIsland = false; Reef.WaterLevel = -50.0f;
    Sectors.Add(Reef);

    FPriadusSector DeepOcean;
    DeepOcean.SectorName = TEXT("DeepOcean"); DeepOcean.MapFraction = 0.3f;
    DeepOcean.BoundsMin = FVector(3200.0f, -4000.0f, -500.0f);
    DeepOcean.BoundsMax = FVector(7200.0f, 4000.0f, 0.0f);
    DeepOcean.bIsIsland = false; DeepOcean.WaterLevel = -200.0f;
    Sectors.Add(DeepOcean);

    FPriadusSector VolcanoIsland;
    VolcanoIsland.SectorName = TEXT("VolcanoIsland"); VolcanoIsland.MapFraction = 0.1f;
    VolcanoIsland.BoundsMin = FVector(7200.0f, -1500.0f, 0.0f);
    VolcanoIsland.BoundsMax = FVector(8000.0f, 1500.0f, 500.0f);
    VolcanoIsland.bIsIsland = true; VolcanoIsland.WaterLevel = 0.0f;
    Sectors.Add(VolcanoIsland);

    // ─── Spawn Points (75) ───────────────────────────────────────────────────
    PlayerSpawnPoints.Empty();
    // 30 on Archipelago islands
    for (int32 i = 0; i < 30; i++)
    {
        FPriadusSpawnPoint S;
        S.Location = FVector(FMath::RandRange(-3500.0f, 500.0f), FMath::RandRange(-3500.0f, 3500.0f), 50.0f);
        S.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        S.SectorName = TEXT("Archipelago"); S.Priority = 8; S.bIsOnIsland = true;
        PlayerSpawnPoints.Add(S);
    }
    // 15 on Reef (shallow water)
    for (int32 i = 0; i < 15; i++)
    {
        FPriadusSpawnPoint S;
        S.Location = FVector(FMath::RandRange(1000.0f, 3000.0f), FMath::RandRange(-1500.0f, 1500.0f), 10.0f);
        S.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        S.SectorName = TEXT("Reef"); S.Priority = 5; S.bIsOnIsland = false;
        PlayerSpawnPoints.Add(S);
    }
    // 20 in DeepOcean (boat spawns)
    for (int32 i = 0; i < 20; i++)
    {
        FPriadusSpawnPoint S;
        S.Location = FVector(FMath::RandRange(3500.0f, 7000.0f), FMath::RandRange(-3500.0f, 3500.0f), 10.0f);
        S.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        S.SectorName = TEXT("DeepOcean"); S.Priority = 3; S.bIsOnIsland = false;
        PlayerSpawnPoints.Add(S);
    }
    // 10 on VolcanoIsland
    for (int32 i = 0; i < 10; i++)
    {
        FPriadusSpawnPoint S;
        S.Location = FVector(FMath::RandRange(7300.0f, 7800.0f), FMath::RandRange(-1000.0f, 1000.0f), 100.0f);
        S.Rotation = FRotator(0.0f, FMath::RandRange(0.0f, 360.0f), 0.0f);
        S.SectorName = TEXT("VolcanoIsland"); S.Priority = 10; S.bIsOnIsland = true;
        PlayerSpawnPoints.Add(S);
    }

    // ─── Loot Spawn Points (90) ──────────────────────────────────────────────
    LootSpawnPoints.Empty();
    for (int32 i = 0; i < 36; i++)
    {
        FPriadusLootSpawnPoint L;
        L.Location = FVector(FMath::RandRange(-3500.0f, 500.0f), FMath::RandRange(-3500.0f, 3500.0f), 0.0f);
        L.SectorName = TEXT("Archipelago"); L.bUnderwater = false;
        LootSpawnPoints.Add(L);
    }
    for (int32 i = 0; i < 18; i++)
    {
        FPriadusLootSpawnPoint L;
        L.Location = FVector(FMath::RandRange(1000.0f, 3000.0f), FMath::RandRange(-1500.0f, 1500.0f), FMath::RandBool() ? -30.0f : 0.0f);
        L.SectorName = TEXT("Reef"); L.bUnderwater = (L.Location.Z < 0.0f);
        L.RarityWeights = { 0.25f, 0.25f, 0.22f, 0.15f, 0.13f };
        LootSpawnPoints.Add(L);
    }
    for (int32 i = 0; i < 27; i++)
    {
        FPriadusLootSpawnPoint L;
        L.Location = FVector(FMath::RandRange(3500.0f, 7000.0f), FMath::RandRange(-3500.0f, 3500.0f), FMath::RandRange(-100.0f, 0.0f));
        L.SectorName = TEXT("DeepOcean"); L.bUnderwater = true;
        L.RarityWeights = { 0.15f, 0.20f, 0.25f, 0.22f, 0.18f };
        LootSpawnPoints.Add(L);
    }
    for (int32 i = 0; i < 9; i++)
    {
        FPriadusLootSpawnPoint L;
        L.Location = FVector(FMath::RandRange(7300.0f, 7800.0f), FMath::RandRange(-1000.0f, 1000.0f), 0.0f);
        L.SectorName = TEXT("VolcanoIsland"); L.bUnderwater = false;
        L.RarityWeights = { 0.10f, 0.15f, 0.20f, 0.25f, 0.30f };
        LootSpawnPoints.Add(L);
    }

    // ─── Environment Markers ─────────────────────────────────────────────────
    EnvironmentMarkers.Empty();
    for (int32 i = 0; i < 8; i++)
    {
        FPriadusEnvironmentMarker M;
        M.Location = FVector(FMath::RandRange(-3500.0f, 500.0f), FMath::RandRange(-3500.0f, 3500.0f), 0.0f);
        M.Type = EPriadusEnvironmentType::Island; M.EffectRadius = 300.0f;
        EnvironmentMarkers.Add(M);
    }
    for (int32 i = 0; i < 5; i++)
    {
        FPriadusEnvironmentMarker M;
        M.Location = FVector(FMath::RandRange(1000.0f, 7000.0f), FMath::RandRange(-3500.0f, 3500.0f), 0.0f);
        M.Type = EPriadusEnvironmentType::BoatSpawn; M.EffectRadius = 200.0f;
        EnvironmentMarkers.Add(M);
    }
    for (int32 i = 0; i < 4; i++)
    {
        FPriadusEnvironmentMarker M;
        M.Location = FVector(FMath::RandRange(1000.0f, 3000.0f), FMath::RandRange(-1500.0f, 1500.0f), -50.0f);
        M.Type = EPriadusEnvironmentType::SharkZone; M.EffectRadius = 800.0f; M.Intensity = 0.7f;
        EnvironmentMarkers.Add(M);
    }
    for (int32 i = 0; i < 3; i++)
    {
        FPriadusEnvironmentMarker M;
        M.Location = FVector(FMath::RandRange(3500.0f, 6500.0f), FMath::RandRange(-2500.0f, 2500.0f), -100.0f);
        M.Type = EPriadusEnvironmentType::Whirlpool; M.EffectRadius = 600.0f; M.ActivePhaseMask = 0x06;
        EnvironmentMarkers.Add(M);
    }
    for (int32 i = 0; i < 2; i++)
    {
        FPriadusEnvironmentMarker M;
        M.Location = FVector(FMath::RandRange(7300.0f, 7800.0f), FMath::RandRange(-1000.0f, 1000.0f), 0.0f);
        M.Type = EPriadusEnvironmentType::Tsunami; M.EffectRadius = 2000.0f; M.ActivePhaseMask = 0x04;
        EnvironmentMarkers.Add(M);
    }

    UE_LOG(LogTemp, Log, TEXT("[Priadus] Map defaults: %d sectors, %d spawns, %d loot, %d env"),
        Sectors.Num(), PlayerSpawnPoints.Num(), LootSpawnPoints.Num(), EnvironmentMarkers.Num());
}
