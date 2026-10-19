// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "ReplicationGraph.h"
#include "Game/KhaaosGameMode.h"
#include "KhaaosReplicationGraph.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UNetConnection;
class APlayerState;
class AGameStateBase;
class AKhaaosGameMode;

// ─── Per-Class Replication Info ────────────────────────────────────────────────

/**
 * FKhaaosClassReplicationInfo
 *
 * Per-class replication configuration for the Khaaos spatial replication graph.
 * Controls how frequently each class replicates and its routing category.
 */
USTRUCT(BlueprintType)
struct FKhaaosClassReplicationInfo
{
    GENERATED_BODY()

    /** Replication frequency in Hz (updates per second). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|RepGraph|Class")
    float ReplicationFrequency = 30.0f;

    /** Whether this class is always relevant (bypasses spatial checks). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|RepGraph|Class")
    uint8 bAlwaysRelevant : 1;

    /** Whether this class uses spatial cell routing. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|RepGraph|Class")
    uint8 bSpatiallyRelevant : 1;

    /** Whether this is a dynamic actor that moves between cells frequently. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|RepGraph|Class")
    uint8 bDynamic : 1;

    /** Priority weight for connection-based sorting (higher = more important). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|RepGraph|Class")
    float PriorityWeight = 1.0f;

    FKhaaosClassReplicationInfo()
        : ReplicationFrequency(30.0f)
        , bAlwaysRelevant(false)
        , bSpatiallyRelevant(true)
        , bDynamic(false)
        , PriorityWeight(1.0f)
    {}

    FKhaaosClassReplicationInfo(float InFrequency, bool bInAlwaysRelevant, bool bInSpatial, bool bInDynamic, float InPriority)
        : ReplicationFrequency(InFrequency)
        , bAlwaysRelevant(bInAlwaysRelevant)
        , bSpatiallyRelevant(bInSpatial)
        , bDynamic(bInDynamic)
        , PriorityWeight(InPriority)
    {}
};

// ─── Spatial Cell Coordinates ─────────────────────────────────────────────────

/**
 * FKhaaosSpatialCellCoord
 *
 * Integer coordinates for a spatial grid cell. Used as key in cell map.
 */
USTRUCT(BlueprintType)
struct FKhaaosSpatialCellCoord
{
    GENERATED_BODY()

    UPROPERTY()
    int32 X = 0;

    UPROPERTY()
    int32 Y = 0;

    FKhaaosSpatialCellCoord() = default;
    FKhaaosSpatialCellCoord(int32 InX, int32 InY) : X(InX), Y(InY) {}

    bool operator==(const FKhaaosSpatialCellCoord& Other) const
    {
        return X == Other.X && Y == Other.Y;
    }

    friend uint32 GetTypeHash(const FKhaaosSpatialCellCoord& Coord)
    {
        return HashCombine(GetTypeHash(Coord.X), GetTypeHash(Coord.Y));
    }
};

// ─── Spatial Cell ──────────────────────────────────────────────────────────────

/**
 * FKhaaosSpatialCell
 *
 * Contains all actors within a single spatial grid cell.
 * Actors are separated into dynamic (moving) and static lists for efficiency.
 */
USTRUCT()
struct FKhaaosSpatialCell
{
    GENERATED_BODY()

    /** Dynamic actors in this cell (Loot, Vehicles, Projectiles). */
    UPROPERTY()
    TArray<TWeakObjectPtr<AActor>> DynamicActors;

    /** Static actors in this cell (world-placed pickups, interactables). */
    UPROPERTY()
    TArray<TWeakObjectPtr<AActor>> StaticActors;

    /** Total actor count (cached for fast queries). */
    int32 CachedActorCount = 0;

    /** Recompute cached actor count. */
    void UpdateCachedCount()
    {
        CachedActorCount = DynamicActors.Num() + StaticActors.Num();
    }
};

// ─── Connection Replication Data ───────────────────────────────────────────────

/**
 * FKhaaosConnectionRepData
 *
 * Per-connection replication tracking data.
 * Stores which cells are relevant to this connection and prioritization info.
 */
USTRUCT()
struct FKhaaosConnectionRepData
{
    GENERATED_BODY()

    /** Cells currently relevant to this connection. */
    TSet<FKhaaosSpatialCellCoord> RelevantCells;

    /** Cached viewer location for distance calculations. */
    FVector ViewerLocation = FVector::ZeroVector;

    /** Last frame number this connection was updated. */
    int32 LastUpdateFrame = 0;

    /** Number of actors replicated to this connection last frame. */
    int32 ActorsReplicatedLastFrame = 0;

    /** Accumulated bandwidth usage estimate (bytes). */
    int32 EstimatedBandwidthBytes = 0;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRepGraphInitialized, int32, CellSize, int32, TotalCells);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnActorCellUpdated, AActor*, Actor, FKhaaosSpatialCellCoord, OldCell, FKhaaosSpatialCellCoord, NewCell);

/**
 * UKhaaosReplicationGraph
 *
 * PhD-Level Spatial Replication Graph for 60-100 player Battle Royale.
 *
 * Architecture:
 *   - Spatial grid partitions the world into configurable cells
 *   - Per-world cell sizes: Barburhen=5000, Ckesalth=3000, CIGKV=4000
 *   - Player replication: Always relevant for PlayerState, Controller
 *   - Dynamic actors (Loot, Vehicles, Projectiles) routed to spatial cells
 *   - Static actors (ReviveStations, AirdropPoints) always relevant
 *   - Connection priority: Sort actors by distance to viewer, importance weight
 *   - Global actor list: GameMode, GameState, always-relevant systems
 *   - Per-class replication rates: PlayerState=30Hz, Weapon=20Hz, Loot=10Hz,
 *     KillFeed=5Hz, Vehicle=15Hz
 *   - Configurable: Player replication frequency, spatial cell size, max actors/frame
 *
 * Spatial Grid:
 *   - World is divided into a 2D grid of cells based on CellSize
 *   - Each actor is assigned to a cell based on its GetActorLocation()
 *   - When an actor moves, UpdateSpatialCell() reassigns it
 *   - Connections only receive replication for actors in nearby cells
 *
 * Relevance Model:
 *   - AlwaysRelevant: PlayerState, Controller, GameMode, GameState, KillFeed,
 *     ReviveStations, AirdropPoints
 *   - SpatiallyRelevant: Loot, Vehicles, Projectiles, Weapons, AI
 *   - Priority sorting: distance to viewer * class priority weight
 *   - Max actors per frame limits bandwidth spike
 *
 * Performance:
 *   - O(1) cell lookup via hash map
 *   - O(N) relevance check where N = actors in nearby cells (not all actors)
 *   - Distance-based prioritization ensures nearest actors replicate first
 *   - Per-class rate limiting prevents bandwidth waste on low-priority actors
 */
UCLASS(Config=Engine, defaultconfig, Transient)
class UKhaaosReplicationGraph : public UReplicationGraph
{
    GENERATED_BODY()

public:
    UKhaaosReplicationGraph();

    // ─── UReplicationGraph Interface ────────────────────────────────────────

    virtual void InitGlobalActorClassObjects() override;
    virtual void InitConnectionGraph(UNetReplicationGraphConnection* RepGraphConnection) override;
    virtual void AddActor(AActor* Actor) override;
    virtual void RemoveActor(AActor* Actor, bool bKeepTearOff) override;
    virtual void ReplicateActor(AActor* Actor) override;

    // ─── Spatial Grid ───────────────────────────────────────────────────────

    /** Update an actor's spatial cell assignment based on its current location. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|RepGraph")
    void UpdateSpatialCell(AActor* Actor);

    /** Get the spatial cell coordinate for a world location. */
    FKhaaosSpatialCellCoord GetCellCoordForLocation(const FVector& Location) const;

    /** Get all actors in cells surrounding a given cell (Moore neighborhood). */
    void GetActorsInNeighborhood(const FKhaaosSpatialCellCoord& CenterCell, int32 CellRadius, TArray<AActor*>& OutActors) const;

    /** Get the current cell size. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RepGraph")
    float GetCellSize() const { return SpatialCellSize; }

    /** Get the total number of cells with actors. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RepGraph")
    int32 GetActiveCellCount() const { return SpatialCells.Num(); }

    // ─── Prioritization ────────────────────────────────────────────────────

    /** Sort actors by priority for a specific viewer connection.
     *  Priority = DistanceWeight * ClassPriorityWeight.
     *  Nearest, highest-priority actors replicate first. */
    void PrioritizeActors(TArray<AActor*>& Actors, const FVector& ViewerLocation) const;

    /** Check if an actor is relevant to a specific connection. */
    bool IsActorRelevantToConnection(AActor* Actor, const FVector& ViewerLocation) const;

    // ─── Per-World Configuration ────────────────────────────────────────────

    /** Configure spatial grid for a specific world (adjusts cell size). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|RepGraph")
    void ConfigureForWorld(EWorldSequence World);

    /** Get per-class replication info. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RepGraph")
    FKhaaosClassReplicationInfo GetClassReplicationInfo(UClass* InClass) const;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Spatial grid cell size in world units. Adjusted per-world. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Spatial")
    float SpatialCellSize = 4000.0f;

    /** Number of cell rings around the viewer to consider relevant. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Spatial")
    int32 RelevantCellRadius = 2;

    /** Maximum actors to replicate per frame per connection. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Budget")
    int32 MaxActorsPerFrame = 512;

    /** Maximum distance for spatial relevance (world units). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Spatial")
    float MaxRelevancyDistance = 15000.0f;

    /** Player replication frequency (Hz). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Frequency")
    float PlayerReplicationFrequency = 30.0f;

    /** Distance importance weight for prioritization. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Priority")
    float DistancePriorityWeight = 1.0f;

    // ─── Per-Class Replication Rates ────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Rates")
    float PlayerStateRepRate = 30.0f;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Rates")
    float WeaponRepRate = 20.0f;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Rates")
    float LootRepRate = 10.0f;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Rates")
    float KillFeedRepRate = 5.0f;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Rates")
    float VehicleRepRate = 15.0f;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|RepGraph|Rates")
    float ProjectileRepRate = 60.0f;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|RepGraph")
    FOnRepGraphInitialized OnRepGraphInitialized;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|RepGraph")
    FOnActorCellUpdated OnActorCellUpdated;

    // ─── Stats ─────────────────────────────────────────────────────────────

    /** Get total actors currently tracked by the graph. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RepGraph")
    int32 GetTotalTrackedActors() const { return ActorToCellMap.Num(); }

    /** Get per-class replication stats as a formatted string. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RepGraph")
    FString GetReplicationStats() const;

protected:

    // ─── Spatial Grid Data ──────────────────────────────────────────────────

    /** Map from cell coordinate to cell data. */
    UPROPERTY()
    TMap<FKhaaosSpatialCellCoord, FKhaaosSpatialCell> SpatialCells;

    /** Map from actor to its current cell coordinate. */
    UPROPERTY()
    TMap<TWeakObjectPtr<AActor>, FKhaaosSpatialCellCoord> ActorToCellMap;

    /** Global always-relevant actors (GameMode, GameState, system components). */
    UPROPERTY()
    TArray<TWeakObjectPtr<AActor>> GlobalAlwaysRelevantActors;

    /** Per-connection replication data. */
    TMap<UNetConnection*, FKhaaosConnectionRepData> ConnectionData;

    /** Per-class replication info cache. */
    TMap<UClass*, FKhaaosClassReplicationInfo> ClassReplicationInfoMap;

    /** Current world sequence for per-world tuning. */
    UPROPERTY()
    EWorldSequence CurrentWorld = EWorldSequence::CIGKV;

    // ─── Internal Methods ──────────────────────────────────────────────────

    /** Initialize per-class replication info for all known game classes. */
    void InitClassReplicationInfo();

    /** Route an actor to the appropriate list (global/spatial/dynamic). */
    void RouteActor(AActor* Actor);

    /** Remove an actor from its current spatial cell. */
    void RemoveActorFromCell(AActor* Actor);

    /** Determine if an actor class is always relevant. */
    bool IsAlwaysRelevantClass(UClass* InClass) const;

    /** Determine if an actor class is dynamic (moves between cells). */
    bool IsDynamicClass(UClass* InClass) const;

    /** Calculate distance-based priority for an actor relative to a viewer. */
    float CalculateActorPriority(AActor* Actor, const FVector& ViewerLocation) const;

    /** Clean up stale weak pointers in spatial cells. */
    void CleanupStaleActors();

    // ─── Stats Tracking ────────────────────────────────────────────────────

    /** Total actors replicated last frame (across all connections). */
    int32 TotalActorsReplicatedLastFrame = 0;

    /** Total cells updated last frame. */
    int32 CellsUpdatedLastFrame = 0;

    /** Frame counter for periodic cleanup. */
    int32 FrameCounter = 0;
};
