// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Airdrop Manager — Spawns airdrops based on ring phase with probability

#include "Game/Ring/KhaaosAirdropManager.h"#include "Game/Ring/KhaaosRingSubsystem.h"#include "Engine/World.h"
#include "TimerManager.h"
#include "Kismet/GameplayStatics.h"

AKhaaosAirdropManager::AKhaaosAirdropManager()
{
    PrimaryActorTick.bCanEverTick = false;
    CurrentPhase = 0;
    PendingDropType = EAirdropType::STANDARD;
}

void AKhaaosAirdropManager::OnRingPhaseChanged(int32 NewPhase)
{
    CurrentPhase = NewPhase;

    // Roll probability for airdrop spawn
    const float Probability = GetAirdropProbability(NewPhase);
    const float Roll = FMath::FRand();

    UE_LOG(LogTemp, Log,
        TEXT("AirdropManager: Phase %d, probability=%.2f, roll=%.2f"),
        NewPhase, Probability, Roll);

    if (Roll <= Probability)
    {
        // Determine airdrop type
        EAirdropType DropType = EAirdropType::STANDARD;

        // Water drop chance in later phases if water zones exist
        if (NewPhase >= 3 && FMath::FRand() < 0.3f)
        {
            DropType = EAirdropType::WATER_DROP;
        }

        // Calculate spawn location (within ring, random position)
        FVector SpawnLocation = CalculateAirdropLocation();

        // Schedule airdrop with delay (plane flyover animation)
        PendingDropType = DropType;

        if (UWorld* World = GetWorld())
        {
            FTimerDelegate DropDelegate;
            DropDelegate.BindUFunction(this, FName("SpawnAirdrop"), SpawnLocation, DropType);
            World->GetTimerManager().SetTimer(AirdropSpawnTimer, DropDelegate, 3.0f, false);
        }

        UE_LOG(LogTemp, Log, TEXT("AirdropManager: Airdrop scheduled! Type=%d"), static_cast<int32>(DropType));
    }
}

void AKhaaosAirdropManager::SpawnAirdrop(const FVector& Location, EAirdropType Type)
{
    FAirdropSpawnPoint DropPoint;
    DropPoint.Location = Location;
    DropPoint.Type = Type;
    DropPoint.bIsWaterDrop = (Type == EAirdropType::WATER_DROP);

    // Loot count by type
    switch (Type)
    {
        case EAirdropType::STANDARD:
            DropPoint.LootCount = 4;
            DropPoint.FallTimeSeconds = 8.f;
            break;
        case EAirdropType::FLARE_GUN:
            DropPoint.LootCount = 6;
            DropPoint.FallTimeSeconds = 6.f;
            break;
        case EAirdropType::WATER_DROP:
            DropPoint.LootCount = 5;
            DropPoint.FallTimeSeconds = 10.f;
            break;
    }

    ActiveDrops.Add(DropPoint);

    // Spawn the airdrop crate actor
    // TSubclassOf<AActor> CrateClass;
    // if (Type == EAirdropType::WATER_DROP)
    //     CrateClass = WaterDropCrateClass;
    // else
    //     CrateClass = StandardCrateClass;
    //
    // if (CrateClass && GetWorld())
    // {
    //     FActorSpawnParameters Params;
    //     Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
    //     GetWorld()->SpawnActor<AActor>(CrateClass, Location, FRotator::ZeroRotator, Params);
    // }

    UE_LOG(LogTemp, Log,
        TEXT("AirdropManager: Airdrop spawned at (%.0f,%.0f,%.0f) type=%d loot=%d"),
        Location.X, Location.Y, Location.Z, static_cast<int32>(Type), DropPoint.LootCount);
}

void AKhaaosAirdropManager::SpawnWaterDrop(const FWaterZone& WaterZone)
{
    // Spawn location within water zone
    const float Angle = FMath::FRand() * 2.f * PI;
    const float Dist = FMath::FRand() * WaterZone.Radius;
    const FVector Location = WaterZone.Center + FVector(Dist * FMath::Cos(Angle), Dist * FMath::Sin(Angle), 200.f);

    SpawnAirdrop(Location, EAirdropType::WATER_DROP);
}

float AKhaaosAirdropManager::GetAirdropProbability(int32 Phase) const
{
    // Probability increases with phase:
    // Phase 1: 30%, Phase 2: 50%, Phase 3: 70%, Phase 4+: 90-100%
    const float Probabilities[] = { 0.3f, 0.5f, 0.7f, 0.9f, 1.0f, 1.0f };
    const int32 Idx = FMath::Clamp(Phase - 1, 0, UE_ARRAY_COUNT(Probabilities) - 1);
    return Probabilities[Idx];
}

void AKhaaosAirdropManager::OnFlareGunActivated(const FVector& FlareLocation)
{
    UE_LOG(LogTemp, Log, TEXT("AirdropManager: Flare gun activated!"));
    SpawnAirdrop(FlareLocation, EAirdropType::FLARE_GUN);
}

FVector AKhaaosAirdropManager::CalculateAirdropLocation_Implementation() const
{
    // Random location within current ring
    // This would use the RingManager's current radius and center
    const float Angle = FMath::FRand() * 2.f * PI;
    const float Radius = FMath::FRand() * 400.f; // Within 400 units of center
    return FVector(Radius * FMath::Cos(Angle), Radius * FMath::Sin(Angle), 500.f);
}
