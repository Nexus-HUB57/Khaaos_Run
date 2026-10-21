// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSCrossplay.h"
#include "KhaaosRun.h"
#include "HAL/PlatformProcess.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosEOSCrossplay::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bCrossplayEnabled = true;
	CurrentPlatform = EKhaaosPlatform::Unknown;

	InitPlatformConfigs();
	DetectPlatform();

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCrossplay: Initialized on platform %s"), *GetPlatformName(CurrentPlatform));
}

void UKhaaosEOSCrossplay::Deinitialize()
{
	PlatformConfigs.Empty();
	Super::Deinitialize();
}

// ─── Platform Detection ─────────────────────────────────────────────────────────

EKhaaosPlatform UKhaaosEOSCrossplay::DetectPlatform()
{
	// Use UE5 platform macros for detection
#if PLATFORM_PS5
	CurrentPlatform = EKhaaosPlatform::PS5;
#elif PLATFORM_XBOXONE || PLATFORM_GDK
	CurrentPlatform = EKhaaosPlatform::XSX;
#elif PLATFORM_SWITCH
	CurrentPlatform = EKhaaosPlatform::Switch2;
#elif PLATFORM_WINDOWS || PLATFORM_LINUX || PLATFORM_MAC
	CurrentPlatform = EKhaaosPlatform::PC;
#elif PLATFORM_ANDROID || PLATFORM_IOS
	CurrentPlatform = EKhaaosPlatform::Mobile;
#else
	CurrentPlatform = EKhaaosPlatform::Unknown;
#endif

	OnPlatformDetected.Broadcast(CurrentPlatform, GetPlatformName(CurrentPlatform));
	return CurrentPlatform;
}

FString UKhaaosEOSCrossplay::GetPlatformName(EKhaaosPlatform Platform)
{
	switch (Platform)
	{
	case EKhaaosPlatform::PS5:     return TEXT("PlayStation 5");
	case EKhaaosPlatform::XSX:     return TEXT("Xbox Series X|S");
	case EKhaaosPlatform::Switch2: return TEXT("Nintendo Switch 2");
	case EKhaaosPlatform::PC:      return TEXT("PC");
	case EKhaaosPlatform::Mobile:  return TEXT("Mobile");
	default:                       return TEXT("Unknown");
	}
}

// ─── Cross-play Control ─────────────────────────────────────────────────────────

void UKhaaosEOSCrossplay::SetCrossplayEnabled(bool bEnabled)
{
	if (bEnabled != bCrossplayEnabled)
	{
		bCrossplayEnabled = bEnabled;
		OnCrossplayChanged.Broadcast(bEnabled, CurrentPlatform);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSCrossplay: Cross-play %s"), bEnabled ? TEXT("enabled") : TEXT("disabled"));
	}
}

TArray<EKhaaosPlatform> UKhaaosEOSCrossplay::GetAllowedPlatforms() const
{
	FKhaaosCrossplayConfig* Config = PlatformConfigs.Find(CurrentPlatform);
	if (Config && bCrossplayEnabled)
	{
		return Config->AllowedPlatforms;
	}

	// Cross-play disabled: only same platform
	TArray<EKhaaosPlatform> Same;
	Same.Add(CurrentPlatform);
	return Same;
}

bool UKhaaosEOSCrossplay::IsPlatformAllowed(EKhaaosPlatform Platform) const
{
	TArray<EKhaaosPlatform> Allowed = GetAllowedPlatforms();
	return Allowed.Contains(Platform);
}

// ─── Input Constraints ──────────────────────────────────────────────────────────

float UKhaaosEOSCrossplay::GetAimAssistAngle() const
{
	FKhaaosCrossplayConfig* Config = PlatformConfigs.Find(CurrentPlatform);
	return Config ? Config->MaxAimAssistAngle : 0.0f;
}

bool UKhaaosEOSCrossplay::RequiresController() const
{
	FKhaaosCrossplayConfig* Config = PlatformConfigs.Find(CurrentPlatform);
	return Config ? Config->bRequiresController : false;
}

bool UKhaaosEOSCrossplay::IsTextChatAvailable() const
{
	FKhaaosCrossplayConfig* Config = PlatformConfigs.Find(CurrentPlatform);
	return Config ? Config->bTextChatEnabled : true;
}

bool UKhaaosEOSCrossplay::IsVoiceChatAvailable() const
{
	FKhaaosCrossplayConfig* Config = PlatformConfigs.Find(CurrentPlatform);
	return Config ? Config->bVoiceChatEnabled : true;
}

// ─── Private ────────────────────────────────────────────────────────────────────

void UKhaaosEOSCrossplay::InitPlatformConfigs()
{
	// PS5: Cross-play with XSX/PC, aim assist, voice+text
	FKhaaosCrossplayConfig PS5Config;
	PS5Config.bCrossplayEnabled = true;
	PS5Config.AllowedPlatforms = { EKhaaosPlatform::PS5, EKhaaosPlatform::XSX, EKhaaosPlatform::PC };
	PS5Config.bRequiresController = true;
	PS5Config.MaxAimAssistAngle = 3.5f;
	PS5Config.bTextChatEnabled = true;
	PS5Config.bVoiceChatEnabled = true;
	PlatformConfigs.Add(EKhaaosPlatform::PS5, PS5Config);

	// XSX: Cross-play with PS5/PC, aim assist, voice+text
	FKhaaosCrossplayConfig XSXConfig;
	XSXConfig.bCrossplayEnabled = true;
	XSXConfig.AllowedPlatforms = { EKhaaosPlatform::XSX, EKhaaosPlatform::PS5, EKhaaosPlatform::PC };
	XSXConfig.bRequiresController = true;
	XSXConfig.MaxAimAssistAngle = 3.0f;
	XSXConfig.bTextChatEnabled = true;
	XSXConfig.bVoiceChatEnabled = true;
	PlatformConfigs.Add(EKhaaosPlatform::XSX, XSXConfig);

	// Switch2: Cross-play opt-in, stronger aim assist, voice only
	FKhaaosCrossplayConfig Switch2Config;
	Switch2Config.bCrossplayEnabled = true;
	Switch2Config.AllowedPlatforms = { EKhaaosPlatform::Switch2, EKhaaosPlatform::PC };
	Switch2Config.bRequiresController = true;
	Switch2Config.MaxAimAssistAngle = 5.0f;
	Switch2Config.bTextChatEnabled = false;
	Switch2Config.bVoiceChatEnabled = true;
	PlatformConfigs.Add(EKhaaosPlatform::Switch2, Switch2Config);

	// PC: Full cross-play, no aim assist, text+voice
	FKhaaosCrossplayConfig PCConfig;
	PCConfig.bCrossplayEnabled = true;
	PCConfig.AllowedPlatforms = { EKhaaosPlatform::PC, EKhaaosPlatform::PS5, EKhaaosPlatform::XSX, EKhaaosPlatform::Switch2 };
	PCConfig.bRequiresController = false;
	PCConfig.MaxAimAssistAngle = 0.0f;
	PCConfig.bTextChatEnabled = true;
	PCConfig.bVoiceChatEnabled = true;
	PlatformConfigs.Add(EKhaaosPlatform::PC, PCConfig);

	// Mobile: Separate pool, touch controls
	FKhaaosCrossplayConfig MobileConfig;
	MobileConfig.bCrossplayEnabled = false;
	MobileConfig.AllowedPlatforms = { EKhaaosPlatform::Mobile };
	MobileConfig.bRequiresController = false;
	MobileConfig.MaxAimAssistAngle = 8.0f;
	MobileConfig.bTextChatEnabled = true;
	MobileConfig.bVoiceChatEnabled = true;
	PlatformConfigs.Add(EKhaaosPlatform::Mobile, MobileConfig);
}
