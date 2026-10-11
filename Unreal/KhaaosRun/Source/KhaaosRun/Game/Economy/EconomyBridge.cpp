// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Economy/EconomyBridge.h"
#include "KhaaosRun.h"

#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "JsonUtilities.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UEconomyBridgeSubsystem::UEconomyBridgeSubsystem()
{
        // ── Default configuration (from EconomyEngine.ts EconomyConfig) ──
        ApiBaseUrl            = TEXT("http://localhost:3001");
        PriceCacheTtl         = 300.0f;   // 5 minutes
        MaxConcurrentRequests = 5;
        RequestTimeout        = 10.0f;

        // ── Economy config ──
        BurnRateOnPurchase   = 0.35f;
        SupplyPressureFactor = 40.0f;
        LoanDailyInterest    = 0.04f;
        MaxOpenLoans         = 2;

        HttpModule          = nullptr;
        ActiveRequestCount  = 0;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UEconomyBridgeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        HttpModule = &FHttpModule::Get();

        InitEconomyConfig();

        UE_LOG(LogKhaaosRun, Log, TEXT("EconomyBridgeSubsystem: Initialized (API: %s)"), *ApiBaseUrl);
}

void UEconomyBridgeSubsystem::Deinitialize()
{
        PriceCache.Empty();
        BasePrices.Empty();
        RarityMultipliers.Empty();
        ActiveRequestCount = 0;

        Super::Deinitialize();

        UE_LOG(LogKhaaosRun, Log, TEXT("EconomyBridgeSubsystem: Deinitialized"));
}

// ─── API Calls ──────────────────────────────────────────────────────────────────

void UEconomyBridgeSubsystem::RequestPrices(const FOnPricesReceived& Callback)
{
        ExpireCache();

        // If we have fresh cache, return immediately
        if (PriceCache.Num() > 0)
        {
                TArray<FMarketQuote> CachedQuotes;
                for (const auto& Pair : PriceCache)
                {
                        CachedQuotes.Add(Pair.Value.Quote);
                }
                if (Callback.IsBound())
                {
                        Callback.Execute(true, CachedQuotes);
                }
                return;
        }

        // Rate limit check
        if (ActiveRequestCount >= MaxConcurrentRequests)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: Rate limited (%d active requests)"), ActiveRequestCount);
                if (Callback.IsBound())
                {
                        TArray<FMarketQuote> Empty;
                        Callback.Execute(false, Empty);
                }
                return;
        }

        SendGetRequest(TEXT("/api/economy/prices"),
                [this, Callback](bool bSuccess, const FString& Response)
                {
                        TArray<FMarketQuote> Quotes;
                        if (bSuccess && ParsePricesResponse(Response, Quotes))
                        {
                                // Cache the results
                                double Now = FPlatformTime::Seconds();
                                for (const FMarketQuote& Quote : Quotes)
                                {
                                        FString Key = Quote.ItemType + TEXT(":") + Quote.Rarity;
                                        FCachedQuote Cached;
                                        Cached.Quote = Quote;
                                        Cached.CacheTimestamp = Now;
                                        PriceCache.Add(Key, Cached);
                                }
                                if (Callback.IsBound())
                                {
                                        Callback.Execute(true, Quotes);
                                }
                        }
                        else
                        {
                                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: Failed to parse prices response"));
                                if (Callback.IsBound())
                                {
                                        Callback.Execute(false, Quotes);
                                }
                        }
                }
        );
}

void UEconomyBridgeSubsystem::RequestSimulation(const FMonteCarloConfig& Config, const FOnSimulationReceived& Callback)
{
        if (ActiveRequestCount >= MaxConcurrentRequests)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: Rate limited for simulation request"));
                if (Callback.IsBound())
                {
                        FEconomyHealth Empty;
                        Callback.Execute(false, Empty);
                }
                return;
        }

        // Build JSON body
        FString JsonBody = FString::Printf(TEXT(
                "{\"agents\":%d,\"days\":%d,\"seed\":%d,\"buyProbability\":%.4f,\"loanProbability\":%.4f}"),
                Config.Agents, Config.Days, Config.Seed,
                Config.BuyProbability, Config.LoanProbability);

        SendPostRequest(TEXT("/api/economy/simulate"), JsonBody,
                [this, Callback](bool bSuccess, const FString& Response)
                {
                        FEconomyHealth Health;
                        if (bSuccess && ParseHealthResponse(Response, Health))
                        {
                                if (Callback.IsBound())
                                {
                                        Callback.Execute(true, Health);
                                }
                        }
                        else
                        {
                                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: Failed to parse simulation response"));
                                if (Callback.IsBound())
                                {
                                        Callback.Execute(false, Health);
                                }
                        }
                }
        );
}

void UEconomyBridgeSubsystem::RequestHealthProbe(const FOnHealthReceived& Callback)
{
        if (ActiveRequestCount >= MaxConcurrentRequests)
        {
                if (Callback.IsBound())
                {
                        FEconomyHealth Empty;
                        Callback.Execute(false, Empty);
                }
                return;
        }

        SendGetRequest(TEXT("/api/economy/health"),
                [this, Callback](bool bSuccess, const FString& Response)
                {
                        FEconomyHealth Health;
                        if (bSuccess && ParseHealthResponse(Response, Health))
                        {
                                if (Callback.IsBound())
                                {
                                        Callback.Execute(true, Health);
                                }
                        }
                        else
                        {
                                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: Failed to parse health response"));
                                if (Callback.IsBound())
                                {
                                        Callback.Execute(false, Health);
                                }
                        }
                }
        );
}

// ─── Local Price Computation ────────────────────────────────────────────────────

FMarketQuote UEconomyBridgeSubsystem::ComputeQuote(const FString& ItemType, const FString& Rarity, int32 CirculatingCount, const FString& ItemName)
{
        FMarketQuote Quote;
        Quote.ItemName = ItemName;
        Quote.ItemType = ItemType;
        Quote.Rarity = Rarity;

        // Base price from config
        int32 BasePrice = 100;
        if (const int32* Found = BasePrices.Find(ItemType))
        {
                BasePrice = *Found;
        }

        // Rarity multiplier
        float RarityMult = 1.0f;
        if (const float* Found = RarityMultipliers.Find(Rarity))
        {
                RarityMult = *Found;
        }

        // Supply pressure: supplyPressureFactor / (circulating + supplyPressureFactor)
        // From EconomyEngine.ts: basePrice * rarityMult * (1 + supplyPressure)
        float SupplyPressure = 0.0f;
        if (CirculatingCount > 0)
        {
                SupplyPressure = SupplyPressureFactor / (static_cast<float>(CirculatingCount) + SupplyPressureFactor);
        }

        Quote.BaseKrc = FMath::RoundToInt(BasePrice * RarityMult);
        Quote.SupplyAdjustedKrc = FMath::RoundToInt(Quote.BaseKrc * (1.0f + SupplyPressure));

        // Burn amount on purchase
        Quote.BurnAmount = FMath::RoundToInt(Quote.SupplyAdjustedKrc * BurnRateOnPurchase);

        // Net mint = supply adjusted - burn
        Quote.NetMint = Quote.SupplyAdjustedKrc - Quote.BurnAmount;

        // Cache the result
        FString Key = ItemType + TEXT(":") + Rarity;
        FCachedQuote Cached;
        Cached.Quote = Quote;
        Cached.CacheTimestamp = FPlatformTime::Seconds();
        PriceCache.Add(Key, Cached);

        return Quote;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UEconomyBridgeSubsystem::InitEconomyConfig()
{
        // Base prices from EconomyEngine.ts EconomyConfig.basePrice
        BasePrices.Empty();
        BasePrices.Add(TEXT("Arma"),      200);
        BasePrices.Add(TEXT("Defesa"),    150);
        BasePrices.Add(TEXT("Curativo"),   80);
        BasePrices.Add(TEXT("Utilidade"), 120);
        BasePrices.Add(TEXT("Recurso"),    50);

        // Rarity multipliers from EconomyConfig.rarityMultiplier
        RarityMultipliers.Empty();
        RarityMultipliers.Add(TEXT("COMUM"),     1.0f);
        RarityMultipliers.Add(TEXT("INCOMUM"),   1.5f);
        RarityMultipliers.Add(TEXT("RARO"),      2.5f);
        RarityMultipliers.Add(TEXT("EPICO"),     5.0f);
        RarityMultipliers.Add(TEXT("LENDARIO"), 12.0f);
        RarityMultipliers.Add(TEXT("MITICO"),  25.0f);
}

void UEconomyBridgeSubsystem::SendGetRequest(const FString& Endpoint, TFunction<void(bool, const FString&)> Callback)
{
        if (!HttpModule)
        {
                Callback(false, TEXT(""));
                return;
        }

        FString Url = ApiBaseUrl + Endpoint;

        TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = HttpModule->CreateRequest();
        Request->SetURL(Url);
        Request->SetVerb(TEXT("GET"));
        Request->SetTimeout(RequestTimeout);
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

        ActiveRequestCount++;

        Request->OnProcessRequestComplete().BindLambda(
                [this, Callback](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bWasSuccessful)
                {
                        ActiveRequestCount = FMath::Max(0, ActiveRequestCount - 1);

                        if (bWasSuccessful && Resp.IsValid() && Resp->GetResponseCode() == 200)
                        {
                                Callback(true, Resp->GetContentAsString());
                        }
                        else
                        {
                                int32 Code = Resp.IsValid() ? Resp->GetResponseCode() : 0;
                                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: GET request failed (code=%d)"), Code);
                                Callback(false, TEXT(""));
                        }
                }
        );

        Request->ProcessRequest();
}

void UEconomyBridgeSubsystem::SendPostRequest(const FString& Endpoint, const FString& JsonBody, TFunction<void(bool, const FString&)> Callback)
{
        if (!HttpModule)
        {
                Callback(false, TEXT(""));
                return;
        }

        FString Url = ApiBaseUrl + Endpoint;

        TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = HttpModule->CreateRequest();
        Request->SetURL(Url);
        Request->SetVerb(TEXT("POST"));
        Request->SetContentAsString(JsonBody);
        Request->SetTimeout(RequestTimeout);
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

        ActiveRequestCount++;

        Request->OnProcessRequestComplete().BindLambda(
                [this, Callback](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bWasSuccessful)
                {
                        ActiveRequestCount = FMath::Max(0, ActiveRequestCount - 1);

                        if (bWasSuccessful && Resp.IsValid() && Resp->GetResponseCode() == 200)
                        {
                                Callback(true, Resp->GetContentAsString());
                        }
                        else
                        {
                                int32 Code = Resp.IsValid() ? Resp->GetResponseCode() : 0;
                                UE_LOG(LogKhaaosRun, Warning, TEXT("EconomyBridge: POST request failed (code=%d)"), Code);
                                Callback(false, TEXT(""));
                        }
                }
        );

        Request->ProcessRequest();
}

void UEconomyBridgeSubsystem::ExpireCache()
{
        double Now = FPlatformTime::Seconds();
        TArray<FString> KeysToRemove;

        for (const auto& Pair : PriceCache)
        {
                if ((Now - Pair.Value.CacheTimestamp) > PriceCacheTtl)
                {
                        KeysToRemove.Add(Pair.Key);
                }
        }

        for (const FString& Key : KeysToRemove)
        {
                PriceCache.Remove(Key);
        }
}

bool UEconomyBridgeSubsystem::ParsePricesResponse(const FString& Json, TArray<FMarketQuote>& OutQuotes)
{
        TSharedPtr<FJsonObject> RootObject;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);

        if (!FJsonSerializer::Deserialize(Reader, RootObject) || !RootObject.IsValid())
        {
                return false;
        }

        const TArray<TSharedPtr<FJsonValue>>* PricesArray;
        if (!RootObject->TryGetArrayField(TEXT("prices"), PricesArray))
        {
                return false;
        }

        for (const TSharedPtr<FJsonValue>& PriceValue : *PricesArray)
        {
                TSharedPtr<FJsonObject> PriceObj = PriceValue->AsObject();
                if (!PriceObj.IsValid())
                {
                        continue;
                }

                FMarketQuote Quote;
                Quote.ItemName = PriceObj->GetStringField(TEXT("itemName"));
                Quote.ItemType = PriceObj->GetStringField(TEXT("itemType"));
                Quote.Rarity   = PriceObj->GetStringField(TEXT("rarity"));
                Quote.BaseKrc  = PriceObj->GetIntegerField(TEXT("baseKrc"));
                Quote.SupplyAdjustedKrc = PriceObj->GetIntegerField(TEXT("supplyAdjustedKrc"));
                Quote.BurnAmount = PriceObj->GetIntegerField(TEXT("burnAmount"));
                Quote.NetMint   = PriceObj->GetIntegerField(TEXT("netMint"));

                OutQuotes.Add(Quote);
        }

        return OutQuotes.Num() > 0;
}

bool UEconomyBridgeSubsystem::ParseHealthResponse(const FString& Json, FEconomyHealth& OutHealth)
{
        TSharedPtr<FJsonObject> RootObject;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);

        if (!FJsonSerializer::Deserialize(Reader, RootObject) || !RootObject.IsValid())
        {
                return false;
        }

        OutHealth.TotalKrcInCirculation = RootObject->GetNumberField(TEXT("totalKrcInCirculation"));
        OutHealth.EstimatedDailyMint    = RootObject->GetIntegerField(TEXT("estimatedDailyMint"));
        OutHealth.EstimatedDailyBurn    = RootObject->GetIntegerField(TEXT("estimatedDailyBurn"));
        OutHealth.NetFlow               = RootObject->GetIntegerField(TEXT("netFlow"));
        OutHealth.Status                = RootObject->GetStringField(TEXT("status"));
        OutHealth.Recommendation        = RootObject->GetStringField(TEXT("recommendation"));

        return true;
}
