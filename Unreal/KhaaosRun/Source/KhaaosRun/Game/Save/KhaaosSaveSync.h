// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Save/KhaaosSaveGame.h"
#include "Game/Save/KhaaosSaveSync.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when save sync completes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSyncComplete, bool, bSuccess, const FString&, ErrorMessage);

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * ESaveMergeStrategy
 *
 * Strategy for resolving conflicts between local and cloud saves.
 */
UENUM(BlueprintType)
enum class ESaveMergeStrategy : uint8
{
	/** Always keep local data on conflict. */
	PreferLocal  UMETA(DisplayName = "Prefer Local"),

	/** Always keep cloud data on conflict. */
	PreferCloud  UMETA(DisplayName = "Prefer Cloud"),

	/** Keep the field that was modified more recently. */
	MergeNewer   UMETA(DisplayName = "Merge Newer"),

	/** Merge both — combine unique data from both sides. */
	MergeBoth    UMETA(DisplayName = "Merge Both")
};

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FSaveDiff
 *
 * Difference between local and cloud save data.
 * Used for conflict resolution and merge operations.
 */
USTRUCT(BlueprintType)
struct FSaveDiff
{
	GENERATED_BODY()

	/** Fields present in local but not in cloud. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	TArray<FString> AddedFields;

	/** Fields present in cloud but not in local. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	TArray<FString> RemovedFields;

	/** Fields that differ between local and cloud. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	TArray<FString> ChangedFields;
};

/**
 * UKhaaosSaveSync
 *
 * Cross-platform progression sync subsystem.
 * Compares local vs cloud save data, resolves conflicts, and merges
 * to ensure consistent progression across devices.
 *
 * Features:
 *   - SyncProgress: Compare local vs cloud, resolve conflicts, merge
 *   - ComputeDiff: Calculate differences between two save objects
 *   - MergeSaves: Combine two saves using a specified strategy
 *   - Auto-sync on EOS login (configurable)
 *
 * Workflow:
 *   1. On EOS login, fetch cloud save metadata
 *   2. Compare local save timestamps with cloud
 *   3. If conflict: ComputeDiff → MergeSaves with configured strategy
 *   4. Upload merged result to cloud
 *   5. Apply merged result locally
 */
UCLASS(Config = Game, defaultconfig)
class UKhaaosSaveSync : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosSaveSync();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Sync Operations ──────────────────────────────────────────────────────

	/**
	 * Sync progression between local and cloud saves.
	 * Compares timestamps, resolves conflicts, merges if needed.
	 * Fires OnSyncComplete when done.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|SaveSync")
	void SyncProgress();

	/**
	 * Compute differences between two save game objects.
	 * Returns FSaveDiff with added/removed/changed fields.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SaveSync")
	FSaveDiff ComputeDiff(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud) const;

	/**
	 * Merge two save game objects using the specified strategy.
	 * Returns the merged result.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|SaveSync")
	UKhaaosSaveGame* MergeSaves(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud, ESaveMergeStrategy Strategy);

	// ─── Configuration ────────────────────────────────────────────────────────

	/** If true, automatically sync when EOS login completes. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	uint8 bAutoSyncOnLogin : 1;

	/** Default merge strategy for conflict resolution. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	ESaveMergeStrategy DefaultMergeStrategy;

	// ─── State ────────────────────────────────────────────────────────────────

	/** Timestamp of the last successful sync. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	FDateTime LastSyncTime;

	/** Whether a sync is currently in progress. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSync")
	uint8 bIsSyncing : 1;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when sync completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|SaveSync")
	FOnSyncComplete OnSyncComplete;

private:

	/** Local save data for sync operations. */
	UPROPERTY()
	TObjectPtr<UKhaaosSaveGame> LocalSaveData;

	/** Cloud save data for sync operations. */
	UPROPERTY()
	TObjectPtr<UKhaaosSaveGame> CloudSaveData;

	/** Name of the sync slot. */
	FString SyncSlotName;

	/** Handle sync completion from cloud save subsystem. */
	UFUNCTION()
	void OnCloudLoadComplete(const FString& SlotName, UKhaaosSaveGame* LoadedData, bool bSuccess);

	/** Handle upload completion after merge. */
	UFUNCTION()
	void OnCloudSaveComplete(const FString& SlotName, bool bSuccess, const FString& ErrorMessage);

	/** Internal: Perform merge based on strategy. */
	UKhaaosSaveGame* PerformMerge(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud, ESaveMergeStrategy Strategy);

	/** Internal: Check if a save field has changed between two saves. */
	bool HasFieldChanged(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud, const FString& FieldName) const;
};
