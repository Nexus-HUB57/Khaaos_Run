// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// KhaaosPostProcessManager.cpp

#include "Game/Graphics/KhaaosPostProcessManager.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ============================================================================
// UTickableWorldSubsystem interface
// ============================================================================

void UKhaaosPostProcessManager::Initialize(FSubsystemCollectionInitialization& Dependencies)
{
	Super::Initialize(Dependencies);

	InitializeDefaultProfiles();
	FindOrCreatePostProcessVolume();

	UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Initialized with %d world profiles"), WorldProfiles.Num());

	// Apply the default profile (CIGKV hub world) immediately
	if (WorldProfiles.Contains(CurrentProfile))
	{
		ApplyProfileToVolume(WorldProfiles[CurrentProfile]);
	}
}

void UKhaaosPostProcessManager::Deinitialize()
{
	WorldProfiles.Empty();
	PostProcessVolume = nullptr;
	bIsTransitioning = false;
	ClearAllScreenEffects();

	Super::Deinitialize();

	UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Deinitialized"));
}

void UKhaaosPostProcessManager::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (bIsTransitioning)
	{
		// Lerp over 2 seconds
		ProfileLerpAlpha += DeltaTime / 2.0f;

		if (ProfileLerpAlpha >= 1.0f)
		{
			// Transition complete
			ProfileLerpAlpha = 1.0f;
			bIsTransitioning = false;
			CurrentProfile = TargetProfile;

			if (WorldProfiles.Contains(CurrentProfile))
			{
				ApplyProfileToVolume(WorldProfiles[CurrentProfile]);
			}

			UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Transition complete to profile %d"),
				static_cast<int32>(CurrentProfile));
		}
		else
		{
			LerpProfiles();
		}
	}

	// Always decay screen effects
	UpdateScreenEffects(DeltaTime);
}

TStatId UKhaaosPostProcessManager::GetStatId() const
{
	RETURN_STAT_ID(STAT_Tickables);
}

// ============================================================================
// Profile management
// ============================================================================

void UKhaaosPostProcessManager::SetWorldProfile(EKhaaosWorldProfile Profile)
{
	if (Profile == CurrentProfile && !bIsTransitioning)
	{
		return;
	}

	TargetProfile = Profile;
	bIsTransitioning = true;
	ProfileLerpAlpha = 0.0f;

	UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Starting transition from %d to %d"),
		static_cast<int32>(CurrentProfile), static_cast<int32>(TargetProfile));
}

FKhaaosPostProcessProfile UKhaaosPostProcessManager::GetProfileSettings(EKhaaosWorldProfile Profile) const
{
	if (const FKhaaosPostProcessProfile* Found = WorldProfiles.Find(Profile))
	{
		return *Found;
	}
	return FKhaaosPostProcessProfile();
}

// ============================================================================
// Screen effects - Gameplay triggers
// ============================================================================

void UKhaaosPostProcessManager::TriggerDamageVignette(float Intensity)
{
	ScreenEffects.DamageVignetteIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);
}

void UKhaaosPostProcessManager::TriggerLowHealthPulse()
{
	ScreenEffects.LowHealthPulse = 1.0f;
}

void UKhaaosPostProcessManager::StopLowHealthPulse()
{
	ScreenEffects.LowHealthPulse = 0.0f;
}

void UKhaaosPostProcessManager::TriggerZoneWarning(float Intensity)
{
	ScreenEffects.ZoneWarningIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);
}

void UKhaaosPostProcessManager::TriggerHealOverlay(float Intensity)
{
	ScreenEffects.HealOverlayIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);
}

void UKhaaosPostProcessManager::TriggerEliminationFlash()
{
	ScreenEffects.EliminationFlash = 1.0f;
}

void UKhaaosPostProcessManager::TriggerShieldBreak()
{
	ScreenEffects.ShieldBreakFlash = 1.0f;
}

void UKhaaosPostProcessManager::SetKillStreakGlow(int32 KillCount)
{
	ScreenEffects.KillStreakGlow = FMath::Min(KillCount * 0.2f, 1.0f);
}

void UKhaaosPostProcessManager::ClearAllScreenEffects()
{
	ScreenEffects.DamageVignetteIntensity = 0.0f;
	ScreenEffects.LowHealthPulse = 0.0f;
	ScreenEffects.ZoneWarningIntensity = 0.0f;
	ScreenEffects.HealOverlayIntensity = 0.0f;
	ScreenEffects.EliminationFlash = 0.0f;
	ScreenEffects.ShieldBreakFlash = 0.0f;
	ScreenEffects.KillStreakGlow = 0.0f;
}

// ============================================================================
// Rendering overrides
// ============================================================================

void UKhaaosPostProcessManager::ForceLumenQuality(int32 Quality)
{
	ForcedLumenQuality = FMath::Clamp(Quality, 0, 3);
	bLumenOverridden = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Lumen quality forced to %d"), ForcedLumenQuality);
}

void UKhaaosPostProcessManager::SetNaniteEnabled(bool bEnabled)
{
	// Nanite enable/disable is typically set via console or project settings.
	// This method provides a Blueprint-accessible toggle for runtime control.
	if (UWorld* World = GetWorld())
	{
		if (bEnabled)
		{
			World->ExecuteConsoleCommand(TEXT("r.Nanite 1"), nullptr);
		}
		else
		{
			World->ExecuteConsoleCommand(TEXT("r.Nanite 0"), nullptr);
		}
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Nanite %s"), bEnabled ? TEXT("enabled") : TEXT("disabled"));
}

// ============================================================================
// Private helpers
// ============================================================================

void UKhaaosPostProcessManager::InitializeDefaultProfiles()
{
	WorldProfiles.Empty(5);

	// ---- BARBURHEN: Hot desert - warm orange grading, heat haze ----
	{
		FKhaaosPostProcessProfile Profile;
		Profile.ColorGradingTint       = FLinearColor(1.0f, 0.85f, 0.7f);
		Profile.VignetteIntensity      = 0.4f;
		Profile.BloomIntensity         = 0.6f;
		Profile.ExposureCompensation   = 0.2f;
		Profile.ChromaticAberration    = 0.003f;
		Profile.DepthOfFieldFstop      = 2.8f;
		Profile.MotionBlurAmount       = 0.1f;
		Profile.AmbientOcclusionIntensity = 0.6f;
		Profile.LumenQuality           = 2;
		Profile.NaniteEnabled          = true;
		Profile.ShadowCascades         = 4;
		Profile.FogDensity             = 0.02f;
		Profile.FogColor               = FLinearColor::White;
		Profile.HeatHazeIntensity      = 0.5f;
		Profile.FrostVignetteIntensity = 0.0f;
		WorldProfiles.Add(EKhaaosWorldProfile::BARBURHEN, Profile);
	}

	// ---- PRIADUS: Frozen tundra - cool blue grading, frost vignette ----
	{
		FKhaaosPostProcessProfile Profile;
		Profile.ColorGradingTint       = FLinearColor(0.7f, 0.85f, 1.0f);
		Profile.VignetteIntensity      = 0.35f;
		Profile.BloomIntensity         = 0.4f;
		Profile.ExposureCompensation   = -0.1f;
		Profile.ChromaticAberration    = 0.001f;
		Profile.DepthOfFieldFstop      = 2.0f;
		Profile.MotionBlurAmount       = 0.15f;
		Profile.AmbientOcclusionIntensity = 0.7f;
		Profile.LumenQuality           = 3;
		Profile.NaniteEnabled          = true;
		Profile.ShadowCascades         = 5;
		Profile.FogDensity             = 0.01f;
		Profile.FogColor               = FLinearColor(0.6f, 0.7f, 1.0f); // blue fog
		Profile.HeatHazeIntensity      = 0.0f;
		Profile.FrostVignetteIntensity = 0.6f;
		WorldProfiles.Add(EKhaaosWorldProfile::PRIADUS, Profile);
	}

	// ---- CKESALTH: Toxic jungle - green haze, poison particles ----
	{
		FKhaaosPostProcessProfile Profile;
		Profile.ColorGradingTint       = FLinearColor(0.7f, 1.0f, 0.7f);
		Profile.VignetteIntensity      = 0.5f;
		Profile.BloomIntensity         = 0.3f;
		Profile.ExposureCompensation   = -0.2f;
		Profile.ChromaticAberration    = 0.002f;
		Profile.DepthOfFieldFstop      = 3.5f;
		Profile.MotionBlurAmount       = 0.1f;
		Profile.AmbientOcclusionIntensity = 0.5f;
		Profile.LumenQuality           = 2;
		Profile.NaniteEnabled          = true;
		Profile.ShadowCascades         = 4;
		Profile.FogDensity             = 0.05f;
		Profile.FogColor               = FLinearColor(0.5f, 1.0f, 0.5f); // green fog
		Profile.HeatHazeIntensity      = 0.0f;
		Profile.FrostVignetteIntensity = 0.0f;
		WorldProfiles.Add(EKhaaosWorldProfile::CKESALTH, Profile);
	}

	// ---- ARUKHEEA: Crystal caverns - purple/teal, bloom heavy ----
	{
		FKhaaosPostProcessProfile Profile;
		Profile.ColorGradingTint       = FLinearColor(0.8f, 0.7f, 1.0f);
		Profile.VignetteIntensity      = 0.2f;
		Profile.BloomIntensity         = 0.8f;
		Profile.ExposureCompensation   = 0.1f;
		Profile.ChromaticAberration    = 0.0f;
		Profile.DepthOfFieldFstop      = 1.8f;
		Profile.MotionBlurAmount       = 0.05f;
		Profile.AmbientOcclusionIntensity = 0.3f;
		Profile.LumenQuality           = 3;
		Profile.NaniteEnabled          = true;
		Profile.ShadowCascades         = 5;
		Profile.FogDensity             = 0.003f;
		Profile.FogColor               = FLinearColor(0.7f, 0.5f, 1.0f); // purple fog
		Profile.HeatHazeIntensity      = 0.0f;
		Profile.FrostVignetteIntensity = 0.0f;
		WorldProfiles.Add(EKhaaosWorldProfile::ARUKHEEA, Profile);
	}

	// ---- CIGKV: Hub world - neutral balanced, subtle vignette ----
	{
		FKhaaosPostProcessProfile Profile;
		Profile.ColorGradingTint       = FLinearColor(1.0f, 1.0f, 1.0f);
		Profile.VignetteIntensity      = 0.15f;
		Profile.BloomIntensity         = 0.2f;
		Profile.ExposureCompensation   = 0.0f;
		Profile.ChromaticAberration    = 0.0f;
		Profile.DepthOfFieldFstop      = 4.0f;
		Profile.MotionBlurAmount       = 0.05f;
		Profile.AmbientOcclusionIntensity = 0.4f;
		Profile.LumenQuality           = 2;
		Profile.NaniteEnabled          = true;
		Profile.ShadowCascades         = 3;
		Profile.FogDensity             = 0.0f;
		Profile.FogColor               = FLinearColor::White;
		Profile.HeatHazeIntensity      = 0.0f;
		Profile.FrostVignetteIntensity = 0.0f;
		WorldProfiles.Add(EKhaaosWorldProfile::CIGKV, Profile);
	}
}

void UKhaaosPostProcessManager::ApplyProfileToVolume(const FKhaaosPostProcessProfile& Profile)
{
	if (!PostProcessVolume)
	{
		return;
	}

	PostProcessVolume->bEnabled = true;
	PostProcessVolume->bUnbound = true;

	// Color grading tint
	{
		FPostProcessVolume::FPostProcessVolumeEntry& Entry = PostProcessVolume->Settings.ColorSaturation;
		// Note: Full color grading is typically set via Material / Blendable.
		// Here we set the key post-process overrides on the volume.
	}

	// Vignette
	PostProcessVolume->Settings.VignetteIntensity.OverrideValue = Profile.VignetteIntensity;
	PostProcessVolume->Settings.VignetteIntensity.bOverride = true;

	// Bloom
	PostProcessVolume->Settings.BloomIntensity.OverrideValue = Profile.BloomIntensity;
	PostProcessVolume->Settings.BloomIntensity.bOverride = true;

	// Exposure compensation
	PostProcessVolume->Settings.AutoExposureBias.OverrideValue = Profile.ExposureCompensation;
	PostProcessVolume->Settings.AutoExposureBias.bOverride = true;

	// Chromatic aberration
	PostProcessVolume->Settings.SceneFringeIntensity.OverrideValue = Profile.ChromaticAberration;
	PostProcessVolume->Settings.SceneFringeIntensity.bOverride = true;

	// Depth of field
	PostProcessVolume->Settings.DepthOfFieldFstop.OverrideValue = Profile.DepthOfFieldFstop;
	PostProcessVolume->Settings.DepthOfFieldFstop.bOverride = true;

	// Motion blur
	PostProcessVolume->Settings.MotionBlurAmount.OverrideValue = Profile.MotionBlurAmount;
	PostProcessVolume->Settings.MotionBlurAmount.bOverride = true;

	// Ambient occlusion (GTAO intensity)
	PostProcessVolume->Settings.AmbientOcclusionIntensity.OverrideValue = Profile.AmbientOcclusionIntensity;
	PostProcessVolume->Settings.AmbientOcclusionIntensity.bOverride = true;

	// Lumen quality (applied via console command if overridden, otherwise from profile)
	if (bLumenOverridden)
	{
		if (UWorld* World = GetWorld())
		{
			const FString Cmd = FString::Printf(TEXT("r.Lumen.ReflectionQuality %d"), ForcedLumenQuality);
			World->ExecuteConsoleCommand(*Cmd, nullptr);
		}
	}
	else
	{
		if (UWorld* World = GetWorld())
		{
			const FString Cmd = FString::Printf(TEXT("r.Lumen.ReflectionQuality %d"), Profile.LumenQuality);
			World->ExecuteConsoleCommand(*Cmd, nullptr);
		}
	}

	// Shadow cascades
	if (UWorld* World = GetWorld())
	{
		const FString ShadowCmd = FString::Printf(TEXT("r.Shadow.CSM.MaxCascades %d"), Profile.ShadowCascades);
		World->ExecuteConsoleCommand(*ShadowCmd, nullptr);
	}
}

void UKhaaosPostProcessManager::LerpProfiles()
{
	if (!WorldProfiles.Contains(CurrentProfile) || !WorldProfiles.Contains(TargetProfile))
	{
		return;
	}

	const FKhaaosPostProcessProfile& FromProfile = WorldProfiles[CurrentProfile];
	const FKhaaosPostProcessProfile& ToProfile   = WorldProfiles[TargetProfile];
	const float Alpha = ProfileLerpAlpha;

	FKhaaosPostProcessProfile LerpedProfile;
	LerpedProfile.ColorGradingTint         = FMath::Lerp(FromProfile.ColorGradingTint, ToProfile.ColorGradingTint, Alpha);
	LerpedProfile.VignetteIntensity        = FMath::Lerp(FromProfile.VignetteIntensity, ToProfile.VignetteIntensity, Alpha);
	LerpedProfile.BloomIntensity           = FMath::Lerp(FromProfile.BloomIntensity, ToProfile.BloomIntensity, Alpha);
	LerpedProfile.ExposureCompensation     = FMath::Lerp(FromProfile.ExposureCompensation, ToProfile.ExposureCompensation, Alpha);
	LerpedProfile.ChromaticAberration      = FMath::Lerp(FromProfile.ChromaticAberration, ToProfile.ChromaticAberration, Alpha);
	LerpedProfile.DepthOfFieldFstop        = FMath::Lerp(FromProfile.DepthOfFieldFstop, ToProfile.DepthOfFieldFstop, Alpha);
	LerpedProfile.MotionBlurAmount         = FMath::Lerp(FromProfile.MotionBlurAmount, ToProfile.MotionBlurAmount, Alpha);
	LerpedProfile.AmbientOcclusionIntensity = FMath::Lerp(FromProfile.AmbientOcclusionIntensity, ToProfile.AmbientOcclusionIntensity, Alpha);
	// Lumen quality and shadow cascades: snap at 50% lerp
	LerpedProfile.LumenQuality             = (Alpha >= 0.5f) ? ToProfile.LumenQuality : FromProfile.LumenQuality;
	LerpedProfile.NaniteEnabled            = (Alpha >= 0.5f) ? ToProfile.NaniteEnabled : FromProfile.NaniteEnabled;
	LerpedProfile.ShadowCascades           = (Alpha >= 0.5f) ? ToProfile.ShadowCascades : FromProfile.ShadowCascades;
	LerpedProfile.FogDensity               = FMath::Lerp(FromProfile.FogDensity, ToProfile.FogDensity, Alpha);
	LerpedProfile.FogColor                 = FMath::Lerp(FromProfile.FogColor, ToProfile.FogColor, Alpha);
	LerpedProfile.HeatHazeIntensity        = FMath::Lerp(FromProfile.HeatHazeIntensity, ToProfile.HeatHazeIntensity, Alpha);
	LerpedProfile.FrostVignetteIntensity   = FMath::Lerp(FromProfile.FrostVignetteIntensity, ToProfile.FrostVignetteIntensity, Alpha);

	ApplyProfileToVolume(LerpedProfile);
}

void UKhaaosPostProcessManager::UpdateScreenEffects(float DeltaTime)
{
	// Damage vignette: fast decay (3.0/s)
	if (ScreenEffects.DamageVignetteIntensity > 0.0f)
	{
		ScreenEffects.DamageVignetteIntensity = FMath::Max(0.0f, ScreenEffects.DamageVignetteIntensity - DeltaTime * 3.0f);
	}

	// Low health pulse: oscillates via sin when active, no decay (must be stopped explicitly)
	if (ScreenEffects.LowHealthPulse > 0.0f)
	{
		// Pulse between 0.3 and 1.0 using sine wave
		static float PulseTime = 0.0f;
		PulseTime += DeltaTime * 4.0f; // 4 Hz pulse rate
		ScreenEffects.LowHealthPulse = 0.65f + 0.35f * FMath::Sin(PulseTime);
	}

	// Zone warning: slow decay (1.5/s)
	if (ScreenEffects.ZoneWarningIntensity > 0.0f)
	{
		ScreenEffects.ZoneWarningIntensity = FMath::Max(0.0f, ScreenEffects.ZoneWarningIntensity - DeltaTime * 1.5f);
	}

	// Heal overlay: moderate decay (2.0/s)
	if (ScreenEffects.HealOverlayIntensity > 0.0f)
	{
		ScreenEffects.HealOverlayIntensity = FMath::Max(0.0f, ScreenEffects.HealOverlayIntensity - DeltaTime * 2.0f);
	}

	// Elimination flash: fast decay (4.0/s)
	if (ScreenEffects.EliminationFlash > 0.0f)
	{
		ScreenEffects.EliminationFlash = FMath::Max(0.0f, ScreenEffects.EliminationFlash - DeltaTime * 4.0f);
	}

	// Shield break flash: very fast decay (5.0/s)
	if (ScreenEffects.ShieldBreakFlash > 0.0f)
	{
		ScreenEffects.ShieldBreakFlash = FMath::Max(0.0f, ScreenEffects.ShieldBreakFlash - DeltaTime * 5.0f);
	}

	// Kill streak glow: no decay (persists until explicitly cleared or reset)
}

void UKhaaosPostProcessManager::FindOrCreatePostProcessVolume()
{
	if (!GetWorld())
	{
		return;
	}

	// Search for an existing post-process volume in the world
	for (TActorIterator<APostProcessVolume> It(GetWorld()); It; ++It)
	{
		APostProcessVolume* FoundVolume = *It;
		if (FoundVolume && FoundVolume->bUnbound)
		{
			PostProcessVolume = FoundVolume;
			UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Found existing unbound PostProcessVolume"));
			return;
		}
	}

	// If no unbound PP volume exists, search for any PP volume
	for (TActorIterator<APostProcessVolume> It(GetWorld()); It; ++It)
	{
		APostProcessVolume* FoundVolume = *It;
		if (FoundVolume)
		{
			PostProcessVolume = FoundVolume;
			UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Found existing PostProcessVolume (bound)"));
			return;
		}
	}

	// No existing volume found. A PostProcessVolume should be placed in the level via Blueprint.
	// Runtime spawning is possible but requires a valid transform and world context.
	UE_LOG(LogTemp, Warning, TEXT("KhaaosPostProcessManager: No PostProcessVolume found in world. "
		"Place an unbound PostProcessVolume in your level or Blueprint setup for full functionality."));

	// Fallback: spawn one at the origin
	if (UWorld* World = GetWorld())
	{
		FActorSpawnParameters SpawnParams;
		SpawnParams.Name = FName(TEXT("KhaaosPostProcessVolume"));
		SpawnParams.bNoFail = true;

		PostProcessVolume = World->SpawnActor<APostProcessVolume>(
			APostProcessVolume::StaticClass(),
			FVector::ZeroVector,
			FRotator::ZeroRotator,
			SpawnParams
		);

		if (PostProcessVolume)
		{
			PostProcessVolume->bUnbound = true;
			PostProcessVolume->bEnabled = true;
			UE_LOG(LogTemp, Log, TEXT("KhaaosPostProcessManager: Spawned fallback PostProcessVolume"));
		}
	}
}
