// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Economy/KhaaosShopSystem.generated.h"

// ─── Shop Data Types ───────────────────────────────────────────────────────────

/**
 * EKhaaosShopRarity
 * Rarity tiers matching loot system (COMUM→MÍTICO).
 */
UENUM(BlueprintType)
enum class EKhaaosShopRarity : uint8
{
	Comum    UMETA(DisplayName = "COMUM"),
	Raro     UMETA(DisplayName = "RARO"),
	Epico    UMETA(DisplayName = "EPICO"),
	Lendario UMETA(DisplayName = "LENDARIO"),
	Mitico   UMETA(DisplayName = "MITICO")
};

/**
 * EKhaaosShopItemType
 * Shop item categories.
 */
UENUM(BlueprintType)
enum class EKhaaosShopItemType : uint8
{
	Skin      UMETA(DisplayName = "SKIN"),
	Emote     UMETA(DisplayName = "EMOTE"),
	WeaponSkin UMETA(DisplayName = "WEAPON_SKIN"),
	Glider    UMETA(DisplayName = "GLIDER"),
	Banner    UMETA(DisplayName = "BANNER"),
	BattlePass UMETA(DisplayName = "BATTLE_PASS")
};

/**
 * FKhaaosShopItem
 * A single shop listing.
 */
USTRUCT(BlueprintType)
struct FKhaaosShopItem
{
	GENERATED_BODY()

	/** Unique item ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	FString ItemId;

	/** Display name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	FString DisplayName;

	/** Item type. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	EKhaaosShopItemType ItemType = EKhaaosShopItemType::Skin;

	/** Rarity tier. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	EKhaaosShopRarity Rarity = EKhaaosShopRarity::Comum;

	/** KRC price. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 KrcPrice = 0;

	/** Discount percentage (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 DiscountPercent = 0;

	/** Is this a daily deal? */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	uint8 bIsDailyDeal : 1;

	/** Is this a featured item? */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	uint8 bIsFeatured : 1;

	/** Available until (unix timestamp, 0 = forever). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	int64 AvailableUntil = 0;

	/** Stock remaining (-1 = unlimited). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 StockRemaining = -1;
};

/**
 * FKhaaosShopRotation
 * Complete shop rotation (daily + featured items).
 */
USTRUCT(BlueprintType)
struct FKhaaosShopRotation
{
	GENERATED_BODY()

	/** Daily deals (refreshed every 24h). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	TArray<FKhaaosShopItem> DailyDeals;

	/** Featured items (refreshed every 7d). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	TArray<FKhaaosShopItem> FeaturedItems;

	/** Rotation start timestamp. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	int64 RotationStart = 0;

	/** Next rotation timestamp. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Shop")
	int64 NextRotation = 0;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnShopPurchaseResult, bool, bSuccess, const FString&, ItemId);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnShopRotationUpdated, const FKhaaosShopRotation&, NewRotation);

/**
 * UKhaaosShopSystem
 *
 * In-game shop system with KRC pricing, daily deals, featured rotations,
 * and Battle Pass tier purchases. Integrates with KhaaosEconomySync for
 * atomic KRC deduction.
 *
 * Parity with Free Fire:
 *   - Daily deal rotation every 24h with 4-6 items
 *   - Featured rotation every 7 days with 8-12 items
 *   - Discount system (10-50% off)
 *   - Limited stock items
 *   - Battle Pass tier skip purchase (150 KRC/tier)
 *   - Anti-fraud: max 10 purchases per minute per player
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosShopSystem : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosShopSystem();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void InitializeComponent() override;

	// ─── Shop Queries ───────────────────────────────────────────────────────

	/** Get current shop rotation. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Shop")
	FKhaaosShopRotation GetCurrentRotation() const { return CurrentRotation; }

	/** Get all available items (daily + featured). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Shop")
	TArray<FKhaaosShopItem> GetAvailableItems() const;

	/** Check if a player owns an item. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Shop")
	bool DoesPlayerOwn(const FString& PlayerEosId, const FString& ItemId) const;

	/** Get effective price after discount. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Shop")
	static int32 GetEffectivePrice(const FKhaaosShopItem& Item);

	// ─── Purchase ───────────────────────────────────────────────────────────

	/**
	 * Purchase a shop item for a player.
	 * Validates ownership, balance, stock, then deducts KRC atomically.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Shop")
	void PurchaseItem(const FString& PlayerEosId, const FString& ItemId, const FOnShopPurchaseResult& Callback);

	// ─── Rotation ───────────────────────────────────────────────────────────

	/** Force rotate the shop (admin/debug only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Shop")
	void ForceRotateShop();

	/** Check if rotation should update based on time. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Shop")
	void CheckRotation();

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Max purchases per minute per player (anti-fraud). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 MaxPurchasesPerMinute;

	/** Battle Pass tier skip price in KRC. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 BattlePassTierPrice;

	/** Daily deal count per rotation. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 DailyDealCount;

	/** Featured item count per rotation. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Shop")
	int32 FeaturedItemCount;

	/** Daily rotation interval (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Shop")
	float DailyRotationInterval;

	/** Featured rotation interval (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Shop")
	float FeaturedRotationInterval;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Shop")
	FOnShopRotationUpdated OnShopRotationUpdated;

private:

	/** Current shop rotation. */
	FKhaaosShopRotation CurrentRotation;

	/** Player ownership cache (PlayerEosId → Set of ItemId). */
	TMap<FString, TSet<FString>> PlayerOwnership;

	/** Purchase rate tracker (PlayerEosId → timestamps). */
	TMap<FString, TArray<float>> PurchaseTimestamps;

	/** All possible shop items pool. */
	TArray<FKhaaosShopItem> ItemPool;

	/** Generate a new rotation. */
	void GenerateRotation();

	/** Check purchase rate limit. */
	bool IsPurchaseRateLimited(const FString& PlayerEosId) const;

	/** Record purchase timestamp. */
	void RecordPurchase(const FString& PlayerEosId);
};
