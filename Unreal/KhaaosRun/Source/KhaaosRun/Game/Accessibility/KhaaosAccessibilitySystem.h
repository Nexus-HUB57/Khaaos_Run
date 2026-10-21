// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Accessibility/KhaaosAccessibilitySystem.generated.h"

// ─── Accessibility Types ────────────────────────────────────────────────────────

/**
 * EKhaaosColorblindMode
 * Colorblind accessibility modes (affects UI colors, zone indicators).
 */
UENUM(BlueprintType)
enum class EKhaaosColorblindMode : uint8
{
        None       UMETA(DisplayName = "NONE"),
        Protanopia UMETA(DisplayName = "PROTANOPIA"),   // Red-blind
        Deuteranopia UMETA(DisplayName = "DEUTERANOPIA"), // Green-blind
        Tritanopia UMETA(DisplayName = "TRITANOPIA"),    // Blue-blind
        Achromatopsia UMETA(DisplayName = "ACHROMATOPSIA") // Total colorblind
};

/**
 * EKhaaosSubtitleSize
 * Subtitle/closed caption display size.
 */
UENUM(BlueprintType)
enum class EKhaaosSubtitleSize : uint8
{
        Small  UMETA(DisplayName = "SMALL"),
        Medium UMETA(DisplayName = "MEDIUM"),
        Large  UMETA(DisplayName = "LARGE")
};

/**
 * FKhaaosAimAssistConfig
 * Aim assist parameters (console only, disabled in ranked).
 */
USTRUCT(BlueprintType)
struct FKhaaosAimAssistConfig
{
        GENERATED_BODY()

        /** Enable aim assist? (Console only, disabled in ranked) */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|A11y|AimAssist")
        uint8 bEnabled : 1;

        /** Aim assist strength 0-1. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|A11y|AimAssist")
        float Strength = 0.5f;

        /** Max aim assist angle (degrees). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|A11y|AimAssist")
        float MaxAngle = 15.0f;

        /** Aim assist distance (cm). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|A11y|AimAssist")
        float MaxDistance = 3000.0f;

        /** ADS aim assist multiplier (reduced when ADS). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|A11y|AimAssist")
        float ADSMultiplier = 0.3f;

        /** Input type that triggers aim assist. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|A11y|AimAssist")
        uint8 bControllerOnly : 1;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnColorblindModeChanged, EKhaaosColorblindMode, NewMode, EKhaaosColorblindMode, OldMode);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnLanguageChanged, const FString&, NewLanguage);

/**
 * UKhaaosAccessibilitySystem
 *
 * Accessibility and localization system for console certification
 * and inclusive gameplay.
 *
 * Accessibility Features:
 *   - Colorblind modes: 5 types (Protanopia, Deuteranopia, Tritanopia, Achromatopsia)
 *   - Aim assist: Console-only, adjustable strength, disabled in ranked
 *   - Subtitles: 3 sizes, speaker name, background opacity
 *   - Text-to-speech: Menu narration for blind players
 *   - Auto-sprint: Hold-to-sprint toggle
 *   - Auto-pickup: Automatic loot pickup (reduce APM barrier)
 *   - Reduced motion: Disable screen shake, flash effects
 *   - High contrast: UI elements with stronger contrast ratios
 *
 * Localization (i18n):
 *   - 12 languages: PT-BR, EN, ES, FR, DE, IT, JA, KO, ZH-CN, ZH-TW, RU, AR
 *   - Right-to-left support (Arabic)
 *   - Date/time/number formatting per locale
 *   - Dynamic text reflow for different string lengths
 *   - Font fallback chain per language
 *
 * Console Certification Requirements:
 *   - PS5: Aim assist, colorblind, subtitles, text-to-speech
 *   - Xbox: Copilot (dual controller), colorblind, subtitles
 *   - Switch2: Aim assist, colorblind, simplified controls
 *
 * Free Fire Parity:
 *   - Auto-pickup loot
 *   - Aim assist on mobile/console
 *   - Colorblind mode for zone indicators
 *   - Multi-language support (12+)
 */
UCLASS(BlueprintType)
class UKhaaosAccessibilitySystem : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Colorblind ───────────────────────────────────────────────────────

        /** Set colorblind mode. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|A11y")
        void SetColorblindMode(EKhaaosColorblindMode Mode);

        /** Get current colorblind mode. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y")
        EKhaaosColorblindMode GetColorblindMode() const { return CurrentColorblindMode; }

        /** Get color override for a given UI color. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y")
        FLinearColor GetAccessibleColor(const FLinearColor& OriginalColor) const;

        // ─── Aim Assist ───────────────────────────────────────────────────────

        /** Get aim assist config. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y")
        const FKhaaosAimAssistConfig& GetAimAssistConfig() const { return AimAssist; }

        /** Set aim assist strength. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|A11y")
        void SetAimAssistStrength(float Strength);

        /** Is aim assist available? (Console/controller only, not ranked) */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y")
        bool IsAimAssistAvailable() const;

        // ─── Subtitles ────────────────────────────────────────────────────────

        /** Set subtitle size. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|A11y")
        void SetSubtitleSize(EKhaaosSubtitleSize Size);

        /** Get subtitle size. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        EKhaaosSubtitleSize SubtitleSize = EKhaaosSubtitleSize::Medium;

        /** Show speaker name in subtitles? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        uint8 bShowSpeakerName : 1;

        /** Subtitle background opacity 0-1. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        float SubtitleBackgroundOpacity = 0.7f;

        // ─── Other Accessibility ──────────────────────────────────────────────

        /** Auto-sprint enabled? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        uint8 bAutoSprint : 1;

        /** Auto-pickup loot? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        uint8 bAutoPickup : 1;

        /** Reduced motion (no screen shake, no flash)? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        uint8 bReducedMotion : 1;

        /** High contrast UI? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y")
        uint8 bHighContrast : 1;

        // ─── Localization ─────────────────────────────────────────────────────

        /** Set language (ISO 639-1 code). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|A11y|i18n")
        void SetLanguage(const FString& LanguageCode);

        /** Get current language. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y|i18n")
        FString GetCurrentLanguage() const { return CurrentLanguage; }

        /** Get localized text for a key. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y|i18n")
        FText GetLocalizedText(const FString& Key) const;

        /** Is current language RTL? */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|A11y|i18n")
        bool IsRightToLeft() const;

        /** Supported languages. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|A11y|i18n")
        TArray<FString> SupportedLanguages;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|A11y")
        FOnColorblindModeChanged OnColorblindModeChanged;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|A11y")
        FOnLanguageChanged OnLanguageChanged;

private:

        /** Current colorblind mode. */
        EKhaaosColorblindMode CurrentColorblindMode;

        /** Aim assist config. */
        FKhaaosAimAssistConfig AimAssist;

        /** Current language code. */
        FString CurrentLanguage;

        /** RTL languages. */
        TSet<FString> RTLLanguages;
};
