// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosInventoryComponent.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UPrimaryDataAsset;

// ─── Inventory Slot Type ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosInventorySlot : uint8
{
    Primary     UMETA(DisplayName = "PRIMARY"),
    Secondary   UMETA(DisplayName = "SECONDARY"),
    Melee       UMETA(DisplayName = "MELEE"),
    Utility     UMETA(DisplayName = "UTILITY"),
    Shield      UMETA(DisplayName = "SHIELD"),
    Backpack    UMETA(DisplayName = "BACKPACK")
};

// ─── Inventory Slot Struct ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosInventorySlot
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    EKhaaosInventorySlot SlotType = EKhaaosInventorySlot::Primary;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    FName ItemID;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    int32 StackCount = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    uint8 bIsLocked : 1;

    FKhaaosInventorySlot()
        : SlotType(EKhaaosInventorySlot::Primary)
        , ItemID(NAME_None)
        , StackCount(0)
        , bIsLocked(false)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnInventoryChanged, EKhaaosInventorySlot, SlotType, FName, ItemID);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnSlotSwapped, EKhaaosInventorySlot, SlotA, EKhaaosInventorySlot, SlotB, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemDropped, EKhaaosInventorySlot, SlotType, FName, ItemID);

/**
 * UKhaaosInventoryComponent
 *
 * PhD-Level inventory grid (Free Fire/Fortnite style).
 *
 * Slots:
 *   Primary   — Main weapon (AR, SMG, Sniper, etc.)
 *   Secondary — Sidearm (Pistol, SMG secondary)
 *   Melee     — Knife, Sword, Exotic melee
 *   Utility   — Grenades, mines, beacons, grappling hook
 *   Shield    — Shield Lv1/Lv2, Colete, Armadura, Escudo
 *   Backpack  — Mochila Tática (increases utility stack max)
 *
 * Auto-equip: On pickup, first matching empty slot is filled.
 * Swap: Drag-and-drop or quick-swap between slots.
 * Drop: Creates AKhaaosLootPickup at player feet.
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosInventoryComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosInventoryComponent();

    // ─── Item Management ────────────────────────────────────────────────────

    /** Add an item to the first matching empty slot. Returns true if added. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    bool AddItem(FName ItemID, int32 Count = 1);

    /** Add an item to a specific slot. Returns true if added. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    bool AddItemToSlot(EKhaaosInventorySlot SlotType, FName ItemID, int32 Count = 1);

    /** Remove an item from a slot. Returns true if removed. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    bool RemoveItem(EKhaaosInventorySlot SlotType, int32 Count = 1);

    /** Swap contents of two slots. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    void SwapSlots(EKhaaosInventorySlot SlotA, EKhaaosInventorySlot SlotB);

    /** Drop item from a slot (creates loot pickup at player location). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    void DropItem(EKhaaosInventorySlot SlotType);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Get item ID in a slot. Returns NAME_None if empty. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    FName GetItemIdInSlot(EKhaaosInventorySlot SlotType) const;

    /** Get stack count in a slot. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    int32 GetStackCount(EKhaaosInventorySlot SlotType) const;

    /** Check if a slot is empty. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    bool IsSlotEmpty(EKhaaosInventorySlot SlotType) const;

    /** Check if a slot is locked. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    bool IsSlotLocked(EKhaaosInventorySlot SlotType) const;

    /** Get all slots (for UI). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    const TArray<FKhaaosInventorySlot>& GetAllSlots() const { return Slots; }

    // ─── Active Weapon ──────────────────────────────────────────────────────

    /** Set the active weapon slot (Primary or Secondary). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    void SetActiveSlot(EKhaaosInventorySlot SlotType);

    /** Get the active weapon slot. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    EKhaaosInventorySlot GetActiveSlot() const { return ActiveSlot; }

    /** Get the item ID of the currently active weapon. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    FName GetActiveWeaponId() const;

    /** Cycle to next weapon slot (Primary ↔ Secondary → Melee). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    void CycleActiveWeapon();

    // ─── Utility Stack Max (Backpack modifier) ──────────────────────────────

    /** Get max stack for utility slot (modified by backpack). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Inventory")
    int32 GetUtilityStackMax() const;

    /** Base max utility stack (without backpack). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory")
    int32 BaseUtilityStackMax = 5;

    /** Bonus utility stacks per backpack tier. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory")
    int32 BackpackStackBonus = 5;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Inventory")
    FOnInventoryChanged OnInventoryChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Inventory")
    FOnSlotSwapped OnSlotSwapped;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Inventory")
    FOnItemDropped OnItemDropped;

protected:

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    TArray<FKhaaosInventorySlot> Slots;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    EKhaaosInventorySlot ActiveSlot = EKhaaosInventorySlot::Primary;

    /** Find slot index by type. Returns -1 if not found. */
    int32 FindSlotIndex(EKhaaosInventorySlot SlotType) const;

    /** Determine the appropriate slot type for an item ID. */
    static EKhaaosInventorySlot DetermineSlotType(FName ItemID);
};
