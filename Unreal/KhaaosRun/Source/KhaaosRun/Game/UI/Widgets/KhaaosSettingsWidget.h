// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Game/UI/Widgets/KhaaosSettingsWidget.generated.h"

/**
 * EKhaaosGraphicsQuality
 * Graphics quality presets (for console/PC).
 */
UENUM(BlueprintType)
enum class EKhaaosGraphicsQuality : uint8
{
	Low      UMETA(DisplayName = "LOW"),
	Medium   UMETA(DisplayName = "MEDIUM"),
	High     UMETA(DisplayName = "HIGH"),
	Epic     UMETA(DisplayName = "EPIC"),
	Custom   UMETA(DisplayName = "CUSTOM")
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE(FOnSettingsApplied);

/**
 * UKhaaosSettingsWidget
 *
 * Settings panel widget for Khaaos Run.
 * Categories: Audio, Graphics, Controls, Gameplay, Crossplay.
 *
 * Console-Specific:
 *   - PS5/XSX: Graphics locked to High/Epic, no custom
 *   - Switch2: Graphics locked to Low/Medium
 *   - PC: Full range + custom
 *   - All: Audio, Controls, Gameplay, Crossplay
 *
 * Features:
 *   - Slider-based audio volume (SFX, Music, Voice, Ambient, UI)
 *   - Graphics quality preset + advanced (if PC)
 *   - Sensitivity sliders (look, aim, scope)
 *   - Aim assist toggle (console only)
 *   - Cross-play toggle
 *   - HUD customization (minimap size, kill feed position)
 *   - Auto-apply with confirmation
 *   - Settings persisted to cloud save
 */
UCLASS(Abstract, BlueprintType)
class UKhaaosSettingsWidget : public UUserWidget
{
	GENERATED_BODY()

public:

	virtual void NativeConstruct() override;

	// ─── Audio Settings ─────────────────────────────────────────────────────

	/** Set SFX volume (0-1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetSFXVolume(float Volume);

	/** Set Music volume (0-1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetMusicVolume(float Volume);

	/** Set Voice volume (0-1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetVoiceVolume(float Volume);

	/** Set Ambient volume (0-1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetAmbientVolume(float Volume);

	/** Set UI volume (0-1). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetUIVolume(float Volume);

	// ─── Graphics Settings ──────────────────────────────────────────────────

	/** Set graphics quality preset. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetGraphicsQuality(EKhaaosGraphicsQuality Quality);

	/** Get allowed quality levels for current platform. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|UI|Settings")
	TArray<EKhaaosGraphicsQuality> GetAllowedQualityLevels() const;

	// ─── Controls Settings ──────────────────────────────────────────────────

	/** Set look sensitivity (0-100). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetLookSensitivity(float Sensitivity);

	/** Set aim sensitivity (0-100). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetAimSensitivity(float Sensitivity);

	/** Toggle aim assist (console only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetAimAssist(bool bEnabled);

	/** Invert Y axis. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetInvertY(bool bInvert);

	// ─── Gameplay Settings ──────────────────────────────────────────────────

	/** Toggle cross-play. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetCrossplay(bool bEnabled);

	/** Set minimap scale (0.5-2.0). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetMinimapScale(float Scale);

	/** Toggle auto-pickup. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void SetAutoPickup(bool bEnabled);

	// ─── Apply/Reset ────────────────────────────────────────────────────────

	/** Apply all settings changes. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void ApplySettings();

	/** Reset to defaults. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Settings")
	void ResetToDefaults();

	// ─── State ──────────────────────────────────────────────────────────────

	/** SFX volume. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Audio")
	float SFXVolume;

	/** Music volume. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Audio")
	float MusicVolume;

	/** Voice volume. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Audio")
	float VoiceVolume;

	/** Graphics quality. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Graphics")
	EKhaaosGraphicsQuality GraphicsQuality;

	/** Look sensitivity. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Controls")
	float LookSensitivity;

	/** Aim assist enabled. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Controls")
	uint8 bAimAssist : 1;

	/** Cross-play enabled. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Gameplay")
	uint8 bCrossplay : 1;

	/** Auto-pickup enabled. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Settings|Gameplay")
	uint8 bAutoPickup : 1;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|UI|Settings")
	FOnSettingsApplied OnSettingsApplied;
};
