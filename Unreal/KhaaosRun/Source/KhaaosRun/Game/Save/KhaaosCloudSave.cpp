// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Save/KhaaosCloudSave.h"
#include "Save/KhaaosSaveGame.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/Base64.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosCloudSave, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosCloudSave
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosCloudSave::UKhaaosCloudSave()
	: bPreferCloudOnConflict(true)
	, bMergeProgress(false)
	, bIsSyncing(false)
	, bAutoSaveEnabled(true)
	, AutoSaveInterval(120.0f)
{
}

void UKhaaosCloudSave::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Start auto-save timer if enabled
	if (bAutoSaveEnabled)
	{
		UWorld* World = GetWorld();
		if (World && World->GetTimerManager().IsTimerActive(AutoSaveTimerHandle) == false)
		{
			World->GetTimerManager().SetTimer(
				AutoSaveTimerHandle,
				this,
				&UKhaaosCloudSave::OnAutoSaveTimer,
				AutoSaveInterval,
				true
			);
		}
	}

	UE_LOG(LogKhaaosCloudSave, Log, TEXT("KhaaosCloudSave: Initialized. AutoSave=%s Interval=%.0fs"),
		bAutoSaveEnabled ? TEXT("ON") : TEXT("OFF"), AutoSaveInterval);
}

void UKhaaosCloudSave::Deinitialize()
{
	// Clear auto-save timer
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(AutoSaveTimerHandle);
	}

	UE_LOG(LogKhaaosCloudSave, Log, TEXT("KhaaosCloudSave: Deinitialized."));
	Super::Deinitialize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cloud Save Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSave::SaveToCloud(const FString& SlotName, UKhaaosSaveGame* SaveData)
{
	if (!SaveData)
	{
		UE_LOG(LogKhaaosCloudSave, Warning, TEXT("SaveToCloud: Null save data for slot '%s'."), *SlotName);
		OnSaveComplete.Broadcast(SlotName, false, TEXT("Null save data"));
		return;
	}

	if (bIsSyncing)
	{
		UE_LOG(LogKhaaosCloudSave, Warning, TEXT("SaveToCloud: Already syncing. Queue slot '%s'."), *SlotName);
		OnSaveComplete.Broadcast(SlotName, false, TEXT("Already syncing"));
		return;
	}

	bIsSyncing = true;
	CurrentSaveData = SaveData;
	CurrentAutoSaveSlot = SlotName;

	// Serialize save data to JSON
	const FString JsonString = SaveData->ToJson();

	// Convert JSON to byte array for EOS upload
	TArray<uint8> DataBytes;
	DataBytes.SetNumUninitialized(JsonString.Len() * sizeof(TCHAR));
	FMemory::Memcpy(DataBytes.GetData(), JsonString.GetCharArray().GetData(), DataBytes.Num());

	UE_LOG(LogKhaaosCloudSave, Log, TEXT("SaveToCloud: Uploading slot '%s' (%d bytes)."), *SlotName, DataBytes.Num());

	// Upload via EOS CloudStorage
	EOSUploadFile(SlotName, DataBytes);
}

void UKhaaosCloudSave::LoadFromCloud(const FString& SlotName)
{
	if (bIsSyncing)
	{
		UE_LOG(LogKhaaosCloudSave, Warning, TEXT("LoadFromCloud: Already syncing. Cannot load slot '%s'."), *SlotName);
		OnLoadComplete.Broadcast(SlotName, nullptr, false);
		return;
	}

	bIsSyncing = true;

	UE_LOG(LogKhaaosCloudSave, Log, TEXT("LoadFromCloud: Downloading slot '%s'."), *SlotName);

	// Download via EOS CloudStorage
	EOSDownloadFile(SlotName);
}

bool UKhaaosCloudSave::DeleteCloudSave(const FString& SlotName)
{
	UE_LOG(LogKhaaosCloudSave, Log, TEXT("DeleteCloudSave: Deleting slot '%s'."), *SlotName);

	// EOS CloudStorage delete operation
	// EOS_HCloudStorage CloudStorage = EOS_Platform_GetCloudStorageInterface(EOSPlatform);
	// EOS_CloudStorage_DeleteFileOptions DeleteOptions = {};
	// DeleteOptions.ApiVersion = EOS_CLOUDSTORAGE_DELETEFILE_API_LATEST;
	// DeleteOptions.FileName = TCHAR_TO_ANSI(*SlotName);
	// EOS_CloudStorage_DeleteFile(CloudStorage, &DeleteOptions, nullptr, nullptr);

	// Update metadata cache
	for (int32 i = 0; i < CloudMetadataCache.Num(); ++i)
	{
		if (CloudMetadataCache[i].SlotName == SlotName)
		{
			CloudMetadataCache.RemoveAt(i);
			break;
		}
	}

	return true;
}

TArray<FCloudSaveMetadata> UKhaaosCloudSave::GetCloudSaveList() const
{
	return CloudMetadataCache;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-Save
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSave::SetAutoSaveEnabled(bool bEnabled)
{
	bAutoSaveEnabled = bEnabled;

	UWorld* World = GetWorld();
	if (!World) return;

	if (bAutoSaveEnabled)
	{
		if (!World->GetTimerManager().IsTimerActive(AutoSaveTimerHandle))
		{
			World->GetTimerManager().SetTimer(
				AutoSaveTimerHandle,
				this,
				&UKhaaosCloudSave::OnAutoSaveTimer,
				AutoSaveInterval,
				true
			);
		}
	}
	else
	{
		World->GetTimerManager().ClearTimer(AutoSaveTimerHandle);
	}

	UE_LOG(LogKhaaosCloudSave, Log, TEXT("AutoSave: %s"), bAutoSaveEnabled ? TEXT("ENABLED") : TEXT("DISABLED"));
}

void UKhaaosCloudSave::SetAutoSaveInterval(float IntervalSeconds)
{
	AutoSaveInterval = FMath::Max(30.0f, IntervalSeconds); // Minimum 30s

	if (bAutoSaveEnabled)
	{
		SetAutoSaveEnabled(false);
		SetAutoSaveEnabled(true); // Restart timer with new interval
	}

	UE_LOG(LogKhaaosCloudSave, Log, TEXT("AutoSave interval: %.0fs"), AutoSaveInterval);
}

void UKhaaosCloudSave::TriggerAutoSave()
{
	if (!CurrentSaveData || CurrentAutoSaveSlot.IsEmpty())
	{
		UE_LOG(LogKhaaosCloudSave, Verbose, TEXT("AutoSave: No save data to auto-save."));
		return;
	}

	SaveToCloud(CurrentAutoSaveSlot, CurrentSaveData);
}

void UKhaaosCloudSave::OnAutoSaveTimer()
{
	TriggerAutoSave();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EOS Internal Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSave::EOSUploadFile(const FString& SlotName, const TArray<uint8>& Data)
{
	// EOS CloudStorage Upload Implementation
	//
	// EOS_HCloudStorage CloudStorage = EOS_Platform_GetCloudStorageInterface(EOSPlatform);
	//
	// EOS_CloudStorage_FileTransferRequest UploadRequest = {};
	// UploadRequest.ApiVersion = EOS_CLOUDSTORAGE_FILETRANSFERREQUEST_API_LATEST;
	// UploadRequest.FileName = TCHAR_TO_ANSI(*SlotName);
	// UploadRequest.FileLengthData = Data.Num();
	//
	// auto ReadCallback = [](void* InData, uint32_t InDataLengthBytes, void* InClientData) -> int32_t
	// {
	//     FMemory::Memcpy(InData, DataPtr, InDataLengthBytes);
	//     return 0; // Success
	// };
	//
	// EOS_CloudStorage_WriteFile(CloudStorage, &UploadRequest, nullptr,
	//     [](const EOS_CloudStorage_WriteFileCallbackInfo* Info) { ... });

	// For now, simulate immediate completion
	HandleUploadComplete(SlotName, true, TEXT(""));
}

void UKhaaosCloudSave::EOSDownloadFile(const FString& SlotName)
{
	// EOS CloudStorage Download Implementation
	//
	// EOS_HCloudStorage CloudStorage = EOS_Platform_GetCloudStorageInterface(EOSPlatform);
	//
	// EOS_CloudStorage_FileMetadata FileMeta;
	// EOS_CloudStorage_QueryFile(CloudStorage, &QueryOptions, nullptr, Callback);
	// EOS_CloudStorage_ReadFile(CloudStorage, &ReadRequest, nullptr, Callback);

	// For now, simulate empty download completion
	TArray<uint8> EmptyData;
	HandleDownloadComplete(SlotName, EmptyData, false);
}

void UKhaaosCloudSave::EOSQueryFileList()
{
	// EOS_CloudStorage_QueryFileListOptions QueryOptions = {};
	// QueryOptions.ApiVersion = EOS_CLOUDSTORAGE_QUERYFILELIST_API_LATEST;
	// EOS_CloudStorage_QueryFileList(CloudStorage, &QueryOptions, nullptr, Callback);
}

void UKhaaosCloudSave::HandleUploadComplete(const FString& SlotName, bool bSuccess, const FString& Error)
{
	bIsSyncing = false;

	if (bSuccess)
	{
		// Update metadata cache
		bool bFound = false;
		for (FCloudSaveMetadata& Meta : CloudMetadataCache)
		{
			if (Meta.SlotName == SlotName)
			{
				Meta.Timestamp = FDateTime::UtcNow().ToIso8601();
				Meta.bIsDirty = false;
				bFound = true;
				break;
			}
		}

		if (!bFound)
		{
			FCloudSaveMetadata NewMeta;
			NewMeta.SlotName = SlotName;
			NewMeta.Timestamp = FDateTime::UtcNow().ToIso8601();
			NewMeta.bIsDirty = false;
			CloudMetadataCache.Add(NewMeta);
		}

		UE_LOG(LogKhaaosCloudSave, Log, TEXT("SaveToCloud: Slot '%s' uploaded successfully."), *SlotName);
	}
	else
	{
		UE_LOG(LogKhaaosCloudSave, Error, TEXT("SaveToCloud: Slot '%s' upload FAILED: %s"), *SlotName, *Error);
	}

	OnSaveComplete.Broadcast(SlotName, bSuccess, Error);
}

void UKhaaosCloudSave::HandleDownloadComplete(const FString& SlotName, const TArray<uint8>& Data, bool bSuccess)
{
	bIsSyncing = false;

	UKhaaosSaveGame* LoadedSave = nullptr;

	if (bSuccess && Data.Num() > 0)
	{
		// Convert byte array back to JSON string
		FString JsonString;
		JsonString.AppendChars(reinterpret_cast<const TCHAR*>(Data.GetData()), Data.Num() / sizeof(TCHAR));

		// Deserialize into UKhaaosSaveGame
		LoadedSave = NewObject<UKhaaosSaveGame>(this);
		if (!LoadedSave->FromJson(JsonString))
		{
			UE_LOG(LogKhaaosCloudSave, Error, TEXT("LoadFromCloud: Failed to deserialize slot '%s'."), *SlotName);
			LoadedSave = nullptr;
		}
		else
		{
			UE_LOG(LogKhaaosCloudSave, Log, TEXT("LoadFromCloud: Slot '%s' downloaded successfully."), *SlotName);
		}
	}
	else
	{
		UE_LOG(LogKhaaosCloudSave, Warning, TEXT("LoadFromCloud: Slot '%s' download failed or empty."), *SlotName);
	}

	OnLoadComplete.Broadcast(SlotName, LoadedSave, bSuccess && (LoadedSave != nullptr));
}
