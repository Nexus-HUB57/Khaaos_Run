// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Performance/KhaaosPerformanceBudget.h"
#include "HAL/PlatformProperties.h"
#include "HAL/IConsoleManager.h"
#include "Engine/Engine.h"
#include "UnrealEngine.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosPerfBudget, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosPerformanceBudgetComponent::UKhaaosPerformanceBudgetComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
	PrimaryComponentTick.TickGroup = ETickingGroup::TG_PrePhysics;

	// Auto-detect platform on construction
	CurrentTarget = DetectConsoleTarget();
	CurrentMode = EKhaaosPerformanceMode::Balanced;

	// Build all default profiles
	BuildDefaultProfiles();

	UE_LOG(LogKhaaosPerfBudget, Log, TEXT("KhaaosPerformanceBudget: Constructed | Target=%d | Mode=%d"),
		static_cast<int32>(CurrentTarget), static_cast<int32>(CurrentMode));
}

// ─── Platform Detection ──────────────────────────────────────────────────────

EKhaaosConsoleTarget UKhaaosPerformanceBudgetComponent::DetectConsoleTarget() const
{
	// Platform detection based on FPlatformProperties
#if PLATFORM_PS5
	return EKhaaosConsoleTarget::PS5;
#elif PLATFORM_XSX
	return EKhaaosConsoleTarget::XSX;
#elif PLATFORM_SWITCH
	return EKhaaosConsoleTarget::Switch2;
#elif PLATFORM_MOBILE
	return EKhaaosConsoleTarget::Mobile;
#else
	// PC: differentiate by hardware capability
	if (GMaxRHIFeatureLevel >= ERHIFeatureLevel::SM6)
	{
		return EKhaaosConsoleTarget::PC_High;
	}
	return EKhaaosConsoleTarget::PC_Medium;
#endif
}

// ─── Performance Mode ────────────────────────────────────────────────────────

void UKhaaosPerformanceBudgetComponent::SetPerformanceMode(EKhaaosPerformanceMode NewMode)
{
	if (NewMode == CurrentMode)
	{
		return;
	}

	EKhaaosPerformanceMode OldMode = CurrentMode;
	CurrentMode = NewMode;

	// Look up profile for current target + new mode
	const TMap<EKhaaosPerformanceMode, FKhaaosPerformanceProfile>* TargetProfiles = ProfileDatabase.Find(CurrentTarget);
	if (TargetProfiles)
	{
		const FKhaaosPerformanceProfile* Profile = TargetProfiles->Find(NewMode);
		if (Profile)
		{
			ActiveProfile = *Profile;
			ApplyProfileCvars(ActiveProfile);
		}
		else
		{
			UE_LOG(LogKhaaosPerfBudget, Warning, TEXT("KhaaosPerformanceBudget: No profile for Target=%d Mode=%d"),
				static_cast<int32>(CurrentTarget), static_cast<int32>(NewMode));
		}
	}

	// Broadcast delegate
	OnPerformanceModeChanged.Broadcast(OldMode, NewMode);

	UE_LOG(LogKhaaosPerfBudget, Log, TEXT("KhaaosPerformanceBudget: Mode changed %d -> %d | Target=%d"),
		static_cast<int32>(OldMode), static_cast<int32>(NewMode), static_cast<int32>(CurrentTarget));
}

// ─── Profile Queries ─────────────────────────────────────────────────────────

FKhaaosPerformanceProfile UKhaaosPerformanceBudgetComponent::GetBudgetForTarget(EKhaaosConsoleTarget Target) const
{
	// Return the Balanced profile for the requested target as the representative budget
	const TMap<EKhaaosPerformanceMode, FKhaaosPerformanceProfile>* TargetProfiles = ProfileDatabase.Find(Target);
	if (TargetProfiles)
	{
		const FKhaaosPerformanceProfile* Balanced = TargetProfiles->Find(EKhaaosPerformanceMode::Balanced);
		if (Balanced)
		{
			return *Balanced;
		}
	}

	// Fallback: return default-constructed profile
	return FKhaaosPerformanceProfile();
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

void UKhaaosPerformanceBudgetComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (bDynamicQualityScaling)
	{
		ProcessDynamicQualityScaling(DeltaTime);
	}
}

// ─── Dynamic Quality Scaling ─────────────────────────────────────────────────

void UKhaaosPerformanceBudgetComponent::ProcessDynamicQualityScaling(float DeltaTime)
{
	// Read current FPS from the engine
	float CurrentFPS = GAverageFPS;
	float TargetFPS = static_cast<float>(ActiveProfile.TargetFPS);

	// Downgrade check: FPS is below target minus hysteresis
	if (CurrentFPS < (TargetFPS - FPSHysteresis))
	{
		BelowTargetTime += DeltaTime;
		AboveTargetTime = 0.0f; // Reset upgrade timer

		// Trigger downgrade if sustained for threshold duration
		if (BelowTargetTime >= DowngradeThresholdSeconds && !bIsDynamicallyDowngraded)
		{
			// Determine next lower mode
			EKhaaosPerformanceMode DowngradedMode = CurrentMode;
			switch (CurrentMode)
			{
			case EKhaaosPerformanceMode::FullQuality:
				DowngradedMode = EKhaaosPerformanceMode::Balanced;
				break;
			case EKhaaosPerformanceMode::Balanced:
				DowngradedMode = EKhaaosPerformanceMode::Performance;
				break;
			case EKhaaosPerformanceMode::Performance:
				DowngradedMode = EKhaaosPerformanceMode::UltraPerformance;
				break;
			case EKhaaosPerformanceMode::UltraPerformance:
				// Already at lowest — cannot downgrade further
				break;
			}

			if (DowngradedMode != CurrentMode)
			{
				PreDowngradeMode = CurrentMode;
				bIsDynamicallyDowngraded = true;
				SetPerformanceMode(DowngradedMode);

				UE_LOG(LogKhaaosPerfBudget, Warning, TEXT("KhaaosPerformanceBudget: DYNAMIC DOWNGRADE | FPS=%.1f < Target=%.1f | Mode %d -> %d"),
					CurrentFPS, TargetFPS, static_cast<int32>(PreDowngradeMode), static_cast<int32>(DowngradedMode));
			}

			BelowTargetTime = 0.0f;
		}
	}
	// Upgrade check: FPS is at or above target
	else if (CurrentFPS >= TargetFPS)
	{
		AboveTargetTime += DeltaTime;
		BelowTargetTime = 0.0f; // Reset downgrade timer

		// Trigger upgrade if stable for threshold duration and we were dynamically downgraded
		if (AboveTargetTime >= UpgradeThresholdSeconds && bIsDynamicallyDowngraded)
		{
			// Determine next higher mode (step one level at a time)
			EKhaaosPerformanceMode UpgradedMode = CurrentMode;
			switch (CurrentMode)
			{
			case EKhaaosPerformanceMode::UltraPerformance:
				UpgradedMode = EKhaaosPerformanceMode::Performance;
				break;
			case EKhaaosPerformanceMode::Performance:
				UpgradedMode = EKhaaosPerformanceMode::Balanced;
				break;
			case EKhaaosPerformanceMode::Balanced:
				UpgradedMode = EKhaaosPerformanceMode::FullQuality;
				break;
			case EKhaaosPerformanceMode::FullQuality:
				// Already at highest — mark as no longer downgraded
				break;
			}

			if (UpgradedMode != CurrentMode)
			{
				EKhaaosPerformanceMode PreviousMode = CurrentMode;
				SetPerformanceMode(UpgradedMode);

				UE_LOG(LogKhaaosPerfBudget, Log, TEXT("KhaaosPerformanceBudget: DYNAMIC UPGRADE | FPS=%.1f >= Target=%.1f | Mode %d -> %d"),
					CurrentFPS, TargetFPS, static_cast<int32>(PreviousMode), static_cast<int32>(UpgradedMode));
			}

			// If we've recovered to or beyond the pre-downgrade mode, clear the flag
			if (CurrentMode >= PreDowngradeMode)
			{
				bIsDynamicallyDowngraded = false;
			}

			AboveTargetTime = 0.0f;
		}
	}
	else
	{
		// FPS is within hysteresis band — reset both timers
		BelowTargetTime = 0.0f;
		AboveTargetTime = 0.0f;
	}
}

// ─── Profile Database ────────────────────────────────────────────────────────

void UKhaaosPerformanceBudgetComponent::BuildDefaultProfiles()
{
	BuildProfilesForTarget(EKhaaosConsoleTarget::PC_High);
	BuildProfilesForTarget(EKhaaosConsoleTarget::PC_Medium);
	BuildProfilesForTarget(EKhaaosConsoleTarget::PS5);
	BuildProfilesForTarget(EKhaaosConsoleTarget::XSX);
	BuildProfilesForTarget(EKhaaosConsoleTarget::Switch2);
	BuildProfilesForTarget(EKhaaosConsoleTarget::Mobile);

	UE_LOG(LogKhaaosPerfBudget, Log, TEXT("KhaaosPerformanceBudget: Built all default profiles for 6 targets"));
}

void UKhaaosPerformanceBudgetComponent::BuildProfilesForTarget(EKhaaosConsoleTarget Target)
{
	TMap<EKhaaosPerformanceMode, FKhaaosPerformanceProfile> Profiles;

	switch (Target)
	{
	// ─── PC HIGH ─────────────────────────────────────────────────────────────
	case EKhaaosConsoleTarget::PC_High:
	{
		FKhaaosPerformanceProfile Full;
		Full.TargetFPS = 120; Full.MaxDrawDistance = 15000.0f; Full.MaxVisiblePlayers = 100;
		Full.MaxParticleSystems = 200; Full.MaxDecals = 1000; Full.ShadowQuality = 3;
		Full.ViewDistanceScale = 1.0f; Full.bMotionBlurEnabled = true;
		Full.AntiAliasingMethod = EKhaaosAAMethod::TAA; Full.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Balanced;
		Balanced.TargetFPS = 120; Balanced.MaxDrawDistance = 12000.0f; Balanced.MaxVisiblePlayers = 100;
		Balanced.MaxParticleSystems = 150; Balanced.MaxDecals = 750; Balanced.ShadowQuality = 2;
		Balanced.ViewDistanceScale = 0.85f; Balanced.bMotionBlurEnabled = true;
		Balanced.AntiAliasingMethod = EKhaaosAAMethod::TAA; Balanced.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Perf;
		Perf.TargetFPS = 120; Perf.MaxDrawDistance = 10000.0f; Perf.MaxVisiblePlayers = 80;
		Perf.MaxParticleSystems = 100; Perf.MaxDecals = 500; Perf.ShadowQuality = 1;
		Perf.ViewDistanceScale = 0.7f; Perf.bMotionBlurEnabled = false;
		Perf.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Perf.TextureResolution = 0.85f;

		FKhaaosPerformanceProfile Ultra;
		Ultra.TargetFPS = 120; Ultra.MaxDrawDistance = 8000.0f; Ultra.MaxVisiblePlayers = 60;
		Ultra.MaxParticleSystems = 50; Ultra.MaxDecals = 250; Ultra.ShadowQuality = 0;
		Ultra.ViewDistanceScale = 0.5f; Ultra.bMotionBlurEnabled = false;
		Ultra.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Ultra.TextureResolution = 0.7f;

		Profiles.Add(EKhaaosPerformanceMode::FullQuality, Full);
		Profiles.Add(EKhaaosPerformanceMode::Balanced, Balanced);
		Profiles.Add(EKhaaosPerformanceMode::Performance, Perf);
		Profiles.Add(EKhaaosPerformanceMode::UltraPerformance, Ultra);
		break;
	}

	// ─── PC MEDIUM ───────────────────────────────────────────────────────────
	case EKhaaosConsoleTarget::PC_Medium:
	{
		FKhaaosPerformanceProfile Full;
		Full.TargetFPS = 60; Full.MaxDrawDistance = 12000.0f; Full.MaxVisiblePlayers = 80;
		Full.MaxParticleSystems = 150; Full.MaxDecals = 750; Full.ShadowQuality = 2;
		Full.ViewDistanceScale = 0.85f; Full.bMotionBlurEnabled = true;
		Full.AntiAliasingMethod = EKhaaosAAMethod::TAA; Full.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Balanced;
		Balanced.TargetFPS = 60; Balanced.MaxDrawDistance = 10000.0f; Balanced.MaxVisiblePlayers = 60;
		Balanced.MaxParticleSystems = 100; Balanced.MaxDecals = 500; Balanced.ShadowQuality = 2;
		Balanced.ViewDistanceScale = 0.75f; Balanced.bMotionBlurEnabled = true;
		Balanced.AntiAliasingMethod = EKhaaosAAMethod::TAA; Balanced.TextureResolution = 0.9f;

		FKhaaosPerformanceProfile Perf;
		Perf.TargetFPS = 60; Perf.MaxDrawDistance = 8000.0f; Perf.MaxVisiblePlayers = 50;
		Perf.MaxParticleSystems = 75; Perf.MaxDecals = 300; Perf.ShadowQuality = 1;
		Perf.ViewDistanceScale = 0.6f; Perf.bMotionBlurEnabled = false;
		Perf.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Perf.TextureResolution = 0.75f;

		FKhaaosPerformanceProfile Ultra;
		Ultra.TargetFPS = 60; Ultra.MaxDrawDistance = 6000.0f; Ultra.MaxVisiblePlayers = 40;
		Ultra.MaxParticleSystems = 40; Ultra.MaxDecals = 150; Ultra.ShadowQuality = 0;
		Ultra.ViewDistanceScale = 0.4f; Ultra.bMotionBlurEnabled = false;
		Ultra.AntiAliasingMethod = EKhaaosAAMethod::None; Ultra.TextureResolution = 0.6f;

		Profiles.Add(EKhaaosPerformanceMode::FullQuality, Full);
		Profiles.Add(EKhaaosPerformanceMode::Balanced, Balanced);
		Profiles.Add(EKhaaosPerformanceMode::Performance, Perf);
		Profiles.Add(EKhaaosPerformanceMode::UltraPerformance, Ultra);
		break;
	}

	// ─── PS5 ─────────────────────────────────────────────────────────────────
	case EKhaaosConsoleTarget::PS5:
	{
		FKhaaosPerformanceProfile Full;
		Full.TargetFPS = 60; Full.MaxDrawDistance = 12000.0f; Full.MaxVisiblePlayers = 60;
		Full.MaxParticleSystems = 150; Full.MaxDecals = 750; Full.ShadowQuality = 3;
		Full.ViewDistanceScale = 1.0f; Full.bMotionBlurEnabled = true;
		Full.AntiAliasingMethod = EKhaaosAAMethod::TAA; Full.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Balanced;
		Balanced.TargetFPS = 60; Balanced.MaxDrawDistance = 10000.0f; Balanced.MaxVisiblePlayers = 60;
		Balanced.MaxParticleSystems = 120; Balanced.MaxDecals = 600; Balanced.ShadowQuality = 2;
		Balanced.ViewDistanceScale = 0.85f; Balanced.bMotionBlurEnabled = true;
		Balanced.AntiAliasingMethod = EKhaaosAAMethod::TAA; Balanced.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Perf;
		Perf.TargetFPS = 60; Perf.MaxDrawDistance = 8000.0f; Perf.MaxVisiblePlayers = 50;
		Perf.MaxParticleSystems = 80; Perf.MaxDecals = 400; Perf.ShadowQuality = 1;
		Perf.ViewDistanceScale = 0.65f; Perf.bMotionBlurEnabled = false;
		Perf.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Perf.TextureResolution = 0.85f;

		FKhaaosPerformanceProfile Ultra;
		Ultra.TargetFPS = 60; Ultra.MaxDrawDistance = 6000.0f; Ultra.MaxVisiblePlayers = 40;
		Ultra.MaxParticleSystems = 50; Ultra.MaxDecals = 200; Ultra.ShadowQuality = 0;
		Ultra.ViewDistanceScale = 0.45f; Ultra.bMotionBlurEnabled = false;
		Ultra.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Ultra.TextureResolution = 0.7f;

		Profiles.Add(EKhaaosPerformanceMode::FullQuality, Full);
		Profiles.Add(EKhaaosPerformanceMode::Balanced, Balanced);
		Profiles.Add(EKhaaosPerformanceMode::Performance, Perf);
		Profiles.Add(EKhaaosPerformanceMode::UltraPerformance, Ultra);
		break;
	}

	// ─── XSX ─────────────────────────────────────────────────────────────────
	case EKhaaosConsoleTarget::XSX:
	{
		// XSX profiles mirror PS5 with minor differences
		FKhaaosPerformanceProfile Full;
		Full.TargetFPS = 60; Full.MaxDrawDistance = 12000.0f; Full.MaxVisiblePlayers = 60;
		Full.MaxParticleSystems = 150; Full.MaxDecals = 750; Full.ShadowQuality = 3;
		Full.ViewDistanceScale = 1.0f; Full.bMotionBlurEnabled = true;
		Full.AntiAliasingMethod = EKhaaosAAMethod::TAA; Full.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Balanced;
		Balanced.TargetFPS = 60; Balanced.MaxDrawDistance = 10000.0f; Balanced.MaxVisiblePlayers = 60;
		Balanced.MaxParticleSystems = 120; Balanced.MaxDecals = 600; Balanced.ShadowQuality = 2;
		Balanced.ViewDistanceScale = 0.85f; Balanced.bMotionBlurEnabled = true;
		Balanced.AntiAliasingMethod = EKhaaosAAMethod::TAA; Balanced.TextureResolution = 1.0f;

		FKhaaosPerformanceProfile Perf;
		Perf.TargetFPS = 60; Perf.MaxDrawDistance = 8000.0f; Perf.MaxVisiblePlayers = 50;
		Perf.MaxParticleSystems = 80; Perf.MaxDecals = 400; Perf.ShadowQuality = 1;
		Perf.ViewDistanceScale = 0.65f; Perf.bMotionBlurEnabled = false;
		Perf.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Perf.TextureResolution = 0.85f;

		FKhaaosPerformanceProfile Ultra;
		Ultra.TargetFPS = 60; Ultra.MaxDrawDistance = 6000.0f; Ultra.MaxVisiblePlayers = 40;
		Ultra.MaxParticleSystems = 50; Ultra.MaxDecals = 200; Ultra.ShadowQuality = 0;
		Ultra.ViewDistanceScale = 0.45f; Ultra.bMotionBlurEnabled = false;
		Ultra.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Ultra.TextureResolution = 0.7f;

		Profiles.Add(EKhaaosPerformanceMode::FullQuality, Full);
		Profiles.Add(EKhaaosPerformanceMode::Balanced, Balanced);
		Profiles.Add(EKhaaosPerformanceMode::Performance, Perf);
		Profiles.Add(EKhaaosPerformanceMode::UltraPerformance, Ultra);
		break;
	}

	// ─── SWITCH 2 (Free Fire Parity: 30fps, reduced visuals) ─────────────────
	case EKhaaosConsoleTarget::Switch2:
	{
		FKhaaosPerformanceProfile Full;
		Full.TargetFPS = 30; Full.MaxDrawDistance = 8000.0f; Full.MaxVisiblePlayers = 30;
		Full.MaxParticleSystems = 60; Full.MaxDecals = 300; Full.ShadowQuality = 1;
		Full.ViewDistanceScale = 0.6f; Full.bMotionBlurEnabled = false;
		Full.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Full.TextureResolution = 0.75f;

		FKhaaosPerformanceProfile Balanced;
		Balanced.TargetFPS = 30; Balanced.MaxDrawDistance = 6000.0f; Balanced.MaxVisiblePlayers = 30;
		Balanced.MaxParticleSystems = 40; Balanced.MaxDecals = 200; Balanced.ShadowQuality = 1;
		Balanced.ViewDistanceScale = 0.5f; Balanced.bMotionBlurEnabled = false;
		Balanced.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Balanced.TextureResolution = 0.65f;

		FKhaaosPerformanceProfile Perf;
		Perf.TargetFPS = 30; Perf.MaxDrawDistance = 5000.0f; Perf.MaxVisiblePlayers = 25;
		Perf.MaxParticleSystems = 25; Perf.MaxDecals = 100; Perf.ShadowQuality = 0;
		Perf.ViewDistanceScale = 0.35f; Perf.bMotionBlurEnabled = false;
		Perf.AntiAliasingMethod = EKhaaosAAMethod::None; Perf.TextureResolution = 0.5f;

		FKhaaosPerformanceProfile Ultra;
		Ultra.TargetFPS = 30; Ultra.MaxDrawDistance = 4000.0f; Ultra.MaxVisiblePlayers = 20;
		Ultra.MaxParticleSystems = 15; Ultra.MaxDecals = 50; Ultra.ShadowQuality = 0;
		Ultra.ViewDistanceScale = 0.25f; Ultra.bMotionBlurEnabled = false;
		Ultra.AntiAliasingMethod = EKhaaosAAMethod::None; Ultra.TextureResolution = 0.4f;

		Profiles.Add(EKhaaosPerformanceMode::FullQuality, Full);
		Profiles.Add(EKhaaosPerformanceMode::Balanced, Balanced);
		Profiles.Add(EKhaaosPerformanceMode::Performance, Perf);
		Profiles.Add(EKhaaosPerformanceMode::UltraPerformance, Ultra);
		break;
	}

	// ─── MOBILE ──────────────────────────────────────────────────────────────
	case EKhaaosConsoleTarget::Mobile:
	{
		FKhaaosPerformanceProfile Full;
		Full.TargetFPS = 30; Full.MaxDrawDistance = 6000.0f; Full.MaxVisiblePlayers = 25;
		Full.MaxParticleSystems = 30; Full.MaxDecals = 150; Full.ShadowQuality = 0;
		Full.ViewDistanceScale = 0.4f; Full.bMotionBlurEnabled = false;
		Full.AntiAliasingMethod = EKhaaosAAMethod::FXAA; Full.TextureResolution = 0.6f;

		FKhaaosPerformanceProfile Balanced;
		Balanced.TargetFPS = 30; Balanced.MaxDrawDistance = 5000.0f; Balanced.MaxVisiblePlayers = 20;
		Balanced.MaxParticleSystems = 20; Balanced.MaxDecals = 100; Balanced.ShadowQuality = 0;
		Balanced.ViewDistanceScale = 0.35f; Balanced.bMotionBlurEnabled = false;
		Balanced.AntiAliasingMethod = EKhaaosAAMethod::None; Balanced.TextureResolution = 0.5f;

		FKhaaosPerformanceProfile Perf;
		Perf.TargetFPS = 30; Perf.MaxDrawDistance = 4000.0f; Perf.MaxVisiblePlayers = 15;
		Perf.MaxParticleSystems = 10; Perf.MaxDecals = 50; Perf.ShadowQuality = 0;
		Perf.ViewDistanceScale = 0.25f; Perf.bMotionBlurEnabled = false;
		Perf.AntiAliasingMethod = EKhaaosAAMethod::None; Perf.TextureResolution = 0.4f;

		FKhaaosPerformanceProfile Ultra;
		Ultra.TargetFPS = 30; Ultra.MaxDrawDistance = 3000.0f; Ultra.MaxVisiblePlayers = 10;
		Ultra.MaxParticleSystems = 5; Ultra.MaxDecals = 25; Ultra.ShadowQuality = 0;
		Ultra.ViewDistanceScale = 0.15f; Ultra.bMotionBlurEnabled = false;
		Ultra.AntiAliasingMethod = EKhaaosAAMethod::None; Ultra.TextureResolution = 0.3f;

		Profiles.Add(EKhaaosPerformanceMode::FullQuality, Full);
		Profiles.Add(EKhaaosPerformanceMode::Balanced, Balanced);
		Profiles.Add(EKhaaosPerformanceMode::Performance, Perf);
		Profiles.Add(EKhaaosPerformanceMode::UltraPerformance, Ultra);
		break;
	}

	default:
		break;
	}

	ProfileDatabase.Add(Target, MoveTemp(Profiles));
}

// ─── Console Variable Application ────────────────────────────────────────────

void UKhaaosPerformanceBudgetComponent::ApplyProfileCvars(const FKhaaosPerformanceProfile& Profile)
{
	IConsoleManager& ConsoleMgr = IConsoleManager::Get();

	// View distance scale
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.ViewDistanceScale")))
	{
		CVar->Set(Profile.ViewDistanceScale);
	}

	// Shadow quality
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.ShadowQuality")))
	{
		CVar->Set(Profile.ShadowQuality);
	}

	// Motion blur
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.MotionBlurQuality")))
	{
		CVar->Set(Profile.bMotionBlurEnabled ? 1 : 0);
	}

	// Texture detail (maps to r.TextureStreamingMipBias inversely)
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.TextureStreamingMipBias")))
	{
		// Higher TextureResolution -> lower MipBias (0.0 = full res, -2.0 = 1/4 res)
		float MipBias = (1.0f - Profile.TextureResolution) * -2.0f;
		CVar->Set(MipBias);
	}

	// Particle systems budget via scalability
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("fx.MaxParticleSystemsPreSimulate")))
	{
		CVar->Set(Profile.MaxParticleSystems);
	}

	// Decal budget
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.Decal.Steve")))
	{
		// r.Decal.LifeSpanScale as a proxy for budget control
		// Fall through silently if cvar not found
	}
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.Decal.FadeScreenSize")))
	{
		// Adjust decal fade based on budget (higher decal count = smaller fade threshold)
		float FadeScreenSize = 0.4f * (500.0f / FMath::Max(1.0f, static_cast<float>(Profile.MaxDecals)));
		CVar->Set(FadeScreenSize);
	}

	// Anti-aliasing
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("r.AntiAliasingMethod")))
	{
		int32 AAMethod = 0;
		switch (Profile.AntiAliasingMethod)
		{
		case EKhaaosAAMethod::None:   AAMethod = 0; break;
		case EKhaaosAAMethod::FXAA:   AAMethod = 1; break;
		case EKhaaosAAMethod::TAA:    AAMethod = 2; break;
		case EKhaaosAAMethod::MSAA2x: AAMethod = 3; break; // MFAA/MSAA mapped
		case EKhaaosAAMethod::MSAA4x: AAMethod = 4; break;
		default:                      AAMethod = 2; break;
		}
		CVar->Set(AAMethod);
	}

	// Max FPS cap
	if (auto* CVar = ConsoleMgr.FindConsoleVariable(TEXT("t.MaxFPS")))
	{
		CVar->Set(Profile.TargetFPS);
	}

	UE_LOG(LogKhaaosPerfBudget, Log, TEXT("KhaaosPerformanceBudget: Applied profile cvars | FPS=%d | VDS=%.2f | Shadows=%d | Tex=%.2f | AA=%d"),
		Profile.TargetFPS, Profile.ViewDistanceScale, Profile.ShadowQuality, Profile.TextureResolution,
		static_cast<int32>(Profile.AntiAliasingMethod));
}
