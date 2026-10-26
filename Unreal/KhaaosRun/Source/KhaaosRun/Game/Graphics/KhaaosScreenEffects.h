// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// KhaaosScreenEffects.h - Screen Effects System for damage vignettes, health pulses,
// zone warnings, heal overlays, elimination flashes, shield breaks, kill streak glows,
// world transitions, and revive effects. Integrates with UMG widgets and PostProcess.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosScreenEffects.generated.h"

// ============================================================================
// Enum: Screen Effect Types
// ============================================================================

/** All supported screen overlay effect types for the Battle Royale HUD. */
UENUM(BlueprintType)
enum class EKhaaosScreenEffectType : uint8
{
	DAMAGE_VIGNETTE			UMETA(DisplayName = "Damage Vignette"),			// Red damage flash
	LOW_HEALTH_PULSE		UMETA(DisplayName = "Low Health Pulse"),		// Pulsing red overlay when HP < 30
	ZONE_WARNING			UMETA(DisplayName = "Zone Warning"),			// Blue/yellow zone danger pulse
	HEAL_OVERLAY				UMETA(DisplayName = "Heal Overlay"),			// Green heal regeneration effect
	ELIMINATION_FLASH		UMETA(DisplayName = "Elimination Flash"),		// White flash on scoring a kill
	SHIELD_BREAK				UMETA(DisplayName = "Shield Break"),			// Blue flash when shield breaks
	KILL_STREAK_GLOW		UMETA(DisplayName = "Kill Streak Glow"),		// Golden glow border for 3+ kill streaks
	WORLD_TRANSITION_FLASH	UMETA(DisplayName = "World Transition Flash"),	// White fade for world transitions
	REVIVE_EFFECT			UMETA(DisplayName = "Revive Effect")			// Golden pulse during revive
};

// ============================================================================
// Struct: Screen Effect Configuration
// ============================================================================

/** Configuration for a single screen effect instance. */
USTRUCT(BlueprintType)
struct FKhaaosScreenEffectConfig
{
	GENERATED_BODY()

	/** The type of screen effect. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	EKhaaosScreenEffectType EffectType = EKhaaosScreenEffectType::DAMAGE_VIGNETTE;

	/** Color of the overlay effect. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	FLinearColor Color = FLinearColor::White;

	/** Maximum intensity (0.0 - 1.0+). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	float MaxIntensity = 1.0f;

	/** Time in seconds to fade in from zero to MaxIntensity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	float FadeInTime = 0.1f;

	/** Time in seconds to fade out from current intensity to zero. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	float FadeOutTime = 0.5f;

	/** Whether the effect loops (pulses) after fade-in. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	bool bIsLooping = false;

	/** Frequency in Hz for pulsing effects. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	float LoopFrequency = 1.0f;

	/** Priority for rendering order; higher = renders on top. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	int32 Priority = 0;
};

// ============================================================================
// Struct: Active Screen Effect State
// ============================================================================

/** Runtime state for an active screen effect. */
USTRUCT(BlueprintType)
struct FKhaaosActiveScreenEffect
{
	GENERATED_BODY()

	/** Configuration of this effect. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	FKhaaosScreenEffectConfig Config;

	/** Current interpolated intensity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	float CurrentIntensity = 0.0f;

	/** Time elapsed since effect started. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	float ElapsedTime = 0.0f;

	/** Whether this effect is still active. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	bool bIsActive = true;

	/** Whether this effect is currently fading out. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|ScreenEffects")
	bool bIsFadingOut = false;
};

// ============================================================================
// Delegate Declarations
// ============================================================================

/** Broadcast when a screen effect is triggered. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKhaaosEffectTriggered, EKhaaosScreenEffectType, EffectType, float, Intensity);

/** Broadcast when a screen effect finishes and is removed. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKhaaosEffectFinished, EKhaaosScreenEffectType, EffectType);

// ============================================================================
// Class: UKhaaosScreenEffects
// ============================================================================

/**
 * UKhaaosScreenEffects - Screen Effects Component
 *
 * Manages damage vignettes, low health pulsing, zone warning overlays,
 * heal effects, elimination flashes, shield breaks, kill streak glows,
 * world transition flashes, and revive effects.
 *
 * Integrates with UMG widgets for UI overlay rendering and with the
 * PostProcess volume for material-based effects.
 *
 * FreeFire-critical feature for Khaaos Run Battle Royale.
 */
UCLASS(ClassGroup=(Khaaos, UI), meta=(BlueprintSpawnableComponent))
class UKhaaosScreenEffects : public UActorComponent
{
	GENERATED_BODY()

public:

	// -----------------------------------------------------------------------
	// Construction / Lifecycle
	// -----------------------------------------------------------------------

	UKhaaosScreenEffects();

	virtual void BeginPlay() override;

	// -----------------------------------------------------------------------
	// Delegates
	// -----------------------------------------------------------------------

	/** Broadcast when a screen effect is triggered. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|ScreenEffects|Delegates")
	FOnKhaaosEffectTriggered OnEffectTriggered;

	/** Broadcast when a screen effect finishes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|ScreenEffects|Delegates")
	FOnKhaaosEffectFinished OnEffectFinished;

	// -----------------------------------------------------------------------
	// Effect Triggers
	// -----------------------------------------------------------------------

	/** Trigger a red damage vignette flash. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerDamageVignette(float Intensity = 1.0f);

	/** Start a looping red pulse for low health (HP < 30). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void StartLowHealthPulse();

	/** Stop and fade out the low health pulse. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void StopLowHealthPulse();

	/** Trigger a zone warning pulse (blue/yellow danger zone). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerZoneWarning(float Intensity = 0.8f);

	/** Stop the zone warning pulse. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void StopZoneWarning();

	/** Trigger a green heal regeneration overlay. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerHealOverlay(float Intensity = 0.5f);

	/** Trigger a white elimination flash on scoring a kill. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerEliminationFlash();

	/** Trigger a blue shield break flash. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerShieldBreak();

	/** Set kill streak glow for the given kill count. Active for kills >= 3. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void SetKillStreakGlow(int32 KillCount);

	/** Clear the kill streak glow. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void ClearKillStreakGlow();

	/** Trigger a full-screen white fade for world transitions. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerWorldTransitionFlash();

	/** Trigger a golden pulse effect during revive. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void TriggerReviveEffect();

	// -----------------------------------------------------------------------
	// Control
	// -----------------------------------------------------------------------

	/** Immediately clear all active screen effects. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void ClearAllEffects();

	/** Set the global intensity multiplier (clamped 0-2, default 1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|ScreenEffects")
	void SetGlobalIntensityMultiplier(float Multiplier);

	// -----------------------------------------------------------------------
	// Query
	// -----------------------------------------------------------------------

	/** Check if an effect of the given type is currently active. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ScreenEffects")
	bool IsEffectActive(EKhaaosScreenEffectType Type) const;

	/** Get the current intensity of an effect of the given type. Returns 0 if not active. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ScreenEffects")
	float GetEffectIntensity(EKhaaosScreenEffectType Type) const;

	/** Get the number of currently active effects. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ScreenEffects")
	int32 GetActiveEffectCount() const;

private:

	// -----------------------------------------------------------------------
	// Internal State
	// -----------------------------------------------------------------------

	/** Array of currently active screen effects. */
	UPROPERTY(Transient)
	TArray<FKhaaosActiveScreenEffect> ActiveEffects;

	/** Global intensity multiplier applied to all effects (0-2, default 1). */
	UPROPERTY(Transient)
	float GlobalIntensityMultiplier = 1.0f;

	// -----------------------------------------------------------------------
	// Internal Helpers
	// -----------------------------------------------------------------------

	/** Find an active effect by type. Returns nullptr if not found. */
	FKhaaosActiveScreenEffect* FindActiveEffect(EKhaaosScreenEffectType Type);

	/** Add a new effect or update an existing one of the same type. */
	void AddOrUpdateEffect(const FKhaaosScreenEffectConfig& InConfig);

	/** Tick all active effects: handle fade in/out, looping, intensity. */
	void UpdateEffects(float DeltaTime);

	/** Remove all finished (inactive) effects from the array. */
	void RemoveFinishedEffects();
};
