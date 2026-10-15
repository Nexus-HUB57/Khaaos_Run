// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#include "Game/Network/KhaaosNetDriverConfig.h"

#include "Net/UnrealNetwork.h"
#include "Engine/NetConnection.h"
#include "GameFramework/GameModeBase.h"
#include "Misc/ConfigCacheIni.h"

// ─── Log Category ──────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosNetDriver, Log, All);

// ─── Constructor ───────────────────────────────────────────────────────────────

UKhaaosNetDriverConfig::UKhaaosNetDriverConfig()
    : MaxClientUpdateRate(60)
    , MaxServerTickRate(30)
    , NetServerMaxTickRate(30)
    , bIrisSupport(true)
    , bIrisEnableReplicationLog(false)
    , MaxTotalBandwidth(524288) // 512 KB/s
{
    // Initialize connection quality defaults for dedicated server
    ConnectionQuality.InitialTimeout = 30.0f;
    ConnectionQuality.HangTimeout = 180.0f;
    ConnectionQuality.KeepAliveInterval = 0.5f;
    ConnectionQuality.MaxConnections = 100;
    ConnectionQuality.MaxPacketsPerSecond = 300;

    // Initialize packet settings
    PacketSettings.MaxPacketSize = 1024;
    PacketSettings.MaxNetTickRate = 30;
    PacketSettings.bEnableCompression = false;
    PacketSettings.bEnableEncryption = false;

    // Initialize per-world configs
    InitPerWorldConfigs();

    UE_LOG(LogKhaaosNetDriver, Log, TEXT("KhaaosNetDriverConfig: Constructed — MaxClientUpdateRate=%d MaxServerTickRate=%d Iris=%s"),
        MaxClientUpdateRate, MaxServerTickRate, bIrisSupport ? TEXT("ON") : TEXT("OFF"));
    UE_LOG(LogKhaaosNetDriver, Log, TEXT("  Connection: InitialTimeout=%.1fs HangTimeout=%.1fs MaxConnections=%d"),
        ConnectionQuality.InitialTimeout, ConnectionQuality.HangTimeout, ConnectionQuality.MaxConnections);
    UE_LOG(LogKhaaosNetDriver, Log, TEXT("  Packet: MaxSize=%d MaxTickRate=%d Compression=%s Encryption=%s"),
        PacketSettings.MaxPacketSize, PacketSettings.MaxNetTickRate,
        PacketSettings.bEnableCompression ? TEXT("ON") : TEXT("OFF"),
        PacketSettings.bEnableEncryption ? TEXT("ON") : TEXT("OFF"));
}

// ─── UNetDriver Interface ──────────────────────────────────────────────────────

void UKhaaosNetDriverConfig::InitConnection(UNetConnection* Connection)
{
    if (!Connection)
    {
        return;
    }

    // Apply rate limiting settings to the connection
    Connection->MaxPacket = PacketSettings.MaxPacketSize;

    // Set connection timeout values
    Connection->TimeOut = ConnectionQuality.InitialTimeout;
    Connection->HangTimeOut = ConnectionQuality.HangTimeout;
    Connection->KeepAlive = ConnectionQuality.KeepAliveInterval;

    UE_LOG(LogKhaaosNetDriver, Verbose, TEXT("KhaaosNetDriverConfig: InitConnection — %s (MaxPacket=%d Timeout=%.1fs)"),
        *Connection->RemoteAddressToString(), PacketSettings.MaxPacketSize, ConnectionQuality.InitialTimeout);
}

bool UKhaaosNetDriverConfig::IsNetResourceAvailable()
{
    // Check if we have bandwidth budget remaining
    UpdateBandwidthEstimate();

    if (EstimatedTotalBandwidth >= MaxTotalBandwidth)
    {
        UE_LOG(LogKhaaosNetDriver, Warning, TEXT("KhaaosNetDriverConfig: IsNetResourceAvailable — bandwidth limit reached (%lld / %lld bytes/s)"),
            EstimatedTotalBandwidth, MaxTotalBandwidth);

        OnBandwidthLimitReached.Broadcast(static_cast<float>(EstimatedTotalBandwidth));
        return false;
    }

    // Check connection count limit
    if (GetServerConnection() && ClientConnections.Num() >= ConnectionQuality.MaxConnections)
    {
        UE_LOG(LogKhaaosNetDriver, Warning, TEXT("KhaaosNetDriverConfig: IsNetResourceAvailable — max connections reached (%d / %d)"),
            ClientConnections.Num(), ConnectionQuality.MaxConnections);
        return false;
    }

    return true;
}

// ─── Configuration ─────────────────────────────────────────────────────────────

void UKhaaosNetDriverConfig::ConfigureForWorld(EWorldSequence World, int32 PlayerCount)
{
    ConfiguredWorld = World;

    // Look up per-world config, or use defaults
    if (const FKhaaosWorldNetConfig* WorldConfig = PerWorldNetConfigs.Find(World))
    {
        CurrentWorldConfig = *WorldConfig;
    }
    else
    {
        // Default config if world not found
        CurrentWorldConfig.MaxClientUpdateRate = MaxClientUpdateRate;
        CurrentWorldConfig.MaxServerTickRate = MaxServerTickRate;
        CurrentWorldConfig.MaxBandwidthPerConnection = 8192;
        CurrentWorldConfig.MaxRelevantActors = 1024;
        CurrentWorldConfig.ExpectedPlayerCount = PlayerCount;
    }

    // Adjust connection limits based on player count
    ConnectionQuality.MaxConnections = FMath::Max(PlayerCount + 10, 60); // +10 for headroom

    // Adjust bandwidth budget based on player count
    MaxTotalBandwidth = static_cast<int64>(CurrentWorldConfig.MaxBandwidthPerConnection) * PlayerCount;

    // Apply tick rate settings
    MaxClientUpdateRate = CurrentWorldConfig.MaxClientUpdateRate;
    MaxServerTickRate = CurrentWorldConfig.MaxServerTickRate;
    NetServerMaxTickRate = CurrentWorldConfig.MaxServerTickRate;

    UE_LOG(LogKhaaosNetDriver, Log, TEXT("KhaaosNetDriverConfig: ConfigureForWorld — %s (players=%d)"),
        *UEnum::GetDisplayValueAsText(World).ToString(), PlayerCount);
    UE_LOG(LogKhaaosNetDriver, Log, TEXT("  ClientRate=%dHz ServerRate=%dHz MaxBW/connection=%d MaxTotalBW=%lld"),
        CurrentWorldConfig.MaxClientUpdateRate, CurrentWorldConfig.MaxServerTickRate,
        CurrentWorldConfig.MaxBandwidthPerConnection, MaxTotalBandwidth);
    UE_LOG(LogKhaaosNetDriver, Log, TEXT("  MaxConnections=%d MaxRelevantActors=%d"),
        ConnectionQuality.MaxConnections, CurrentWorldConfig.MaxRelevantActors);

    // Broadcast configuration change
    OnNetDriverConfigured.Broadcast(World, PlayerCount);
}

bool UKhaaosNetDriverConfig::IsBandwidthLimitReached() const
{
    return EstimatedTotalBandwidth >= MaxTotalBandwidth;
}

// ─── Internal Methods ─────────────────────────────────────────────────────────

void UKhaaosNetDriverConfig::InitPerWorldConfigs()
{
    // ─── Barburhen: 100 players, high bandwidth ──────────────────────────
    FKhaaosWorldNetConfig BarburhenConfig;
    BarburhenConfig.MaxClientUpdateRate = 60;
    BarburhenConfig.MaxServerTickRate = 30;
    BarburhenConfig.MaxBandwidthPerConnection = 12288; // 12 KB/s per connection
    BarburhenConfig.MaxRelevantActors = 1536;
    BarburhenConfig.ExpectedPlayerCount = 100;
    PerWorldNetConfigs.Add(EWorldSequence::Barburhen, BarburhenConfig);

    // ─── CIGKV: 50 players, moderate bandwidth ───────────────────────────
    FKhaaosWorldNetConfig CIGKVConfig;
    CIGKVConfig.MaxClientUpdateRate = 60;
    CIGKVConfig.MaxServerTickRate = 30;
    CIGKVConfig.MaxBandwidthPerConnection = 8192; // 8 KB/s per connection
    CIGKVConfig.MaxRelevantActors = 1024;
    CIGKVConfig.ExpectedPlayerCount = 50;
    PerWorldNetConfigs.Add(EWorldSequence::CIGKV, CIGKVConfig);

    // ─── Ckesalth: Dense, moderate bandwidth ──────────────────────────────
    FKhaaosWorldNetConfig CkesalthConfig;
    CkesalthConfig.MaxClientUpdateRate = 60;
    CkesalthConfig.MaxServerTickRate = 30;
    CkesalthConfig.MaxBandwidthPerConnection = 10240; // 10 KB/s per connection
    CkesalthConfig.MaxRelevantActors = 1280;
    CkesalthConfig.ExpectedPlayerCount = 80;
    PerWorldNetConfigs.Add(EWorldSequence::Ckesalth, CkesalthConfig);

    // ─── Priadus: Standard ───────────────────────────────────────────────
    FKhaaosWorldNetConfig PriadusConfig;
    PriadusConfig.MaxClientUpdateRate = 60;
    PriadusConfig.MaxServerTickRate = 30;
    PriadusConfig.MaxBandwidthPerConnection = 8192;
    PriadusConfig.MaxRelevantActors = 1024;
    PriadusConfig.ExpectedPlayerCount = 60;
    PerWorldNetConfigs.Add(EWorldSequence::Priadus, PriadusConfig);

    // ─── Arukheea: Standard ──────────────────────────────────────────────
    FKhaaosWorldNetConfig ArukheeaConfig;
    ArukheeaConfig.MaxClientUpdateRate = 60;
    ArukheeaConfig.MaxServerTickRate = 30;
    ArukheeaConfig.MaxBandwidthPerConnection = 8192;
    ArukheeaConfig.MaxRelevantActors = 1024;
    ArukheeaConfig.ExpectedPlayerCount = 60;
    PerWorldNetConfigs.Add(EWorldSequence::Arukheea, ArukheeaConfig);

    // Set default current config
    CurrentWorldConfig = CIGKVConfig;

    UE_LOG(LogKhaaosNetDriver, Log, TEXT("KhaaosNetDriverConfig: InitPerWorldConfigs — %d world configs initialized"),
        PerWorldNetConfigs.Num());
}

void UKhaaosNetDriverConfig::UpdateBandwidthEstimate()
{
    EstimatedTotalBandwidth = 0;

    if (ClientConnections.Num() > 0)
    {
        // Estimate bandwidth: average packet rate * packet size * connection count
        const int64 AvgBytesPerConnection = static_cast<int64>(
            ConnectionQuality.MaxPacketsPerSecond * PacketSettings.MaxPacketSize) / 2; // Assume 50% utilization
        EstimatedTotalBandwidth = AvgBytesPerConnection * ClientConnections.Num();
    }
}
