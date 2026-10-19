// ============================================================================
// Khaaos Run — W4/C4 Arukheea Map Data Implementation (Fase 4)
// ============================================================================

#include "Game/World/Arukheea/KhaaosArukheeaMapData.h"
#include "Math/UnrealMathUtility.h"

TArray<FVector> UKhaaosArukheeaMapData::GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const
{
    TArray<FVector> Result;
    TArray<const FArukheeaLootSpawnPoint*> Valid;
    for (const auto& P : LootSpawnPoints) { if (FVector::Dist(P.Location, ZoneCenter) <= ZoneRadius) Valid.Add(&P); }
    int32 Pick = FMath::Min(Count, Valid.Num());
    TArray<int32> Idx; for (int32 i=0;i<Valid.Num();i++) Idx.Add(i);
    for (int32 i=Idx.Num()-1;i>0;i--) { int32 j=FMath::RandRange(0,i); Idx.Swap(i,j); }
    for (int32 i=0;i<Pick;i++) Result.Add(Valid[Idx[i]]->Location);
    return Result;
}

FVector UKhaaosArukheeaMapData::GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const
{
    float X,Y; do { X=FMath::FRandRange(-1,1); Y=FMath::FRandRange(-1,1); } while(X*X+Y*Y>1);
    return ZoneCenter + FVector(X*ZoneRadius, Y*ZoneRadius, 0);
}

void UKhaaosArukheeaMapData::InitializeDefaults()
{
    Sectors.Empty();
    FArukheeaSector Dunes; Dunes.SectorName=TEXT("Dunes"); Dunes.MapFraction=0.3f;
    Dunes.BoundsMin=FVector(-5000,-5000,0); Dunes.BoundsMax=FVector(-2000,5000,300); Dunes.HeatIntensity=0.8f;
    Sectors.Add(Dunes);
    FArukheeaSector Canyon; Canyon.SectorName=TEXT("Canyon"); Canyon.MapFraction=0.3f;
    Canyon.BoundsMin=FVector(-2000,-5000,-300); Canyon.BoundsMax=FVector(2000,5000,100); Canyon.HeatIntensity=0.3f;
    Sectors.Add(Canyon);
    FArukheeaSector Oasis; Oasis.SectorName=TEXT("Oasis"); Oasis.MapFraction=0.2f;
    Oasis.BoundsMin=FVector(2000,-3000,0); Oasis.BoundsMax=FVector(5000,3000,100); Oasis.HeatIntensity=0.1f;
    Sectors.Add(Oasis);
    FArukheeaSector Arena; Arena.SectorName=TEXT("Arena"); Arena.MapFraction=0.2f;
    Arena.BoundsMin=FVector(5000,-5000,0); Arena.BoundsMax=FVector(9000,5000,600); Arena.HeatIntensity=1.0f;
    Sectors.Add(Arena);

    PlayerSpawnPoints.Empty();
    for (int32 i=0;i<24;i++) { FArukheeaSpawnPoint S; S.Location=FVector(FMath::RandRange(-4500,-2200),FMath::RandRange(-4500,4500),FMath::RandRange(50,250)); S.SectorName=TEXT("Dunes"); S.Priority=6; PlayerSpawnPoints.Add(S); }
    for (int32 i=0;i<24;i++) { FArukheeaSpawnPoint S; S.Location=FVector(FMath::RandRange(-1800,1800),FMath::RandRange(-4500,4500),FMath::RandRange(-200,50)); S.SectorName=TEXT("Canyon"); S.Priority=8; PlayerSpawnPoints.Add(S); }
    for (int32 i=0;i<16;i++) { FArukheeaSpawnPoint S; S.Location=FVector(FMath::RandRange(2200,4800),FMath::RandRange(-2500,2500),30); S.SectorName=TEXT("Oasis"); S.Priority=10; PlayerSpawnPoints.Add(S); }
    for (int32 i=0;i<16;i++) { FArukheeaSpawnPoint S; S.Location=FVector(FMath::RandRange(5200,8800),FMath::RandRange(-4500,4500),FMath::RandRange(50,500)); S.SectorName=TEXT("Arena"); S.Priority=4; PlayerSpawnPoints.Add(S); }

    LootSpawnPoints.Empty();
    for (int32 i=0;i<30;i++) { FArukheeaLootSpawnPoint L; L.Location=FVector(FMath::RandRange(-4500,-2200),FMath::RandRange(-4500,4500),0); L.SectorName=TEXT("Dunes"); LootSpawnPoints.Add(L); }
    for (int32 i=0;i<30;i++) { FArukheeaLootSpawnPoint L; L.Location=FVector(FMath::RandRange(-1800,1800),FMath::RandRange(-4500,4500),FMath::RandRange(-200,0)); L.SectorName=TEXT("Canyon"); L.bInCanyon=true; L.RarityWeights={0.20f,0.25f,0.25f,0.18f,0.12f}; LootSpawnPoints.Add(L); }
    for (int32 i=0;i<20;i++) { FArukheeaLootSpawnPoint L; L.Location=FVector(FMath::RandRange(2200,4800),FMath::RandRange(-2500,2500),0); L.SectorName=TEXT("Oasis"); LootSpawnPoints.Add(L); }
    for (int32 i=0;i<20;i++) { FArukheeaLootSpawnPoint L; L.Location=FVector(FMath::RandRange(5200,8800),FMath::RandRange(-4500,4500),0); L.SectorName=TEXT("Arena"); L.RarityWeights={0.15f,0.20f,0.25f,0.22f,0.18f}; LootSpawnPoints.Add(L); }

    EnvironmentMarkers.Empty();
    for (int32 i=0;i<5;i++) { FArukheeaEnvironmentMarker M; M.Location=FVector(FMath::RandRange(2200,4800),FMath::RandRange(-2500,2500),0); M.Type=EArukheeaEnvironmentType::Oasis; M.EffectRadius=500.0f; EnvironmentMarkers.Add(M); }
    for (int32 i=0;i<6;i++) { FArukheeaEnvironmentMarker M; M.Location=FVector(FMath::RandRange(-1800,1800),FMath::RandRange(-4500,4500),-100); M.Type=EArukheeaEnvironmentType::Bunker; M.EffectRadius=300; EnvironmentMarkers.Add(M); }
    for (int32 i=0;i<4;i++) { FArukheeaEnvironmentMarker M; M.Location=FVector(FMath::RandRange(-4500,8000),FMath::RandRange(-4500,4500),0); M.Type=EArukheeaEnvironmentType::Sandstorm; M.EffectRadius=2000; M.ActivePhaseMask=0x0E; EnvironmentMarkers.Add(M); }
    for (int32 i=0;i<3;i++) { FArukheeaEnvironmentMarker M; M.Location=FVector(FMath::RandRange(-4500,-2200),FMath::RandRange(-4500,4500),0); M.Type=EArukheeaEnvironmentType::Quicksand; M.EffectRadius=400; M.Intensity=0.8f; EnvironmentMarkers.Add(M); }

    UE_LOG(LogTemp, Log, TEXT("[Arukheea] Map defaults: %d sectors, %d spawns, %d loot"), Sectors.Num(), PlayerSpawnPoints.Num(), LootSpawnPoints.Num());
}
