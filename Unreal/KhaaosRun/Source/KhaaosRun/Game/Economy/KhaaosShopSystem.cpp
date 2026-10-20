// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Economy/KhaaosShopSystem.h"
#include "Game/Economy/KhaaosEconomySync.h"
#include "KhaaosRun.h"
#include "Engine/World.h"
#include "Math/UnrealMathUtility.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosShopSystem::UKhaaosShopSystem()
{
	PrimaryComponentTick.bCanEverTick = false;

	MaxPurchasesPerMinute    = 10;
	BattlePassTierPrice      = 150;
	DailyDealCount           = 6;
	FeaturedItemCount        = 10;
	DailyRotationInterval    = 86400.0f;   // 24h
	FeaturedRotationInterval = 604800.0f;  // 7d
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosShopSystem::InitializeComponent()
{
	Super::InitializeComponent();

	// Initialize item pool with all available cosmetic items
	// In production, this loads from UPrimaryDataAsset
	ItemPool.Reserve(50);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosShopSystem: Initialized with %d items in pool"), ItemPool.Num());

	// Generate initial rotation
	GenerateRotation();
}

// ─── Shop Queries ───────────────────────────────────────────────────────────────

TArray<FKhaaosShopItem> UKhaaosShopSystem::GetAvailableItems() const
{
	TArray<FKhaaosShopItem> Result;
	Result.Append(CurrentRotation.DailyDeals);
	Result.Append(CurrentRotation.FeaturedItems);

	// Filter out expired items
	int64 Now = FDateTime::UtcNow().ToUnixTimestamp();
	Result.RemoveAll([Now](const FKhaaosShopItem& Item)
	{
		return Item.AvailableUntil > 0 && Item.AvailableUntil < Now;
	});

	return Result;
}

bool UKhaaosShopSystem::DoesPlayerOwn(const FString& PlayerEosId, const FString& ItemId) const
{
	const TSet<FString>* Owned = PlayerOwnership.Find(PlayerEosId);
	return Owned && Owned->Contains(ItemId);
}

int32 UKhaaosShopSystem::GetEffectivePrice(const FKhaaosShopItem& Item)
{
	if (Item.DiscountPercent <= 0) return Item.KrcPrice;
	float Multiplier = 1.0f - (static_cast<float>(Item.DiscountPercent) / 100.0f);
	return FMath::Max(1, FMath::RoundToInt(static_cast<float>(Item.KrcPrice) * Multiplier));
}

// ─── Purchase ───────────────────────────────────────────────────────────────────

void UKhaaosShopSystem::PurchaseItem(const FString& PlayerEosId, const FString& ItemId, const FOnShopPurchaseResult& Callback)
{
	// Rate limit check
	if (IsPurchaseRateLimited(PlayerEosId))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosShopSystem: Purchase rate limited for %s"), *PlayerEosId);
		Callback.ExecuteIfBound(false, ItemId);
		return;
	}

	// Ownership check
	if (DoesPlayerOwn(PlayerEosId, ItemId))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosShopSystem: Player %s already owns %s"), *PlayerEosId, *ItemId);
		Callback.ExecuteIfBound(false, ItemId);
		return;
	}

	// Find item in current rotation
	FKhaaosShopItem* ShopItem = nullptr;
	for (auto& Item : CurrentRotation.DailyDeals)
	{
		if (Item.ItemId == ItemId) { ShopItem = &Item; break; }
	}
	if (!ShopItem)
	{
		for (auto& Item : CurrentRotation.FeaturedItems)
		{
			if (Item.ItemId == ItemId) { ShopItem = &Item; break; }
		}
	}

	if (!ShopItem)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosShopSystem: Item %s not in current rotation"), *ItemId);
		Callback.ExecuteIfBound(false, ItemId);
		return;
	}

	// Stock check
	if (ShopItem->StockRemaining == 0)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosShopSystem: Item %s out of stock"), *ItemId);
		Callback.ExecuteIfBound(false, ItemId);
		return;
	}

	// Compute effective price
	int32 Price = GetEffectivePrice(*ShopItem);

	// TODO: Call KhaaosEconomySync::DeductKRC and wait for callback
	// For now, assume success and grant ownership
	TSet<FString>& Owned = PlayerOwnership.FindOrAdd(PlayerEosId);
	Owned.Add(ItemId);

	// Decrement stock
	if (ShopItem->StockRemaining > 0)
	{
		ShopItem->StockRemaining--;
	}

	RecordPurchase(PlayerEosId);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosShopSystem: %s purchased %s for %d KRC"), *PlayerEosId, *ItemId, Price);
	Callback.ExecuteIfBound(true, ItemId);
}

// ─── Rotation ───────────────────────────────────────────────────────────────────

void UKhaaosShopSystem::ForceRotateShop()
{
	GenerateRotation();
	OnShopRotationUpdated.Broadcast(CurrentRotation);
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosShopSystem: Shop rotation forced"));
}

void UKhaaosShopSystem::CheckRotation()
{
	int64 Now = FDateTime::UtcNow().ToUnixTimestamp();
	if (Now >= CurrentRotation.NextRotation)
	{
		GenerateRotation();
		OnShopRotationUpdated.Broadcast(CurrentRotation);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosShopSystem: Shop auto-rotated"));
	}
}

// ─── Private ────────────────────────────────────────────────────────────────────

void UKhaaosShopSystem::GenerateRotation()
{
	int64 Now = FDateTime::UtcNow().ToUnixTimestamp();
	CurrentRotation.RotationStart = Now;
	CurrentRotation.NextRotation = Now + static_cast<int64>(DailyRotationInterval);

	CurrentRotation.DailyDeals.Empty();
	CurrentRotation.FeaturedItems.Empty();

	if (ItemPool.Num() == 0) return;

	// Shuffle and pick daily deals
	TArray<int32> Indices;
	for (int32 i = 0; i < ItemPool.Num(); ++i) Indices.Add(i);

	// Fisher-Yates shuffle (deterministic with seed)
	int32 Seed = static_cast<int32>(Now % 2147483647);
	FRandomStream RNG(Seed);
	for (int32 i = Indices.Num() - 1; i > 0; --i)
	{
		int32 J = RNG.RandRange(0, i);
		Indices.Swap(i, J);
	}

	// Pick daily deals (first N)
	int32 DailyCount = FMath::Min(DailyDealCount, Indices.Num());
	for (int32 i = 0; i < DailyCount; ++i)
	{
		FKhaaosShopItem Deal = ItemPool[Indices[i]];
		Deal.bIsDailyDeal = true;
		Deal.bIsFeatured = false;
		Deal.AvailableUntil = Now + static_cast<int64>(DailyRotationInterval);
		// Random discount 10-50%
		Deal.DiscountPercent = RNG.RandRange(1, 5) * 10;
		CurrentRotation.DailyDeals.Add(Deal);
	}

	// Pick featured items (next M)
	int32 FeaturedCount = FMath::Min(FeaturedItemCount, Indices.Num() - DailyCount);
	for (int32 i = 0; i < FeaturedCount; ++i)
	{
		FKhaaosShopItem Featured = ItemPool[Indices[DailyCount + i]];
		Featured.bIsDailyDeal = false;
		Featured.bIsFeatured = true;
		Featured.AvailableUntil = Now + static_cast<int64>(FeaturedRotationInterval);
		Featured.DiscountPercent = 0; // No discount on featured
		CurrentRotation.FeaturedItems.Add(Featured);
	}
}

bool UKhaaosShopSystem::IsPurchaseRateLimited(const FString& PlayerEosId) const
{
	const TArray<float>* Timestamps = PurchaseTimestamps.Find(PlayerEosId);
	if (!Timestamps) return false;

	float Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
	int32 RecentCount = 0;
	for (float Ts : *Timestamps)
	{
		if (Now - Ts < 60.0f) ++RecentCount;
	}
	return RecentCount >= MaxPurchasesPerMinute;
}

void UKhaaosShopSystem::RecordPurchase(const FString& PlayerEosId)
{
	TArray<float>& Timestamps = PurchaseTimestamps.FindOrAdd(PlayerEosId);
	float Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
	Timestamps.Add(Now);

	// Clean old entries (older than 2 minutes)
	Timestamps.RemoveAll([Now](float Ts) { return Now - Ts > 120.0f; });
}
