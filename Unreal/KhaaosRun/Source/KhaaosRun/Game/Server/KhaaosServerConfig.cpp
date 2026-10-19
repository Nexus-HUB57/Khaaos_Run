// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Server/KhaaosServerConfig.h"
#include "Engine/Engine.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Net/UnrealNetwork.h"

UKhaaosServerConfig::UKhaaosServerConfig()
{
}

void UKhaaosServerConfig::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Load from INI defaults first, then command line overrides
	LoadConfig();

	UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] Initialized — Server: %s, MaxPlayers: %d, Port: %d, Region: %s"),
		*ServerConfig.ServerName, ServerConfig.MaxPlayers, NetworkConfig.ListenPort, *ServerConfig.Region);
}

void UKhaaosServerConfig::Deinitialize()
{
	Super::Deinitialize();
	UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] Deinitialized"));
}

const FServerConfig& UKhaaosServerConfig::GetServerConfig() const
{
	return ServerConfig;
}

const FNetworkConfig& UKhaaosServerConfig::GetNetworkConfig() const
{
	return NetworkConfig;
}

const FPerformanceConfig& UKhaaosServerConfig::GetPerformanceConfig() const
{
	return PerformanceConfig;
}

void UKhaaosServerConfig::LoadConfig()
{
	// Load from INI file (Super::LoadConfig reads UPROPERTY(Config))
	Super::LoadConfig();

	// Command line overrides take highest priority
	ParseCommandLineOverrides();
}

void UKhaaosServerConfig::ApplyConfig()
{
	ApplyNetworkSettings();
	ApplyPerformanceSettings();

	UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] Applied — TickRate: %d, Iris: %s, SmoothFPS: %s"),
		NetworkConfig.NetServerMaxTickRate,
		NetworkConfig.bUseIris ? TEXT("true") : TEXT("false"),
		PerformanceConfig.bSmoothFrameRate ? TEXT("true") : TEXT("false"));
}

void UKhaaosServerConfig::SetMaxPlayers(int32 NewMax)
{
	ServerConfig.MaxPlayers = FMath::Clamp(NewMax, 2, 200);
	UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] MaxPlayers overridden to %d"), ServerConfig.MaxPlayers);
}

void UKhaaosServerConfig::SetTickRate(int32 NewTickRate)
{
	NetworkConfig.NetServerMaxTickRate = FMath::Clamp(NewTickRate, 30, 120);
	UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] TickRate overridden to %d"), NetworkConfig.NetServerMaxTickRate);
}

void UKhaaosServerConfig::ParseCommandLineOverrides()
{
	// ── Server Name ─────────────────────────────────────────────────────────
	FString CmdServerName;
	if (FParse::Value(FCommandLine::Get(), TEXT("ServerName="), CmdServerName))
	{
		ServerConfig.ServerName = CmdServerName;
	}

	// ── Max Players ─────────────────────────────────────────────────────────
	int32 CmdMaxPlayers = 0;
	if (FParse::Value(FCommandLine::Get(), TEXT("MaxPlayers="), CmdMaxPlayers) && CmdMaxPlayers > 0)
	{
		ServerConfig.MaxPlayers = FMath::Clamp(CmdMaxPlayers, 2, 200);
	}

	// ── Map Name ────────────────────────────────────────────────────────────
	FString CmdMapName;
	if (FParse::Value(FCommandLine::Get(), TEXT("Map="), CmdMapName))
	{
		ServerConfig.MapName = CmdMapName;
	}

	// ── Game Mode ───────────────────────────────────────────────────────────
	FString CmdGameMode;
	if (FParse::Value(FCommandLine::Get(), TEXT("Game="), CmdGameMode))
	{
		ServerConfig.GameMode = CmdGameMode;
	}

	// ── Tick Rate ───────────────────────────────────────────────────────────
	int32 CmdTickRate = 0;
	if (FParse::Value(FCommandLine::Get(), TEXT("tickrate="), CmdTickRate) && CmdTickRate > 0)
	{
		NetworkConfig.NetServerMaxTickRate = FMath::Clamp(CmdTickRate, 30, 120);
	}

	// ── Listen Port ─────────────────────────────────────────────────────────
	int32 CmdPort = 0;
	if (FParse::Value(FCommandLine::Get(), TEXT("port="), CmdPort) && CmdPort > 0)
	{
		NetworkConfig.ListenPort = CmdPort;
	}

	// ── Beacon Port ─────────────────────────────────────────────────────────
	int32 CmdBeaconPort = 0;
	if (FParse::Value(FCommandLine::Get(), TEXT("beaconport="), CmdBeaconPort) && CmdBeaconPort > 0)
	{
		NetworkConfig.BeaconPort = CmdBeaconPort;
	}

	// ── Query Port ──────────────────────────────────────────────────────────
	int32 CmdQueryPort = 0;
	if (FParse::Value(FCommandLine::Get(), TEXT("queryport="), CmdQueryPort) && CmdQueryPort > 0)
	{
		NetworkConfig.QueryPort = CmdQueryPort;
	}

	// ── Region ──────────────────────────────────────────────────────────────
	FString CmdRegion;
	if (FParse::Value(FCommandLine::Get(), TEXT("Region="), CmdRegion))
	{
		ServerConfig.Region = CmdRegion;
	}

	// ── Iris ────────────────────────────────────────────────────────────────
	if (FParse::Param(FCommandLine::Get(), TEXT("NoIris")))
	{
		NetworkConfig.bUseIris = false;
	}

	// ── Dedicated ───────────────────────────────────────────────────────────
	ServerConfig.bIsDedicated = FParse::Param(FCommandLine::Get(), TEXT("dedicated")) ||
	                           !FParse::Param(FCommandLine::Get(), TEXT("listen"));
}

void UKhaaosServerConfig::ApplyNetworkSettings()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	UNetDriver* NetDriver = World->GetNetDriver();
	if (NetDriver)
	{
		// Apply tick rate to net driver
		NetDriver->SetNetServerMaxTickRate(NetworkConfig.NetServerMaxTickRate);

		UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] NetDriver tick rate set to %d"),
			NetworkConfig.NetServerMaxTickRate);
	}

	// Apply timeout via game session
	if (World->GetGameSession())
	{
		// Timeout is handled via engine INI; log for verification
		UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] Timeout: %.1fs"), NetworkConfig.TimeoutSeconds);
	}
}

void UKhaaosServerConfig::ApplyPerformanceSettings()
{
	// Smooth frame rate is set via engine INI (DefaultEngine.ini or DefaultProduction.ini)
	// Here we verify and log the settings
	UE_LOG(LogTemp, Log, TEXT("[KhaaosServerConfig] Performance — MaxFPS: %d, Smooth: %s, TargetFrameTime: %.3fms"),
		PerformanceConfig.MaxFPS,
		PerformanceConfig.bSmoothFrameRate ? TEXT("true") : TEXT("false"),
		PerformanceConfig.TargetFrameTime);
}
