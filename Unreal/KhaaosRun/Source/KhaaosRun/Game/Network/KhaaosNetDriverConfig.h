// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Engine/NetDriver.h"
#include "Game/KhaaosGameMode.h"
#include "KhaaosNetDriverConfig.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UNetConnection;
class UKhaaosNetDriverConfig;

// ─── Network Configuration Per-World ──────────────────────────────────────────

/**
 * FKhaaosWorldNetConfig
 *
 * Per-world network configuration settings.
 * Different worlds have different player counts and bandwidth requirements.
 */
USTRUCT(BlueprintType)
struct FKhaaosWorldNetConfig
{
    GENERATED_BODY()

    /** Maximum client update rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|World")
    int32 MaxClientUpdateRate = 60;

    /** Maximum server tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|World")
    int32 MaxServerTickRate = 30;

    /** Maximum bandwidth per connection (bytes/sec). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|World")
    int32 MaxBandwidthPerConnection = 8192;

    /** Maximum relevant actors per connection. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|World")
    int32 MaxRelevantActors = 1024;

    /** Expected player count for this world. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|World")
    int32 ExpectedPlayerCount = 100;

    FKhaaosWorldNetConfig() = default;
};

// ─── Connection Quality Settings ───────────────────────────────────────────────

/**
 * FKhaaosConnectionQualityConfig
 *
 * Connection quality and timeout settings for the net driver.
 */
USTRUCT(BlueprintType)
struct FKhaaosConnectionQualityConfig
{
    GENERATED_BODY()

    /** Initial connection timeout (seconds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Connection")
    float InitialTimeout = 30.0f;

    /** Connection hang timeout (seconds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Connection")
    float HangTimeout = 180.0f;

    /** Keep-alive interval (seconds). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Connection")
    float KeepAliveInterval = 0.5f;

    /** Maximum number of open connections. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Connection")
    int32 MaxConnections = 100;

    /** Rate limiting: max packets per second per connection. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Connection")
    int32 MaxPacketsPerSecond = 300;

    FKhaaosConnectionQualityConfig() = default;
};

// ─── Packet Settings ───────────────────────────────────────────────────────────

/**
 * FKhaaosPacketConfig
 *
 * Packet-level configuration for the net driver.
 */
USTRUCT(BlueprintType)
struct FKhaaosPacketConfig
{
    GENERATED_BODY()

    /** Maximum packet size (bytes). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Packet")
    int32 MaxPacketSize = 1024;

    /** Maximum net tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Packet")
    int32 MaxNetTickRate = 30;

    /** Whether to enable packet compression. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Packet")
    uint8 bEnableCompression : 1;

    /** Whether to enable packet encryption. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|NetDriver|Packet")
    uint8 bEnableEncryption : 1;

    FKhaaosPacketConfig()
        : MaxPacketSize(1024)
        , MaxNetTickRate(30)
        , bEnableCompression(false)
        , bEnableEncryption(false)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnNetDriverConfigured, EWorldSequence, World, int32, PlayerCount);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnBandwidthLimitReached, float, CurrentBandwidth);

/**
 * UKhaaosNetDriverConfig
 *
 * Custom Net Driver Configuration for Khaaos Run 60-100p Battle Royale.
 *
 * Architecture:
 *   - Extends UNetDriver with Khaaos-specific configuration
 *   - Per-world network config: CIGKV (50p, lower bandwidth) vs Barburhen (100p, higher)
 *   - Connection quality: InitialTimeout=30s, HangTimeout=180s
 *   - Packet settings: MaxPacketSize=1024, MaxNetTickRate=30
 *   - Iris serialization: bIrisSupport=true, bIrisEnableReplicationLog=false
 *   - Rate limiting per connection to prevent bandwidth spikes
 *   - Bandwidth monitoring and throttling
 *
 * Per-World Tuning:
 *   - Barburhen: 100 players, higher bandwidth (12KB/s per connection)
 *   - CIGKV: 50 players, lower bandwidth (8KB/s per connection)
 *   - Ckesalth: Dense, moderate bandwidth (10KB/s per connection)
 *
 * Integration:
 *   - Configured in DefaultEngine.ini as NetDriverDefinition
 *   - GameMode calls ConfigureForWorld() on world transition
 *   - ReplicationGraph reads bandwidth limits from this config
 *   - Connection rate limiting enforced in InitConnection()
 */
UCLASS(Config=Engine, defaultconfig, Transient)
class UKhaaosNetDriverConfig : public UNetDriver
{
    GENERATED_BODY()

public:
    UKhaaosNetDriverConfig();

    // ─── UNetDriver Interface ─────────────────────────────────────────────

    virtual void InitConnection(UNetConnection* Connection) override;
    virtual bool IsNetResourceAvailable() override;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Configure network settings for a specific world. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|NetDriver")
    void ConfigureForWorld(EWorldSequence World, int32 PlayerCount = 100);

    /** Get current world network config. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|NetDriver")
    FKhaaosWorldNetConfig GetCurrentWorldConfig() const { return CurrentWorldConfig; }

    /** Get connection quality settings. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|NetDriver")
    FKhaaosConnectionQualityConfig GetConnectionQualityConfig() const { return ConnectionQuality; }

    /** Get packet settings. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|NetDriver")
    FKhaaosPacketConfig GetPacketConfig() const { return PacketSettings; }

    /** Check if bandwidth limit is reached. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|NetDriver")
    bool IsBandwidthLimitReached() const;

    /** Get current estimated total bandwidth (bytes/sec). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|NetDriver")
    int64 GetCurrentBandwidthEstimate() const { return EstimatedTotalBandwidth; }

    // ─── Settings ───────────────────────────────────────────────────────────

    /** Maximum client update rate (Hz). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Rate")
    int32 MaxClientUpdateRate = 60;

    /** Maximum server tick rate (Hz). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Rate")
    int32 MaxServerTickRate = 30;

    /** NetServerMaxTickRate (engine cvar override). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Rate")
    int32 NetServerMaxTickRate = 30;

    /** Connection quality settings. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Connection")
    FKhaaosConnectionQualityConfig ConnectionQuality;

    /** Packet settings. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Packet")
    FKhaaosPacketConfig PacketSettings;

    // ─── Iris Serialization ────────────────────────────────────────────────

    /** Whether Iris support is enabled. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Iris")
    uint8 bIrisSupport : 1;

    /** Whether Iris replication logging is enabled (verbose, dev only). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Iris")
    uint8 bIrisEnableReplicationLog : 1;

    // ─── Per-World Configs ─────────────────────────────────────────────────

    /** Network config per world. */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|World")
    TMap<EWorldSequence, FKhaaosWorldNetConfig> PerWorldNetConfigs;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|NetDriver")
    FOnNetDriverConfigured OnNetDriverConfigured;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|NetDriver")
    FOnBandwidthLimitReached OnBandwidthLimitReached;

protected:

    /** Current world network config (after ConfigureForWorld). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetDriver")
    FKhaaosWorldNetConfig CurrentWorldConfig;

    /** Current world sequence. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetDriver")
    EWorldSequence ConfiguredWorld = EWorldSequence::CIGKV;

    /** Estimated total bandwidth across all connections (bytes/sec). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|NetDriver")
    int64 EstimatedTotalBandwidth = 0;

    /** Maximum allowed total bandwidth (bytes/sec). */
    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|NetDriver|Budget")
    int64 MaxTotalBandwidth = 524288; // 512 KB/s total

    // ─── Internal Methods ──────────────────────────────────────────────────

    /** Initialize per-world network configs with defaults. */
    void InitPerWorldConfigs();

    /** Update bandwidth estimate based on current connections. */
    void UpdateBandwidthEstimate();
};
