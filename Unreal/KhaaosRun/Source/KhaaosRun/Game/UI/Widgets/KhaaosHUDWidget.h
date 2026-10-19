// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "CommonUI/Public/Widgets/CommonActivatableWidget.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosAbilitySlotWidget;
class UKhaaosKillFeed;
class USoundBase;

/**
 * UKhaaosHUDWidget
 *
 * Main HUD overlay widget built on CommonUI (UCommonActivatableWidget).
 * Displays health, shield, energy, ability cooldowns, ammo, zone warning,
 * kill feed, crosshair, ping, and credits.
 *
 * CommonUI Integration:
 *   - Inherits UCommonActivatableWidget for input/action support
 *   - Supports CommonUI focus rules and activation
 *   - Works with UCommonActivatableWidgetStack for layered UI
 *
 * Layout (conceptual):
 *   ┌──────────────────────────────────────────┐
 *   │  [Minimap]     [Health][Shield][Energy]   │
 *   │               [Ammo Counter]             │
 *   │  [Ability1][Ability2][Ability3][Ability4]│
 *   │  [Kill Feed]           [Zone Warning]    │
 *   │  [Crosshair]           [Ping Indicator]  │
 *   │  [Credits Display]                      │
 *   └──────────────────────────────────────────┘
 */
UCLASS(Abstract, Blueprintable, meta = (Category = "Khaaos|UI"))
class UKhaaosHUDWidget : public UCommonActivatableWidget
{
	GENERATED_BODY()

public:
	UKhaaosHUDWidget();

	// ─── Bar Updates ──────────────────────────────────────────────────────────

	/** Update health bar display. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdateHealth(float Current, float Max);

	/** Blueprint hook for a brief red vignette on each SafeZone damage cue. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD|SafeZone")
	void PlayZoneDamageVignette(float Intensity);

	/** Show the local Zu choice prompt; option 0 is the protective action, option 1 is unsafe. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD|Zu")
	void ShowZuEntryPrompt(uint8 VariantIndex, const FText& Prompt, const FText& OptionA, const FText& OptionB, float CinematicDuration, float ResponseTimeout);

	/** Hide the Zu choice prompt after a valid choice or timeout. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD|Zu")
	void HideZuEntryPrompt();

	/** Submit a button choice to the owning server-authoritative controller. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD|Zu")
	void SubmitZuEntryChoice(uint8 ChoiceIndex);

	/** Start/update local SafeZone warning cadence after a replicated damage cue. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD|SafeZone")
	void NotifySafeZoneDamageCue(float Current, float Max);

	/** Stop the warning cadence after leaving the damage area or being eliminated. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD|SafeZone")
	void StopSafeZoneWarningAudio();

	/** Pure cadence function, exposed for automation and tuning. Lower Health means a shorter interval. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|HUD|SafeZone")
	static float GetZoneWarningBeepInterval(float Current, float Max);

	/** Update shield bar display. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdateShield(float Current, float Max);

	/** Update energy bar display. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdateEnergy(float Current, float Max);

	// ─── Ability Slots ────────────────────────────────────────────────────────

	/** Update cooldown for a specific ability slot. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdateAbilityCooldown(int32 Slot, float Remaining, float Total);

	// ─── Ammo ─────────────────────────────────────────────────────────────────

	/** Update ammo counter display. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdateAmmo(int32 Current, int32 Reserve);

	// ─── Zone Warning ─────────────────────────────────────────────────────────

	/** Show zone warning message (e.g., "ZONE SHRINKING - MOVE!"). */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void ShowZoneWarning(const FText& Message);

	/** Hide zone warning. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void HideZoneWarning();

	// ─── Kill Feed ────────────────────────────────────────────────────────────

	/** Add an entry to the kill feed. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void AddKillFeedEntry(const FString& Killer, const FString& Victim, const FString& Weapon);

	// ─── Network ──────────────────────────────────────────────────────────────

	/** Update ping indicator. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdatePing(int32 PingMs);

	// ─── Credits ──────────────────────────────────────────────────────────────

	/** Update credits display. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void UpdateCredits(int32 Credits);

	// ─── Crosshair ────────────────────────────────────────────────────────────

	/** Show or hide the crosshair. */
	UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category = "Khaaos|HUD")
	void SetCrosshairVisible(bool bVisible);

	// ─── Blueprint Bindable Properties ────────────────────────────────────────

	/** Current health (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	float CurrentHealth;

	/** Max health (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	float MaxHealth;

	/** Current shield (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	float CurrentShield;

	/** Max shield (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	float MaxShield;

	/** Current energy (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	float CurrentEnergy;

	/** Max energy (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	float MaxEnergy;

	/** Current ammo in magazine (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	int32 CurrentAmmo;

	/** Reserve ammo (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	int32 ReserveAmmo;

	/** Current ping in ms (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	int32 CurrentPing;

	/** Current credits (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	int32 CurrentCredits;

	/** Zone warning text (for UMG binding). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	FText ZoneWarningText;

	/** Short beep imported from Content/Audio/SFX/SFX_ZoneWarningBeep.wav. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|HUD|SafeZone")
	TSoftObjectPtr<USoundBase> ZoneWarningBeepSound;

protected:
	virtual void NativeDestruct() override;

	void PlayZoneWarningBeep();

	FTimerHandle ZoneWarningPulseTimerHandle;
	FTimerHandle ZoneWarningTimeoutTimerHandle;
	float ZoneWarningHealthFraction = 1.0f;
	float ZoneWarningPulseInterval = 0.0f;

	static constexpr float ZoneWarningMinimumInterval = 0.18f;
	static constexpr float ZoneWarningMaximumInterval = 0.90f;
	static constexpr float ZoneWarningCueTimeout = 1.65f;

	/** Number of ability cooldown slots. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|HUD")
	int32 NumAbilitySlots = 4;
};
