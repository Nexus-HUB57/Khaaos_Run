// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosServerConfig.generated.h"

// ─── Server Configuration Struct ───────────────────────────────────────────────

/**
 * FServerConfig
 *
 * Core server parameters for the dedicated server instance.
 * Loaded from command line arguments with INI overrides.
 */
USTRUCT(BlueprintType)
struct FServerConfig
{
	GENERATED_BODY()

	/** Display name for this server instance. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	FString ServerName = TEXT("KhaaosRun-Server");

	/** Maximum players allowed in a single match. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	int32 MaxPlayers = 100;

	/** Default map name to load on server start. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	FString MapName = TEXT("Main");

	/** Game mode class path. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	FString GameMode = TEXT("KhaaosGameMode");

	/** Server tick rate (Hz). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	int32 TickRate = 60;

	/** Whether this is a dedicated server (no local player). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	uint8 bIsDedicated : 1 = true;

	/** Geographic region for matchmaking routing. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	FString Region = TEXT("us-east-1");

	/** Whether to auto-balance teams when players leave/join. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Server")
	uint8 bAutoBalanceTeams : 1 = false;
};

// ─── Network Configuration Struct ──────────────────────────────────────────────

/**
 * FNetworkConfig
 *
 * Network-level configuration for replication, ports, and Iris.
 */
USTRUCT(BlueprintType)
struct FNetworkConfig
{
	GENERATED_BODY()

	/** Game traffic listen port. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	int32 ListenPort = 7777;

	/** Beacon port for session discovery. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	int32 BeaconPort = 7778;

	/** Steam/server query port. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	int32 QueryPort = 27015;

	/** Maximum packet size in bytes. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	int32 MaxPacketSize = 1024;

	/** Maximum server tick rate for net driver. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	int32 NetServerMaxTickRate = 60;

	/** Client timeout in seconds before disconnect. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	float TimeoutSeconds = 30.0f;

	/** Whether to use Iris replication system. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Network")
	uint8 bUseIris : 1 = true;
};

// ─── Performance Configuration Struct ──────────────────────────────────────────

/**
 * FPerformanceConfig
 *
 * Server-side performance tuning for dedicated server.
 */
USTRUCT(BlueprintType)
struct FPerformanceConfig
{
	GENERATED_BODY()

	/** Maximum frames per second (0 = unlimited). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Performance")
	int32 MaxFPS = 62;

	/** Whether to smooth frame rate for consistent tick timing. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Performance")
	uint8 bSmoothFrameRate : 1 = true;

	/** Target frame time in milliseconds. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Performance")
	float TargetFrameTime = 16.667f;

	/** Whether to use fixed frame rate (no dynamic adjustment). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Performance")
	uint8 bUseFixedFrameRate : 1 = false;
};

// ─── Server Config Subsystem ───────────────────────────────────────────────────

/**
 * UKhaaosServerConfig
 *
 * Server configuration subsystem that loads settings from
 * command line arguments with INI file overrides.
 *
 * Priority: Command Line > INI Override > Defaults
 *
 * Used by GameMode, NetDriver, and monitoring systems to
 * configure the dedicated server at startup.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos Server Config"))
class UKhaaosServerConfig : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosServerConfig();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Configuration Access ───────────────────────────────────────────────

	/** Get the server configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Server")
	const FServerConfig& GetServerConfig() const;

	/** Get the network configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Network")
	const FNetworkConfig& GetNetworkConfig() const;

	/** Get the performance configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Performance")
	const FPerformanceConfig& GetPerformanceConfig() const;

	// ─── Loading ────────────────────────────────────────────────────────────

	/**
	 * Load configuration from command line + INI overrides.
	 * Called during Initialize(). Can be called again for hot-reload.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Server")
	void LoadConfig();

	/**
	 * Apply loaded configuration to engine net driver settings.
	 * Sets tick rate, timeout, Iris flag, smooth frame rate, etc.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Server")
	void ApplyConfig();

	// ─── Runtime Overrides ──────────────────────────────────────────────────

	/** Override max players at runtime (e.g., from matchmaking). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Server")
	void SetMaxPlayers(int32 NewMax);

	/** Override tick rate at runtime. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Server")
	void SetTickRate(int32 NewTickRate);

private:

	/** Cached server config. */
	UPROPERTY(Config)
	FServerConfig ServerConfig;

	/** Cached network config. */
	UPROPERTY(Config)
	FNetworkConfig NetworkConfig;

	/** Cached performance config. */
	UPROPERTY(Config)
	FPerformanceConfig PerformanceConfig;

	/** Parse command-line arguments and override INI values. */
	void ParseCommandLineOverrides();

	/** Apply network settings to the engine net driver. */
	void ApplyNetworkSettings();

	/** Apply performance settings to the engine. */
	void ApplyPerformanceSettings();
};
