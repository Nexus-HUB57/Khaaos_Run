// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Save/KhaaosSaveSlots.h"
#include "Save/KhaaosSaveGame.h"

#include "Engine/Engine.h"
#include "Kismet/GameplayStatics.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosSaveSlots, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosSaveSlots
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosSaveSlots::UKhaaosSaveSlots()
	: bAutoCreateSlotOnFirstGame(true)
{
	// Pre-allocate slot array
	Slots.SetNum(MaxSlots);
	for (int32 i = 0; i < MaxSlots; ++i)
	{
		Slots[i].SlotIndex = i;
		Slots[i].SlotName.Empty();
	}
}

void UKhaaosSaveSlots::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Load existing slot metadata from local save
	for (int32 i = 0; i < MaxSlots; ++i)
	{
		const FString SlotName = FString::Printf(TEXT("KhaaosSlot_%d"), i);
		if (UKhaaosSaveGame::DoesSaveExist(SlotName, 0))
		{
			UKhaaosSaveGame* Loaded = UKhaaosSaveGame::LoadFromSlot(SlotName, 0);
			if (Loaded)
			{
				Slots[i].SlotName = Loaded->SaveSlotName;
				Slots[i].Timestamp = Loaded->LastSaveTimestamp;
				Slots[i].bIsCloudBacked = false; // Will be updated by cloud sync
				Slots[i].SlotIndex = i;
				UE_LOG(LogKhaaosSaveSlots, Log, TEXT("Slot %d: '%s' loaded."), i, *Slots[i].SlotName);
			}
		}
	}

	UE_LOG(LogKhaaosSaveSlots, Log, TEXT("KhaaosSaveSlots: Initialized. %d/%d slots occupied."),
		GetOccupiedSlotCount(), MaxSlots);
}

void UKhaaosSaveSlots::Deinitialize()
{
	UE_LOG(LogKhaaosSaveSlots, Log, TEXT("KhaaosSaveSlots: Deinitialized."));
	Super::Deinitialize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slot Operations
// ═══════════════════════════════════════════════════════════════════════════════

int32 UKhaaosSaveSlots::CreateSlot(const FString& Name)
{
	const int32 EmptyIdx = FindEmptySlot();
	if (EmptyIdx < 0)
	{
		UE_LOG(LogKhaaosSaveSlots, Warning, TEXT("CreateSlot: All %d slots are occupied. Cannot create '%s'."), MaxSlots, *Name);
		return -1;
	}

	FKhaaosSaveSlot& Slot = Slots[EmptyIdx];
	Slot.SlotName = Name;
	Slot.Timestamp = FDateTime::UtcNow().ToIso8601();
	Slot.PlayTime = 0.0f;
	Slot.CharacterLevel = 1;
	Slot.MatchCount = 0;
	Slot.bIsCloudBacked = false;
	Slot.SlotIndex = EmptyIdx;

	UE_LOG(LogKhaaosSaveSlots, Log, TEXT("CreateSlot: Created slot %d '%s'."), EmptyIdx, *Name);
	return EmptyIdx;
}

void UKhaaosSaveSlots::DeleteSlot(int32 SlotIndex)
{
	if (!IsSlotValid(SlotIndex))
	{
		UE_LOG(LogKhaaosSaveSlots, Warning, TEXT("DeleteSlot: Invalid slot index %d."), SlotIndex);
		return;
	}

	// Delete local save data
	const FString SlotName = FString::Printf(TEXT("KhaaosSlot_%d"), SlotIndex);
	UKhaaosSaveGame::DeleteSaveSlot(SlotName, 0);

	UE_LOG(LogKhaaosSaveSlots, Log, TEXT("DeleteSlot: Deleted slot %d '%s'."), SlotIndex, *Slots[SlotIndex].SlotName);

	// Clear metadata
	Slots[SlotIndex].SlotName.Empty();
	Slots[SlotIndex].Timestamp.Empty();
	Slots[SlotIndex].PlayTime = 0.0f;
	Slots[SlotIndex].CharacterLevel = 1;
	Slots[SlotIndex].MatchCount = 0;
	Slots[SlotIndex].bIsCloudBacked = false;
}

FKhaaosSaveSlot UKhaaosSaveSlots::GetSlot(int32 SlotIndex) const
{
	if (SlotIndex >= 0 && SlotIndex < MaxSlots)
	{
		return Slots[SlotIndex];
	}

	FKhaaosSaveSlot Empty;
	return Empty;
}

TArray<FKhaaosSaveSlot> UKhaaosSaveSlots::GetAvailableSlots() const
{
	TArray<FKhaaosSaveSlot> Result;
	for (const FKhaaosSaveSlot& Slot : Slots)
	{
		if (!Slot.SlotName.IsEmpty())
		{
			Result.Add(Slot);
		}
	}
	return Result;
}

void UKhaaosSaveSlots::UpdateSlotMetadata(int32 SlotIndex, const FKhaaosSaveSlot& UpdatedMetadata)
{
	if (SlotIndex < 0 || SlotIndex >= MaxSlots)
	{
		UE_LOG(LogKhaaosSaveSlots, Warning, TEXT("UpdateSlotMetadata: Invalid slot index %d."), SlotIndex);
		return;
	}

	Slots[SlotIndex] = UpdatedMetadata;
	Slots[SlotIndex].SlotIndex = SlotIndex; // Preserve index

	UE_LOG(LogKhaaosSaveSlots, Log, TEXT("UpdateSlotMetadata: Updated slot %d '%s'."), SlotIndex, *UpdatedMetadata.SlotName);
}

int32 UKhaaosSaveSlots::FindSlotByName(const FString& Name) const
{
	for (int32 i = 0; i < MaxSlots; ++i)
	{
		if (Slots[i].SlotName == Name)
		{
			return i;
		}
	}
	return -1;
}

bool UKhaaosSaveSlots::IsSlotValid(int32 SlotIndex) const
{
	return (SlotIndex >= 0 && SlotIndex < MaxSlots && !Slots[SlotIndex].SlotName.IsEmpty());
}

int32 UKhaaosSaveSlots::GetOccupiedSlotCount() const
{
	int32 Count = 0;
	for (const FKhaaosSaveSlot& Slot : Slots)
	{
		if (!Slot.SlotName.IsEmpty())
		{
			Count++;
		}
	}
	return Count;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal
// ═══════════════════════════════════════════════════════════════════════════════

int32 UKhaaosSaveSlots::FindEmptySlot() const
{
	for (int32 i = 0; i < MaxSlots; ++i)
	{
		if (Slots[i].SlotName.IsEmpty())
		{
			return i;
		}
	}
	return -1;
}
