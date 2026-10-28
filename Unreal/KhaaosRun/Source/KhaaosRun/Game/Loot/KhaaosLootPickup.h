// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosLootPickup.generated.h"

class UKhaaosInventoryComponent;

// ─── Enums ported from schema.ts ──────────────────────────────────────────────

/** Loot rarity tiers (from schema.ts Rarity). */
UENUM(BlueprintType)
enum class ELootRarity : uint8
{
	Comum     UMETA(DisplayName = "COMUM"),
	Incomum   UMETA(DisplayName = "INCOMUM"),
	Raro      UMETA(DisplayName = "RARO"),
	Epico     UMETA(DisplayName = "EPICO"),
	Lendario  UMETA(DisplayName = "LENDARIO"),
	Mitico    UMETA(DisplayName = "MITICO")
};

/** Item types (from schema.ts ItemType). */
UENUM(BlueprintType)
enum class EItemType : uint8
{
	Arma      UMETA(DisplayName = "ARMA"),
	Defesa    UMETA(DisplayName = "DEFESA"),
	Curativo  UMETA(DisplayName = "CURATIVO"),
	Utilidade UMETA(DisplayName = "UTILIDADE"),
	Recurso   UMETA(DisplayName = "RECURSO")
};

/**
 * FLootStats
 *
 * Generic stats map for loot items (mirrors TS stats: Record<string, number>).
 * Stores damage, accuracy, heal, defense, etc.
 */
USTRUCT(BlueprintType)
struct FLootStats
{
	GENERATED_BODY()

	/** Damage value (weapons, grenades). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Damage = 0.0f;

	/** Accuracy value (weapons). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Accuracy = 0.0f;

	/** Ammo count (weapons). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	int32 Ammo = 0;

	/** Heal amount (curatives). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Heal = 0.0f;

	/** Defense value (armor, shields). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Defense = 0.0f;

	/** Blast radius (grenades). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Radius = 0.0f;

	/** Capacity (backpacks). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	int32 Capacity = 0;

	/** Speed bonus (adrenaline). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Speed = 0.0f;

	/** Vision range (drones). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float Vision = 0.0f;
};

/**
 * AKhaaosLootPickup
 *
 * World-space loot item actor (BP_LootBase equivalent).
 * Ported from TS RoomLoot and schema.ts lootItems/LOOT_PRESETS.
 *
 * Server-authoritative pickup: only server can set bIsActive = false
 * and broadcast the pickup to clients.
 */
UCLASS(Abstract)
class AKhaaosLootPickup : public AActor
{
	GENERATED_BODY()

public:
	AKhaaosLootPickup();

	// ─── Replicated Loot Properties ─────────────────────────────────────────

	/** Unique loot item ID. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	int32 ItemId;

	/** Display name of the item. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	FString ItemName;

	/** Stable item key and stack transferred into the authoritative inventory. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	FName InventoryItemID;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	int32 InventoryStackCount = 1;

	/** Rarity tier. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	ELootRarity Rarity;

	/** Item type category. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	EItemType ItemType;

	/** Item stats (damage, heal, defense, etc.). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	FLootStats ItemStats;

	/** Whether this pickup is still available. */
	UPROPERTY(ReplicatedUsing = OnRep_IsActive, BlueprintReadOnly, Category = "Khaaos|Loot")
	uint8 bIsActive : 1;

	/** ID of the player who picked this up (empty if unclaimed). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	FString PickedUpBy;

	/** Normalized map position (0-100). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Loot")
	FVector2D MapPosition;

	// ─── RepNotify ──────────────────────────────────────────────────────────

	UFUNCTION()
	void OnRep_IsActive();

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when this item is picked up. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnLootPickedUp, AKhaaosLootPickup*, Pickup, const FString&, PickerId);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Loot")
	FOnLootPickedUp OnLootPickedUp;

	// ─── Server Methods ─────────────────────────────────────────────────────

	/**
	 * Server-only: player picks up this loot item.
	 * Validates that the item is active and player is in range.
	 * Ported from TS handlePickup logic.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Loot")
	bool TryPickup(const FString& PlayerId, float PlayerPosX, float PlayerPosY, float PickupRange);

	/** Server-only transaction: add to inventory first, then atomically consume this pickup. */
	bool TryPickupIntoInventory(UKhaaosInventoryComponent* Inventory);
	void ConfigureInventoryItem(FName ItemID, int32 StackCount, EItemType InType);

	/** Reset this pickup for a new match. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Loot")
	void ResetPickup();

	/** Initialize from preset data (port of LOOT_PRESETS entry). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Loot")
	void InitFromPreset(int32 InItemId, const FString& InName, EItemType InType, ELootRarity InRarity, float InPosX, float InPosY, const FLootStats& InStats);

	/** Server-only: set the replicated rarity before the pickup is collected. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Loot")
	bool SetRarity(ELootRarity InRarity);

	// ─── Client RPC ──────────────────────────────────────────────────────────────

	/** Client-side pickup effect (sound, VFX, UI feedback). */
	UFUNCTION(Client, Reliable)
	void ClientOnPickedUp(const FString& PickerId);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

	/** Pickup range in map units (config from TS). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot")
	float DefaultPickupRange;

	/** 3D interaction range for inventory pickups, in Unreal centimeters. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Loot", meta=(ClampMin="50.0", ClampMax="1000.0"))
	float WorldPickupRangeCm = 250.0f;

	/** Collision sphere for pickup detection. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Loot")
	class USphereComponent* PickupCollision;
};
