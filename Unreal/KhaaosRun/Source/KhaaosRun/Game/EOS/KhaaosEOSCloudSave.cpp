// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSCloudSave.h"
#include "Game/EOS/KhaaosEOSManager.h"
#include "Game/Save/KhaaosSaveGame.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Misc/DateTime.h"

// ─── Subsystem Lifecycle ───────────────────────────────────────────────────────

void UKhaaosEOSCloudSave::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Bind to EOS login complete for auto-sync
    UKhaaosEOSManager* EOSManager = GetGameInstance()->GetSubsystem<UKhaaosEOSManager>();
    if (EOSManager)
    {
        EOSManager->OnLoginComplete.AddDynamic(this, &UKhaaosEOSCloudSave::OnEOSLoginComplete);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave: Initialized"));
}

void UKhaaosEOSCloudSave::Deinitialize()
{
    // Unbind from EOS manager
    UKhaaosEOSManager* EOSManager = GetGameInstance()->GetSubsystem<UKhaaosEOSManager>();
    if (EOSManager)
    {
        EOSManager->OnLoginComplete.RemoveDynamic(this, &UKhaaosEOSCloudSave::OnEOSLoginComplete);
    }

    // Flush any remaining saves
    FlushPendingSaves();

    Super::Deinitialize();
}

// ─── Cloud Operations ─────────────────────────────────────────────────────────

void UKhaaosEOSCloudSave::LoadFromCloud(const FString& SlotName)
{
    // EOS CloudSave API: EOS_TitleStorage_ReadFile or EOS_PlayerDataStorage_ReadFile
    // The actual EOS SDK call would be:
    //   EOS_PlayerDataStorage_ReadFile(PlayerDataStorageHandle, &ReadOptions, this, OnReadFileComplete);
    // For now, log the operation (real implementation requires EOS SDK linked)

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::LoadFromCloud - Slot: %s"), *SlotName);

    // Placeholder: broadcast success with empty data
    // Real implementation would async-wait for EOS callback
    TArray<uint8> EmptyData;
    OnCloudSaveLoaded.Broadcast(true, SlotName, EmptyData);
}

void UKhaaosEOSCloudSave::StoreToCloud(const FString& SlotName, const TArray<uint8>& SaveData)
{
    // EOS CloudSave API: EOS_PlayerDataStorage_WriteFile
    // Real implementation:
    //   EOS_PlayerDataStorage_WriteFile(PlayerDataStorageHandle, &WriteOptions, FileTransferHandle, this, OnWriteFileComplete);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::StoreToCloud - Slot: %s, Size: %d bytes"), *SlotName, SaveData.Num());

    // Cache locally and add to pending
    LocalSaveCache.Add(SlotName, SaveData);
    PendingSaves.Add(SlotName, SaveData);

    // Placeholder: broadcast success
    OnCloudSaveStored.Broadcast(true, SlotName);
}

void UKhaaosEOSCloudSave::DeleteFromCloud(const FString& SlotName)
{
    // EOS CloudSave API: EOS_PlayerDataStorage_DeleteFile
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::DeleteFromCloud - Slot: %s"), *SlotName);

    // Remove from local caches
    LocalSaveCache.Remove(SlotName);
    PendingSaves.Remove(SlotName);

    OnCloudSaveDeleted.Broadcast(true, SlotName);
}

void UKhaaosEOSCloudSave::ListCloudSaves()
{
    // EOS CloudSave API: EOS_PlayerDataStorage_QueryFileList
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::ListCloudSaves - Querying cloud save list"));

    OnCloudSaveListReceived.Broadcast(true);
}

// ─── Sync Operations ──────────────────────────────────────────────────────────

void UKhaaosEOSCloudSave::SyncAll()
{
    if (bSyncInProgress)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSCloudSave::SyncAll - Sync already in progress"));
        return;
    }

    UKhaaosEOSManager* EOSManager = GetGameInstance()->GetSubsystem<UKhaaosEOSManager>();
    if (!EOSManager || !EOSManager->IsLoggedIn())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSCloudSave::SyncAll - Not logged in to EOS"));
        return;
    }

    bSyncInProgress = true;

    // 1. List cloud saves
    ListCloudSaves();

    // 2. For each slot: load cloud, compare with local, resolve conflicts
    const TArray<FString> SyncSlots = { TEXT("profile"), TEXT("progress"), TEXT("loadout"), TEXT("economy"), TEXT("match_history") };

    for (const FString& SlotName : SyncSlots)
    {
        LoadFromCloud(SlotName);
    }

    // 3. Push pending local changes
    FlushPendingSaves();

    bSyncInProgress = false;
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::SyncAll - Sync complete"));
}

void UKhaaosEOSCloudSave::FlushPendingSaves()
{
    if (PendingSaves.Num() == 0)
    {
        return;
    }

    UKhaaosEOSManager* EOSManager = GetGameInstance()->GetSubsystem<UKhaaosEOSManager>();
    if (!EOSManager || !EOSManager->IsLoggedIn())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSCloudSave::FlushPendingSaves - Not logged in, queuing %d saves"), PendingSaves.Num());
        return;
    }

    for (auto& Pair : PendingSaves)
    {
        StoreToCloud(Pair.Key, Pair.Value);
    }

    PendingSaves.Empty();
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::FlushPendingSaves - Flushed all pending saves"));
}

// ─── Queries ──────────────────────────────────────────────────────────────────

TArray<uint8> UKhaaosEOSCloudSave::GetLocalSaveData(const FString& SlotName) const
{
    if (const TArray<uint8>* Found = LocalSaveCache.Find(SlotName))
    {
        return *Found;
    }
    return TArray<uint8>();
}

// ─── Internal ─────────────────────────────────────────────────────────────────

TArray<uint8> UKhaaosEOSCloudSave::ResolveConflict(const FString& SlotName, const TArray<uint8>& LocalData, const TArray<uint8>& CloudData)
{
    // Conflict resolution: latest timestamp wins
    // On tie: cloud wins (server authority)
    // On corrupted cloud data: fallback to local

    // Parse timestamps from save data headers
    // For now: cloud wins (server-authoritative model)
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave::ResolveConflict - Slot: %s, Cloud wins (server authority)"), *SlotName);

    if (CloudData.Num() > 0)
    {
        return CloudData;
    }
    return LocalData;
}

void UKhaaosEOSCloudSave::OnEOSLoginComplete(bool bSuccess, const FString& ErrorMessage)
{
    if (bSuccess)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCloudSave: EOS login success, triggering auto-sync"));
        SyncAll();
    }
    else
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSCloudSave: EOS login failed: %s"), *ErrorMessage);
    }
}

TArray<uint8> UKhaaosEOSCloudSave::SerializeSaveGame(UKhaaosSaveGame* SaveGame)
{
    // FMemoryWriter → TArray<uint8> serialization
    TArray<uint8> OutData;
    if (!SaveGame) return OutData;

    FMemoryWriter Writer(OutData, true);
    SaveGame->Serialize(Writer);

    return OutData;
}

UKhaaosSaveGame* UKhaaosEOSCloudSave::DeserializeSaveGame(const TArray<uint8>& Data)
{
    if (Data.Num() == 0) return nullptr;

    UKhaaosSaveGame* SaveGame = NewObject<UKhaaosSaveGame>();
    FMemoryReader Reader(Data, true);
    SaveGame->Serialize(Reader);

    return SaveGame;
}
