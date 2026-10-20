#include "Game/World/CIGKV/KhaaosCIGKVMapData.h"

#include <cmath>
#include <iostream>

const FVector FVector::ZeroVector(0.0f, 0.0f, 0.0f);
const FRotator FRotator::ZeroRotator(0.0f, 0.0f, 0.0f);

namespace
{
int Failures = 0;

void Expect(bool Condition, const char* Description)
{
    if (Condition)
    {
        std::cout << "PASS: " << Description << '\n';
    }
    else
    {
        std::cerr << "FAIL: " << Description << '\n';
        ++Failures;
    }
}

FCIGKVLootSpawnPoint MakePoint(
    float X,
    float Y,
    float Z,
    int32 MinimumPhase,
    const FString& SectorName)
{
    FCIGKVLootSpawnPoint Point;
    Point.Location = FVector(X, Y, Z);
    Point.MinPhase = MinimumPhase;
    Point.SectorName = SectorName;
    return Point;
}

bool HasSector(const TArray<FCIGKVLootSpawnPoint>& Points, const FString& SectorName)
{
    for (const FCIGKVLootSpawnPoint& Point : Points)
    {
        if (Point.SectorName == SectorName)
        {
            return true;
        }
    }
    return false;
}

void TestProductionLootEntrySelection()
{
    UKhaaosCIGKVMapData MapData;
    MapData.LootSpawnPoints.Empty();

    MapData.LootSpawnPoints.Add(MakePoint(0.0f, 0.0f, 0.0f, 0, "starter"));
    MapData.LootSpawnPoints.Add(MakePoint(50.0f, 0.0f, 0.0f, 2, "phase-locked"));
    MapData.LootSpawnPoints.Add(MakePoint(101.0f, 0.0f, 0.0f, 0, "outside-zone"));
    MapData.LootSpawnPoints.Add(MakePoint(100.0f, 0.0f, 0.0f, 0, "boundary"));

    FCIGKVLootSpawnPoint Elevated = MakePoint(0.0f, 10.0f, 5000.0f, 0, "elevated");
    Elevated.Rotation = FRotator(10.0f, 90.0f, 5.0f);
    Elevated.RarityWeights = {0.0f, 0.25f, 0.75f};
    Elevated.bElevated = true;
    MapData.LootSpawnPoints.Add(Elevated);

    FMath::SeedRandom(20261012u);
    const TArray<FCIGKVLootSpawnPoint> PhaseZero = MapData.GetRandomLootSpawnEntries(
        20, FVector(0.0f, 0.0f, 0.0f), 100.0f, 0);

    Expect(PhaseZero.Num() == 3, "production MapData filters locked and outside-zone entries");
    Expect(HasSector(PhaseZero, "starter"), "production MapData includes MinPhase 0 in phase 0");
    Expect(!HasSector(PhaseZero, "phase-locked"), "production MapData excludes MinPhase 2 in phase 0");
    Expect(!HasSector(PhaseZero, "outside-zone"), "production MapData excludes a point outside the zone");
    Expect(HasSector(PhaseZero, "boundary"), "production MapData includes a point on the 2D zone boundary");
    Expect(HasSector(PhaseZero, "elevated"), "production MapData uses 2D radius and allows elevated loot");

    bool bMetadataPreserved = false;
    for (const FCIGKVLootSpawnPoint& Point : PhaseZero)
    {
        if (Point.SectorName == "elevated")
        {
            bMetadataPreserved = Point.Location.Z == 5000.0f
                && Point.Rotation.Pitch == 10.0f
                && Point.Rotation.Yaw == 90.0f
                && Point.Rotation.Roll == 5.0f
                && Point.RarityWeights.Num() == 3
                && Point.RarityWeights[1] == 0.25f
                && Point.RarityWeights[2] == 0.75f
                && Point.bElevated;
        }
    }
    Expect(bMetadataPreserved, "production MapData returns the complete point with rarity, rotation, and elevation");

    const TArray<FCIGKVLootSpawnPoint> PhaseTwo = MapData.GetRandomLootSpawnEntries(
        20, FVector(0.0f, 0.0f, 0.0f), 100.0f, 2);
    Expect(PhaseTwo.Num() == 4, "phase-locked point is unlocked by production MapData in phase 2");
    Expect(HasSector(PhaseTwo, "phase-locked"), "production MapData returns the unlocked phase-2 point");

    const TArray<FCIGKVLootSpawnPoint> Capped = MapData.GetRandomLootSpawnEntries(
        2, FVector(0.0f, 0.0f, 0.0f), 100.0f, 0);
    Expect(Capped.Num() == 2, "production MapData caps output at the requested loot count");
    Expect(MapData.GetRandomLootSpawnEntries(0, FVector::ZeroVector, 100.0f, 0).Num() == 0,
        "production MapData returns no entries for a zero request");
    Expect(MapData.GetRandomLootSpawnEntries(-1, FVector::ZeroVector, 100.0f, 0).Num() == 0,
        "production MapData returns no entries for a negative request");

    const TArray<FVector> LegacyLocations = MapData.GetRandomLootSpawnPoints(
        20, FVector(0.0f, 0.0f, 0.0f), 100.0f, 0);
    bool bLegacyLocationsEligible = LegacyLocations.Num() == 3;
    for (const FVector& Location : LegacyLocations)
    {
        const bool bIsKnownEligible = (Location.X == 0.0f && (Location.Y == 0.0f || Location.Y == 10.0f))
            || Location.X == 100.0f;
        bLegacyLocationsEligible = bLegacyLocationsEligible && bIsKnownEligible;
    }
    Expect(bLegacyLocationsEligible, "legacy location-only API delegates to the same production eligibility filter");
}

void TestProductionDefaultMapData()
{
    FMath::SeedRandom(20261012u);
    UKhaaosCIGKVMapData MapData;
    MapData.InitializeDefaults();

    Expect(MapData.LootSpawnPoints.Num() == 60, "production InitializeDefaults creates 60 CIGKV loot points");

    int32 ArmoryCount = 0;
    int32 ProvingGroundsCount = 0;
    int32 ParkCount = 0;
    bool bAllDefaultPointsStartAtPhaseZero = true;
    bool bHasElevatedRarityProfile = false;
    for (const FCIGKVLootSpawnPoint& Point : MapData.LootSpawnPoints)
    {
        if (Point.SectorName == "ArmoryHub") ++ArmoryCount;
        if (Point.SectorName == "ProvingGrounds")
        {
            ++ProvingGroundsCount;
            if (Point.bElevated
                && Point.RarityWeights.Num() == 5
                && std::fabs(Point.RarityWeights[0] - 0.20f) < 0.0001f
                && std::fabs(Point.RarityWeights[1] - 0.30f) < 0.0001f)
            {
                bHasElevatedRarityProfile = true;
            }
        }
        if (Point.SectorName == "Park") ++ParkCount;
        bAllDefaultPointsStartAtPhaseZero = bAllDefaultPointsStartAtPhaseZero && Point.MinPhase == 0;
    }

    Expect(bAllDefaultPointsStartAtPhaseZero, "all default CIGKV loot points start unlocked at phase 0");
    Expect(ArmoryCount == 10, "production defaults create 10 Armory Hub loot points");
    Expect(ProvingGroundsCount == 25, "production defaults create 25 Proving Grounds loot points");
    Expect(ParkCount == 25, "production defaults create 25 Park loot points");
    Expect(bHasElevatedRarityProfile, "production defaults assign the elevated rarity profile");

    const TArray<FCIGKVLootSpawnPoint> AllDefaults = MapData.GetRandomLootSpawnEntries(
        100, FVector::ZeroVector, 20000.0f, 0);
    Expect(AllDefaults.Num() == 60, "production selector returns every default point inside a covering zone");
}
} // namespace

int main()
{
    TestProductionLootEntrySelection();
    TestProductionDefaultMapData();

    if (Failures > 0)
    {
        std::cerr << Failures << " MapData integration assertion(s) failed.\n";
        return 1;
    }

    std::cout << "All production MapData integration tests passed.\n";
    return 0;
}
