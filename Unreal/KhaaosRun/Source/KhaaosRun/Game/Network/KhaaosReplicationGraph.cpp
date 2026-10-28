// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#include "Game/Network/KhaaosReplicationGraph.h"

#include "Net/UnrealNetwork.h"
#include "Engine/NetConnection.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/GameModeBase.h"

// ─── Log Category ──────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosRepGraph, Log, All);

// ─── Constructor ───────────────────────────────────────────────────────────────

UKhaaosReplicationGraph::UKhaaosReplicationGraph()
    : SpatialCellSize(4000.0f)
    , RelevantCellRadius(2)
    , MaxActorsPerFrame(512)
    , MaxRelevancyDistance(15000.0f)
    , PlayerReplicationFrequency(30.0f)
    , DistancePriorityWeight(1.0f)
    , PlayerStateRepRate(30.0f)
    , WeaponRepRate(20.0f)
    , LootRepRate(10.0f)
    , KillFeedRepRate(5.0f)
    , VehicleRepRate(15.0f)
    , ProjectileRepRate(60.0f)
{
}

// ─── UReplicationGraph Interface ──────────────────────────────────────────────

void UKhaaosReplicationGraph::InitGlobalActorClassObjects()
{
    UE_LOG(LogKhaaosRepGraph, Log, TEXT("KhaaosReplicationGraph: InitGlobalActorClassObjects — initializing per-class replication info"));

    // Initialize per-class replication rates
    InitClassReplicationInfo();

    // Log the configured rates
    UE_LOG(LogKhaaosRepGraph, Log, TEXT("  PlayerState: %.1f Hz | Weapon: %.1f Hz | Loot: %.1f Hz"),
        PlayerStateRepRate, WeaponRepRate, LootRepRate);
    UE_LOG(LogKhaaosRepGraph, Log, TEXT("  KillFeed: %.1f Hz | Vehicle: %.1f Hz | Projectile: %.1f Hz"),
        KillFeedRepRate, VehicleRepRate, ProjectileRepRate);
    UE_LOG(LogKhaaosRepGraph, Log, TEXT("  SpatialCellSize: %.0f | RelevantCellRadius: %d | MaxActorsPerFrame: %d"),
        SpatialCellSize, RelevantCellRadius, MaxActorsPerFrame);

    // Broadcast initialization
    OnRepGraphInitialized.Broadcast(static_cast<int32>(SpatialCellSize), SpatialCells.Num());
}

void UKhaaosReplicationGraph::InitConnectionGraph(UNetReplicationGraphConnection* RepGraphConnection)
{
    if (!RepGraphConnection)
    {
        return;
    }

    UNetConnection* NetConnection = RepGraphConnection->GetNetConnection();
    if (!NetConnection)
    {
        return;
    }

    // Initialize per-connection tracking data
    FKhaaosConnectionRepData& ConnData = ConnectionData.FindOrAdd(NetConnection);
    ConnData.RelevantCells.Empty();
    ConnData.ViewerLocation = FVector::ZeroVector;
    ConnData.LastUpdateFrame = 0;
    ConnData.ActorsReplicatedLastFrame = 0;
    ConnData.EstimatedBandwidthBytes = 0;

    UE_LOG(LogKhaaosRepGraph, Verbose, TEXT("KhaaosReplicationGraph: InitConnectionGraph — connection %s initialized"),
        *NetConnection->RemoteAddressToString());
}

void UKhaaosReplicationGraph::AddActor(AActor* Actor)
{
    if (!Actor || !Actor->HasAuthority())
    {
        return;
    }

    // Route actor to appropriate list
    RouteActor(Actor);

    UE_LOG(LogKhaaosRepGraph, VeryVerbose, TEXT("KhaaosReplicationGraph: AddActor — %s (class: %s)"),
        *Actor->GetName(), *Actor->GetClass()->GetName());
}

void UKhaaosReplicationGraph::RemoveActor(AActor* Actor, bool bKeepTearOff)
{
    if (!Actor)
    {
        return;
    }

    // Remove from spatial cell if present
    RemoveActorFromCell(Actor);

    // Remove from global always-relevant list
    GlobalAlwaysRelevantActors.RemoveAll([Actor](const TWeakObjectPtr<AActor>& WeakPtr)
    {
        return WeakPtr.Get() == Actor || !WeakPtr.IsValid();
    });

    // Remove from actor-to-cell map
    ActorToCellMap.Remove(Actor);

    UE_LOG(LogKhaaosRepGraph, VeryVerbose, TEXT("KhaaosReplicationGraph: RemoveActor — %s (bKeepTearOff: %s)"),
        *Actor->GetName(), bKeepTearOff ? TEXT("true") : TEXT("false"));
}

void UKhaaosReplicationGraph::ReplicateActor(AActor* Actor)
{
    if (!Actor || !Actor->HasAuthority())
    {
        return;
    }

    // Update frame counter
    FrameCounter++;

    // Periodic cleanup of stale actors (every 300 frames)
    if (FrameCounter % 300 == 0)
    {
        CleanupStaleActors();
    }

    // For dynamic actors, update spatial cell assignment
    if (IsDynamicClass(Actor->GetClass()))
    {
        UpdateSpatialCell(Actor);
    }
}

// ─── Spatial Grid ─────────────────────────────────────────────────────────────

void UKhaaosReplicationGraph::UpdateSpatialCell(AActor* Actor)
{
    if (!Actor)
    {
        return;
    }

    const FVector ActorLocation = Actor->GetActorLocation();
    const FKhaaosSpatialCellCoord NewCell = GetCellCoordForLocation(ActorLocation);

    // Check if actor already has a cell assignment
    TWeakObjectPtr<AActor> WeakActor(Actor);
    if (FKhaaosSpatialCellCoord* ExistingCell = ActorToCellMap.Find(WeakActor))
    {
        // Already in the correct cell — nothing to do
        if (*ExistingCell == NewCell)
        {
            return;
        }

        // Remove from old cell
        FKhaaosSpatialCellCoord OldCell = *ExistingCell;

        if (FKhaaosSpatialCell* CellData = SpatialCells.Find(OldCell))
        {
            if (IsDynamicClass(Actor->GetClass()))
            {
                CellData->DynamicActors.RemoveAll([Actor](const TWeakObjectPtr<AActor>& Ptr)
                {
                    return Ptr.Get() == Actor || !Ptr.IsValid();
                });
            }
            else
            {
                CellData->StaticActors.RemoveAll([Actor](const TWeakObjectPtr<AActor>& Ptr)
                {
                    return Ptr.Get() == Actor || !Ptr.IsValid();
                });
            }
            CellData->UpdateCachedCount();

            // Remove empty cells
            if (CellData->CachedActorCount == 0)
            {
                SpatialCells.Remove(OldCell);
            }
        }

        // Broadcast cell update
        OnActorCellUpdated.Broadcast(Actor, OldCell, NewCell);
    }

    // Add to new cell
    FKhaaosSpatialCell& NewCellData = SpatialCells.FindOrAdd(NewCell);
    if (IsDynamicClass(Actor->GetClass()))
    {
        NewCellData.DynamicActors.Add(WeakActor);
    }
    else
    {
        NewCellData.StaticActors.Add(WeakActor);
    }
    NewCellData.UpdateCachedCount();

    // Update actor-to-cell mapping
    ActorToCellMap.Add(WeakActor, NewCell);

    CellsUpdatedLastFrame++;
}

FKhaaosSpatialCellCoord UKhaaosReplicationGraph::GetCellCoordForLocation(const FVector& Location) const
{
    const float InvCellSize = 1.0f / FMath::Max(SpatialCellSize, 1.0f);
    return FKhaaosSpatialCellCoord(
        FMath::FloorToInt(Location.X * InvCellSize),
        FMath::FloorToInt(Location.Y * InvCellSize)
    );
}

void UKhaaosReplicationGraph::GetActorsInNeighborhood(
    const FKhaaosSpatialCellCoord& CenterCell,
    int32 CellRadius,
    TArray<AActor*>& OutActors) const
{
    OutActors.Reserve(OutActors.Num() + 64); // Rough estimate

    for (int32 DX = -CellRadius; DX <= CellRadius; ++DX)
    {
        for (int32 DY = -CellRadius; DY <= CellRadius; ++DY)
        {
            const FKhaaosSpatialCellCoord NeighborCell(CenterCell.X + DX, CenterCell.Y + DY);

            if (const FKhaaosSpatialCell* CellData = SpatialCells.Find(NeighborCell))
            {
                // Add dynamic actors
                for (const TWeakObjectPtr<AActor>& WeakPtr : CellData->DynamicActors)
                {
                    if (AActor* Actor = WeakPtr.Get())
                    {
                        OutActors.Add(Actor);
                    }
                }

                // Add static actors
                for (const TWeakObjectPtr<AActor>& WeakPtr : CellData->StaticActors)
                {
                    if (AActor* Actor = WeakPtr.Get())
                    {
                        OutActors.Add(Actor);
                    }
                }
            }
        }
    }
}

// ─── Prioritization ───────────────────────────────────────────────────────────

void UKhaaosReplicationGraph::PrioritizeActors(TArray<AActor*>& Actors, const FVector& ViewerLocation) const
{
    // Sort by priority (highest first): priority = class_weight / (distance + 1)
    Actors.Sort([this, &ViewerLocation](AActor& A, AActor& B)
    {
        const float PriorityA = CalculateActorPriority(&A, ViewerLocation);
        const float PriorityB = CalculateActorPriority(&B, ViewerLocation);
        return PriorityA > PriorityB; // Higher priority first
    });
}

bool UKhaaosReplicationGraph::IsActorRelevantToConnection(AActor* Actor, const FVector& ViewerLocation) const
{
    if (!Actor)
    {
        return false;
    }

    // Always relevant actors are always relevant
    if (IsAlwaysRelevantClass(Actor->GetClass()))
    {
        return true;
    }

    // Check distance-based relevance
    const float DistanceSq = FVector::DistSquared(Actor->GetActorLocation(), ViewerLocation);
    const float MaxDistSq = MaxRelevancyDistance * MaxRelevancyDistance;

    return DistanceSq <= MaxDistSq;
}

// ─── Per-World Configuration ──────────────────────────────────────────────────

void UKhaaosReplicationGraph::ConfigureForWorld(EWorldSequence World)
{
    CurrentWorld = World;

    switch (World)
    {
    case EWorldSequence::Barburhen:
        // 100 players — larger cells, higher bandwidth budget
        SpatialCellSize = 5000.0f;
        MaxActorsPerFrame = 768;
        MaxRelevancyDistance = 18000.0f;
        UE_LOG(LogKhaaosRepGraph, Log, TEXT("KhaaosReplicationGraph: ConfigureForWorld — Barburhen (100p, cell=5000, maxActors=768)"));
        break;

    case EWorldSequence::Ckesalth:
        // Dense environment — smaller cells for tighter spatial clustering
        SpatialCellSize = 3000.0f;
        MaxActorsPerFrame = 512;
        MaxRelevancyDistance = 12000.0f;
        UE_LOG(LogKhaaosRepGraph, Log, TEXT("KhaaosReplicationGraph: ConfigureForWorld — Ckesalth (dense, cell=3000, maxActors=512)"));
        break;

    case EWorldSequence::CIGKV:
        // 50 players — moderate cells, lower bandwidth
        SpatialCellSize = 4000.0f;
        MaxActorsPerFrame = 512;
        MaxRelevancyDistance = 15000.0f;
        UE_LOG(LogKhaaosRepGraph, Log, TEXT("KhaaosReplicationGraph: ConfigureForWorld — CIGKV (50p, cell=4000, maxActors=512)"));
        break;

    case EWorldSequence::Priadus:
    case EWorldSequence::Arukheea:
        // Default configuration
        SpatialCellSize = 4000.0f;
        MaxActorsPerFrame = 512;
        MaxRelevancyDistance = 15000.0f;
        UE_LOG(LogKhaaosRepGraph, Log, TEXT("KhaaosReplicationGraph: ConfigureForWorld — %s (default, cell=4000)"),
            World == EWorldSequence::Priadus ? TEXT("Priadus") : TEXT("Arukheea"));
        break;

    default:
        break;
    }
}

FKhaaosClassReplicationInfo UKhaaosReplicationGraph::GetClassReplicationInfo(UClass* InClass) const
{
	    for (UClass* CheckClass = InClass; CheckClass; CheckClass = CheckClass->GetSuperClass())
	    {
	        if (const FKhaaosClassReplicationInfo* Info = ClassReplicationInfoMap.Find(CheckClass))
	        {
	            return *Info;
	        }
	    }

    // Default: spatially relevant, 30Hz
    return FKhaaosClassReplicationInfo(30.0f, false, true, false, 1.0f);
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

FString UKhaaosReplicationGraph::GetReplicationStats() const
{
    return FString::Printf(
        TEXT("TrackedActors=%d ActiveCells=%d GlobalActors=%d CellsUpdated=%d"),
        ActorToCellMap.Num(),
        SpatialCells.Num(),
        GlobalAlwaysRelevantActors.Num(),
        CellsUpdatedLastFrame
    );
}

// ─── Internal Methods ─────────────────────────────────────────────────────────

void UKhaaosReplicationGraph::InitClassReplicationInfo()
{
    // ─── Always-Relevant Classes (replicated to all connections) ─────────

    // PlayerState — always relevant, high frequency
    ClassReplicationInfoMap.Add(APlayerState::StaticClass(),
        FKhaaosClassReplicationInfo(PlayerStateRepRate, true, false, false, 10.0f));

    // PlayerController — always relevant
    ClassReplicationInfoMap.Add(APlayerController::StaticClass(),
        FKhaaosClassReplicationInfo(PlayerReplicationFrequency, true, false, false, 10.0f));

    // GameState — always relevant, moderate frequency
    ClassReplicationInfoMap.Add(AGameStateBase::StaticClass(),
        FKhaaosClassReplicationInfo(10.0f, true, false, false, 8.0f));

    // GameMode — always relevant (server-only but registered for completeness)
    ClassReplicationInfoMap.Add(AGameModeBase::StaticClass(),
        FKhaaosClassReplicationInfo(10.0f, true, false, false, 8.0f));

    // ─── Dynamic Spatially-Relevant Classes ──────────────────────────────

    // Weapon — dynamic, high priority
    ClassReplicationInfoMap.Add(AActor::StaticClass(), // Fallback — will be overridden by weapon subclass
        FKhaaosClassReplicationInfo(WeaponRepRate, false, true, true, 5.0f));

    // Note: Specific weapon/loot/vehicle classes would be registered here
    // once their UClass is available. The base AActor entry serves as a default.

    UE_LOG(LogKhaaosRepGraph, Log, TEXT("KhaaosReplicationGraph: InitClassReplicationInfo — registered %d class entries"),
        ClassReplicationInfoMap.Num());
}

void UKhaaosReplicationGraph::RouteActor(AActor* Actor)
{
    if (!Actor)
    {
        return;
    }

    UClass* ActorClass = Actor->GetClass();

    if (IsAlwaysRelevantClass(ActorClass))
    {
        // Route to global always-relevant list
        GlobalAlwaysRelevantActors.Add(TWeakObjectPtr<AActor>(Actor));

        UE_LOG(LogKhaaosRepGraph, VeryVerbose, TEXT("  → Routed to GlobalAlwaysRelevant: %s"), *Actor->GetName());
    }
    else
    {
        // Route to spatial grid
        UpdateSpatialCell(Actor);

        UE_LOG(LogKhaaosRepGraph, VeryVerbose, TEXT("  → Routed to SpatialCell: %s"), *Actor->GetName());
    }
}

void UKhaaosReplicationGraph::RemoveActorFromCell(AActor* Actor)
{
    if (!Actor)
    {
        return;
    }

    TWeakObjectPtr<AActor> WeakActor(Actor);
    if (FKhaaosSpatialCellCoord* CellCoord = ActorToCellMap.Find(WeakActor))
    {
        FKhaaosSpatialCellCoord OldCell = *CellCoord;

        if (FKhaaosSpatialCell* CellData = SpatialCells.Find(OldCell))
        {
            // Remove from both dynamic and static lists (safe even if not present)
            CellData->DynamicActors.RemoveAll([Actor](const TWeakObjectPtr<AActor>& Ptr)
            {
                return Ptr.Get() == Actor || !Ptr.IsValid();
            });
            CellData->StaticActors.RemoveAll([Actor](const TWeakObjectPtr<AActor>& Ptr)
            {
                return Ptr.Get() == Actor || !Ptr.IsValid();
            });
            CellData->UpdateCachedCount();

            // Remove empty cells
            if (CellData->CachedActorCount == 0)
            {
                SpatialCells.Remove(OldCell);
            }
        }
    }
}

bool UKhaaosReplicationGraph::IsAlwaysRelevantClass(UClass* InClass) const
{
    if (!InClass)
    {
        return false;
    }

    // Exact-class false must not mask an always-relevant superclass.
    for (UClass* CheckClass = InClass; CheckClass; CheckClass = CheckClass->GetSuperClass())
    {
        if (const FKhaaosClassReplicationInfo* Info = ClassReplicationInfoMap.Find(CheckClass))
        {
            return Info->bAlwaysRelevant;
        }
    }

    return false;
}

bool UKhaaosReplicationGraph::IsDynamicClass(UClass* InClass) const
{
    if (!InClass)
    {
        return false;
    }

    for (UClass* CheckClass = InClass; CheckClass; CheckClass = CheckClass->GetSuperClass())
    {
        if (const FKhaaosClassReplicationInfo* Info = ClassReplicationInfoMap.Find(CheckClass))
        {
            return Info->bDynamic;
        }
    }

    // By default, assume actors are dynamic if they have mobility
    // (Projectiles, Vehicles, Loot that can be picked up)
    return true;
}

float UKhaaosReplicationGraph::CalculateActorPriority(AActor* Actor, const FVector& ViewerLocation) const
{
    if (!Actor)
    {
        return 0.0f;
    }

    // Distance-based priority
    const float Distance = FVector::Dist(Actor->GetActorLocation(), ViewerLocation);
    const float DistanceFactor = 1.0f / (Distance + 1.0f); // +1 to avoid division by zero

    // Class-based priority weight
    float ClassWeight = 1.0f;
    if (const FKhaaosClassReplicationInfo* Info = ClassReplicationInfoMap.Find(Actor->GetClass()))
    {
        ClassWeight = Info->PriorityWeight;
    }

    // Always-relevant actors get maximum priority
    if (IsAlwaysRelevantClass(Actor->GetClass()))
    {
        return 1000000.0f; // Very high priority
    }

    return DistanceFactor * ClassWeight * DistancePriorityWeight;
}

void UKhaaosReplicationGraph::CleanupStaleActors()
{
    // Clean up stale weak pointers in all spatial cells
    TArray<FKhaaosSpatialCellCoord> EmptyCells;

    for (auto& CellPair : SpatialCells)
    {
        FKhaaosSpatialCell& Cell = CellPair.Value;

        Cell.DynamicActors.RemoveAll([](const TWeakObjectPtr<AActor>& Ptr)
        {
            return !Ptr.IsValid();
        });

        Cell.StaticActors.RemoveAll([](const TWeakObjectPtr<AActor>& Ptr)
        {
            return !Ptr.IsValid();
        });

        Cell.UpdateCachedCount();

        if (Cell.CachedActorCount == 0)
        {
            EmptyCells.Add(CellPair.Key);
        }
    }

    // Remove empty cells
    for (const FKhaaosSpatialCellCoord& EmptyCell : EmptyCells)
    {
        SpatialCells.Remove(EmptyCell);
    }

    // Clean up stale entries in actor-to-cell map
    ActorToCellMap.RemoveAll([](const TPair<TWeakObjectPtr<AActor>, FKhaaosSpatialCellCoord>& Pair)
    {
        return !Pair.Key.IsValid();
    });

    // Clean up stale global actors
    GlobalAlwaysRelevantActors.RemoveAll([](const TWeakObjectPtr<AActor>& Ptr)
    {
        return !Ptr.IsValid();
    });

    UE_LOG(LogKhaaosRepGraph, VeryVerbose, TEXT("KhaaosReplicationGraph: CleanupStaleActors — removed %d empty cells"), EmptyCells.Num());
}
