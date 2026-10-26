// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Accessibility/KhaaosAccessibilitySystem.h"
#include "KhaaosRun.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosAccessibilitySystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        CurrentColorblindMode = EKhaaosColorblindMode::None;
        CurrentLanguage = TEXT("pt-BR");

        // Aim assist defaults (console-friendly)
        AimAssist.bEnabled = true;
        AimAssist.Strength = 0.5f;
        AimAssist.MaxAngle = 15.0f;
        AimAssist.MaxDistance = 3000.0f;
        AimAssist.ADSMultiplier = 0.3f;
        AimAssist.bControllerOnly = true;

        // Accessibility defaults
        bAutoSprint = false;
        bAutoPickup = true;       // Free Fire default
        bReducedMotion = false;
        bHighContrast = false;
        bShowSpeakerName = true;

        // Supported languages (12)
        SupportedLanguages = {
                TEXT("pt-BR"), TEXT("en"), TEXT("es"), TEXT("fr"),
                TEXT("de"), TEXT("it"), TEXT("ja"), TEXT("ko"),
                TEXT("zh-CN"), TEXT("zh-TW"), TEXT("ru"), TEXT("ar")
        };

        // RTL languages
        RTLLanguages = { TEXT("ar") };

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAccessibilitySystem: Initialized (lang=%s, %d languages)"),
                *CurrentLanguage, SupportedLanguages.Num());
}

void UKhaaosAccessibilitySystem::Deinitialize()
{
        SupportedLanguages.Empty();
        RTLLanguages.Empty();
        Super::Deinitialize();
}

// ─── Colorblind ─────────────────────────────────────────────────────────────────

void UKhaaosAccessibilitySystem::SetColorblindMode(EKhaaosColorblindMode Mode)
{
        const EKhaaosColorblindMode OldMode = CurrentColorblindMode;
        CurrentColorblindMode = Mode;

        OnColorblindModeChanged.Broadcast(Mode, OldMode);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAccessibilitySystem: Colorblind mode %d → %d"),
                (int32)OldMode, (int32)Mode);
}

FLinearColor UKhaaosAccessibilitySystem::GetAccessibleColor(const FLinearColor& OriginalColor) const
{
        if (CurrentColorblindMode == EKhaaosColorblindMode::None)
        {
                return OriginalColor;
        }

        // Daltonize algorithm: simulate colorblindness and shift distinguishable colors
        // Simplified version: shift red/green toward yellow/blue for protanopia/deuteranopia
        FLinearColor Adjusted = OriginalColor;

        switch (CurrentColorblindMode)
        {
        case EKhaaosColorblindMode::Protanopia:
                // Red-blind: shift red toward yellow
                Adjusted.R = OriginalColor.R * 0.5667f + OriginalColor.G * 0.4333f;
                Adjusted.G = OriginalColor.R * 0.5583f + OriginalColor.G * 0.4417f;
                break;

        case EKhaaosColorblindMode::Deuteranopia:
                // Green-blind: shift green toward yellow
                Adjusted.R = OriginalColor.R * 0.6253f + OriginalColor.G * 0.3747f;
                Adjusted.G = OriginalColor.R * 0.7010f + OriginalColor.G * 0.2990f;
                break;

        case EKhaaosColorblindMode::Tritanopia:
                // Blue-blind: shift blue toward cyan
                Adjusted.B = OriginalColor.B * 0.4333f + OriginalColor.G * 0.5667f;
                break;

        case EKhaaosColorblindMode::Achromatopsia:
                // Total colorblind: convert to luminance
                const float Lum = OriginalColor.R * 0.299f + OriginalColor.G * 0.587f + OriginalColor.B * 0.114f;
                Adjusted = FLinearColor(Lum, Lum, Lum, OriginalColor.A);
                break;
        }

        return Adjusted;
}

// ─── Aim Assist ─────────────────────────────────────────────────────────────────

void UKhaaosAccessibilitySystem::SetAimAssistStrength(float Strength)
{
        AimAssist.Strength = FMath::Clamp(Strength, 0.0f, 1.0f);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAccessibilitySystem: Aim assist strength = %.1f"), AimAssist.Strength);
}

bool UKhaaosAccessibilitySystem::IsAimAssistAvailable() const
{
        // Available on console/controller, not in ranked mode
        // (Would check input device and match type in production)
        return AimAssist.bEnabled && AimAssist.bControllerOnly;
}

// ─── Subtitles ──────────────────────────────────────────────────────────────────

void UKhaaosAccessibilitySystem::SetSubtitleSize(EKhaaosSubtitleSize Size)
{
        SubtitleSize = Size;
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAccessibilitySystem: Subtitle size = %d"), (int32)Size);
}

// ─── Localization ───────────────────────────────────────────────────────────────

void UKhaaosAccessibilitySystem::SetLanguage(const FString& LanguageCode)
{
        if (!SupportedLanguages.Contains(LanguageCode))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAccessibilitySystem: Unsupported language %s"), *LanguageCode);
                return;
        }

        const FString OldLanguage = CurrentLanguage;
        CurrentLanguage = LanguageCode;

        OnLanguageChanged.Broadcast(LanguageCode);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAccessibilitySystem: Language %s → %s (RTL: %s)"),
                *OldLanguage, *LanguageCode, IsRightToLeft() ? TEXT("YES") : TEXT("NO"));
}

FText UKhaaosAccessibilitySystem::GetLocalizedText(const FString& Key) const
{
        // In production: Look up in FStringTableRegistry
        return FText::FromString(Key);
}

bool UKhaaosAccessibilitySystem::IsRightToLeft() const
{
        return RTLLanguages.Contains(CurrentLanguage);
}
