// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Airdrop/KhaaosAirdropSystem.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosAirdropSystemComponent::UKhaaosAirdropSystemComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = false;

    NextAirdropId     = 0;
    MatchElapsedTime  = 0.0f;
    TimeUntilNextDrop = 0.0f;

    SafeZoneCenter = FVector2D::ZeroVector;
    SafeZoneRadius = 10000.0f;
    ZonePhase      = 0;

    MapCenter = FVector2D::ZeroVector;
    MapRadius = 10000.0f;

    // Default drop pattern (Free Fire-style: 120s base, decreasing)
    DropPattern.BaseIntervalSeconds       = 120.0f;
    DropPattern.IntervalDecreasePerMinute = 5.0f;
    DropPattern.MinimumIntervalSeconds    = 30.0f;
    DropPattern.ZoneEdgeWeight            = 0.6f;
    DropPattern.bDropAtZoneEdgeLaterPhases = true;
    DropPattern.EdgeDropStartPhase         = 2;

    InitializeDefaultLootPools();
}

// ─── Default Loot Pools ─────────────────────────────────────────────────────────

void UKhaaosAirdropSystemComponent::InitializeDefaultLootPools()
{
    LootPoolsByRarity.Empty(4);

    // Common: basic weapons and ammo
    {
        TArray<FName> Pool;
        Pool.Add(FName("AssaultRifle_Common"));
        Pool.Add(FName("Shotgun_Common"));
        Pool.Add(FName("Ammo_Medium"));
        Pool.Add(FName("MedKit_Small"));
        LootPoolsByRarity.Add(EKhaaosAirdropRarity::Common, Pool);
    }

    // Uncommon: better weapons, attachments
    {
        TArray<FName> Pool;
        Pool.Add(FName("AssaultRifle_Uncommon"));
        Pool.Add(FName("Sniper_Uncommon"));
        Pool.Add(FName("Scope_4x"));
        Pool.Add(FName("Armor_Medium"));
        LootPoolsByRarity.Add(EKhaaosAirdropRarity::Uncommon, Pool);
    }

    // Rare: high-value gear
    {
        TArray<FName> Pool;
        Pool.Add(FName("AssaultRifle_Rare"));
        Pool.Add(FName("Sniper_Rare"));
        Pool.Add(FName("Scope_8x"));
        Pool.Add(FName("Armor_Heavy"));
        Pool.Add(FName("MedKit_Large"));
        LootPoolsByRarity.Add(EKhaaosAirdropRarity::Rare, Pool);
    }

    // Lendário (Legendary): top-tier, game-changing loot
    {
        TArray<FName> Pool;
        Pool.Add(FName("AWM_Lendario"));
        Pool.Add(FName("GhillieSuit"));
        Pool.Add(FName("Armor_Lendario"));
        Pool.Add(FName("MedKit_Full"));
        Pool.Add(FName("AirdropLauncher"));
        LootPoolsByRarity.Add(EKhaaosAirdropRarity::Lendario, Pool);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("AirdropSystem::InitializeDefaultLootPools - 4 rarity tiers initialized"));
}

// ─── Configuration ──────────────────────────────────────────────────────────────

void UKhaaosAirdropSystemComponent::ConfigureDropPattern(const FKhaaosAirdropPattern& InPattern)
{
    DropPattern = InPattern;
    UE_LOG(LogKhaaosRun, Log, TEXT("AirdropSystem::ConfigureDropPattern - BaseInterval=%.0fs MinInterval=%.0fs EdgeWeight=%.2f"),
        DropPattern.BaseIntervalSeconds, DropPattern.MinimumIntervalSeconds, DropPattern.ZoneEdgeWeight);
}

void UKhaaosAirdropSystemComponent::SetZoneInfo(const FVector2D& InZoneCenter, float InZoneRadius, int32 InCurrentPhase)
{
    SafeZoneCenter = InZoneCenter;
    SafeZoneRadius = InZoneRadius;
    ZonePhase      = InCurrentPhase;
}

void UKhaaosAirdropSystemComponent::SetMapBounds(const FVector2D& InMapCenter, float InMapRadius)
{
    MapCenter = InMapCenter;
    MapRadius = InMapRadius;
}

// ─── Drop Scheduling ────────────────────────────────────────────────────────────

void UKhaaosAirdropSystemComponent::ScheduleAirdrop()
{
    if (GetOwnerRole() != ROLE_Authority)
    {
        return;
    }

    FKhaaosAirdrop Drop;
    Drop.AirdropId = NextAirdropId++;
    Drop.Location  = ComputeDropLocation();
    Drop.Rarity    = DetermineRarity();
    Drop.LootPool  = SelectLootForRarity(Drop.Rarity);
    Drop.DropTime  = MatchElapsedTime + 10.0f; // 10s flight time
    Drop.bHasLanded = false;

    ActiveAirdrops.Add(Drop);

    // Broadcast incoming — UI shows minimap marker and alert
    OnAirdropIncoming.Broadcast(Drop.AirdropId, Drop.Location);

    UE_LOG(LogKhaaosRun, Log, TEXT("AirdropSystem::ScheduleAirdrop - ID=%d Rarity=%s Loc=(%.0f,%.0f,%.0f) DropAt=%.1fs"),
        Drop.AirdropId,
        Drop.Rarity == EKhaaosAirdropRarity::Lendario ? TEXT("Lendário") :
        Drop.Rarity == EKhaaosAirdropRarity::Rare     ? TEXT("Rare") :
        Drop.Rarity == EKhaaosAirdropRarity::Uncommon ? TEXT("Uncommon") : TEXT("Common"),
        Drop.Location.X, Drop.Location.Y, Drop.Location.Z,
        Drop.DropTime);
}

void UKhaaosAirdropSystemComponent::ScheduleAirdropAtLocation(const FVector& Location, EKhaaosAirdropRarity Rarity)
{
    if (GetOwnerRole() != ROLE_Authority)
    {
        return;
    }

    FKhaaosAirdrop Drop;
    Drop.AirdropId  = NextAirdropId++;
    Drop.Location   = Location;
    Drop.Rarity     = Rarity;
    Drop.LootPool   = SelectLootForRarity(Rarity);
    Drop.DropTime   = MatchElapsedTime + 10.0f;
    Drop.bHasLanded = false;

    ActiveAirdrops.Add(Drop);

    OnAirdropIncoming.Broadcast(Drop.AirdropId, Drop.Location);

    UE_LOG(LogKhaaosRun, Log, TEXT("AirdropSystem::ScheduleAirdropAtLocation - ID=%d at (%.0f,%.0f,%.0f)"),
        Drop.AirdropId, Location.X, Location.Y, Location.Z);
}

// ─── Location & Rarity Selection ────────────────────────────────────────────────

FVector UKhaaosAirdropSystemComponent::ComputeDropLocation() const
{
    // Zone-edge weighted location selection
    // Blend between fully random (inside map) and zone-edge point
    const float EdgeWeight = DropPattern.ZoneEdgeWeight;

    // Random point inside the safe zone
    const float Angle1 = FMath::FRandRange(0.0f, 2.0f * PI);
    const float Dist1  = FMath::FRandRange(0.0f, SafeZoneRadius);
    const FVector2D RandomPoint(
        SafeZoneCenter.X + FMath::Cos(Angle1) * Dist1,
        SafeZoneCenter.Y + FMath::Sin(Angle1) * Dist1
    );

    // Point near zone edge (80-100% of zone radius)
    const float Angle2 = FMath::FRandRange(0.0f, 2.0f * PI);
    const float EdgeDist = FMath::FRandRange(0.8f, 1.0f) * SafeZoneRadius;
    const FVector2D EdgePoint(
        SafeZoneCenter.X + FMath::Cos(Angle2) * EdgeDist,
        SafeZoneCenter.Y + FMath::Sin(Angle2) * EdgeDist
    );

    // Blend between random and edge based on weight
    FVector2D DropLocation2D = FMath::Lerp(RandomPoint, EdgePoint, EdgeWeight);

    // In later phases, always bias toward edge
    if (DropPattern.bDropAtZoneEdgeLaterPhases && ZonePhase >= DropPattern.EdgeDropStartPhase)
    {
        const float LaterPhaseWeight = FMath::Min(1.0f, EdgeWeight + 0.2f);
        DropLocation2D = FMath::Lerp(RandomPoint, EdgePoint, LaterPhaseWeight);
    }

    // Clamp to map bounds
    const FVector2D ToCenter = DropLocation2D - MapCenter;
    const float DistFromMapCenter = ToCenter.Size();
    if (DistFromMapCenter > MapRadius * 0.95f)
    {
        DropLocation2D = MapCenter + (ToCenter / DistFromMapCenter) * (MapRadius * 0.9f);
    }

    // Z component = 0 (ground level, crate spawns on landing)
    return FVector(DropLocation2D.X, DropLocation2D.Y, 0.0f);
}

EKhaaosAirdropRarity UKhaaosAirdropSystemComponent::DetermineRarity() const
{
    // Rarity escalates with match time:
    // 0-5 min: Common (60%) / Uncommon (30%) / Rare (8%) / Lendário (2%)
    // 5-10 min: Common (30%) / Uncommon (35%) / Rare (25%) / Lendário (10%)
    // 10+ min: Common (10%) / Uncommon (25%) / Rare (40%) / Lendário (25%)

    const float Roll = FMath::FRand();

    if (MatchElapsedTime < 300.0f) // First 5 minutes
    {
        if (Roll < 0.02f)  return EKhaaosAirdropRarity::Lendario;
        if (Roll < 0.10f)  return EKhaaosAirdropRarity::Rare;
        if (Roll < 0.40f)  return EKhaaosAirdropRarity::Uncommon;
        return EKhaaosAirdropRarity::Common;
    }
    else if (MatchElapsedTime < 600.0f) // 5-10 minutes
    {
        if (Roll < 0.10f)  return EKhaaosAirdropRarity::Lendario;
        if (Roll < 0.35f)  return EKhaaosAirdropRarity::Rare;
        if (Roll < 0.70f)  return EKhaaosAirdropRarity::Uncommon;
        return EKhaaosAirdropRarity::Common;
    }
    else // 10+ minutes
    {
        if (Roll < 0.25f)  return EKhaaosAirdropRarity::Lendario;
        if (Roll < 0.65f)  return EKhaaosAirdropRarity::Rare;
        if (Roll < 0.90f)  return EKhaaosAirdropRarity::Uncommon;
        return EKhaaosAirdropRarity::Common;
    }
}

TArray<FName> UKhaaosAirdropSystemComponent::SelectLootForRarity(EKhaaosAirdropRarity Rarity) const
{
    const TArray<FName>* Pool = LootPoolsByRarity.Find(Rarity);
    if (Pool && Pool->Num() > 0)
    {
        // Select 2-4 items from the pool
        const int32 NumItems = FMath::RandRange(2, FMath::Min(4, Pool->Num()));
        TArray<FName> Selected;
        TArray<FName> PoolCopy = *Pool;

        for (int32 i = 0; i < NumItems && PoolCopy.Num() > 0; ++i)
        {
            const int32 Idx = FMath::RandRange(0, PoolCopy.Num() - 1);
            Selected.Add(PoolCopy[Idx]);
            PoolCopy.RemoveAtSwap(Idx);
        }

        return Selected;
    }

    // Fallback: empty loot
    return TArray<FName>();
}

// ─── Interval Computation ───────────────────────────────────────────────────────

float UKhaaosAirdropSystemComponent::ComputeCurrentInterval() const
{
    const float MinutesElapsed = MatchElapsedTime / 60.0f;
    const float Decrease = DropPattern.IntervalDecreasePerMinute * MinutesElapsed;
    return FMath::Max(DropPattern.MinimumIntervalSeconds,
                      DropPattern.BaseIntervalSeconds - Decrease);
}

// ─── Query ──────────────────────────────────────────────────────────────────────

TArray<FKhaaosAirdrop> UKhaaosAirdropSystemComponent::GetPendingAirdrops() const
{
    TArray<FKhaaosAirdrop> Pending;
    for (const FKhaaosAirdrop& Drop : ActiveAirdrops)
    {
        if (!Drop.bHasLanded)
        {
            Pending.Add(Drop);
        }
    }
    return Pending;
}

TArray<FKhaaosAirdrop> UKhaaosAirdropSystemComponent::GetLandedAirdrops() const
{
    TArray<FKhaaosAirdrop> Landed;
    for (const FKhaaosAirdrop& Drop : ActiveAirdrops)
    {
        if (Drop.bHasLanded)
        {
            Landed.Add(Drop);
        }
    }
    return Landed;
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosAirdropSystemComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority)
    {
        return;
    }

    MatchElapsedTime += DeltaTime;

    // ─── Process landing for in-flight airdrops ────────────────────────────
    for (FKhaaosAirdrop& Drop : ActiveAirdrops)
    {
        if (!Drop.bHasLanded && MatchElapsedTime >= Drop.DropTime)
        {
            Drop.bHasLanded = true;

            OnAirdropLanded.Broadcast(Drop.AirdropId, Drop.Location);

            UE_LOG(LogKhaaosRun, Log, TEXT("AirdropSystem - Airdrop %d LANDED at (%.0f,%.0f,%.0f) Rarity=%d Loot=%d"),
                Drop.AirdropId, Drop.Location.X, Drop.Location.Y, Drop.Location.Z,
                static_cast<int32>(Drop.Rarity), Drop.LootPool.Num());
        }
    }

    // ─── Auto-schedule next airdrop ────────────────────────────────────────
    TimeUntilNextDrop -= DeltaTime;

    if (TimeUntilNextDrop <= 0.0f)
    {
        ScheduleAirdrop();

        // Reset timer with computed interval
        TimeUntilNextDrop = ComputeCurrentInterval();

        UE_LOG(LogKhaaosRun, Verbose, TEXT("AirdropSystem - Next drop in %.1fs (interval from %.0fs base)"),
            TimeUntilNextDrop, DropPattern.BaseIntervalSeconds);
    }
}
