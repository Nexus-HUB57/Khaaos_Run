// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// KhaaosPostProcessManager.h
// Post-Process Manager subsystem: per-world post-process profiles, Lumen/Nanite settings,
// and screen-space effects for the 5 Khaaos Run worlds.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/TickableWorldSubsystem.h"
#include "Engine/PostProcessVolume.h"
#include "KhaaosPostProcessManager.generated.h"

/**
 * World profile enum mapping to the 5 Khaaos Run worlds.
 * Each profile drives a unique post-process configuration for visual identity.
 */
UENUM(BlueprintType)
enum class EKhaaosWorldProfile : uint8
{
	BARBURHEN	UMETA(DisplayName = "Barburhen", ToolTip = "Hot desert - warm orange grading, heat haze"),
	PRIADUS		UMETA(DisplayName = "Priadus", ToolTip = "Frozen tundra - cool blue grading, frost vignette"),
	CKESALTH	UMETA(DisplayName = "Ckesalth", ToolTip = "Toxic jungle - green haze, poison particles"),
	ARUKHEEA	UMETA(DisplayName = "Arukheea", ToolTip = "Crystal caverns - purple/teal, bloom heavy"),
	CIGKV		UMETA(DisplayName = "CIGKV", ToolTip = "Hub world - neutral balanced, subtle vignette")
};

/**
 * Full post-process profile for a Khaaos world.
 * Contains color grading, screen effects, Lumen/Nanite, fog, and world-specific overrides.
 */
USTRUCT(BlueprintType)
struct FKhaaosPostProcessProfile
{
	GENERATED_BODY()

	/** World color tint applied via color grading */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ColorGrading")
	FLinearColor ColorGradingTint = FLinearColor::White;

	/** Vignette intensity (0 = off, 1 = max) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ScreenEffects", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float VignetteIntensity = 0.3f;

	/** Bloom intensity */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ScreenEffects", meta = (ClampMin = "0.0"))
	float BloomIntensity = 0.5f;

	/** Exposure compensation (stops) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ScreenEffects")
	float ExposureCompensation = 0.0f;

	/** Chromatic aberration amount */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ScreenEffects", meta = (ClampMin = "0.0"))
	float ChromaticAberration = 0.0f;

	/** Depth of field F-stop */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "DepthOfField", meta = (ClampMin = "1.0"))
	float DepthOfFieldFstop = 2.8f;

	/** Motion blur amount */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MotionBlur", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float MotionBlurAmount = 0.2f;

	/** Ambient occlusion intensity */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AmbientOcclusion", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float AmbientOcclusionIntensity = 0.5f;

	/** Lumen quality level (0=Off, 1=Low, 2=Med, 3=High) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rendering", meta = (ClampMin = "0", ClampMax = "3"))
	int32 LumenQuality = 2;

	/** Enable Nanite virtualized geometry */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rendering")
	bool NaniteEnabled = true;

	/** Number of shadow cascades */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shadows", meta = (ClampMin = "1", ClampMax = "10"))
	int32 ShadowCascades = 4;

	/** Atmospheric fog density */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fog", meta = (ClampMin = "0.0"))
	float FogDensity = 0.0f;

	/** Fog color */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fog")
	FLinearColor FogColor = FLinearColor::White;

	/** Heat haze intensity - Barburhen specific */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSpecific", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HeatHazeIntensity = 0.0f;

	/** Frost vignette intensity - Priadus specific */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSpecific", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float FrostVignetteIntensity = 0.0f;
};

/**
 * Runtime state of gameplay-driven screen-space effects.
 * These are layered on top of the world post-process profile.
 */
USTRUCT(BlueprintType)
struct FKhaaosScreenEffectState
{
	GENERATED_BODY()

	/** Red damage vignette intensity (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Damage", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float DamageVignetteIntensity = 0.0f;

	/** Low health pulsing overlay (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Health", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float LowHealthPulse = 0.0f;

	/** Zone danger warning vignette (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zone", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float ZoneWarningIntensity = 0.0f;

	/** Green heal overlay intensity (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Heal", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HealOverlayIntensity = 0.0f;

	/** White elimination flash (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Elimination", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float EliminationFlash = 0.0f;

	/** Blue shield break flash (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shield", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float ShieldBreakFlash = 0.0f;

	/** Golden kill streak glow (0-1) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Streak", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float KillStreakGlow = 0.0f;
};

/**
 * UKhaaosPostProcessManager
 *
 * Tickable world subsystem that manages per-world post-process profiles,
 * Lumen/Nanite rendering settings, and screen-space gameplay effects
 * for the 5 Khaaos Run worlds. Transitions between world profiles are
 * lerped over 2 seconds for smooth visual changes.
 */
UCLASS(Abstract, BlueprintType, Blueprintable, Config = Game, defaultconfig)
class UKhaaosPostProcessManager : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	//~ UTickableWorldSubsystem interface
	virtual void Initialize(FSubsystemCollectionInitialization& Dependencies) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;
	//~ End UTickableWorldSubsystem interface

	/** Transition to a new world post-process profile (lerps over 2 seconds) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcess")
	void SetWorldProfile(EKhaaosWorldProfile Profile);

	/** Get the currently active world profile */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PostProcess")
	EKhaaosWorldProfile GetCurrentProfile() const { return CurrentProfile; }

	/** Get the post-process settings for a given world profile */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PostProcess")
	FKhaaosPostProcessProfile GetProfileSettings(EKhaaosWorldProfile Profile) const;

	/** Flash a red damage vignette at the given intensity (0-1) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerDamageVignette(float Intensity);

	/** Enable the pulsing low-health overlay */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerLowHealthPulse();

	/** Disable the pulsing low-health overlay */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void StopLowHealthPulse();

	/** Show the zone danger warning vignette at the given intensity (0-1) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerZoneWarning(float Intensity);

	/** Show the green heal overlay at the given intensity (0-1) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerHealOverlay(float Intensity);

	/** Flash white on an elimination kill */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerEliminationFlash();

	/** Flash blue on a shield break */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerShieldBreak();

	/** Set golden kill streak glow based on kill count (scaled by 0.2, capped at 1.0) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void SetKillStreakGlow(int32 KillCount);

	/** Reset all screen effects to zero */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void ClearAllScreenEffects();

	/** Override Lumen quality level (0=Off, 1=Low, 2=Med, 3=High) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Rendering")
	void ForceLumenQuality(int32 Quality);

	/** Toggle Nanite virtualized geometry on/off */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Rendering")
	void SetNaniteEnabled(bool bEnabled);

private:
	/** Currently active world profile */
	UPROPERTY(VisibleAnywhere, Category = "Khaaos|State")
	EKhaaosWorldProfile CurrentProfile = EKhaaosWorldProfile::CIGKV;

	/** Target profile during a transition */
	EKhaaosWorldProfile TargetProfile = EKhaaosWorldProfile::CIGKV;

	/** Interpolation alpha for profile transitions (0 = current, 1 = target) */
	float ProfileLerpAlpha = 0.0f;

	/** Whether we are currently transitioning between profiles */
	bool bIsTransitioning = false;

	/** Runtime screen effect state */
	UPROPERTY(VisibleAnywhere, Category = "Khaaos|State")
	FKhaaosScreenEffectState ScreenEffects;

	/** Map of world profiles to their post-process settings */
	UPROPERTY(VisibleAnywhere, Category = "Khaaos|Profiles")
	TMap<EKhaaosWorldProfile, FKhaaosPostProcessProfile> WorldProfiles;

	/** Reference to the world's post-process volume */
	UPROPERTY()
	TObjectPtr<APostProcessVolume> PostProcessVolume;

	/** Whether Lumen quality has been manually overridden */
	bool bLumenOverridden = false;

	/** Forced Lumen quality level when overridden */
	int32 ForcedLumenQuality = 2;

	/** Populate WorldProfiles with default settings for all 5 worlds */
	void InitializeDefaultProfiles();

	/** Apply a profile's settings to the post-process volume */
	void ApplyProfileToVolume(const FKhaaosPostProcessProfile& Profile);

	/** Interpolate between current and target profiles during transition */
	void LerpProfiles();

	/** Decay transient screen effects over time */
	void UpdateScreenEffects(float DeltaTime);

	/** Find an existing post-process volume in the world or create one */
	void FindOrCreatePostProcessVolume();
};
