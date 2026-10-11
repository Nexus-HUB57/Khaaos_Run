// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Save/KhaaosSaveSlots.generated.h"

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FKhaaosSaveSlot
 *
 * Metadata for a single save slot. Up to 10 slots supported.
 * Tracks slot name, timestamp, play time, character level,
 * match count, and whether it's backed up to the cloud.
 */
USTRUCT(BlueprintType)
struct FKhaaosSaveSlot
{
	GENERATED_BODY()

	/** Display name of this save slot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	FString SlotName;

	/** Timestamp of last save (ISO 8601). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	FString Timestamp;

	/** Total play time in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	float PlayTime = 0.0f;

	/** Character level at time of save. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	int32 CharacterLevel = 1;

	/** Number of matches played. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	int32 MatchCount = 0;

	/** Whether this slot has been backed up to EOS cloud. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	uint8 bIsCloudBacked : 1;

	/** Slot index (0-9). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	int32 SlotIndex = 0;
};

/**
 * UKhaaosSaveSlots
 *
 * Save slot management subsystem.
 * Manages up to 10 save slots with metadata tracking.
 *
 * Features:
 *   - CreateSlot: Create a new save slot
 *   - DeleteSlot: Remove a save slot and its data
 *   - GetSlot: Get metadata for a specific slot
 *   - GetAvailableSlots: Get all slot metadata
 *   - Auto-create slot on first game
 *
 * Slot names are used as both display names and EOS cloud identifiers.
 * Slot indices (0-9) map to UE's USaveGame slot indices.
 */
UCLASS(Config = Game, defaultconfig)
class UKhaaosSaveSlots : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosSaveSlots();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Slot Operations ──────────────────────────────────────────────────────

	/**
	 * Create a new save slot with the given display name.
	 * Returns the slot index, or -1 if no slots available.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|SaveSlots")
	int32 CreateSlot(const FString& Name);

	/**
	 * Delete a save slot by index.
	 * Removes local and cloud data.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|SaveSlots")
	void DeleteSlot(int32 SlotIndex);

	/**
	 * Get metadata for a specific slot.
	 * Returns empty slot if index is invalid.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SaveSlots")
	FKhaaosSaveSlot GetSlot(int32 SlotIndex) const;

	/**
	 * Get metadata for all available (non-empty) slots.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SaveSlots")
	TArray<FKhaaosSaveSlot> GetAvailableSlots() const;

	/**
	 * Update slot metadata (e.g., after a save).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|SaveSlots")
	void UpdateSlotMetadata(int32 SlotIndex, const FKhaaosSaveSlot& UpdatedMetadata);

	/**
	 * Find a slot by name.
	 * Returns the slot index, or -1 if not found.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SaveSlots")
	int32 FindSlotByName(const FString& Name) const;

	/**
	 * Check if a slot index is valid and occupied.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SaveSlots")
	bool IsSlotValid(int32 SlotIndex) const;

	/**
	 * Get the number of occupied slots.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SaveSlots")
	int32 GetOccupiedSlotCount() const;

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Maximum number of save slots. */
	static constexpr int32 MaxSlots = 10;

	/** If true, automatically create a slot on first game play. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	uint8 bAutoCreateSlotOnFirstGame : 1;

	// ─── State ────────────────────────────────────────────────────────────────

	/** All save slots (0-9). Empty slots have empty SlotName. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SaveSlots")
	TArray<FKhaaosSaveSlot> Slots;

private:

	/** Find the first empty slot index. Returns -1 if full. */
	int32 FindEmptySlot() const;
};
