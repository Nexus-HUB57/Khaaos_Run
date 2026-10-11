// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Data/KhaaosDataTables.h"
#include "Engine/DataTable.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosDataTablesSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Auto-load all configured tables
	LoadAllTables();

	UE_LOG(LogTemp, Log, TEXT("KhaaosDataTablesSubsystem: Initialized with %d cached tables"), CachedTables.Num());
}

void UKhaaosDataTablesSubsystem::Deinitialize()
{
	CachedTables.Empty();
	Super::Deinitialize();
}

// ─── Data Table Accessors ────────────────────────────────────────────────────

bool UKhaaosDataTablesSubsystem::GetWeaponStats(FName WeaponID, FKhaaosWeaponStats& OutStats) const
{
	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_WeaponStats")))
	{
		if (UDataTable* DT = Table->Get())
		{
			if (FKhaaosWeaponStats* Row = DT->FindRow<FKhaaosWeaponStats>(WeaponID, TEXT("GetWeaponStats")))
			{
				OutStats = *Row;
				return true;
			}
		}
	}
	return false;
}

TMap<FName, FKhaaosWeaponStats> UKhaaosDataTablesSubsystem::GetAllWeaponStats() const
{
	TMap<FName, FKhaaosWeaponStats> Result;

	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_WeaponStats")))
	{
		if (UDataTable* DT = Table->Get())
		{
			for (const TPair<FName, FKhaaosWeaponStats*>& Row : DT->GetRowMap<FKhaaosWeaponStats>())
			{
				if (Row.Value)
				{
					Result.Add(Row.Key, *Row.Value);
				}
			}
		}
	}

	return Result;
}

bool UKhaaosDataTablesSubsystem::GetLootTableEntry(FName ItemID, FKhaaosLootTableEntry& OutEntry) const
{
	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_LootTable")))
	{
		if (UDataTable* DT = Table->Get())
		{
			if (FKhaaosLootTableEntry* Row = DT->FindRow<FKhaaosLootTableEntry>(ItemID, TEXT("GetLootTableEntry")))
			{
				OutEntry = *Row;
				return true;
			}
		}
	}
	return false;
}

TMap<FName, FKhaaosLootTableEntry> UKhaaosDataTablesSubsystem::GetAllLootTableEntries() const
{
	TMap<FName, FKhaaosLootTableEntry> Result;

	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_LootTable")))
	{
		if (UDataTable* DT = Table->Get())
		{
			for (const TPair<FName, FKhaaosLootTableEntry*>& Row : DT->GetRowMap<FKhaaosLootTableEntry>())
			{
				if (Row.Value)
				{
					Result.Add(Row.Key, *Row.Value);
				}
			}
		}
	}

	return Result;
}

bool UKhaaosDataTablesSubsystem::GetZonePhaseConfig(int32 Phase, FKhaaosZonePhaseConfig& OutConfig) const
{
	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_ZonePhases")))
	{
		if (UDataTable* DT = Table->Get())
		{
			// Zone phases are keyed by FName of the phase index
			const FName RowKey = FName(*FString::FromInt(Phase));
			if (FKhaaosZonePhaseConfig* Row = DT->FindRow<FKhaaosZonePhaseConfig>(RowKey, TEXT("GetZonePhaseConfig")))
			{
				OutConfig = *Row;
				return true;
			}
		}
	}
	return false;
}

TArray<FKhaaosZonePhaseConfig> UKhaaosDataTablesSubsystem::GetAllZonePhaseConfigs() const
{
	TArray<FKhaaosZonePhaseConfig> Result;

	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_ZonePhases")))
	{
		if (UDataTable* DT = Table->Get())
		{
			TArray<FKhaaosZonePhaseConfig*> AllRows;
			DT->GetAllRows<FKhaaosZonePhaseConfig>(TEXT("GetAllZonePhaseConfigs"), AllRows);

			for (FKhaaosZonePhaseConfig* Row : AllRows)
			{
				if (Row)
				{
					Result.Add(*Row);
				}
			}

			// Sort by phase index
			Result.Sort([](const FKhaaosZonePhaseConfig& A, const FKhaaosZonePhaseConfig& B)
			{
				return A.Phase < B.Phase;
			});
		}
	}

	return Result;
}

bool UKhaaosDataTablesSubsystem::GetAIDifficultyConfig(FGameplayTag Difficulty, FKhaaosAIDifficultyConfig& OutConfig) const
{
	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_AIDifficulty")))
	{
		if (UDataTable* DT = Table->Get())
		{
			// Key rows by difficulty tag name
			const FName RowKey = Difficulty.GetTagName();
			if (FKhaaosAIDifficultyConfig* Row = DT->FindRow<FKhaaosAIDifficultyConfig>(RowKey, TEXT("GetAIDifficultyConfig")))
			{
				OutConfig = *Row;
				return true;
			}
		}
	}
	return false;
}

bool UKhaaosDataTablesSubsystem::GetEconomyItem(FName ItemID, FKhaaosEconomyItem& OutItem) const
{
	if (const TObjectPtr<UDataTable>* Table = CachedTables.Find(FName("DT_Economy")))
	{
		if (UDataTable* DT = Table->Get())
		{
			if (FKhaaosEconomyItem* Row = DT->FindRow<FKhaaosEconomyItem>(ItemID, TEXT("GetEconomyItem")))
			{
				OutItem = *Row;
				return true;
			}
		}
	}
	return false;
}

// ─── Data Table Loading ──────────────────────────────────────────────────────

bool UKhaaosDataTablesSubsystem::LoadAllTables()
{
	bool bAllLoaded = true;

	ResolveDataTable(DT_WeaponStats, FName("DT_WeaponStats"));
	ResolveDataTable(DT_LootTable, FName("DT_LootTable"));
	ResolveDataTable(DT_ZonePhases, FName("DT_ZonePhases"));
	ResolveDataTable(DT_AIDifficulty, FName("DT_AIDifficulty"));
	ResolveDataTable(DT_Economy, FName("DT_Economy"));

	return CachedTables.Num() > 0;
}

bool UKhaaosDataTablesSubsystem::IsTableLoaded(FName TableName) const
{
	return CachedTables.Contains(TableName);
}

UDataTable* UKhaaosDataTablesSubsystem::ResolveDataTable(TSoftObjectPtr<UDataTable>& SoftRef, FName TableName)
{
	if (!SoftRef.IsValid() && !SoftRef.IsPending())
	{
		return nullptr;
	}

	UDataTable* DataTable = SoftRef.LoadSynchronous();
	if (DataTable)
	{
		CachedTables.Add(TableName, DataTable);
		UE_LOG(LogTemp, Log, TEXT("KhaaosDataTablesSubsystem: Loaded data table '%s'"), *TableName.ToString());
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosDataTablesSubsystem: Failed to load data table '%s'"), *TableName.ToString());
	}

	return DataTable;
}
