// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Launch/KhaaosProductionConfig.h"
#include "Misc/CommandLine.h"

UKhaaosProductionConfig::UKhaaosProductionConfig()
{
}

void UKhaaosProductionConfig::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Load from INI
	Super::LoadConfig();

	// Initialize feature flags
	InitFeatureFlags();

	// Check for production flag on command line
	if (FParse::Param(FCommandLine::Get(), TEXT("production")))
	{
		Config.bIsProduction = true;
	}

	// Apply production overrides if in production mode
	if (Config.bIsProduction)
	{
		ApplyProductionOverrides();
	}

	ValidateConfig();

	UE_LOG(LogTemp, Log, TEXT("[ProductionConfig] Initialized — Production: %s, Auth: %s, AntiCheat: %s"),
		Config.bIsProduction ? TEXT("true") : TEXT("false"),
		Config.bRequireAuthentication ? TEXT("true") : TEXT("false"),
		Config.bRequireAntiCheat ? TEXT("true") : TEXT("false"));
}

void UKhaaosProductionConfig::Deinitialize()
{
	FeatureFlags.Empty();
	Super::Deinitialize();
}

const FProductionConfig& UKhaaosProductionConfig::GetConfig() const
{
	return Config;
}

bool UKhaaosProductionConfig::IsFeatureEnabled(FName Feature) const
{
	const bool* Enabled = FeatureFlags.Find(Feature);
	return Enabled ? *Enabled : false;
}

void UKhaaosProductionConfig::SetFeatureEnabled(FName Feature, bool bEnabled)
{
	// In production, some features are locked and cannot be changed at runtime
	if (Config.bIsProduction && Feature == FName("EAC"))
	{
		UE_LOG(LogTemp, Warning, TEXT("[ProductionConfig] Cannot disable EAC in production mode"));
		return;
	}

	FeatureFlags.Add(Feature, bEnabled);
	UE_LOG(LogTemp, Log, TEXT("[ProductionConfig] Feature %s set to %s"),
		*Feature.ToString(), bEnabled ? TEXT("enabled") : TEXT("disabled"));
}

void UKhaaosProductionConfig::ApplyProductionOverrides()
{
	// ── Lock down for production ────────────────────────────────────────────
	Config.bEnableProfiling = false;
	Config.bRequireAuthentication = true;
	Config.bRequireAntiCheat = true;
	Config.bEnableRateLimiting = true;
	Config.bEnableDDoSProtection = true;
	Config.bEnableMetricsCollection = true;
	Config.bEnableCrashReporting = true;

	// Force feature flags in production
	FeatureFlags.Add(FName("EAC"), true);
	FeatureFlags.Add(FName("EOS"), true);
	FeatureFlags.Add(FName("CLOUD_SAVE"), true);

	UE_LOG(LogTemp, Log, TEXT("[ProductionConfig] Production overrides applied — all security measures enforced"));
}

bool UKhaaosProductionConfig::IsProduction() const
{
	return Config.bIsProduction;
}

void UKhaaosProductionConfig::InitFeatureFlags()
{
	// Default feature flags
	FeatureFlags.Add(FName("EAC"), true);           // Easy Anti-Cheat
	FeatureFlags.Add(FName("EOS"), true);            // Epic Online Services
	FeatureFlags.Add(FName("CLOUD_SAVE"), true);     // Cloud save system
	FeatureFlags.Add(FName("ADAPTIVE_MUSIC"), true); // Adaptive music system
	FeatureFlags.Add(FName("LIVE_OPS"), true);       // Live operations/events

	// Allow command-line overrides for feature flags
	FString DisabledFeatures;
	if (FParse::Value(FCommandLine::Get(), TEXT("DisableFeatures="), DisabledFeatures))
	{
		TArray<FString> FeatureList;
		DisabledFeatures.ParseIntoArray(FeatureList, TEXT(","), true);
		for (const FString& Feature : FeatureList)
		{
			FeatureFlags.Add(FName(*Feature), false);
		}
	}
}

void UKhaaosProductionConfig::ValidateConfig()
{
	// ── Warn about dangerous configurations ─────────────────────────────────
	if (Config.bIsProduction && Config.bEnableProfiling)
	{
		UE_LOG(LogTemp, Error, TEXT("[ProductionConfig] CRITICAL: Profiling enabled in production! Disabling."));
		Config.bEnableProfiling = false;
	}

	if (Config.bIsProduction && !Config.bRequireAuthentication)
	{
		UE_LOG(LogTemp, Error, TEXT("[ProductionConfig] CRITICAL: Authentication disabled in production! Enabling."));
		Config.bRequireAuthentication = true;
	}

	if (Config.bIsProduction && !Config.bRequireAntiCheat)
	{
		UE_LOG(LogTemp, Error, TEXT("[ProductionConfig] CRITICAL: Anti-cheat disabled in production! Enabling."));
		Config.bRequireAntiCheat = true;
	}

	if (Config.MaxConcurrentConnections <= 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("[ProductionConfig] MaxConcurrentConnections invalid, defaulting to 1000"));
		Config.MaxConcurrentConnections = 1000;
	}
}
