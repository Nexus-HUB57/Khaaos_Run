// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/Data/KhaaosAssetRegistrySubsystem.h"
#include "GameFramework/Pawn.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosInventoryComponent::UKhaaosInventoryComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
    SetIsReplicatedByDefault(true);

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
    if (!GetOwner() || !GetOwner()->HasAuthority()) return false;
    FKhaaosInventoryItemDefinition Definition;
    if (!ResolveItemDefinition(ItemID, Definition) || Count <= 0 || Count > 9999) return false;
    return AddItemToSlot(Definition.SlotType, ItemID, Count);
}

bool UKhaaosInventoryComponent::AddItemToSlot(EKhaaosInventorySlot SlotType, FName ItemID, int32 Count)
{
    if (!GetOwner() || !GetOwner()->HasAuthority()) return false;
    FKhaaosInventoryItemDefinition Definition;
    if (!ResolveItemDefinition(ItemID, Definition) || Count <= 0 || Count > 9999 || Definition.SlotType != SlotType) return false;
    int32 MaxStack = FMath::Clamp(Definition.MaxStack, 1, 9999);
    if (SlotType == EKhaaosInventorySlot::Utility) MaxStack = FMath::Min(MaxStack, GetUtilityStackMax());
    if (Count > MaxStack) return false;
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
        if (GetOwner()) GetOwner()->ForceNetUpdate();
        UE_LOG(LogKhaaosRun, Log, TEXT("Inventory::AddItemToSlot - %s → %s (x%d)"),
            *ItemID.ToString(), *SlotType.GetName(), Count);
        return true;
    }
    else if (Slot.ItemID == ItemID)
    {
        // Same item — stack it
        if (Slot.StackCount > MaxStack - Count) return false;
        Slot.StackCount += Count;
        OnInventoryChanged.Broadcast(SlotType, ItemID);
        if (GetOwner()) GetOwner()->ForceNetUpdate();
        return true;
    }

    // Slot occupied by different item
    return false;
}

bool UKhaaosInventoryComponent::RemoveItem(EKhaaosInventorySlot SlotType, int32 Count)
{
    if (GetOwner() && !GetOwner()->HasAuthority())
    {
        ServerRemoveItem(SlotType, Count);
        return true;
    }
    if (Count <= 0) return false;
    int32 Idx = FindSlotIndex(SlotType);
    if (Idx < 0) return false;

    FKhaaosInventorySlot& Slot = Slots[Idx];
    if (Slot.ItemID.IsNone() || Slot.bIsLocked || Count > Slot.StackCount) return false;

    Slot.StackCount -= Count;
    if (Slot.StackCount <= 0)
    {
        FName RemovedItem = Slot.ItemID;
        Slot.ItemID = NAME_None;
        Slot.StackCount = 0;
        OnInventoryChanged.Broadcast(SlotType, RemovedItem);
    }
    if (GetOwner()) GetOwner()->ForceNetUpdate();
    return true;
}

void UKhaaosInventoryComponent::SwapSlots(EKhaaosInventorySlot SlotA, EKhaaosInventorySlot SlotB)
{
    if (GetOwner() && !GetOwner()->HasAuthority())
    {
        ServerSwapSlots(SlotA, SlotB);
        return;
    }
    int32 IdxA = FindSlotIndex(SlotA);
    int32 IdxB = FindSlotIndex(SlotB);
    if (IdxA < 0 || IdxB < 0 || Slots[IdxA].bIsLocked || Slots[IdxB].bIsLocked) return;
    FKhaaosInventoryItemDefinition DefinitionA;
    FKhaaosInventoryItemDefinition DefinitionB;
    const bool bHasDefinitionA = Slots[IdxA].ItemID.IsNone() || ResolveItemDefinition(Slots[IdxA].ItemID, DefinitionA);
    const bool bHasDefinitionB = Slots[IdxB].ItemID.IsNone() || ResolveItemDefinition(Slots[IdxB].ItemID, DefinitionB);
    if (!bHasDefinitionA || !bHasDefinitionB ||
        (!Slots[IdxA].ItemID.IsNone() && DefinitionA.SlotType != SlotB) ||
        (!Slots[IdxB].ItemID.IsNone() && DefinitionB.SlotType != SlotA))
    {
        OnSlotSwapped.Broadcast(SlotA, SlotB, false);
        return;
    }

    Swap(Slots[IdxA], Slots[IdxB]);

    // Restore slot types (they don't swap, only contents do)
    Slots[IdxA].SlotType = SlotA;
    Slots[IdxB].SlotType = SlotB;

    OnSlotSwapped.Broadcast(SlotA, SlotB, true);
    if (GetOwner()) GetOwner()->ForceNetUpdate();
}

void UKhaaosInventoryComponent::DropItem(EKhaaosInventorySlot SlotType)
{
    if (GetOwner() && !GetOwner()->HasAuthority())
    {
        ServerDropItem(SlotType);
        return;
    }
    int32 Idx = FindSlotIndex(SlotType);
    if (Idx < 0) return;
    if (Slots[Idx].ItemID.IsNone() || Slots[Idx].bIsLocked || !DroppedPickupClass || !GetWorld()) return;

    FName DroppedItem = Slots[Idx].ItemID;
    const int32 DroppedCount = Slots[Idx].StackCount;
    const FVector DropLocation = GetOwner() ? GetOwner()->GetActorLocation() + GetOwner()->GetActorForwardVector() * 100.0f + FVector(0.0f, 0.0f, 40.0f) : FVector::ZeroVector;
    FActorSpawnParameters SpawnParams;
    SpawnParams.Owner = GetOwner();
    SpawnParams.Instigator = Cast<APawn>(GetOwner());
    AKhaaosLootPickup* Pickup = GetWorld()->SpawnActor<AKhaaosLootPickup>(DroppedPickupClass, DropLocation, FRotator::ZeroRotator, SpawnParams);
    if (!Pickup) return;
    const EItemType DropType = (SlotType == EKhaaosInventorySlot::Primary || SlotType == EKhaaosInventorySlot::Secondary || SlotType == EKhaaosInventorySlot::Melee)
        ? EItemType::Arma : (SlotType == EKhaaosInventorySlot::Shield ? EItemType::Defesa : EItemType::Utilidade);
    Pickup->ConfigureInventoryItem(DroppedItem, DroppedCount, DropType);

    Slots[Idx].ItemID = NAME_None;
    Slots[Idx].StackCount = 0;

    OnItemDropped.Broadcast(SlotType, DroppedItem);
    OnInventoryChanged.Broadcast(SlotType, NAME_None);
    if (GetOwner()) GetOwner()->ForceNetUpdate();

    UE_LOG(LogKhaaosRun, Log, TEXT("Inventory::DropItem - %s from %s"), *DroppedItem.ToString(), *SlotType.GetName());
}

void UKhaaosInventoryComponent::RequestPickup(AKhaaosLootPickup* Pickup)
{
	if (!Pickup) return;
	if (GetOwner() && GetOwner()->HasAuthority()) ServerRequestPickup_Implementation(Pickup);
	else ServerRequestPickup(Pickup);
}

void UKhaaosInventoryComponent::ServerRemoveItem_Implementation(EKhaaosInventorySlot SlotType, int32 Count) { RemoveItem(SlotType, Count); }
void UKhaaosInventoryComponent::ServerSwapSlots_Implementation(EKhaaosInventorySlot SlotA, EKhaaosInventorySlot SlotB) { SwapSlots(SlotA, SlotB); }
void UKhaaosInventoryComponent::ServerDropItem_Implementation(EKhaaosInventorySlot SlotType) { DropItem(SlotType); }
void UKhaaosInventoryComponent::ServerSetActiveSlot_Implementation(EKhaaosInventorySlot SlotType) { SetActiveSlot(SlotType); }

void UKhaaosInventoryComponent::ServerRequestPickup_Implementation(AKhaaosLootPickup* Pickup)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || !Pickup || Pickup->GetWorld() != GetWorld()) return;
	Pickup->TryPickupIntoInventory(this);
}

void UKhaaosInventoryComponent::OnRep_Slots()
{
	for (const FKhaaosInventorySlot& Slot : Slots)
	{
		OnInventoryChanged.Broadcast(Slot.SlotType, Slot.ItemID);
	}
}

void UKhaaosInventoryComponent::OnRep_ActiveSlot()
{
	OnInventoryChanged.Broadcast(ActiveSlot, GetItemIdInSlot(ActiveSlot));
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
    if (GetOwner() && !GetOwner()->HasAuthority())
    {
        ServerSetActiveSlot(SlotType);
        return;
    }
    if (SlotType != EKhaaosInventorySlot::Primary &&
        SlotType != EKhaaosInventorySlot::Secondary &&
        SlotType != EKhaaosInventorySlot::Melee) return;

    ActiveSlot = SlotType;
    if (GetOwner()) GetOwner()->ForceNetUpdate();
}

FName UKhaaosInventoryComponent::GetActiveWeaponId() const
{
    return GetItemIdInSlot(ActiveSlot);
}

void UKhaaosInventoryComponent::CycleActiveWeapon()
{
    if (ActiveSlot == EKhaaosInventorySlot::Primary)
        SetActiveSlot(EKhaaosInventorySlot::Secondary);
    else if (ActiveSlot == EKhaaosInventorySlot::Secondary)
        SetActiveSlot(EKhaaosInventorySlot::Melee);
    else
        SetActiveSlot(EKhaaosInventorySlot::Primary);
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

    DOREPLIFETIME_CONDITION(UKhaaosInventoryComponent, Slots, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(UKhaaosInventoryComponent, ActiveSlot, COND_OwnerOnly);
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

bool UKhaaosInventoryComponent::ResolveItemDefinition(FName ItemID, FKhaaosInventoryItemDefinition& OutDefinition) const
{
    if (ItemID.IsNone()) return false;
    if (const FKhaaosInventoryItemDefinition* Override = ItemCatalog.FindByPredicate([ItemID](const FKhaaosInventoryItemDefinition& Definition)
    {
        return Definition.ItemID == ItemID;
    }))
    {
        OutDefinition = *Override;
        return true;
    }

    const UWorld* World = GetWorld();
    UGameInstance* GameInstance = World ? World->GetGameInstance() : nullptr;
    UKhaaosAssetRegistrySubsystem* Registry = GameInstance ? GameInstance->GetSubsystem<UKhaaosAssetRegistrySubsystem>() : nullptr;
    if (!Registry) return false;

    if (const UKhaaosWeaponDataAsset* Weapon = Registry->GetWeapon(ItemID))
    {
        OutDefinition.ItemID = ItemID;
        OutDefinition.SlotType = Weapon->Slot.ToString().Equals(TEXT("SECONDARY"), ESearchCase::IgnoreCase)
            ? EKhaaosInventorySlot::Secondary
            : (Weapon->Slot.ToString().Equals(TEXT("MELEE"), ESearchCase::IgnoreCase) ? EKhaaosInventorySlot::Melee : EKhaaosInventorySlot::Primary);
        OutDefinition.MaxStack = 9999; // Weapon pickups carry magazine/ammo count in this slot.
        return true;
    }

    if (const UKhaaosLootItemDataAsset* Loot = Registry->GetLootItem(ItemID))
    {
        OutDefinition.ItemID = ItemID;
        const FString ItemKey = ItemID.ToString().ToLower();
        OutDefinition.SlotType = (ItemKey.Contains(TEXT("backpack")) || ItemKey.Contains(TEXT("mochila")))
            ? EKhaaosInventorySlot::Backpack
            : (Loot->LootType == EKhaaosLootType::Defesa ? EKhaaosInventorySlot::Shield : EKhaaosInventorySlot::Utility);
        OutDefinition.MaxStack = FMath::Max(Loot->StackMax, 1);
        return true;
    }
    return false;
}
