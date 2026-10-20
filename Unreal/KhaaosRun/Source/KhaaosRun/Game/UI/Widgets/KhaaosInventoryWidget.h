// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Game/UI/Widgets/KhaaosInventoryWidget.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosPlayerState;
class UImage;
class UTextBlock;
class UBorder;
class UDragDropOperation;
class UGridPanel;

// ─── Inventory Constants ──────────────────────────────────────────────────────

/** Number of inventory slots (matches KhaaosInventoryComponent). */
static constexpr int32 KHAaos_INVENTORY_SLOTS = 6;

/**
 * EKhaaosItemRarity
 * Rarity for UI display colors.
 */
UENUM(BlueprintType)
enum class EKhaaosItemRarityUI : uint8
{
	Comum    UMETA(DisplayName = "COMUM"),
	Raro     UMETA(DisplayName = "RARO"),
	Epico    UMETA(DisplayName = "EPICO"),
	Lendario UMETA(DisplayName = "LENDARIO"),
	Mitico   UMETA(DisplayName = "MITICO")
};

/**
 * FKhaaosInventorySlotData
 * Data for a single inventory slot.
 */
USTRUCT(BlueprintType)
struct FKhaaosInventorySlotData
{
	GENERATED_BODY()

	/** Slot index (0-5). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	int32 SlotIndex = -1;

	/** Item ID (empty = empty slot). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	FString ItemId;

	/** Display name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	FString DisplayName;

	/** Item rarity. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	EKhaaosItemRarityUI Rarity = EKhaaosItemRarityUI::Comum;

	/** Quantity. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	int32 Quantity = 0;

	/** Max stack size. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	int32 MaxStack = 1;

	/** Is slot empty? */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	uint8 bIsEmpty : 1;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnSlotClicked, int32, SlotIndex, const FString&, ItemId);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnSlotDrop, int32, FromSlot, int32, ToSlot);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnQuickEquip, int32, SlotIndex);

/**
 * UKhaaosInventoryWidget
 *
 * 6-slot inventory grid widget with drag-drop, rarity-colored borders,
 * quick-equip, and item tooltips. Matches Free Fire's inventory layout.
 *
 * Layout:
 *   ┌──────┐ ┌──────┐ ┌──────┐
 *   │ Wpn1 │ │ Wpn2 │ │ Wpn3 │
 *   └──────┘ └──────┘ └──────┘
 *   ┌──────┐ ┌──────┐ ┌──────┐
 *   │ Item1│ │ Item2│ │ Item3│
 *   └──────┘ └──────┘ └──────┘
 *
 * Rarity Colors (Free Fire parity):
 *   COMUM:    #B0B0B0 (Gray)
 *   RARO:     #4FC3F7 (Blue)
 *   EPICO:    #AB47BC (Purple)
 *   LENDARIO: #FFA726 (Orange)
 *   MITICO:   #EF5350 (Red/Gold glow)
 *
 * Features:
 *   - Drag-drop item rearrangement between slots
 *   - Quick-equip on double-click
 *   - Rarity-colored border glow
 *   - Ammo counter overlay for weapons
 *   - Tooltip on hover
 *   - Animated slot highlight on pickup
 *   - Console-friendly: large slots, D-pad navigation
 */
UCLASS(Abstract, BlueprintType)
class UKhaaosInventoryWidget : public UUserWidget
{
	GENERATED_BODY()

public:

	virtual void NativeConstruct() override;
	virtual void NativeDestruct() override;

	// ─── Data Binding ───────────────────────────────────────────────────────

	/** Update all slots from player state. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Inventory")
	void RefreshInventory(UKhaaosPlayerState* PlayerState);

	/** Update a single slot. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Inventory")
	void UpdateSlot(int32 SlotIndex, const FKhaaosInventorySlotData& Data);

	/** Clear all slots. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Inventory")
	void ClearAllSlots();

	// ─── Interaction ────────────────────────────────────────────────────────

	/** Handle slot click (select). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Inventory")
	void OnSlotClicked(int32 SlotIndex);

	/** Handle slot double-click (quick-equip). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Inventory")
	void OnSlotDoubleClicked(int32 SlotIndex);

	/** Handle drag-drop between slots. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Inventory")
	void OnSlotDragDrop(int32 FromSlot, int32 ToSlot);

	// ─── Rarity Colors ─────────────────────────────────────────────────────

	/** Get border color for rarity. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|UI|Inventory")
	static FLinearColor GetRarityColor(EKhaaosItemRarityUI Rarity);

	/** Get rarity glow intensity. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|UI|Inventory")
	static float GetRarityGlowIntensity(EKhaaosItemRarityUI Rarity);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Currently selected slot (-1 = none). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	int32 SelectedSlot;

	/** Slot data array. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Inventory")
	TArray<FKhaaosInventorySlotData> Slots;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|UI|Inventory")
	FOnSlotClicked OnSlotClickedDelegate;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|UI|Inventory")
	FOnSlotDrop OnSlotDropDelegate;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|UI|Inventory")
	FOnQuickEquip OnQuickEquipDelegate;
};
