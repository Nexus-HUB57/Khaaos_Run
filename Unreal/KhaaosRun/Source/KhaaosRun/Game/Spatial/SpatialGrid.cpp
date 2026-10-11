// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Spatial/SpatialGrid.h"
#include "KhaaosRun.h"

#include "Math/UnrealMathUtility.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

USpatialGridSubsystem::USpatialGridSubsystem()
{
        CellSize = 15.0f;  // 15% of map (from TS SpatialGrid)
        CachedEntityCount = 0;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void USpatialGridSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        CachedEntityCount = 0;

        UE_LOG(LogKhaaosRun, Log, TEXT("SpatialGridSubsystem: Initialized (CellSize=%.1f)"), CellSize);
}

void USpatialGridSubsystem::Deinitialize()
{
        Clear();

        Super::Deinitialize();

        UE_LOG(LogKhaaosRun, Log, TEXT("SpatialGridSubsystem: Deinitialized"));
}

void USpatialGridSubsystem::Tick(float DeltaTime)
{
        // Periodic maintenance: compact sparse cells, etc.
        // Currently a no-op — all operations are O(1) on demand.
}

TStatId USpatialGridSubsystem::GetStatId() const
{
        RETURN_QUICK_DECLARE_CYCLE_STAT(USpatialGridSubsystem, STATGROUP_Tickables);
}

// ─── Grid Operations ────────────────────────────────────────────────────────────

void USpatialGridSubsystem::InsertEntity(const FString& EntityId, const FVector2D& Position)
{
        // Remove from old cell if already exists
        if (FEntityData* Existing = EntityMap.Find(EntityId))
        {
                TSet<FString>* OldCell = Cells.Find(Existing->CellKey);
                if (OldCell)
                {
                        OldCell->Remove(EntityId);
                        if (OldCell->Num() == 0)
                        {
                                Cells.Remove(Existing->CellKey);
                        }
                }
        }

        // Compute new cell key
        FCellKey NewKey = PositionToCellKey(Position);

        // Insert into cell
        TSet<FString>& CellSet = Cells.FindOrAdd(NewKey);
        CellSet.Add(EntityId);

        // Update entity map
        FEntityData& Data = EntityMap.FindOrAdd(EntityId);
        Data.EntityId = EntityId;
        Data.Position = Position;
        Data.CellKey = NewKey;

        CachedEntityCount = EntityMap.Num();
}

void USpatialGridSubsystem::RemoveEntity(const FString& EntityId)
{
        FEntityData* Data = EntityMap.Find(EntityId);
        if (!Data)
        {
                return;
        }

        // Remove from cell
        TSet<FString>* Cell = Cells.Find(Data->CellKey);
        if (Cell)
        {
                Cell->Remove(EntityId);
                if (Cell->Num() == 0)
                {
                        Cells.Remove(Data->CellKey);
                }
        }

        // Remove from entity map
        EntityMap.Remove(EntityId);
        CachedEntityCount = EntityMap.Num();
}

void USpatialGridSubsystem::UpdateEntity(const FString& EntityId, const FVector2D& NewPosition)
{
        // Equivalent to insert — handles cell migration automatically
        InsertEntity(EntityId, NewPosition);
}

void USpatialGridSubsystem::Clear()
{
        Cells.Empty();
        EntityMap.Empty();
        CachedEntityCount = 0;
}

// ─── Queries ────────────────────────────────────────────────────────────────────

TArray<FString> USpatialGridSubsystem::QueryNeighbors(const FVector2D& Position) const
{
        TArray<FString> Result;

        FCellKey CenterKey = PositionToCellKey(Position);

        // 3x3 cell lookup (same + 8 adjacent)
        for (int32 DX = -1; DX <= 1; ++DX)
        {
                for (int32 DY = -1; DY <= 1; ++DY)
                {
                        FCellKey NeighborKey;
                        NeighborKey.X = CenterKey.X + DX;
                        NeighborKey.Y = CenterKey.Y + DY;

                        const TSet<FString>* Cell = Cells.Find(NeighborKey);
                        if (Cell)
                        {
                                for (const FString& Id : *Cell)
                                {
                                        Result.Add(Id);
                                }
                        }
                }
        }

        return Result;
}

TArray<FString> USpatialGridSubsystem::QueryRadius(const FVector2D& Position, float Radius) const
{
        // Get 3x3 neighbors first
        TArray<FString> Neighbors = QueryNeighbors(Position);

        // Post-filter by euclidean distance
        TArray<FString> Result;
        float RadiusSq = Radius * Radius;

        for (const FString& Id : Neighbors)
        {
                const FEntityData* Data = EntityMap.Find(Id);
                if (Data)
                {
                        float DistSq = FVector2D::DistSquared(Data->Position, Position);
                        if (DistSq <= RadiusSq)
                        {
                                Result.Add(Id);
                        }
                }
        }

        return Result;
}

int32 USpatialGridSubsystem::GetEntityCount() const
{
        return CachedEntityCount;
}

bool USpatialGridSubsystem::HasEntity(const FString& EntityId) const
{
        return EntityMap.Contains(EntityId);
}

bool USpatialGridSubsystem::GetEntityPosition(const FString& EntityId, FVector2D& OutPosition) const
{
        const FEntityData* Data = EntityMap.Find(EntityId);
        if (Data)
        {
                OutPosition = Data->Position;
                return true;
        }
        return false;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

USpatialGridSubsystem::FCellKey USpatialGridSubsystem::PositionToCellKey(const FVector2D& Position) const
{
        FCellKey Key;
        Key.X = FMath::FloorToInt(Position.X / CellSize);
        Key.Y = FMath::FloorToInt(Position.Y / CellSize);
        return Key;
}
