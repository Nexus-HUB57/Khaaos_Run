// ============================================================================
// Khaaos Run — W3/C3 Ckesalth Map Data Implementation (Fase 4)
// ============================================================================

#include "Game/World/Ckesalth/KhaaosCkesalthMapData.h"
#include "Math/UnrealMathUtility.h"

TArray<FVector> UKhaaosCkesalthMapData::GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const
{
    TArray<FVector> Result;
    TArray<const FCkesalthLootSpawnPoint*> Valid;
    for (const auto& P : LootSpawnPoints) { if (FVector::Dist(P.Location, ZoneCenter) <= ZoneRadius) Valid.Add(&P); }
    int32 Pick = FMath::Min(Count, Valid.Num());
    TArray<int32> Idx; for (int32 i = 0; i < Valid.Num(); i++) Idx.Add(i);
    for (int32 i = Idx.Num() - 1; i > 0; i--) { int32 j = FMath::RandRange(0, i); Idx.Swap(i, j); }
    for (int32 i = 0; i < Pick; i++) Result.Add(Valid[Idx[i]]->Location);
    return Result;
}

FVector UKhaaosCkesalthMapData::GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const
{
    float X, Y;
    do { X = FMath::FRandRange(-1,1); Y = FMath::FRandRange(-1,1); } while (X*X+Y*Y>1);
    return ZoneCenter + FVector(X*ZoneRadius, Y*ZoneRadius, 0);
}

void UKhaaosCkesalthMapData::InitializeDefaults()
{
    Sectors.Empty();
    FCkesalthSector Base; Base.SectorName=TEXT("BaseCamp"); Base.MapFraction=0.25f;
    Base.BoundsMin=FVector(-3000,-3000,0); Base.BoundsMax=FVector(-1500,3000,400); Base.MinAltitude=0; Base.MaxAltitude=400;
    Sectors.Add(Base);
    FCkesalthSector Mid; Mid.SectorName=TEXT("MidMountain"); Mid.MapFraction=0.375f;
    Mid.BoundsMin=FVector(-1500,-3000,400); Mid.BoundsMax=FVector(1500,3000,1000); Mid.MinAltitude=400; Mid.MaxAltitude=1000;
    Sectors.Add(Mid);
    FCkesalthSector Peak; Peak.SectorName=TEXT("PeakZone"); Peak.MapFraction=0.25f;
    Peak.BoundsMin=FVector(1500,-3000,1000); Peak.BoundsMax=FVector(3000,3000,1600); Peak.MinAltitude=1000; Peak.MaxAltitude=1600;
    Sectors.Add(Peak);
    FCkesalthSector Summit; Summit.SectorName=TEXT("SummitArena"); Summit.MapFraction=0.125f;
    Summit.BoundsMin=FVector(-1000,-1000,1600); Summit.BoundsMax=FVector(1000,1000,2000); Summit.MinAltitude=1600; Summit.MaxAltitude=2000;
    Sectors.Add(Summit);

    PlayerSpawnPoints.Empty();
    for (int32 i=0;i<15;i++) { FCkesalthSpawnPoint S; S.Location=FVector(FMath::RandRange(-2800,-1600),FMath::RandRange(-2800,2800),FMath::RandRange(50,350)); S.SectorName=TEXT("BaseCamp"); S.Priority=10; PlayerSpawnPoints.Add(S); }
    for (int32 i=0;i<20;i++) { FCkesalthSpawnPoint S; S.Location=FVector(FMath::RandRange(-1400,1400),FMath::RandRange(-2800,2800),FMath::RandRange(400,950)); S.SectorName=TEXT("MidMountain"); S.Priority=7; PlayerSpawnPoints.Add(S); }
    for (int32 i=0;i<15;i++) { FCkesalthSpawnPoint S; S.Location=FVector(FMath::RandRange(1600,2800),FMath::RandRange(-2800,2800),FMath::RandRange(1000,1550)); S.SectorName=TEXT("PeakZone"); S.Priority=5; PlayerSpawnPoints.Add(S); }
    for (int32 i=0;i<10;i++) { FCkesalthSpawnPoint S; S.Location=FVector(FMath::RandRange(-800,800),FMath::RandRange(-800,800),FMath::RandRange(1600,1900)); S.SectorName=TEXT("SummitArena"); S.Priority=3; PlayerSpawnPoints.Add(S); }

    LootSpawnPoints.Empty();
    for (int32 i=0;i<20;i++) { FCkesalthLootSpawnPoint L; L.Location=FVector(FMath::RandRange(-2800,-1600),FMath::RandRange(-2800,2800),FMath::RandRange(0,350)); L.SectorName=TEXT("BaseCamp"); LootSpawnPoints.Add(L); }
    for (int32 i=0;i<30;i++) { FCkesalthLootSpawnPoint L; L.Location=FVector(FMath::RandRange(-1400,1400),FMath::RandRange(-2800,2800),FMath::RandRange(400,950)); L.SectorName=TEXT("MidMountain"); L.bRequiresClimbing=(L.Location.Z>600); LootSpawnPoints.Add(L); }
    for (int32 i=0;i<20;i++) { FCkesalthLootSpawnPoint L; L.Location=FVector(FMath::RandRange(1600,2800),FMath::RandRange(-2800,2800),FMath::RandRange(1000,1550)); L.SectorName=TEXT("PeakZone"); L.bRequiresClimbing=true; L.RarityWeights={0.15f,0.20f,0.25f,0.22f,0.18f}; LootSpawnPoints.Add(L); }
    for (int32 i=0;i<10;i++) { FCkesalthLootSpawnPoint L; L.Location=FVector(FMath::RandRange(-800,800),FMath::RandRange(-800,800),FMath::RandRange(1600,1900)); L.SectorName=TEXT("SummitArena"); L.bRequiresClimbing=true; L.RarityWeights={0.10f,0.15f,0.20f,0.25f,0.30f}; LootSpawnPoints.Add(L); }

    EnvironmentMarkers.Empty();
    for (int32 i=0;i<6;i++) { FCkesalthEnvironmentMarker M; M.Location=FVector(FMath::RandRange(-1400,1400),FMath::RandRange(-2800,2800),FMath::RandRange(400,800)); M.Type=ECkesalthEnvironmentType::ClimbWall; M.EffectRadius=300; EnvironmentMarkers.Add(M); }
    for (int32 i=0;i<4;i++) { FCkesalthEnvironmentMarker M; M.Location=FVector(FMath::RandRange(-1400,2800),FMath::RandRange(-2000,2000),FMath::RandRange(600,1400)); M.Type=ECkesalthEnvironmentType::Zipline; M.EffectRadius=200; EnvironmentMarkers.Add(M); }
    for (int32 i=0;i<3;i++) { FCkesalthEnvironmentMarker M; M.Location=FVector(FMath::RandRange(-800,800),FMath::RandRange(-800,800),FMath::RandRange(1500,1900)); M.Type=ECkesalthEnvironmentType::ThinAir; M.EffectRadius=1000; M.ActivePhaseMask=0x0C; EnvironmentMarkers.Add(M); }
    for (int32 i=0;i<3;i++) { FCkesalthEnvironmentMarker M; M.Location=FVector(FMath::RandRange(1600,2800),FMath::RandRange(-2000,2000),1200); M.Type=ECkesalthEnvironmentType::Avalanche; M.EffectRadius=1500; M.ActivePhaseMask=0x0E; EnvironmentMarkers.Add(M); }

    UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Map defaults: %d sectors, %d spawns, %d loot"), Sectors.Num(), PlayerSpawnPoints.Num(), LootSpawnPoints.Num());
}
