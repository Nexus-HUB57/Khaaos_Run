// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Audio/KhaaosAdaptiveMusic.generated.h"

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * EMusicState
 *
 * Adaptive music states that map to gameplay situations.
 * The music system crossfades between these states smoothly.
 */
UENUM(BlueprintType)
enum class EMusicState : uint8
{
	/** Main menu / loading. */
	Menu         UMETA(DisplayName = "Menu"),

	/** Lobby / waiting for match. */
	Lobby        UMETA(DisplayName = "Lobby"),

	/** Free exploration / ambient. */
	Exploration  UMETA(DisplayName = "Exploration"),

	/** Tension building (zone shrink, enemy nearby). */
	Tension      UMETA(DisplayName = "Tension"),

	/** Active combat. */
	Combat       UMETA(DisplayName = "Combat"),

	/** Match won. */
	Victory      UMETA(DisplayName = "Victory"),

	/** Match lost / eliminated. */
	Defeat       UMETA(DisplayName = "Defeat")
};

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FAdaptiveMusicState
 *
 * Runtime state of the adaptive music system.
 * Tracks current and target states, transition progress.
 */
USTRUCT(BlueprintType)
struct FAdaptiveMusicState
{
	GENERATED_BODY()

	/** Current active music state. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	EMusicState CurrentState = EMusicState::Menu;

	/** Target state for crossfade transition. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	EMusicState TargetState = EMusicState::Menu;

	/** Crossfade progress [0, 1]. 0 = fully current, 1 = fully target. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	float TransitionProgress = 0.0f;

	/** Crossfade duration in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	float CrossfadeTime = 2.0f;

	/** Whether a transition is in progress. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	uint8 bIsTransitioning : 1;
};

/**
 * UKhaaosAdaptiveMusic
 *
 * Adaptive music subsystem for Khaaos Run.
 * Manages music intensity, state transitions, and crossfades.
 *
 * Design:
 *   - Intensity parameter (0.0 → 1.0) drives music complexity
 *   - 0.0 = ambient/exploration, 1.0 = full combat
 *   - Game events escalate/de-escalate intensity automatically
 *   - Smooth crossfades between music states
 *   - MetaSound Intensity parameter updated in real-time
 *
 * Event Bindings:
 *   - OnCombatStart → escalate intensity to Combat
 *   - OnCombatEnd → de-escalate with configurable delay
 *   - OnZoneShrink → escalate to Tension
 *   - OnMatchEnd → transition to Victory or Defeat
 *
 * Tick:
 *   - UpdateMusic() called each frame to handle crossfades
 *     and intensity parameter updates
 */
UCLASS(Config = Game, defaultconfig)
class UKhaaosAdaptiveMusic : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosAdaptiveMusic();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaSeconds);

	// ─── Intensity Control ────────────────────────────────────────────────────

	/**
	 * Set music intensity level.
	 * @param Intensity  0.0 (ambient) → 1.0 (full combat)
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Music")
	void SetMusicIntensity(float Intensity);

	/** Get current music intensity. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Music")
	float GetMusicIntensity() const { return CurrentIntensity; }

	// ─── State Transitions ────────────────────────────────────────────────────

	/**
	 * Transition to a specific music state.
	 * @param State  Target music state
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Music")
	void TransitionToState(EMusicState State);

	/** Get current music state. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Music")
	EMusicState GetCurrentState() const { return MusicStateData.CurrentState; }

	// ─── Game Event Bindings ──────────────────────────────────────────────────

	/** Called when combat starts — auto-escalate intensity. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Music")
	void OnCombatStart();

	/** Called when combat ends — de-escalate with delay. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Music")
	void OnCombatEnd();

	/** Called when zone starts shrinking — escalate to Tension. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Music")
	void OnZoneShrink();

	/** Called when match ends — transition to Victory/Defeat. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Music")
	void OnMatchEnd(bool bVictory);

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Delay in seconds before de-escalating after combat ends. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Music")
	float CombatDeescalationDelay = 5.0f;

	/** Rate at which intensity increases per second. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Music")
	float IntensityRampUp = 0.5f;

	/** Rate at which intensity decreases per second. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Music")
	float IntensityRampDown = 0.2f;

	// ─── State ────────────────────────────────────────────────────────────────

	/** Current music intensity (0-1). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	float CurrentIntensity = 0.0f;

	/** Target intensity for smooth ramping. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	float TargetIntensity = 0.0f;

	/** Runtime music state data. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Music")
	FAdaptiveMusicState MusicStateData;

private:

	/** Whether combat is active. */
	uint8 bCombatActive : 1;

	/** Timer handle for combat de-escalation delay. */
	FTimerHandle CombatDeescalationTimer;

	/** Whether the subsystem has been initialized. */
	uint8 bInitialized : 1;

	/** Internal: Update intensity parameter on the MetaSound source. */
	void UpdateMetaSoundIntensity();

	/** Internal: Handle combat de-escalation timer. */
	void OnCombatDeescalationTimer();
};
