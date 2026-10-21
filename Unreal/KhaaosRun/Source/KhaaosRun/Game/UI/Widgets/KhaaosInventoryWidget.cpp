// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosInventoryWidget.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

// ─── Native Lifecycle ──────────────────────────────────────────────────────────

void UKhaaosInventoryWidget::NativeConstruct()
{
	Super::NativeConstruct();

	// Initialize slot data
	Slots.SetNum(KHAAOS_INVENTORY_SLOTS);
	for (int32 i = 0; i < KHAAOS_INVENTORY_SLOTS; ++i)
	{
		Slots[i].SlotIndex = i;
		Slots[i].bIsEmpty = true;
	}

	SelectedSlot = -1;
}

void UKhaaosInventoryWidget::NativeDestruct()
{
	Slots.Empty();
	Super::NativeDestruct();
}

// ─── Data Binding ───────────────────────────────────────────────────────────────

void UKhaaosInventoryWidget::RefreshInventory(UKhaaosPlayerState* PlayerState)
{
	if (!PlayerState) return;

	// In production, iterate KhaaosInventoryComponent slots
	// For now, mark all slots as needing update
	for (int32 i = 0; i < KHAAOS_INVENTORY_SLOTS; ++i)
	{
		// Slot data would be populated from PlayerState->InventoryComponent
		UpdateSlot(i, Slots[i]);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosInventoryWidget: Inventory refreshed"));
}

void UKhaaosInventoryWidget::UpdateSlot(int32 SlotIndex, const FKhaaosInventorySlotData& Data)
{
	if (!Slots.IsValidIndex(SlotIndex)) return;
	Slots[SlotIndex] = Data;
	Slots[SlotIndex].SlotIndex = SlotIndex;

	// Blueprint-implemented visual update would happen here
}

void UKhaaosInventoryWidget::ClearAllSlots()
{
	for (int32 i = 0; i < KHAAOS_INVENTORY_SLOTS; ++i)
	{
		Slots[i].SlotIndex = i;
		Slots[i].ItemId.Empty();
		Slots[i].DisplayName.Empty();
		Slots[i].bIsEmpty = true;
		Slots[i].Quantity = 0;
	}
}

// ─── Interaction ────────────────────────────────────────────────────────────────

void UKhaaosInventoryWidget::OnSlotClicked(int32 SlotIndex)
{
	if (!Slots.IsValidIndex(SlotIndex)) return;
	SelectedSlot = SlotIndex;
	OnSlotClickedDelegate.Broadcast(SlotIndex, Slots[SlotIndex].ItemId);
}

void UKhaaosInventoryWidget::OnSlotDoubleClicked(int32 SlotIndex)
{
	if (!Slots.IsValidIndex(SlotIndex)) return;
	if (!Slots[SlotIndex].bIsEmpty)
	{
		OnQuickEquipDelegate.Broadcast(SlotIndex);
	}
}

void UKhaaosInventoryWidget::OnSlotDragDrop(int32 FromSlot, int32 ToSlot)
{
	if (!Slots.IsValidIndex(FromSlot) || !Slots.IsValidIndex(ToSlot)) return;
	if (FromSlot == ToSlot) return;

	// Swap slots
	Slots.Swap(FromSlot, ToSlot);
	Slots[FromSlot].SlotIndex = FromSlot;
	Slots[ToSlot].SlotIndex = ToSlot;

	OnSlotDropDelegate.Broadcast(FromSlot, ToSlot);
}

// ─── Rarity Colors ─────────────────────────────────────────────────────────────

FLinearColor UKhaaosInventoryWidget::GetRarityColor(EKhaaosItemRarityUI Rarity)
{
	switch (Rarity)
	{
	case EKhaaosItemRarityUI::Comum:    return FLinearColor(0.69f, 0.69f, 0.69f, 1.0f); // Gray
	case EKhaaosItemRarityUI::Raro:     return FLinearColor(0.31f, 0.76f, 0.97f, 1.0f); // Blue
	case EKhaaosItemRarityUI::Epico:    return FLinearColor(0.67f, 0.28f, 0.74f, 1.0f); // Purple
	case EKhaaosItemRarityUI::Lendario: return FLinearColor(1.0f, 0.65f, 0.15f, 1.0f);  // Orange
	case EKhaaosItemRarityUI::Mitico:   return FLinearColor(0.94f, 0.33f, 0.31f, 1.0f);  // Red
	default:                            return FLinearColor::White;
	}
}

float UKhaaosInventoryWidget::GetRarityGlowIntensity(EKhaaosItemRarityUI Rarity)
{
	switch (Rarity)
	{
	case EKhaaosItemRarityUI::Comum:    return 0.0f;
	case EKhaaosItemRarityUI::Raro:     return 0.3f;
	case EKhaaosItemRarityUI::Epico:    return 0.5f;
	case EKhaaosItemRarityUI::Lendario: return 0.7f;
	case EKhaaosItemRarityUI::Mitico:   return 1.0f;
	default:                            return 0.0f;
	}
}
