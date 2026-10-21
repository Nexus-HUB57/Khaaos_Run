// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/EOS/KhaaosEOSManager.h"
#include "Game/Save/KhaaosSaveGame.h"
#include "KhaaosEOSCloudSave.generated.h"

// ─── Cloud Save Slot Data ─────────────────────────────────────────────────────

/** Represents a single cloud save slot synced via EOS CloudSave. */
USTRUCT(BlueprintType)
struct FEOSCloudSaveSlot
{
    GENERATED_BODY()

    /** Slot name identifier. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|CloudSave")
    FString SlotName;

    /** Timestamp of last modification (ISO 8601). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|CloudSave")
    FString LastModifiedTimestamp;

    /** Size of save data in bytes. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|CloudSave")
    int32 DataSizeBytes = 0;

    /** ETag for optimistic concurrency. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|CloudSave")
    FString ETag;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnCloudSaveLoaded, bool, bSuccess, const FString&, SlotName, const TArray<uint8>&, SaveData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnCloudSaveStored, bool, bSuccess, const FString&, SlotName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnCloudSaveDeleted, bool, bSuccess, const FString&, SlotName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCloudSaveListReceived, bool, bSuccess);

/**
 * UKhaaosEOSCloudSave
 *
 * GameInstanceSubsystem bridging UE5 save system to EOS CloudSave.
 * Provides async read/write/delete operations with conflict resolution
 * and automatic sync on login.
 *
 * Integration Flow:
 *   1. EOS Auth → Login (KhaaosEOSManager)
 *   2. OnLoginComplete → Auto-sync local ↔ cloud saves
 *   3. OnMatchEnd → Upload match results + player progress
 *   4. OnAppSuspend → Flush pending saves to cloud
 *
 * Conflict Resolution:
 *   - Compare timestamps: latest wins
 *   - On tie: cloud wins (server authority)
 *   - Corrupted cloud data: fallback to local
 *
 * Save Slots:
 *   - "profile"     → Player profile + settings
 *   - "progress"    → Rank, stats, unlocks
 *   - "loadout"     → Current weapon/species loadout
 *   - "economy"     → KRC balance + transaction cache
 *   - "match_history" → Recent match results (last 50)
 */
UCLASS(BlueprintType)
class UKhaaosEOSCloudSave : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:

    // ─── Subsystem Lifecycle ───────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Cloud Operations ──────────────────────────────────────────────────────

    /** Load save data from EOS Cloud. Results via OnCloudSaveLoaded. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|CloudSave")
    void LoadFromCloud(const FString& SlotName);

    /** Store save data to EOS Cloud. Results via OnCloudSaveStored. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|CloudSave")
    void StoreToCloud(const FString& SlotName, const TArray<uint8>& SaveData);

    /** Delete save data from EOS Cloud. Results via OnCloudSaveDeleted. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|CloudSave")
    void DeleteFromCloud(const FString& SlotName);

    /** List all cloud save slots. Results via OnCloudSaveListReceived. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|CloudSave")
    void ListCloudSaves();

    // ─── Sync Operations ───────────────────────────────────────────────────────

    /** Auto-sync: pull cloud saves, resolve conflicts, push local changes. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|CloudSave")
    void SyncAll();

    /** Flush any pending saves to cloud (call on app suspend). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|CloudSave")
    void FlushPendingSaves();

    /** Check if sync is currently in progress. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|CloudSave")
    bool IsSyncing() const { return bSyncInProgress; }

    // ─── Queries ───────────────────────────────────────────────────────────────

    /** Get cached cloud save slot info. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|CloudSave")
    TArray<FEOSCloudSaveSlot> GetCachedSlots() const { return CachedSlots; }

    /** Get the local save data for a slot (empty if not cached). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|CloudSave")
    TArray<uint8> GetLocalSaveData(const FString& SlotName) const;

    // ─── Delegates ────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|CloudSave")
    FOnCloudSaveLoaded OnCloudSaveLoaded;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|CloudSave")
    FOnCloudSaveStored OnCloudSaveStored;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|CloudSave")
    FOnCloudSaveDeleted OnCloudSaveDeleted;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|CloudSave")
    FOnCloudSaveListReceived OnCloudSaveListReceived;

private:

    /** Whether sync is in progress. */
    bool bSyncInProgress = false;

    /** Cached cloud save slots. */
    TArray<FEOSCloudSaveSlot> CachedSlots;

    /** Pending saves to flush (SlotName → Data). */
    TMap<FString, TArray<uint8>> PendingSaves;

    /** Local save cache (SlotName → Data). */
    TMap<FString, TArray<uint8>> LocalSaveCache;

    /** Resolve conflict between local and cloud saves. */
    TArray<uint8> ResolveConflict(const FString& SlotName, const TArray<uint8>& LocalData, const TArray<uint8>& CloudData);

    /** Internal handler for EOS login complete — triggers auto-sync. */
    void OnEOSLoginComplete(bool bSuccess, const FString& ErrorMessage);

    /** Convert UKhaaosSaveGame to byte array. */
    TArray<uint8> SerializeSaveGame(UKhaaosSaveGame* SaveGame);

    /** Convert byte array back to UKhaaosSaveGame. */
    UKhaaosSaveGame* DeserializeSaveGame(const TArray<uint8>& Data);
};
