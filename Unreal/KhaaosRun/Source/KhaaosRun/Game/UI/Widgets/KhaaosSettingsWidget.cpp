// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosSettingsWidget.h"
#include "KhaaosRun.h"

// ─── Native Lifecycle ──────────────────────────────────────────────────────────

void UKhaaosSettingsWidget::NativeConstruct()
{
	Super::NativeConstruct();

	// Defaults
	SFXVolume     = 0.8f;
	MusicVolume   = 0.5f;
	VoiceVolume   = 1.0f;
	GraphicsQuality = EKhaaosGraphicsQuality::High;
	LookSensitivity = 50.0f;
	bAimAssist    = true;
	bCrossplay    = true;
	bAutoPickup   = true;
}

// ─── Audio Settings ─────────────────────────────────────────────────────────────

void UKhaaosSettingsWidget::SetSFXVolume(float Volume)     { SFXVolume   = FMath::Clamp(Volume, 0.0f, 1.0f); }
void UKhaaosSettingsWidget::SetMusicVolume(float Volume)   { MusicVolume = FMath::Clamp(Volume, 0.0f, 1.0f); }
void UKhaaosSettingsWidget::SetVoiceVolume(float Volume)   { VoiceVolume = FMath::Clamp(Volume, 0.0f, 1.0f); }
void UKhaaosSettingsWidget::SetAmbientVolume(float Volume) { /* AmbientVolume = Clamp */ }
void UKhaaosSettingsWidget::SetUIVolume(float Volume)      { /* UIVolume = Clamp */ }

// ─── Graphics Settings ──────────────────────────────────────────────────────────

void UKhaaosSettingsWidget::SetGraphicsQuality(EKhaaosGraphicsQuality Quality)
{
	TArray<EKhaaosGraphicsQuality> Allowed = GetAllowedQualityLevels();
	if (Allowed.Contains(Quality))
	{
		GraphicsQuality = Quality;
	}
}

TArray<EKhaaosGraphicsQuality> UKhaaosSettingsWidget::GetAllowedQualityLevels() const
{
	TArray<EKhaaosGraphicsQuality> Levels;

#if PLATFORM_PS5 || PLATFORM_GDK
	// Console: High or Epic only
	Levels.Add(EKhaaosGraphicsQuality::High);
	Levels.Add(EKhaaosGraphicsQuality::Epic);
#elif PLATFORM_SWITCH
	// Switch2: Low or Medium only
	Levels.Add(EKhaaosGraphicsQuality::Low);
	Levels.Add(EKhaaosGraphicsQuality::Medium);
#else
	// PC: All
	Levels.Add(EKhaaosGraphicsQuality::Low);
	Levels.Add(EKhaaosGraphicsQuality::Medium);
	Levels.Add(EKhaaosGraphicsQuality::High);
	Levels.Add(EKhaaosGraphicsQuality::Epic);
	Levels.Add(EKhaaosGraphicsQuality::Custom);
#endif

	return Levels;
}

// ─── Controls Settings ──────────────────────────────────────────────────────────

void UKhaaosSettingsWidget::SetLookSensitivity(float Sensitivity) { LookSensitivity = FMath::Clamp(Sensitivity, 0.0f, 100.0f); }
void UKhaaosSettingsWidget::SetAimSensitivity(float Sensitivity)  { /* AimSensitivity = Clamp */ }
void UKhaaosSettingsWidget::SetAimAssist(bool bEnabled)
{
#if PLATFORM_PS5 || PLATFORM_GDK || PLATFORM_SWITCH
	bAimAssist = bEnabled;
#else
	bAimAssist = false; // PC: no aim assist
#endif
}
void UKhaaosSettingsWidget::SetInvertY(bool bInvert) { /* bInvertY = bInvert */ }

// ─── Gameplay Settings ──────────────────────────────────────────────────────────

void UKhaaosSettingsWidget::SetCrossplay(bool bEnabled) { bCrossplay = bEnabled; }
void UKhaaosSettingsWidget::SetMinimapScale(float Scale) { /* MinimapScale = Clamp(0.5, 2.0) */ }
void UKhaaosSettingsWidget::SetAutoPickup(bool bEnabled) { bAutoPickup = bEnabled; }

// ─── Apply/Reset ────────────────────────────────────────────────────────────────

void UKhaaosSettingsWidget::ApplySettings()
{
	// In production: save to UKhaaosCloudSave, apply to AudioManager, etc.
	OnSettingsApplied.Broadcast();
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSettingsWidget: Settings applied"));
}

void UKhaaosSettingsWidget::ResetToDefaults()
{
	SFXVolume     = 0.8f;
	MusicVolume   = 0.5f;
	VoiceVolume   = 1.0f;
	GraphicsQuality = EKhaaosGraphicsQuality::High;
	LookSensitivity = 50.0f;
	bAimAssist    = true;
	bCrossplay    = true;
	bAutoPickup   = true;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSettingsWidget: Settings reset to defaults"));
}
