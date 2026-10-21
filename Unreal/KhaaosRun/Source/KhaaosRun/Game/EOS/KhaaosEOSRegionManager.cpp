// KhaaosEOSRegionManager Implementation

#include "Game/EOS/KhaaosEOSRegionManager.h"
#include "HAL/PlatformProcess.h"

void UKhaaosEOSRegionManager::Initialize(FSubsystemCollectionInitializationContext& Context)
{
    Super::Initialize(Context);
    LoadRegionConfig();
}

void UKhaaosEOSRegionManager::LoadRegionConfig()
{
    Regions.Empty();

    // Region sa1: South America (São Paulo)
    FKhaaosEOSRegion SA1;
    SA1.RegionId = TEXT("sa1");
    SA1.RegionName = TEXT("South America - Sao Paulo");
    SA1.Endpoint = TEXT("eos-sa1.epicgames.com");
    SA1.Latitude = -23.5505;
    SA1.Longitude = -46.6333;
    SA1.MaxLobbySize = 100;
    SA1.MaxPlayersPerServer = 50;
    SA1.MatchmakingPool = TEXT("KR_SA1");
    SA1.bEnabled = true;
    SA1.PingThreshold = 150;
    Regions.Add(SA1);

    // Region na1: North America (Virginia)
    FKhaaosEOSRegion NA1;
    NA1.RegionId = TEXT("na1");
    NA1.RegionName = TEXT("North America - Virginia");
    NA1.Endpoint = TEXT("eos-na1.epicgames.com");
    NA1.Latitude = 37.4316;
    NA1.Longitude = -78.6569;
    NA1.MaxLobbySize = 100;
    NA1.MaxPlayersPerServer = 50;
    NA1.MatchmakingPool = TEXT("KR_NA1");
    NA1.bEnabled = true;
    NA1.PingThreshold = 100;
    Regions.Add(NA1);

    // Region eu1: Europe (Frankfurt)
    FKhaaosEOSRegion EU1;
    EU1.RegionId = TEXT("eu1");
    EU1.RegionName = TEXT("Europe - Frankfurt");
    EU1.Endpoint = TEXT("eos-eu1.epicgames.com");
    EU1.Latitude = 50.1109;
    EU1.Longitude = 8.6821;
    EU1.MaxLobbySize = 100;
    EU1.MaxPlayersPerServer = 50;
    EU1.MatchmakingPool = TEXT("KR_EU1");
    EU1.bEnabled = true;
    EU1.PingThreshold = 100;
    Regions.Add(EU1);

    UE_LOG(LogTemp, Log, TEXT("[EOS] Region Manager initialized — %d regions"), Regions.Num());
}

FKhaaosEOSRegion UKhaaosEOSRegionManager::GetBestRegion(ERegionSelectionStrategy Strategy) const
{
    if (Strategy == ERegionSelectionStrategy::Manual && !ManualRegionId.IsEmpty())
    {
        return GetRegion(ManualRegionId);
    }

    TArray<FKhaaosEOSRegion> EnabledRegions;
    for (const FKhaaosEOSRegion& Region : Regions)
    {
        if (Region.bEnabled) EnabledRegions.Add(Region);
    }

    if (EnabledRegions.Num() == 0)
    {
        return Regions[0]; // Fallback
    }

    switch (Strategy)
    {
    case ERegionSelectionStrategy::LowestPing:
        EnabledRegions.Sort([](const FKhaaosEOSRegion& A, const FKhaaosEOSRegion& B)
            { return A.CurrentPingMs < B.CurrentPingMs; });
        break;

    case ERegionSelectionStrategy::PlayerCount:
        EnabledRegions.Sort([](const FKhaaosEOSRegion& A, const FKhaaosEOSRegion& B)
            { return A.CurrentPlayers > B.CurrentPlayers; });
        break;

    case ERegionSelectionStrategy::ClosestGeo:
        // Would need player geo-location — default to ping
        EnabledRegions.Sort([](const FKhaaosEOSRegion& A, const FKhaaosEOSRegion& B)
            { return A.CurrentPingMs < B.CurrentPingMs; });
        break;

    default:
        break;
    }

    return EnabledRegions[0];
}

FKhaaosEOSRegion UKhaaosEOSRegionManager::GetRegion(const FString& RegionId) const
{
    for (const FKhaaosEOSRegion& Region : Regions)
    {
        if (Region.RegionId == RegionId) return Region;
    }
    return Regions[0]; // Fallback
}

void UKhaaosEOSRegionManager::SetManualRegion(const FString& RegionId)
{
    ManualRegionId = RegionId;
    SelectionStrategy = ERegionSelectionStrategy::Manual;
}

void UKhaaosEOSRegionManager::MeasureAllRegionPings()
{
    for (FKhaaosEOSRegion& Region : Regions)
    {
        Region.CurrentPingMs = MeasureRegionPing(Region.RegionId);
    }
}

int32 UKhaaosEOSRegionManager::MeasureRegionPing(const FString& RegionId) const
{
    // ICMP ping measurement — platform dependent
    // On Linux: use FPlatformProcess::ExecProcess("ping -c 1 -W 2 <endpoint>")
    // For now, return a simulated value based on geographic proximity
    // Real implementation uses EOS Ping API
    for (const FKhaaosEOSRegion& Region : Regions)
    {
        if (Region.RegionId == RegionId)
        {
            // Simulated ping (replace with real EOS ping in production)
            if (RegionId == TEXT("sa1")) return 30;   // Local (BR)
            if (RegionId == TEXT("na1")) return 120;  // US East
            if (RegionId == TEXT("eu1")) return 180;  // EU
        }
    }
    return 999;
}

void UKhaaosEOSRegionManager::UpdateRegionPlayerCount(const FString& RegionId, int32 PlayerCount)
{
    for (FKhaaosEOSRegion& Region : Regions)
    {
        if (Region.RegionId == RegionId)
        {
            Region.CurrentPlayers = PlayerCount;
            return;
        }
    }
}

int32 UKhaaosEOSRegionManager::GetTotalPlayers() const
{
    int32 Total = 0;
    for (const FKhaaosEOSRegion& Region : Regions)
    {
        Total += Region.CurrentPlayers;
    }
    return Total;
}
