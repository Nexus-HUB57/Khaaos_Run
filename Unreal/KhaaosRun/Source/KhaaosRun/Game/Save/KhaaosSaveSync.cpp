// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Save/KhaaosSaveSync.h"
#include "Game/Save/KhaaosCloudSave.h"
#include "Save/KhaaosSaveGame.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosSaveSync, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosSaveSync
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosSaveSync::UKhaaosSaveSync()
	: bAutoSyncOnLogin(true)
	, DefaultMergeStrategy(ESaveMergeStrategy::MergeNewer)
	, LastSyncTime(FDateTime::MinValue())
	, bIsSyncing(false)
{
}

void UKhaaosSaveSync::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogKhaaosSaveSync, Log, TEXT("KhaaosSaveSync: Initialized. AutoSyncOnLogin=%s"),
		bAutoSyncOnLogin ? TEXT("ON") : TEXT("OFF"));
}

void UKhaaosSaveSync::Deinitialize()
{
	UE_LOG(LogKhaaosSaveSync, Log, TEXT("KhaaosSaveSync: Deinitialized."));
	Super::Deinitialize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sync Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosSaveSync::SyncProgress()
{
	if (bIsSyncing)
	{
		UE_LOG(LogKhaaosSaveSync, Warning, TEXT("SyncProgress: Already syncing."));
		OnSyncComplete.Broadcast(false, TEXT("Already syncing"));
		return;
	}

	bIsSyncing = true;
	SyncSlotName = TEXT("DefaultSave");

	UE_LOG(LogKhaaosSaveSync, Log, TEXT("SyncProgress: Starting sync for slot '%s'."), *SyncSlotName);

	// Load local save
	LocalSaveData = UKhaaosSaveGame::LoadFromSlot(SyncSlotName, 0);

	// Request cloud save load
	UKhaaosCloudSave* CloudSave = GetGameInstance()->GetSubsystem<UKhaaosCloudSave>();
	if (CloudSave)
	{
		CloudSave->OnLoadComplete.AddDynamic(this, &UKhaaosSaveSync::OnCloudLoadComplete);
		CloudSave->LoadFromCloud(SyncSlotName);
	}
	else
	{
		// No cloud save available — just use local
		UE_LOG(LogKhaaosSaveSync, Log, TEXT("SyncProgress: No cloud save subsystem. Using local only."));
		bIsSyncing = false;
		LastSyncTime = FDateTime::UtcNow();
		OnSyncComplete.Broadcast(true, TEXT(""));
	}
}

FSaveDiff UKhaaosSaveSync::ComputeDiff(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud) const
{
	FSaveDiff Diff;

	if (!Local || !Cloud)
	{
		return Diff;
	}

	// Compare player stats
	if (Local->PlayerStats.XP != Cloud->PlayerStats.XP)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.XP"));
	}
	if (Local->PlayerStats.Rating != Cloud->PlayerStats.Rating)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.Rating"));
	}
	if (Local->PlayerStats.MatchesPlayed != Cloud->PlayerStats.MatchesPlayed)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.MatchesPlayed"));
	}
	if (Local->PlayerStats.Wins != Cloud->PlayerStats.Wins)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.Wins"));
	}
	if (Local->PlayerStats.TotalKills != Cloud->PlayerStats.TotalKills)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.TotalKills"));
	}
	if (Local->PlayerStats.TotalDeaths != Cloud->PlayerStats.TotalDeaths)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.TotalDeaths"));
	}
	if (Local->PlayerStats.WeaponsBalance != Cloud->PlayerStats.WeaponsBalance)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.WeaponsBalance"));
	}
	if (Local->PlayerStats.Patente != Cloud->PlayerStats.Patente)
	{
		Diff.ChangedFields.Add(TEXT("PlayerStats.Patente"));
	}

	// Compare unlocked items
	TSet<FString> LocalItems, CloudItems;
	for (const FUnlockedItem& Item : Local->UnlockedItems)
	{
		LocalItems.Add(Item.ItemId);
	}
	for (const FUnlockedItem& Item : Cloud->UnlockedItems)
	{
		CloudItems.Add(Item.ItemId);
	}

	for (const FString& ItemId : LocalItems.Difference(CloudItems))
	{
		Diff.AddedFields.Add(ItemId);
	}
	for (const FString& ItemId : CloudItems.Difference(LocalItems))
	{
		Diff.RemovedFields.Add(ItemId);
	}

	// Compare settings
	if (Local->SettingsJson != Cloud->SettingsJson)
	{
		Diff.ChangedFields.Add(TEXT("SettingsJson"));
	}
	if (Local->PreferredQueueMode != Cloud->PreferredQueueMode)
	{
		Diff.ChangedFields.Add(TEXT("PreferredQueueMode"));
	}
	if (Local->PreferredRegion != Cloud->PreferredRegion)
	{
		Diff.ChangedFields.Add(TEXT("PreferredRegion"));
	}

	return Diff;
}

UKhaaosSaveGame* UKhaaosSaveSync::MergeSaves(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud, ESaveMergeStrategy Strategy)
{
	return PerformMerge(Local, Cloud, Strategy);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosSaveSync::OnCloudLoadComplete(const FString& SlotName, UKhaaosSaveGame* LoadedData, bool bSuccess)
{
	UKhaaosCloudSave* CloudSave = GetGameInstance()->GetSubsystem<UKhaaosCloudSave>();
	if (CloudSave)
	{
		CloudSave->OnLoadComplete.RemoveDynamic(this, &UKhaaosSaveSync::OnCloudLoadComplete);
	}

	if (!bSuccess || !LoadedData)
	{
		UE_LOG(LogKhaaosSaveSync, Warning, TEXT("SyncProgress: Cloud load failed. Using local data."));
		bIsSyncing = false;
		LastSyncTime = FDateTime::UtcNow();
		OnSyncComplete.Broadcast(true, TEXT("Cloud unavailable, using local"));
		return;
	}

	CloudSaveData = LoadedData;

	// Check for conflicts
	const FSaveDiff Diff = ComputeDiff(LocalSaveData, CloudSaveData);

	if (Diff.ChangedFields.Num() == 0 && Diff.AddedFields.Num() == 0 && Diff.RemovedFields.Num() == 0)
	{
		UE_LOG(LogKhaaosSaveSync, Log, TEXT("SyncProgress: No conflicts. Data is in sync."));
		bIsSyncing = false;
		LastSyncTime = FDateTime::UtcNow();
		OnSyncComplete.Broadcast(true, TEXT(""));
		return;
	}

	UE_LOG(LogKhaaosSaveSync, Log, TEXT("SyncProgress: %d changed, %d added, %d removed fields. Merging with strategy %d."),
		Diff.ChangedFields.Num(), Diff.AddedFields.Num(), Diff.RemovedFields.Num(),
		static_cast<int32>(DefaultMergeStrategy));

	// Merge and upload
	UKhaaosSaveGame* Merged = PerformMerge(LocalSaveData, CloudSaveData, DefaultMergeStrategy);
	if (Merged)
	{
		if (CloudSave)
		{
			CloudSave->OnSaveComplete.AddDynamic(this, &UKhaaosSaveSync::OnCloudSaveComplete);
			CloudSave->SaveToCloud(SyncSlotName, Merged);
		}
		else
		{
			bIsSyncing = false;
			LastSyncTime = FDateTime::UtcNow();
			OnSyncComplete.Broadcast(true, TEXT(""));
		}
	}
	else
	{
		bIsSyncing = false;
		OnSyncComplete.Broadcast(false, TEXT("Merge failed"));
	}
}

void UKhaaosSaveSync::OnCloudSaveComplete(const FString& SlotName, bool bSuccess, const FString& ErrorMessage)
{
	UKhaaosCloudSave* CloudSave = GetGameInstance()->GetSubsystem<UKhaaosCloudSave>();
	if (CloudSave)
	{
		CloudSave->OnSaveComplete.RemoveDynamic(this, &UKhaaosSaveSync::OnCloudSaveComplete);
	}

	bIsSyncing = false;

	if (bSuccess)
	{
		LastSyncTime = FDateTime::UtcNow();
		UE_LOG(LogKhaaosSaveSync, Log, TEXT("SyncProgress: Merged save uploaded successfully."));
	}
	else
	{
		UE_LOG(LogKhaaosSaveSync, Error, TEXT("SyncProgress: Failed to upload merged save: %s"), *ErrorMessage);
	}

	OnSyncComplete.Broadcast(bSuccess, ErrorMessage);
}

UKhaaosSaveGame* UKhaaosSaveSync::PerformMerge(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud, ESaveMergeStrategy Strategy)
{
	if (!Local && !Cloud) return nullptr;
	if (!Local) return Cloud;
	if (!Cloud) return Local;

	switch (Strategy)
	{
	case ESaveMergeStrategy::PreferLocal:
		{
			UKhaaosSaveGame* Result = NewObject<UKhaaosSaveGame>(this);
			Result->PlayerStats = Local->PlayerStats;
			Result->UnlockedItems = Local->UnlockedItems;
			Result->EquippedItems = Local->EquippedItems;
			Result->SettingsJson = Local->SettingsJson;
			Result->PreferredQueueMode = Local->PreferredQueueMode;
			Result->PreferredRegion = Local->PreferredRegion;
			return Result;
		}

	case ESaveMergeStrategy::PreferCloud:
		{
			UKhaaosSaveGame* Result = NewObject<UKhaaosSaveGame>(this);
			Result->PlayerStats = Cloud->PlayerStats;
			Result->UnlockedItems = Cloud->UnlockedItems;
			Result->EquippedItems = Cloud->EquippedItems;
			Result->SettingsJson = Cloud->SettingsJson;
			Result->PreferredQueueMode = Cloud->PreferredQueueMode;
			Result->PreferredRegion = Cloud->PreferredRegion;
			return Result;
		}

	case ESaveMergeStrategy::MergeNewer:
		{
			// Compare timestamps and keep newer data
			const FDateTime LocalTime = FDateTime::ParseIso8601(*Local->LastSaveTimestamp);
			const FDateTime CloudTime = FDateTime::ParseIso8601(*Cloud->LastSaveTimestamp);

			UKhaaosSaveGame* Result = NewObject<UKhaaosSaveGame>(this);
			if (LocalTime > CloudTime)
			{
				Result->PlayerStats = Local->PlayerStats;
				Result->UnlockedItems = Local->UnlockedItems;
				Result->EquippedItems = Local->EquippedItems;
			}
			else
			{
				Result->PlayerStats = Cloud->PlayerStats;
				Result->UnlockedItems = Cloud->UnlockedItems;
				Result->EquippedItems = Cloud->EquippedItems;
			}

			// Always take latest settings
			Result->SettingsJson = (LocalTime > CloudTime) ? Local->SettingsJson : Cloud->SettingsJson;
			Result->PreferredQueueMode = (LocalTime > CloudTime) ? Local->PreferredQueueMode : Cloud->PreferredQueueMode;
			Result->PreferredRegion = (LocalTime > CloudTime) ? Local->PreferredRegion : Cloud->PreferredRegion;
			return Result;
		}

	case ESaveMergeStrategy::MergeBoth:
		{
			UKhaaosSaveGame* Result = NewObject<UKhaaosSaveGame>(this);

			// Stats: take maximum values (never lose progress)
			Result->PlayerStats.XP = FMath::Max(Local->PlayerStats.XP, Cloud->PlayerStats.XP);
			Result->PlayerStats.Rating = FMath::Max(Local->PlayerStats.Rating, Cloud->PlayerStats.Rating);
			Result->PlayerStats.MatchesPlayed = FMath::Max(Local->PlayerStats.MatchesPlayed, Cloud->PlayerStats.MatchesPlayed);
			Result->PlayerStats.Wins = FMath::Max(Local->PlayerStats.Wins, Cloud->PlayerStats.Wins);
			Result->PlayerStats.Top5 = FMath::Max(Local->PlayerStats.Top5, Cloud->PlayerStats.Top5);
			Result->PlayerStats.TotalKills = FMath::Max(Local->PlayerStats.TotalKills, Cloud->PlayerStats.TotalKills);
			Result->PlayerStats.TotalDeaths = FMath::Max(Local->PlayerStats.TotalDeaths, Cloud->PlayerStats.TotalDeaths);
			Result->PlayerStats.SeasonKills = FMath::Max(Local->PlayerStats.SeasonKills, Cloud->PlayerStats.SeasonKills);
			Result->PlayerStats.Patente = static_cast<EPatenteRank>(FMath::Max(
				static_cast<int32>(Local->PlayerStats.Patente),
				static_cast<int32>(Cloud->PlayerStats.Patente)));

			// Items: union of both sets
			TSet<FString> SeenItems;
			for (const FUnlockedItem& Item : Local->UnlockedItems)
			{
				if (!SeenItems.Contains(Item.ItemId))
				{
					Result->UnlockedItems.Add(Item);
					SeenItems.Add(Item.ItemId);
				}
			}
			for (const FUnlockedItem& Item : Cloud->UnlockedItems)
			{
				if (!SeenItems.Contains(Item.ItemId))
				{
					Result->UnlockedItems.Add(Item);
					SeenItems.Add(Item.ItemId);
				}
			}

			// Equipped items: prefer local
			Result->EquippedItems = Local->EquippedItems;

			// Settings: prefer local
			Result->SettingsJson = Local->SettingsJson;
			Result->PreferredQueueMode = Local->PreferredQueueMode;
			Result->PreferredRegion = Local->PreferredRegion;

			return Result;
		}
	}

	return Local;
}

bool UKhaaosSaveSync::HasFieldChanged(UKhaaosSaveGame* Local, UKhaaosSaveGame* Cloud, const FString& FieldName) const
{
	// Generic field comparison — used for diff computation
	// In a production system, this would use reflection or a field registry
	return false;
}
