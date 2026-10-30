// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosInventoryComponent.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UPrimaryDataAsset;
class AKhaaosLootPickup;

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

/** Server-side item allowlist entry; clients cannot inject arbitrary item IDs/stacks. */
USTRUCT(BlueprintType)
struct FKhaaosInventoryItemDefinition
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory|Catalog")
    FName ItemID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory|Catalog")
    EKhaaosInventorySlot SlotType = EKhaaosInventorySlot::Utility;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory|Catalog", meta=(ClampMin="1", ClampMax="9999"))
    int32 MaxStack = 1;
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

    /** Request a nearby world pickup; the server rechecks distance and capacity. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Inventory")
    void RequestPickup(AKhaaosLootPickup* Pickup);

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

    /** Derived pickup class configured by the game content for dropped inventory items. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory|Loot")
    TSubclassOf<AKhaaosLootPickup> DroppedPickupClass;

    /** Authoritative allowlist and stack rules populated in the game's inventory data asset/BP. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Inventory|Catalog")
    TArray<FKhaaosInventoryItemDefinition> ItemCatalog;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Inventory")
    FOnInventoryChanged OnInventoryChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Inventory")
    FOnSlotSwapped OnSlotSwapped;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Inventory")
    FOnItemDropped OnItemDropped;

protected:

    UPROPERTY(ReplicatedUsing=OnRep_Slots, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    TArray<FKhaaosInventorySlot> Slots;

    UPROPERTY(ReplicatedUsing=OnRep_ActiveSlot, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Inventory")
    EKhaaosInventorySlot ActiveSlot = EKhaaosInventorySlot::Primary;

    UFUNCTION()
    void OnRep_Slots();

    UFUNCTION()
    void OnRep_ActiveSlot();

    UFUNCTION(Server, Reliable)
    void ServerRemoveItem(EKhaaosInventorySlot SlotType, int32 Count);

    UFUNCTION(Server, Reliable)
    void ServerSwapSlots(EKhaaosInventorySlot SlotA, EKhaaosInventorySlot SlotB);

    UFUNCTION(Server, Reliable)
    void ServerDropItem(EKhaaosInventorySlot SlotType);

    UFUNCTION(Server, Reliable)
    void ServerSetActiveSlot(EKhaaosInventorySlot SlotType);

    UFUNCTION(Server, Reliable)
    void ServerRequestPickup(AKhaaosLootPickup* Pickup);

    // ─── Replication ──────────────────────────────────────────────────────

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    /** Find slot index by type. Returns -1 if not found. */
    int32 FindSlotIndex(EKhaaosInventorySlot SlotType) const;

    bool ResolveItemDefinition(FName ItemID, FKhaaosInventoryItemDefinition& OutDefinition) const;
};
