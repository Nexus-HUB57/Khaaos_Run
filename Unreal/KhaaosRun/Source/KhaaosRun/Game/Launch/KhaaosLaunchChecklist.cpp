// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Launch/KhaaosLaunchChecklist.h"
#include "Game/Launch/KhaaosProductionConfig.h"
#include "Game/AntiCheat/KhaaosAntiCheat.h"
#include "Game/Server/KhaaosServerConfig.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/Paths.h"
#include "HAL/PlatformFile.h"

UKhaaosLaunchChecklist::UKhaaosLaunchChecklist()
{
}

void UKhaaosLaunchChecklist::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogTemp, Log, TEXT("[LaunchChecklist] Initialized"));
}

void UKhaaosLaunchChecklist::Deinitialize()
{
	Super::Deinitialize();
}

FLaunchCheckResult UKhaaosLaunchChecklist::RunPreLaunchChecks()
{
	FLaunchCheckResult Result;

	// ── Run all checks ──────────────────────────────────────────────────────
	Result.Checks.Add(CheckServerBuildVerified());
	Result.Checks.Add(CheckEOSConfigured());
	Result.Checks.Add(CheckAntiCheatEnabled());
	Result.Checks.Add(CheckRateLimitingEnabled());
	Result.Checks.Add(CheckDDoSProtectionEnabled());
	Result.Checks.Add(CheckProductionConfigApplied());
	Result.Checks.Add(CheckSecretsConfigured());
	Result.Checks.Add(CheckMaxPlayersSet());
	Result.Checks.Add(CheckTickRateAdequate());
	Result.Checks.Add(CheckLFSConfigured());
	Result.Checks.Add(CheckCrashReportingEnabled());
	Result.Checks.Add(CheckMonitoringEnabled());
	Result.Checks.Add(CheckCloudSaveEnabled());
	Result.Checks.Add(CheckDedicatedServerExeExists());

	// ── Compute summary ─────────────────────────────────────────────────────
	Result.CriticalFailures = 0;
	Result.Warnings = 0;
	Result.PassedCount = 0;

	for (const FCheckEntry& Check : Result.Checks)
	{
		if (Check.bPassed)
		{
			Result.PassedCount++;
		}
		else if (Check.Severity == ECheckSeverity::Critical)
		{
			Result.CriticalFailures++;
		}
		else if (Check.Severity == ECheckSeverity::Warning)
		{
			Result.Warnings++;
		}
	}

	// Ready only if no critical failures
	Result.bIsReady = (Result.CriticalFailures == 0);

	LastResult = Result;

	UE_LOG(LogTemp, Log, TEXT("[LaunchChecklist] Pre-launch checks: %d/%d passed, %d critical failures, %d warnings"),
		Result.PassedCount, Result.Checks.Num(), Result.CriticalFailures, Result.Warnings);

	return Result;
}

FString UKhaaosLaunchChecklist::GetChecklistReport()
{
	FLaunchCheckResult Result = LastResult;
	if (Result.Checks.Num() == 0)
	{
		Result = RunPreLaunchChecks();
	}

	FString Report;
	Report += TEXT("╔══════════════════════════════════════════════════════════╗\n");
	Report += TEXT("║         KHAOS RUN — PRE-LAUNCH CHECKLIST REPORT          ║\n");
	Report += TEXT("╠══════════════════════════════════════════════════════════╣\n");

	FString StatusStr = Result.bIsReady ? TEXT("✅ READY FOR LAUNCH") : TEXT("❌ NOT READY");
	Report += FString::Printf(TEXT("║ Status: %s                              ║\n"), *StatusStr);
	Report += TEXT("╠══════════════════════════════════════════════════════════╣\n");

	for (const FCheckEntry& Check : Result.Checks)
	{
		FString PassStr = Check.bPassed ? TEXT("PASS") : TEXT("FAIL");
		FString SevStr;
		switch (Check.Severity)
		{
		case ECheckSeverity::Critical: SevStr = TEXT("CRIT"); break;
		case ECheckSeverity::Warning:  SevStr = TEXT("WARN"); break;
		case ECheckSeverity::Info:     SevStr = TEXT("INFO"); break;
		}

		Report += FString::Printf(TEXT("║ [%s] [%s] %-30s ║\n"), *PassStr, *SevStr, *Check.Name);
		if (!Check.bPassed && !Check.Details.IsEmpty())
		{
			Report += FString::Printf(TEXT("║        → %s\n"), *Check.Details);
		}
	}

	Report += TEXT("╠══════════════════════════════════════════════════════════╣\n");
	Report += FString::Printf(TEXT("║ Summary: %d/%d passed | %d critical | %d warnings  ║\n"),
		Result.PassedCount, Result.Checks.Num(), Result.CriticalFailures, Result.Warnings);
	Report += TEXT("╚══════════════════════════════════════════════════════════╝\n");

	return Report;
}

// ── Individual Check Implementations ───────────────────────────────────────────

FCheckEntry UKhaaosLaunchChecklist::CheckServerBuildVerified()
{
	FCheckEntry Check;
	Check.Name = TEXT("Server Build Verified");
	Check.Severity = ECheckSeverity::Critical;

	// Check if we're running a dedicated server build
	bool bIsDedicated = FParse::Param(FCommandLine::Get(), TEXT("dedicated")) ||
	                    !FParse::Param(FCommandLine::Get(), TEXT("listen"));

	if (bIsDedicated)
	{
		Check.bPassed = true;
		Check.Details = TEXT("Dedicated server build detected");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Not running as dedicated server");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckEOSConfigured()
{
	FCheckEntry Check;
	Check.Name = TEXT("EOS Configured");
	Check.Severity = ECheckSeverity::Critical;

	// Check if EOS config file exists
	FString EOSConfigPath = FPaths::ProjectConfigDir() / TEXT("DefaultEOS.ini");
	if (FPlatformFileManager::Get().GetPlatformFile().FileExists(*EOSConfigPath))
	{
		Check.bPassed = true;
		Check.Details = TEXT("DefaultEOS.ini found");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("DefaultEOS.ini not found");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckAntiCheatEnabled()
{
	FCheckEntry Check;
	Check.Name = TEXT("Anti-Cheat Enabled");
	Check.Severity = ECheckSeverity::Critical;

	const UKhaaosAntiCheat* AntiCheat = GetGameInstance()->GetSubsystem<UKhaaosAntiCheat>();
	if (AntiCheat && AntiCheat->bAutoKickOnCheat)
	{
		Check.bPassed = true;
		Check.Details = TEXT("Anti-cheat subsystem active with auto-kick");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Anti-cheat not active or auto-kick disabled");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckRateLimitingEnabled()
{
	FCheckEntry Check;
	Check.Name = TEXT("Rate Limiting Enabled");
	Check.Severity = ECheckSeverity::Critical;

	const UKhaaosProductionConfig* ProdConfig = GetGameInstance()->GetSubsystem<UKhaaosProductionConfig>();
	if (ProdConfig && ProdConfig->GetConfig().bEnableRateLimiting)
	{
		Check.bPassed = true;
		Check.Details = TEXT("Rate limiting enabled in production config");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Rate limiting not enabled");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckDDoSProtectionEnabled()
{
	FCheckEntry Check;
	Check.Name = TEXT("DDoS Protection Enabled");
	Check.Severity = ECheckSeverity::Critical;

	const UKhaaosProductionConfig* ProdConfig = GetGameInstance()->GetSubsystem<UKhaaosProductionConfig>();
	if (ProdConfig && ProdConfig->GetConfig().bEnableDDoSProtection)
	{
		Check.bPassed = true;
		Check.Details = TEXT("DDoS protection enabled in production config");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("DDoS protection not enabled");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckProductionConfigApplied()
{
	FCheckEntry Check;
	Check.Name = TEXT("Production Config Applied");
	Check.Severity = ECheckSeverity::Critical;

	const UKhaaosProductionConfig* ProdConfig = GetGameInstance()->GetSubsystem<UKhaaosProductionConfig>();
	if (ProdConfig && ProdConfig->IsProduction())
	{
		Check.bPassed = true;
		Check.Details = TEXT("Running in production mode");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Not in production mode — development settings active");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckSecretsConfigured()
{
	FCheckEntry Check;
	Check.Name = TEXT("Secrets/Webhooks Configured");
	Check.Severity = ECheckSeverity::Warning;

	// Check if webhook URL is available (from environment or INI)
	FString WebhookURL;
	if (FParse::Value(FCommandLine::Get(), TEXT("WebhookURL="), WebhookURL) && !WebhookURL.IsEmpty())
	{
		Check.bPassed = true;
		Check.Details = TEXT("Webhook URL configured via command line");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("No webhook URL found — deployment notifications disabled");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckMaxPlayersSet()
{
	FCheckEntry Check;
	Check.Name = TEXT("Max Players Set");
	Check.Severity = ECheckSeverity::Warning;

	const UKhaaosServerConfig* ServerConfig = GetGameInstance()->GetSubsystem<UKhaaosServerConfig>();
	if (ServerConfig && ServerConfig->GetServerConfig().MaxPlayers > 0)
	{
		Check.bPassed = true;
		Check.Details = FString::Printf(TEXT("MaxPlayers: %d"), ServerConfig->GetServerConfig().MaxPlayers);
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("MaxPlayers not configured or zero");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckTickRateAdequate()
{
	FCheckEntry Check;
	Check.Name = TEXT("Tick Rate Adequate (>=60)");
	Check.Severity = ECheckSeverity::Critical;

	const UKhaaosServerConfig* ServerConfig = GetGameInstance()->GetSubsystem<UKhaaosServerConfig>();
	if (ServerConfig && ServerConfig->GetNetworkConfig().NetServerMaxTickRate >= 60)
	{
		Check.bPassed = true;
		Check.Details = FString::Printf(TEXT("Tick rate: %d Hz"), ServerConfig->GetNetworkConfig().NetServerMaxTickRate);
	}
	else
	{
		Check.bPassed = false;
		int32 Rate = ServerConfig ? ServerConfig->GetNetworkConfig().NetServerMaxTickRate : 0;
		Check.Details = FString::Printf(TEXT("Tick rate %d Hz is below 60 Hz minimum"), Rate);
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckLFSConfigured()
{
	FCheckEntry Check;
	Check.Name = TEXT("LFS Configured");
	Check.Severity = ECheckSeverity::Warning;

	// Check if .gitattributes exists for LFS
	FString GitAttributesPath = FPaths::ProjectDir() / TEXT("../../.gitattributes");
	if (FPlatformFileManager::Get().GetPlatformFile().FileExists(*GitAttributesPath))
	{
		Check.bPassed = true;
		Check.Details = TEXT(".gitattributes found — LFS likely configured");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT(".gitattributes not found — verify Git LFS for large assets");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckCrashReportingEnabled()
{
	FCheckEntry Check;
	Check.Name = TEXT("Crash Reporting Enabled");
	Check.Severity = ECheckSeverity::Warning;

	const UKhaaosProductionConfig* ProdConfig = GetGameInstance()->GetSubsystem<UKhaaosProductionConfig>();
	if (ProdConfig && ProdConfig->GetConfig().bEnableCrashReporting)
	{
		Check.bPassed = true;
		Check.Details = TEXT("Crash reporting enabled");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Crash reporting disabled");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckMonitoringEnabled()
{
	FCheckEntry Check;
	Check.Name = TEXT("Monitoring Enabled");
	Check.Severity = ECheckSeverity::Warning;

	const UKhaaosMonitorDashboard* Dashboard = GetGameInstance()->GetSubsystem<UKhaaosMonitorDashboard>();
	if (Dashboard && Dashboard->bIsMonitoring)
	{
		Check.bPassed = true;
		Check.Details = TEXT("Monitor dashboard active");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Monitoring not active");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckCloudSaveEnabled()
{
	FCheckEntry Check;
	Check.Name = TEXT("Cloud Save Enabled");
	Check.Severity = ECheckSeverity::Warning;

	const UKhaaosProductionConfig* ProdConfig = GetGameInstance()->GetSubsystem<UKhaaosProductionConfig>();
	if (ProdConfig && ProdConfig->IsFeatureEnabled(FName("CLOUD_SAVE")))
	{
		Check.bPassed = true;
		Check.Details = TEXT("Cloud save feature flag enabled");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = TEXT("Cloud save feature flag disabled");
	}

	return Check;
}

FCheckEntry UKhaaosLaunchChecklist::CheckDedicatedServerExeExists()
{
	FCheckEntry Check;
	Check.Name = TEXT("Dedicated Server Executable Exists");
	Check.Severity = ECheckSeverity::Critical;

	// Check for the server binary
	FString ServerBinaryPath = FPaths::ProjectDir() / TEXT("Binaries/Linux/KhaaosRunServer");
#if PLATFORM_WINDOWS
	ServerBinaryPath = FPaths::ProjectDir() / TEXT("Binaries/Win64/KhaaosRunServer.exe");
#endif

	if (FPlatformFileManager::Get().GetPlatformFile().FileExists(*ServerBinaryPath))
	{
		Check.bPassed = true;
		Check.Details = TEXT("Server binary found");
	}
	else
	{
		Check.bPassed = false;
		Check.Details = FString::Printf(TEXT("Server binary not found at: %s"), *ServerBinaryPath);
	}

	return Check;
}
