// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Localization/KhaaosLocalizationManager.generated.h"

// ─── Localization Types ────────────────────────────────────────────────────────

/**
 * EKhaaosSupportedLanguage
 * Supported languages for Khaaos Run (12 total).
 * ptBR is default (Brazilian Portuguese - primary market).
 */
UENUM(BlueprintType)
enum class EKhaaosSupportedLanguage : uint8
{
        ptBR UMETA(DisplayName = "PT-BR"),   // Portuguese (Brazil) - Default
        enUS UMETA(DisplayName = "EN-US"),   // English (United States)
        esES UMETA(DisplayName = "ES-ES"),   // Spanish (Spain)
        frFR UMETA(DisplayName = "FR-FR"),   // French (France)
        deDE UMETA(DisplayName = "DE-DE"),   // German (Germany)
        jaJP UMETA(DisplayName = "JA-JP"),   // Japanese (Japan)
        koKR UMETA(DisplayName = "KO-KR"),   // Korean (South Korea)
        zhCN UMETA(DisplayName = "ZH-CN"),   // Chinese Simplified
        zhTW UMETA(DisplayName = "ZH-TW"),   // Chinese Traditional
        ruRU UMETA(DisplayName = "RU-RU"),   // Russian (Russia)
        arSA UMETA(DisplayName = "AR-SA"),   // Arabic (Saudi Arabia) - RTL
        hiIN UMETA(DisplayName = "HI-IN")    // Hindi (India)
};

/**
 * FKhaaosLocalizedString
 * A localized string entry with per-language translations.
 * Supports gendered variants (e.g., adjective agreement in PT/ES/FR/DE/RU).
 */
USTRUCT(BlueprintType)
struct FKhaaosLocalizedString
{
        GENERATED_BODY()

        /** Localization key (e.g., "UI_Menu_StartGame"). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|String")
        FString Key;

        /** Translation map: language → translated string. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|String")
        TMap<EKhaaosSupportedLanguage, FString> Translation;

        /** Does this string have gendered variants? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|String")
        uint8 bIsGendered : 1;

        /** Male variant per language. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|String")
        TMap<EKhaaosSupportedLanguage, FString> MaleVariant;

        /** Female variant per language. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|String")
        TMap<EKhaaosSupportedLanguage, FString> FemaleVariant;

        FKhaaosLocalizedString()
                : bIsGendered(false)
        {}
};

/**
 * FKhaaosLocalizationConfig
 * Localization configuration (locale formatting, units, defaults).
 */
USTRUCT(BlueprintType)
struct FKhaaosLocalizationConfig
{
        GENERATED_BODY()

        /** Current active language. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        EKhaaosSupportedLanguage CurrentLanguage = EKhaaosSupportedLanguage::ptBR;

        /** Auto-detect system language on startup? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        uint8 bAutoDetectLanguage : 1;

        /** Use metric units (true) or imperial (false). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        uint8 bUseMetricUnits : 1;

        /** Date format string (e.g., "DD/MM/YYYY"). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        FString DateFormat = TEXT("DD/MM/YYYY");

        /** Time format (e.g., "24h" or "12h"). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        FString TimeFormat = TEXT("24h");

        /** Currency symbol (KRC = Khaaos Run Coin). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        FString CurrencySymbol = TEXT("KRC");

        /** Number group separator (e.g., "." for 1.000.000). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        FString NumberGroupSeparator = TEXT(".");

        /** Decimal separator (e.g., "," for 3,14). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Config, Category = "Khaaos|Localization|Config")
        FString DecimalSeparator = TEXT(",");

        FKhaaosLocalizationConfig()
                : bAutoDetectLanguage(true)
                , bUseMetricUnits(true)
        {}
};

/**
 * FKhaaosCulturalAdaptation
 * Cultural adaptation rules for regional compliance (content ratings, censorship).
 */
USTRUCT(BlueprintType)
struct FKhaaosCulturalAdaptation
{
        GENERATED_BODY()

        /** Regional content rating (e.g., "PEGI 12", "ESRB T", "CERO B"). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|Culture")
        FString ContentRating;

        /** Violence allowed in this region? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|Culture")
        uint8 bViolenceAllowed : 1;

        /** Gambling/loot box mechanics allowed? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|Culture")
        uint8 bGamblingAllowed : 1;

        /** Filter profanity in chat? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|Culture")
        uint8 bProfanityFiltered : 1;

        /** Censorship rules map (rule name → replacement/value). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Localization|Culture")
        TMap<FString, FString> CensorshipRules;

        FKhaaosCulturalAdaptation()
                : bViolenceAllowed(true)
                , bGamblingAllowed(true)
                , bProfanityFiltered(false)
        {}
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnLocalizationLanguageChanged, EKhaaosSupportedLanguage, NewLanguage, EKhaaosSupportedLanguage, OldLanguage);

/**
 * UKhaaosLocalizationManager
 *
 * Multi-language localization and i18n system for Khaaos Run.
 *
 * Features:
 *   - 12 supported languages (PT-BR default, EN, ES, FR, DE, JA, KO, ZH-CN, ZH-TW, RU, AR, HI)
 *   - Gendered string support (adjective agreement for PT/ES/FR/DE/RU)
 *   - RTL support for Arabic (arSA)
 *   - Locale-aware number, currency, date, and time formatting
 *   - Cultural adaptation per region (content ratings, censorship, profanity)
 *   - Dynamic string table loading and registration
 *   - KRC (Khaaos Run Coin) currency formatting
 *   - Auto-detect system language on startup
 *
 * Console Certification:
 *   - PS5: PEGI/CERO ratings, profanity filter
 *   - Xbox: ESRB ratings, copilot language sync
 *   - Switch2: CERO ratings, simplified kanji fallback
 *
 * Free Fire Parity:
 *   - PT-BR as primary language
 *   - Multi-language chat with auto-translation
 *   - Regional content restrictions
 */
UCLASS(BlueprintType, Config=Game, defaultconfig)
class UKhaaosLocalizationManager : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Configuration ───────────────────────────────────────────────────

        /** Initialize localization with config. Returns true on success. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Localization|Config")
        bool Initialize(const FKhaaosLocalizationConfig& InConfig);

        /** Set active language. Returns true if language is supported. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Localization|Config")
        bool SetLanguage(EKhaaosSupportedLanguage Language);

        /** Get current active language. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Config")
        EKhaaosSupportedLanguage GetCurrentLanguage() const { return Config.CurrentLanguage; }

        // ─── String Lookup ───────────────────────────────────────────────────

        /** Get localized text for a key (non-gendered). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|String")
        FString GetLocalizedText(const FString& Key) const;

        /** Get localized text for a key with gender variant. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|String")
        FString GetLocalizedTextGendered(const FString& Key, bool bIsMale) const;

        // ─── Locale Formatting ───────────────────────────────────────────────

        /** Format number using locale separators (e.g., 1.000.000,00). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Format")
        FString FormatNumber(double Value) const;

        /** Format currency amount with KRC symbol and locale separators. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Format")
        FString FormatCurrency(double Amount) const;

        /** Format date using locale date format. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Format")
        FString FormatDate(const FDateTime& DateTime) const;

        /** Format time using locale time format. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Format")
        FString FormatTime(const FDateTime& DateTime) const;

        // ─── Cultural Adaptation ─────────────────────────────────────────────

        /** Get cultural adaptation rules for current language region. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Culture")
        FKhaaosCulturalAdaptation GetCulturalAdaptation() const;

        // ─── String Table Management ─────────────────────────────────────────

        /** Load string table from a file path. Returns true on success. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Localization|Table")
        bool LoadStringTable(const FString& TablePath);

        /** Register a localized string at runtime. Returns true on success. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Localization|Table")
        bool RegisterLocalizedString(const FString& Key, const TMap<EKhaaosSupportedLanguage, FString>& Translations);

        // ─── Language Query ──────────────────────────────────────────────────

        /** Get all available languages. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Query")
        TArray<EKhaaosSupportedLanguage> GetAvailableLanguages() const;

        /** Is a specific language supported? */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Localization|Query")
        bool IsLanguageSupported(EKhaaosSupportedLanguage Language) const;

        // ─── Delegates ────────────────────────────────────────────────────────

        /** Broadcast when active language changes. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Localization")
        FOnLocalizationLanguageChanged OnLanguageChanged;

private:

        /** Localization configuration. */
        FKhaaosLocalizationConfig Config;

        /** Registered localized strings (key → localized string). */
        TMap<FString, FKhaaosLocalizedString> LocalizedStrings;

        /** Cultural adaptation rules per language. */
        TMap<EKhaaosSupportedLanguage, FKhaaosCulturalAdaptation> CulturalAdaptations;

        /** Initialize default string tables for ptBR. */
        void InitializeDefaultStringTables();

        /** Initialize cultural adaptation rules per region. */
        void InitializeCulturalAdaptations();

        /** Apply locale-specific config overrides for a language. */
        void ApplyLocaleOverrides(EKhaaosSupportedLanguage Language);
};
