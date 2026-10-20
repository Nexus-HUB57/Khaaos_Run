// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosInventoryComponent::UKhaaosInventoryComponent()
{
    PrimaryComponentTick.bCanEverTick = false;

    // Initialize 6 fixed slots
    Slots.SetNum(6);
    Slots[0].SlotType = EKhaaosInventorySlot::Primary;
    Slots[1].SlotType = EKhaaosInventorySlot::Secondary;
    Slots[2].SlotType = EKhaaosInventorySlot::Melee;
    Slots[3].SlotType = EKhaaosInventorySlot::Utility;
    Slots[4].SlotType = EKhaaosInventorySlot::Shield;
    Slots[5].SlotType = EKhaaosInventorySlot::Backpack;

    ActiveSlot = EKhaaosInventorySlot::Primary;
    BaseUtilityStackMax = 5;
    BackpackStackBonus = 5;
}

// ─── Item Management ────────────────────────────────────────────────────────────

bool UKhaaosInventoryComponent::AddItem(FName ItemID, int32 Count)
{
    if (ItemID.IsNone() || Count <= 0) return false;

    EKhaaosInventorySlot TargetSlot = DetermineSlotType(ItemID);
    return AddItemToSlot(TargetSlot, ItemID, Count);
}

bool UKhaaosInventoryComponent::AddItemToSlot(EKhaaosInventorySlot SlotType, FName ItemID, int32 Count)
{
    int32 Idx = FindSlotIndex(SlotType);
    if (Idx < 0) return false;
    if (Slots[Idx].bIsLocked) return false;

    FKhaaosInventorySlot& Slot = Slots[Idx];

    if (Slot.ItemID.IsNone())
    {
        // Empty slot — fill it
        Slot.ItemID = ItemID;
        Slot.StackCount = Count;
        OnInventoryChanged.Broadcast(SlotType, ItemID);
        UE_LOG(LogKhaaosRun, Log, TEXT("Inventory::AddItemToSlot - %s → %s (x%d)"),
            *ItemID.ToString(), *SlotType.GetName(), Count);
        return true;
    }
    else if (Slot.ItemID == ItemID)
    {
        // Same item — stack it
        Slot.StackCount += Count;
        OnInventoryChanged.Broadcast(SlotType, ItemID);
        return true;
    }

    // Slot occupied by different item
    return false;
}

bool UKhaaosInventoryComponent::RemoveItem(EKhaaosInventorySlot SlotType, int32 Count)
{
    int32 Idx = FindSlotIndex(SlotType);
    if (Idx < 0) return false;

    FKhaaosInventorySlot& Slot = Slots[Idx];
    if (Slot.ItemID.IsNone()) return false;

    Slot.StackCount -= Count;
    if (Slot.StackCount <= 0)
    {
        FName RemovedItem = Slot.ItemID;
        Slot.ItemID = NAME_None;
        Slot.StackCount = 0;
        OnInventoryChanged.Broadcast(SlotType, RemovedItem);
    }
    return true;
}

void UKhaaosInventoryComponent::SwapSlots(EKhaaosInventorySlot SlotA, EKhaaosInventorySlot SlotB)
{
    int32 IdxA = FindSlotIndex(SlotA);
    int32 IdxB = FindSlotIndex(SlotB);
    if (IdxA < 0 || IdxB < 0) return;

    Swap(Slots[IdxA], Slots[IdxB]);

    // Restore slot types (they don't swap, only contents do)
    Slots[IdxA].SlotType = SlotA;
    Slots[IdxB].SlotType = SlotB;

    OnSlotSwapped.Broadcast(SlotA, SlotB, true);
}

void UKhaaosInventoryComponent::DropItem(EKhaaosInventorySlot SlotType)
{
    int32 Idx = FindSlotIndex(SlotType);
    if (Idx < 0) return;
    if (Slots[Idx].ItemID.IsNone()) return;

    FName DroppedItem = Slots[Idx].ItemID;
    Slots[Idx].ItemID = NAME_None;
    Slots[Idx].StackCount = 0;

    OnItemDropped.Broadcast(SlotType, DroppedItem);
    OnInventoryChanged.Broadcast(SlotType, NAME_None);

    UE_LOG(LogKhaaosRun, Log, TEXT("Inventory::DropItem - %s from %s"), *DroppedItem.ToString(), *SlotType.GetName());
}

// ─── Query ──────────────────────────────────────────────────────────────────────

FName UKhaaosInventoryComponent::GetItemIdInSlot(EKhaaosInventorySlot SlotType) const
{
    int32 Idx = FindSlotIndex(SlotType);
    return (Idx >= 0) ? Slots[Idx].ItemID : NAME_None;
}

int32 UKhaaosInventoryComponent::GetStackCount(EKhaaosInventorySlot SlotType) const
{
    int32 Idx = FindSlotIndex(SlotType);
    return (Idx >= 0) ? Slots[Idx].StackCount : 0;
}

bool UKhaaosInventoryComponent::IsSlotEmpty(EKhaaosInventorySlot SlotType) const
{
    int32 Idx = FindSlotIndex(SlotType);
    return (Idx >= 0) ? Slots[Idx].ItemID.IsNone() : true;
}

bool UKhaaosInventoryComponent::IsSlotLocked(EKhaaosInventorySlot SlotType) const
{
    int32 Idx = FindSlotIndex(SlotType);
    return (Idx >= 0) ? Slots[Idx].bIsLocked : true;
}

// ─── Active Weapon ──────────────────────────────────────────────────────────────

void UKhaaosInventoryComponent::SetActiveSlot(EKhaaosInventorySlot SlotType)
{
    if (SlotType != EKhaaosInventorySlot::Primary &&
        SlotType != EKhaaosInventorySlot::Secondary &&
        SlotType != EKhaaosInventorySlot::Melee) return;

    ActiveSlot = SlotType;
}

FName UKhaaosInventoryComponent::GetActiveWeaponId() const
{
    return GetItemIdInSlot(ActiveSlot);
}

void UKhaaosInventoryComponent::CycleActiveWeapon()
{
    if (ActiveSlot == EKhaaosInventorySlot::Primary)
        ActiveSlot = EKhaaosInventorySlot::Secondary;
    else if (ActiveSlot == EKhaaosInventorySlot::Secondary)
        ActiveSlot = EKhaaosInventorySlot::Melee;
    else
        ActiveSlot = EKhaaosInventorySlot::Primary;
}

int32 UKhaaosInventoryComponent::GetUtilityStackMax() const
{
    int32 Max = BaseUtilityStackMax;
    if (!IsSlotEmpty(EKhaaosInventorySlot::Backpack))
    {
        Max += BackpackStackBonus;
    }
    return Max;
}

// ─── Replication ────────────────────────────────────────────────────────────────

void UKhaaosInventoryComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME_CONDITION(UKhaaosInventoryComponent, Slots, COND_None);
    DOREPLIFETIME_CONDITION(UKhaaosInventoryComponent, ActiveSlot, COND_None);
}

// ─── Internal ───────────────────────────────────────────────────────────────────

int32 UKhaaosInventoryComponent::FindSlotIndex(EKhaaosInventorySlot SlotType) const
{
    for (int32 i = 0; i < Slots.Num(); ++i)
    {
        if (Slots[i].SlotType == SlotType) return i;
    }
    return -1;
}

EKhaaosInventorySlot UKhaaosInventoryComponent::DetermineSlotType(FName ItemID)
{
    // Heuristic based on item ID naming conventions
    const FString IdStr = ItemID.ToString().ToLower();

    if (IdStr.StartsWith("wpn_") || IdStr.Contains("rifle") || IdStr.Contains("smg") ||
        IdStr.Contains("sniper") || IdStr.Contains("carbine") || IdStr.Contains("lmg") ||
        IdStr.Contains("dmr") || IdStr.Contains("shotgun"))
    {
        return EKhaaosInventorySlot::Primary;
    }
    if (IdStr.Contains("pistol"))
    {
        return EKhaaosInventorySlot::Secondary;
    }
    if (IdStr.Contains("knife") || IdStr.Contains("sword") || IdStr.Contains("espada") ||
        IdStr.Contains("melee") || IdStr.Contains("canhao"))
    {
        return EKhaaosInventorySlot::Melee;
    }
    if (IdStr.Contains("granada") || IdStr.Contains("mina") || IdStr.Contains("beacon") ||
        IdStr.Contains("grappling") || IdStr.Contains("drone"))
    {
        return EKhaaosInventorySlot::Utility;
    }
    if (IdStr.Contains("shield") || IdStr.Contains("colete") || IdStr.Contains("capacete") ||
        IdStr.Contains("armadura") || IdStr.Contains("escudo"))
    {
        return EKhaaosInventorySlot::Shield;
    }
    if (IdStr.Contains("mochila") || IdStr.Contains("backpack"))
    {
        return EKhaaosInventorySlot::Backpack;
    }

    // Default: utility slot
    return EKhaaosInventorySlot::Utility;
}
