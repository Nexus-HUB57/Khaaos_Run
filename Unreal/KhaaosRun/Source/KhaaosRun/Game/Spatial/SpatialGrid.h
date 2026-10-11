// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "SpatialGrid.generated.h"

// ─── Spatial Entity Interface ─────────────────────────────────────────────────

/**
 * ISpatialEntity
 *
 * Minimal interface for entities in the spatial grid.
 * Ported from TS SpatialGrid.ts SpatialEntity interface.
 *
 * Position is in normalized map space (0-100).
 */
UINTERFACE(BlueprintType)
class UKhaaosSpatialEntity : public UInterface
{
	GENERATED_BODY()
};

class IKhaaosSpatialEntity
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Khaaos|Spatial")
	FString GetEntityId() const;

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Khaaos|Spatial")
	FVector2D GetEntityPosition() const;

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Khaaos|Spatial")
	void SetEntityPosition(const FVector2D& NewPos);
};

/**
 * USpatialGridSubsystem
 *
 * O(1) spatial hash grid for interest management and range queries.
 * Direct port of server/game/SpatialGrid.ts.
 *
 * Design:
 *   - Uniform grid over normalized 0-100 map space
 *   - Cell size ~15% of map (good for BR interest + PvP range)
 *   - O(1) insert/remove/update via hash map
 *   - queryNeighbors: 3x3 cell lookup (same + 8 adjacent)
 *   - queryRadius: post-filter neighbors by euclidean distance
 *
 * Used by:
 *   - Interest management (only send nearby players/loot to each client)
 *   - PvP range checks
 *   - Loot proximity validation
 */
UCLASS(Abstract)
class USpatialGridSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	USpatialGridSubsystem();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	// ─── Grid Operations ────────────────────────────────────────────────────

	/** Insert or update an entity in the grid. O(1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Spatial")
	void InsertEntity(const FString& EntityId, const FVector2D& Position);

	/** Remove an entity from the grid. O(1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Spatial")
	void RemoveEntity(const FString& EntityId);

	/** Update entity position (equivalent to insert — removes from old cell first). O(1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Spatial")
	void UpdateEntity(const FString& EntityId, const FVector2D& NewPosition);

	/** Clear all entities from the grid. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Spatial")
	void Clear();

	// ─── Queries ────────────────────────────────────────────────────────────

	/**
	 * Get entity IDs in the same cell and the 8 neighbors (3x3 block).
	 * Ported from TS queryNeighbors(). O(1) amortized.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Spatial")
	TArray<FString> QueryNeighbors(const FVector2D& Position) const;

	/**
	 * Get entity IDs within euclidean radius.
	 * Post-filters queryNeighbors() result. O(k) where k = neighbor count.
	 * Ported from TS queryRadius().
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Spatial")
	TArray<FString> QueryRadius(const FVector2D& Position, float Radius) const;

	/** Get the total number of entities in the grid. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Spatial")
	int32 GetEntityCount() const;

	/** Check if an entity exists in the grid. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Spatial")
	bool HasEntity(const FString& EntityId) const;

	/** Get position of an entity (returns false if not found). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Spatial")
	bool GetEntityPosition(const FString& EntityId, FVector2D& OutPosition) const;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Cell size in map percentage (default 15, from TS SpatialGrid). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Spatial")
	float CellSize;

private:

	/** Compute cell key from position. */
	FCellKey PositionToCellKey(const FVector2D& Position) const;

	/** Cell key struct for TMap hashing. */
	struct FCellKey
	{
		int32 X;
		int32 Y;

		bool operator==(const FCellKey& Other) const
		{
			return X == Other.X && Y == Other.Y;
		}

		friend uint32 GetTypeHash(const FCellKey& Key)
		{
			return HashCombine(GetTypeHash(Key.X), GetTypeHash(Key.Y));
		}
	};

	/** Entity data cached in the grid. */
	struct FEntityData
	{
		FString EntityId;
		FVector2D Position;
		FCellKey CellKey;
	};

	/** Map from cell key to set of entity IDs in that cell. */
	TMap<FCellKey, TSet<FString>> Cells;

	/** Map from entity ID to its data (for O(1) removal). */
	TMap<FString, FEntityData> EntityMap;

	/** Total entity count (cached for fast access). */
	int32 CachedEntityCount;
};
