// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Save/KhaaosSaveGame.h"
#include "Game/Save/KhaaosCloudSave.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosEOSManager;

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a cloud save operation completes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnSaveComplete, const FString&, SlotName, bool, bSuccess, const FString&, ErrorMessage);

/** Broadcast when a cloud load operation completes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnLoadComplete, const FString&, SlotName, UKhaaosSaveGame*, LoadedData, bool, bSuccess);

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FCloudSaveMetadata
 *
 * Metadata for a cloud save slot, used for listing and conflict resolution.
 */
USTRUCT(BlueprintType)
struct FCloudSaveMetadata
{
	GENERATED_BODY()

	/** Slot name identifier. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FString SlotName;

	/** Timestamp of last modification (ISO 8601). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FString Timestamp;

	/** Size of the save data in bytes. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int64 SizeBytes = 0;

	/** Whether the local copy has unsaved changes. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	uint8 bIsDirty : 1;
};

/**
 * UKhaaosCloudSave
 *
 * EOS Cloud Storage integration for cross-platform save game persistence.
 * Uploads/downloads save data via EOS CloudStorage API.
 *
 * Features:
 *   - SaveToCloud: Upload save data to EOS cloud storage
 *   - LoadFromCloud: Download save data from EOS cloud storage
 *   - DeleteCloudSave: Remove a cloud save slot
 *   - GetCloudSaveList: List all available save slots in the cloud
 *   - Auto-save timer (configurable interval, default 120s)
 *   - Conflict resolution: prefer cloud or merge on conflict
 *
 * EOS SDK Patterns:
 *   - EOS_HCloudStorage handle from EOS_Platform
 *   - EOS_CloudStorage_FileTransferRequest for upload/download
 *   - EOS_CloudStorage_QueryFileList to enumerate slots
 */
UCLASS(Config = Game, defaultconfig)
class UKhaaosCloudSave : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosCloudSave();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Cloud Save Operations ────────────────────────────────────────────────

	/**
	 * Save game data to EOS Cloud Storage.
	 * Serializes UKhaaosSaveGame to JSON and uploads.
	 * Fires OnSaveComplete when done.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave")
	void SaveToCloud(const FString& SlotName, UKhaaosSaveGame* SaveData);

	/**
	 * Load game data from EOS Cloud Storage.
	 * Downloads JSON and deserializes into UKhaaosSaveGame.
	 * Fires OnLoadComplete when done.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave")
	void LoadFromCloud(const FString& SlotName);

	/**
	 * Delete a cloud save slot.
	 * Returns true if the delete request was initiated.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave")
	bool DeleteCloudSave(const FString& SlotName);

	/**
	 * Get list of all available cloud save slots.
	 * Returns metadata for each slot.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CloudSave")
	TArray<FCloudSaveMetadata> GetCloudSaveList() const;

	// ─── Auto-Save ────────────────────────────────────────────────────────────

	/** Enable or disable auto-save. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave")
	void SetAutoSaveEnabled(bool bEnabled);

	/** Set auto-save interval in seconds. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave")
	void SetAutoSaveInterval(float IntervalSeconds);

	/** Manually trigger an auto-save (if dirty). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave")
	void TriggerAutoSave();

	// ─── Conflict Resolution ──────────────────────────────────────────────────

	/** If true, prefer cloud data when local/cloud conflict. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	uint8 bPreferCloudOnConflict : 1;

	/** If true, attempt to merge progress instead of overwriting. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	uint8 bMergeProgress : 1;

	// ─── State ────────────────────────────────────────────────────────────────

	/** Whether a cloud operation is currently in progress. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	uint8 bIsSyncing : 1;

	/** Whether auto-save is enabled. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	uint8 bAutoSaveEnabled : 1;

	/** Auto-save interval in seconds (default 120). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	float AutoSaveInterval;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when cloud save completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|CloudSave")
	FOnSaveComplete OnSaveComplete;

	/** Broadcast when cloud load completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|CloudSave")
	FOnLoadComplete OnLoadComplete;

private:

	/** Cloud save metadata cache. */
	UPROPERTY()
	TArray<FCloudSaveMetadata> CloudMetadataCache;

	/** Handle for the auto-save timer. */
	FTimerHandle AutoSaveTimerHandle;

	/** Currently loaded save data (for auto-save). */
	UPROPERTY()
	TObjectPtr<UKhaaosSaveGame> CurrentSaveData;

	/** Name of the current auto-save slot. */
	FString CurrentAutoSaveSlot;

	/** Internal: Perform EOS CloudStorage upload. */
	void EOSUploadFile(const FString& SlotName, const TArray<uint8>& Data);

	/** Internal: Perform EOS CloudStorage download. */
	void EOSDownloadFile(const FString& SlotName);

	/** Internal: Query EOS CloudStorage file list. */
	void EOSQueryFileList();

	/** Auto-save timer callback. */
	void OnAutoSaveTimer();

	/** Handle upload completion from EOS callback. */
	void HandleUploadComplete(const FString& SlotName, bool bSuccess, const FString& Error);

	/** Handle download completion from EOS callback. */
	void HandleDownloadComplete(const FString& SlotName, const TArray<uint8>& Data, bool bSuccess);
};
