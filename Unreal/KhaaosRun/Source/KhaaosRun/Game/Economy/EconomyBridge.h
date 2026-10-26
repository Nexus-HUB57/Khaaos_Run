// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Http.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "EconomyBridge.generated.h"

// ─── Economy Data Types (from EconomyEngine.ts) ───────────────────────────────

/**
 * FMarketQuote
 * Ported from EconomyEngine.ts MarketQuote interface.
 */
USTRUCT(BlueprintType)
struct FMarketQuote
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	FString ItemName;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	FString ItemType;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	FString Rarity;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 BaseKrc = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 SupplyAdjustedKrc = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 BurnAmount = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 NetMint = 0;
};

/**
 * FEconomyHealth
 * Ported from EconomyEngine.ts EconomyHealth interface.
 */
USTRUCT(BlueprintType)
struct FEconomyHealth
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int64 TotalKrcInCirculation = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 EstimatedDailyMint = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 EstimatedDailyBurn = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 NetFlow = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	FString Status; // HEALTHY | INFLATIONARY | DEFLATIONARY | CRITICAL

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	FString Recommendation;
};

/**
 * FMonteCarloConfig
 * Ported from MonteCarloEconomy.ts MonteCarloConfig interface.
 */
USTRUCT(BlueprintType)
struct FMonteCarloConfig
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 Agents = 200;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 Days = 30;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 Seed = 0;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	float BuyProbability = 0.45f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
	float LoanProbability = 0.08f;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnPricesReceived, bool, bSuccess, const TArray<FMarketQuote>&, Quotes);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnSimulationReceived, bool, bSuccess, const FEconomyHealth&, Health);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnHealthReceived, bool, bSuccess, const FEconomyHealth&, Health);

/**
 * UEconomyBridgeSubsystem
 *
 * HTTP bridge to Node.js Economy API.
 * Provides async access to price discovery, Monte Carlo simulation,
 * and economy health probes.
 *
 * Endpoints (from Node.js server routes):
 *   /api/economy/prices     — price discovery for items
 *   /api/economy/simulate   — Monte Carlo balance simulation
 *   /api/economy/health     — economy health diagnostic
 *
 * Features:
 *   - Async request handling with delegates for callbacks
 *   - Caching layer for frequently accessed prices (TTL-based)
 *   - Automatic retry on failure
 *   - Rate limiting to prevent API flooding
 */
UCLASS(Abstract)
class UEconomyBridgeSubsystem : public UEngineSubsystem
{
	GENERATED_BODY()

public:
	UEconomyBridgeSubsystem();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── API Calls ──────────────────────────────────────────────────────────

	/**
	 * Fetch market prices from /api/economy/prices.
	 * Results returned via delegate callback.
	 * Cached locally with configurable TTL.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy")
	void RequestPrices(const FOnPricesReceived& Callback);

	/**
	 * Run Monte Carlo simulation via /api/economy/simulate.
	 * Results returned via delegate callback.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy")
	void RequestSimulation(const FMonteCarloConfig& Config, const FOnSimulationReceived& Callback);

	/**
	 * Probe economy health via /api/economy/health.
	 * Results returned via delegate callback.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy")
	void RequestHealthProbe(const FOnHealthReceived& Callback);

	// ─── Local Price Computation ────────────────────────────────────────────

	/**
	 * Compute a market quote locally (ported from EconomyEngine.ts quoteItem).
	 * Uses cached supply data. Falls back to base price if no cache.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy")
	FMarketQuote ComputeQuote(const FString& ItemType, const FString& Rarity, int32 CirculatingCount, const FString& ItemName = TEXT("Item"));

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Base URL for the Node.js Economy API. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	FString ApiBaseUrl;

	/** Cache TTL for price data (seconds). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	float PriceCacheTtl;

	/** Maximum concurrent HTTP requests. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 MaxConcurrentRequests;

	/** Request timeout (seconds). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	float RequestTimeout;

	// ─── Economy Config (from EconomyEngine.ts EconomyConfig) ───────────────

	/** Burn rate on purchase (0.35 from EconomyEngine). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	float BurnRateOnPurchase;

	/** Supply pressure factor (40 from EconomyEngine). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	float SupplyPressureFactor;

	/** Loan daily interest rate (0.04 from EconomyEngine). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	float LoanDailyInterest;

	/** Max open loans per player (2 from EconomyEngine). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy")
	int32 MaxOpenLoans;

private:

	/** HTTP request manager. */
	FHttpModule* HttpModule;

	/** Cached market quotes (ItemType:Rarity → Quote + Timestamp). */
	struct FCachedQuote
	{
		FMarketQuote Quote;
		double CacheTimestamp;
	};
	TMap<FString, FCachedQuote> PriceCache;

	/** Base prices by item type (from EconomyConfig.basePrice). */
	TMap<FString, int32> BasePrices;

	/** Rarity multipliers (from EconomyConfig.rarityMultiplier). */
	TMap<FString, float> RarityMultipliers;

	/** Number of active HTTP requests. */
	int32 ActiveRequestCount;

	/** Initialize economy config from EconomyEngine.ts defaults. */
	void InitEconomyConfig();

	/** Send HTTP GET request. */
	void SendGetRequest(const FString& Endpoint, TFunction<void(bool, const FString&)> Callback);

	/** Send HTTP POST request with JSON body. */
	void SendPostRequest(const FString& Endpoint, const FString& JsonBody, TFunction<void(bool, const FString&)> Callback);

	/** Check and expire stale cache entries. */
	void ExpireCache();

	/** Parse prices JSON response into FMarketQuote array. */
	bool ParsePricesResponse(const FString& Json, TArray<FMarketQuote>& OutQuotes);

	/** Parse health JSON response into FEconomyHealth. */
	bool ParseHealthResponse(const FString& Json, FEconomyHealth& OutHealth);
};
