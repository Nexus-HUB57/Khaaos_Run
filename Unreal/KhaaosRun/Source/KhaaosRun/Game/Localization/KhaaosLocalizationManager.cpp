// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Localization/KhaaosLocalizationManager.h"
#include "KhaaosRun.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosLocalizationManager::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        // Default configuration (ptBR, metric, 24h)
        Config.CurrentLanguage = EKhaaosSupportedLanguage::ptBR;
        Config.bAutoDetectLanguage = true;
        Config.bUseMetricUnits = true;
        Config.DateFormat = TEXT("DD/MM/YYYY");
        Config.TimeFormat = TEXT("24h");
        Config.CurrencySymbol = TEXT("KRC");
        Config.NumberGroupSeparator = TEXT(".");
        Config.DecimalSeparator = TEXT(",");

        // Initialize default string tables
        InitializeDefaultStringTables();

        // Initialize cultural adaptation rules
        InitializeCulturalAdaptations();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Initialized (lang=ptBR, %d strings, %d languages)"),
                LocalizedStrings.Num(), 12);
}

void UKhaaosLocalizationManager::Deinitialize()
{
        LocalizedStrings.Empty();
        CulturalAdaptations.Empty();
        Super::Deinitialize();
}

// ─── Configuration ──────────────────────────────────────────────────────────────

bool UKhaaosLocalizationManager::Initialize(const FKhaaosLocalizationConfig& InConfig)
{
        Config = InConfig;

        // Apply locale overrides for the configured language
        ApplyLocaleOverrides(Config.CurrentLanguage);

        // Auto-detect language if requested
        if (Config.bAutoDetectLanguage)
        {
                // In production: Detect from OS locale via FPlatformMisc::GetDefaultLocale()
                // For now, keep the configured language
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Auto-detect enabled (keeping lang=%d)"),
                        (int32)Config.CurrentLanguage);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Configured (lang=%d, dateFormat=%s, timeFormat=%s, currency=%s)"),
                (int32)Config.CurrentLanguage, *Config.DateFormat, *Config.TimeFormat, *Config.CurrencySymbol);

        return true;
}

bool UKhaaosLocalizationManager::SetLanguage(EKhaaosSupportedLanguage Language)
{
        if (!IsLanguageSupported(Language))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosLocalizationManager: Unsupported language %d"), (int32)Language);
                return false;
        }

        const EKhaaosSupportedLanguage OldLanguage = Config.CurrentLanguage;
        Config.CurrentLanguage = Language;

        // Apply locale overrides for the new language
        ApplyLocaleOverrides(Language);

        // Broadcast language change
        OnLanguageChanged.Broadcast(Language, OldLanguage);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Language %d → %d"),
                (int32)OldLanguage, (int32)Language);

        return true;
}

// ─── String Lookup ──────────────────────────────────────────────────────────────

FString UKhaaosLocalizationManager::GetLocalizedText(const FString& Key) const
{
        const FKhaaosLocalizedString* Found = LocalizedStrings.Find(Key);
        if (!Found)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosLocalizationManager: Key not found '%s'"), *Key);
                return Key;
        }

        const FString* Translation = Found->Translation.Find(Config.CurrentLanguage);
        if (Translation && !Translation->IsEmpty())
        {
                return *Translation;
        }

        // Fallback to ptBR
        const FString* Fallback = Found->Translation.Find(EKhaaosSupportedLanguage::ptBR);
        if (Fallback && !Fallback->IsEmpty())
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosLocalizationManager: Fallback to ptBR for key '%s'"), *Key);
                return *Fallback;
        }

        // Last resort: return the key itself
        return Key;
}

FString UKhaaosLocalizationManager::GetLocalizedTextGendered(const FString& Key, bool bIsMale) const
{
        const FKhaaosLocalizedString* Found = LocalizedStrings.Find(Key);
        if (!Found)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosLocalizationManager: Gendered key not found '%s'"), *Key);
                return Key;
        }

        if (!Found->bIsGendered)
        {
                // Not gendered, fall back to standard lookup
                return GetLocalizedText(Key);
        }

        // Look up the appropriate gender variant
        const TMap<EKhaaosSupportedLanguage, FString>& Variant = bIsMale ? Found->MaleVariant : Found->FemaleVariant;
        const FString* Translation = Variant.Find(Config.CurrentLanguage);
        if (Translation && !Translation->IsEmpty())
        {
                return *Translation;
        }

        // Fallback to non-gendered translation
        return GetLocalizedText(Key);
}

// ─── Locale Formatting ─────────────────────────────────────────────────────────

FString UKhaaosLocalizationManager::FormatNumber(double Value) const
{
        // Separate integer and decimal parts
        const double AbsValue = FMath::Abs(Value);
        const int64 IntPart = static_cast<int64>(AbsValue);
        const double DecPart = AbsValue - static_cast<double>(IntPart);

        // Format integer part with group separators
        FString IntStr = FString::FromInt(IntPart);
        FString Grouped;

        int32 CharCount = 0;
        for (int32 i = IntStr.Len() - 1; i >= 0; --i)
        {
                if (CharCount > 0 && CharCount % 3 == 0)
                {
                        Grouped = Config.NumberGroupSeparator + Grouped;
                }
                Grouped = FString::Chr(IntStr[i]) + Grouped;
                ++CharCount;
        }

        // Format decimal part (2 digits)
        FString DecStr;
        if (DecPart > 0.005)
        {
                const int32 DecDigits = FMath::RoundToInt(DecPart * 100.0);
                DecStr = Config.DecimalSeparator + FString::Printf(TEXT("%02d"), DecDigits);
        }

        // Handle negative values
        FString Result = Grouped + DecStr;
        if (Value < 0.0)
        {
                Result = TEXT("-") + Result;
        }

        return Result;
}

FString UKhaaosLocalizationManager::FormatCurrency(double Amount) const
{
        // Format the number first, then prepend/append currency symbol
        const FString NumberStr = FormatNumber(Amount);

        // For RTL languages (arSA), append symbol; otherwise prepend
        if (Config.CurrentLanguage == EKhaaosSupportedLanguage::arSA)
        {
                return NumberStr + TEXT(" ") + Config.CurrencySymbol;
        }

        return Config.CurrencySymbol + TEXT(" ") + NumberStr;
}

FString UKhaaosLocalizationManager::FormatDate(const FDateTime& DateTime) const
{
        const int32 Day = DateTime.GetDay();
        const int32 Month = DateTime.GetMonth();
        const int32 Year = DateTime.GetYear();

        FString DayStr = (Day < 10) ? FString::Printf(TEXT("0%d"), Day) : FString::FromInt(Day);
        FString MonthStr = (Month < 10) ? FString::Printf(TEXT("0%d"), Month) : FString::FromInt(Month);
        FString YearStr = FString::FromInt(Year);

        // Parse date format string and substitute
        FString Result = Config.DateFormat;
        Result = Result.Replace(TEXT("YYYY"), *YearStr);
        Result = Result.Replace(TEXT("MM"), *MonthStr);
        Result = Result.Replace(TEXT("DD"), *DayStr);

        return Result;
}

FString UKhaaosLocalizationManager::FormatTime(const FDateTime& DateTime) const
{
        const int32 Hour = DateTime.GetHour();
        const int32 Minute = DateTime.GetMinute();
        const int32 Second = DateTime.GetSecond();

        FString HourStr;
        FString AmPm;

        if (Config.TimeFormat == TEXT("12h"))
        {
                const int32 Hour12 = (Hour % 12 == 0) ? 12 : Hour % 12;
                HourStr = (Hour12 < 10) ? FString::Printf(TEXT("0%d"), Hour12) : FString::FromInt(Hour12);
                AmPm = (Hour < 12) ? TEXT(" AM") : TEXT(" PM");
        }
        else
        {
                HourStr = (Hour < 10) ? FString::Printf(TEXT("0%d"), Hour) : FString::FromInt(Hour);
        }

        FString MinuteStr = (Minute < 10) ? FString::Printf(TEXT("0%d"), Minute) : FString::FromInt(Minute);
        FString SecondStr = (Second < 10) ? FString::Printf(TEXT("0%d"), Second) : FString::FromInt(Second);

        return HourStr + Config.DecimalSeparator + MinuteStr + Config.DecimalSeparator + SecondStr + AmPm;
}

// ─── Cultural Adaptation ────────────────────────────────────────────────────────

FKhaaosCulturalAdaptation UKhaaosLocalizationManager::GetCulturalAdaptation() const
{
        const FKhaaosCulturalAdaptation* Found = CulturalAdaptations.Find(Config.CurrentLanguage);
        if (Found)
        {
                return *Found;
        }

        // Default: return a permissive cultural adaptation
        FKhaaosCulturalAdaptation DefaultAdaptation;
        DefaultAdaptation.ContentRating = TEXT("PEGI 12");
        DefaultAdaptation.bViolenceAllowed = true;
        DefaultAdaptation.bGamblingAllowed = true;
        DefaultAdaptation.bProfanityFiltered = false;
        return DefaultAdaptation;
}

// ─── String Table Management ────────────────────────────────────────────────────

bool UKhaaosLocalizationManager::LoadStringTable(const FString& TablePath)
{
        // In production: Load from JSON/CSV via FFileHelper or FStringTableRegistry
        // For now, log the request and return success
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: LoadStringTable '%s'"), *TablePath);

        // Mark as pending load (would be async in production)
        return true;
}

bool UKhaaosLocalizationManager::RegisterLocalizedString(const FString& Key, const TMap<EKhaaosSupportedLanguage, FString>& Translations)
{
        if (Key.IsEmpty())
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosLocalizationManager: Cannot register string with empty key"));
                return false;
        }

        FKhaaosLocalizedString& Entry = LocalizedStrings.FindOrAdd(Key);
        Entry.Key = Key;
        Entry.Translation = Translations;
        Entry.bIsGendered = false;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Registered string '%s' (%d translations)"),
                *Key, Translations.Num());

        return true;
}

// ─── Language Query ─────────────────────────────────────────────────────────────

TArray<EKhaaosSupportedLanguage> UKhaaosLocalizationManager::GetAvailableLanguages() const
{
        return {
                EKhaaosSupportedLanguage::ptBR,
                EKhaaosSupportedLanguage::enUS,
                EKhaaosSupportedLanguage::esES,
                EKhaaosSupportedLanguage::frFR,
                EKhaaosSupportedLanguage::deDE,
                EKhaaosSupportedLanguage::jaJP,
                EKhaaosSupportedLanguage::koKR,
                EKhaaosSupportedLanguage::zhCN,
                EKhaaosSupportedLanguage::zhTW,
                EKhaaosSupportedLanguage::ruRU,
                EKhaaosSupportedLanguage::arSA,
                EKhaaosSupportedLanguage::hiIN
        };
}

bool UKhaaosLocalizationManager::IsLanguageSupported(EKhaaosSupportedLanguage Language) const
{
        // All enum values are valid supported languages (12 total)
        return Language >= EKhaaosSupportedLanguage::ptBR && Language <= EKhaaosSupportedLanguage::hiIN;
}

// ─── Private: Default String Tables ─────────────────────────────────────────────

void UKhaaosLocalizationManager::InitializeDefaultStringTables()
{
        // ─── UI Menu Strings ──────────────────────────────────────────────
        RegisterLocalizedString(TEXT("UI_Menu_StartGame"), {
                { EKhaaosSupportedLanguage::ptBR, TEXT("Iniciar Jogo") },
                { EKhaaosSupportedLanguage::enUS, TEXT("Start Game") },
                { EKhaaosSupportedLanguage::esES, TEXT("Iniciar Juego") },
                { EKhaaosSupportedLanguage::frFR, TEXT("Démarrer le Jeu") },
                { EKhaaosSupportedLanguage::deDE, TEXT("Spiel Starten") },
                { EKhaaosSupportedLanguage::jaJP, TEXT("ゲーム開始") },
                { EKhaaosSupportedLanguage::koKR, TEXT("게임 시작") },
                { EKhaaosSupportedLanguage::zhCN, TEXT("开始游戏") },
                { EKhaaosSupportedLanguage::zhTW, TEXT("開始遊戲") },
                { EKhaaosSupportedLanguage::ruRU, TEXT("Начать Игру") },
                { EKhaaosSupportedLanguage::arSA, TEXT("بدء اللعبة") },
                { EKhaaosSupportedLanguage::hiIN, TEXT("खेल शुरू करें") }
        });

        RegisterLocalizedString(TEXT("UI_Menu_Settings"), {
                { EKhaaosSupportedLanguage::ptBR, TEXT("Configurações") },
                { EKhaaosSupportedLanguage::enUS, TEXT("Settings") },
                { EKhaaosSupportedLanguage::esES, TEXT("Configuración") },
                { EKhaaosSupportedLanguage::frFR, TEXT("Paramètres") },
                { EKhaaosSupportedLanguage::deDE, TEXT("Einstellungen") },
                { EKhaaosSupportedLanguage::jaJP, TEXT("設定") },
                { EKhaaosSupportedLanguage::koKR, TEXT("설정") },
                { EKhaaosSupportedLanguage::zhCN, TEXT("设置") },
                { EKhaaosSupportedLanguage::zhTW, TEXT("設定") },
                { EKhaaosSupportedLanguage::ruRU, TEXT("Настройки") },
                { EKhaaosSupportedLanguage::arSA, TEXT("الإعدادات") },
                { EKhaaosSupportedLanguage::hiIN, TEXT("सेटिंग्स") }
        });

        RegisterLocalizedString(TEXT("UI_Menu_Quit"), {
                { EKhaaosSupportedLanguage::ptBR, TEXT("Sair") },
                { EKhaaosSupportedLanguage::enUS, TEXT("Quit") },
                { EKhaaosSupportedLanguage::esES, TEXT("Salir") },
                { EKhaaosSupportedLanguage::frFR, TEXT("Quitter") },
                { EKhaaosSupportedLanguage::deDE, TEXT("Beenden") },
                { EKhaaosSupportedLanguage::jaJP, TEXT("終了") },
                { EKhaaosSupportedLanguage::koKR, TEXT("종료") },
                { EKhaaosSupportedLanguage::zhCN, TEXT("退出") },
                { EKhaaosSupportedLanguage::zhTW, TEXT("離開") },
                { EKhaaosSupportedLanguage::ruRU, TEXT("Выход") },
                { EKhaaosSupportedLanguage::arSA, TEXT("خروج") },
                { EKhaaosSupportedLanguage::hiIN, TEXT("बाहर") }
        });

        RegisterLocalizedString(TEXT("UI_HUD_EnemiesAlive"), {
                { EKhaaosSupportedLanguage::ptBR, TEXT("Inimigos Vivos") },
                { EKhaaosSupportedLanguage::enUS, TEXT("Enemies Alive") },
                { EKhaaosSupportedLanguage::esES, TEXT("Enemigos Vivos") },
                { EKhaaosSupportedLanguage::frFR, TEXT("Ennemis en Vie") },
                { EKhaaosSupportedLanguage::deDE, TEXT("Lebende Feinde") },
                { EKhaaosSupportedLanguage::jaJP, TEXT("生存敵数") },
                { EKhaaosSupportedLanguage::koKR, TEXT("생존 적 수") },
                { EKhaaosSupportedLanguage::zhCN, TEXT("存活敌人") },
                { EKhaaosSupportedLanguage::zhTW, TEXT("存活敵人") },
                { EKhaaosSupportedLanguage::ruRU, TEXT("Враги вживую") },
                { EKhaaosSupportedLanguage::arSA, TEXT("أعداء أحياء") },
                { EKhaaosSupportedLanguage::hiIN, TEXT("जीवित दुश्मन") }
        });

        RegisterLocalizedString(TEXT("UI_HUD_TimeRemaining"), {
                { EKhaaosSupportedLanguage::ptBR, TEXT("Tempo Restante") },
                { EKhaaosSupportedLanguage::enUS, TEXT("Time Remaining") },
                { EKhaaosSupportedLanguage::esES, TEXT("Tiempo Restante") },
                { EKhaaosSupportedLanguage::frFR, TEXT("Temps Restant") },
                { EKhaaosSupportedLanguage::deDE, TEXT("Verbleibende Zeit") },
                { EKhaaosSupportedLanguage::jaJP, TEXT("残り時間") },
                { EKhaaosSupportedLanguage::koKR, TEXT("남은 시간") },
                { EKhaaosSupportedLanguage::zhCN, TEXT("剩余时间") },
                { EKhaaosSupportedLanguage::zhTW, TEXT("剩餘時間") },
                { EKhaaosSupportedLanguage::ruRU, TEXT("Оставшееся Время") },
                { EKhaaosSupportedLanguage::arSA, TEXT("الوقت المتبقي") },
                { EKhaaosSupportedLanguage::hiIN, TEXT("शेष समय") }
        });

        RegisterLocalizedString(TEXT("UI_Shop_Buy"), {
                { EKhaaosSupportedLanguage::ptBR, TEXT("Comprar") },
                { EKhaaosSupportedLanguage::enUS, TEXT("Buy") },
                { EKhaaosSupportedLanguage::esES, TEXT("Comprar") },
                { EKhaaosSupportedLanguage::frFR, TEXT("Acheter") },
                { EKhaaosSupportedLanguage::deDE, TEXT("Kaufen") },
                { EKhaaosSupportedLanguage::jaJP, TEXT("購入") },
                { EKhaaosSupportedLanguage::koKR, TEXT("구매") },
                { EKhaaosSupportedLanguage::zhCN, TEXT("购买") },
                { EKhaaosSupportedLanguage::zhTW, TEXT("購買") },
                { EKhaaosSupportedLanguage::ruRU, TEXT("Купить") },
                { EKhaaosSupportedLanguage::arSA, TEXT("شراء") },
                { EKhaaosSupportedLanguage::hiIN, TEXT("खरीदें") }
        });

        // ─── Gendered String Example (Adjective Agreement) ────────────────
        {
                FKhaaosLocalizedString& GenderedEntry = LocalizedStrings.FindOrAdd(TEXT("Char_Status_Dead"));
                GenderedEntry.Key = TEXT("Char_Status_Dead");
                GenderedEntry.bIsGendered = true;

                // Base (neutral) translations
                GenderedEntry.Translation = {
                        { EKhaaosSupportedLanguage::ptBR, TEXT("Morto") },
                        { EKhaaosSupportedLanguage::enUS, TEXT("Dead") },
                        { EKhaaosSupportedLanguage::esES, TEXT("Muerto") },
                        { EKhaaosSupportedLanguage::frFR, TEXT("Mort") },
                        { EKhaaosSupportedLanguage::deDE, TEXT("Tot") },
                        { EKhaaosSupportedLanguage::jaJP, TEXT("死亡") },
                        { EKhaaosSupportedLanguage::koKR, TEXT("사망") },
                        { EKhaaosSupportedLanguage::zhCN, TEXT("死亡") },
                        { EKhaaosSupportedLanguage::zhTW, TEXT("死亡") },
                        { EKhaaosSupportedLanguage::ruRU, TEXT("Мёртвый") },
                        { EKhaaosSupportedLanguage::arSA, TEXT("ميت") },
                        { EKhaaosSupportedLanguage::hiIN, TEXT("मृत") }
                };

                // Male variant
                GenderedEntry.MaleVariant = {
                        { EKhaaosSupportedLanguage::ptBR, TEXT("Morto") },
                        { EKhaaosSupportedLanguage::enUS, TEXT("Dead") },
                        { EKhaaosSupportedLanguage::esES, TEXT("Muerto") },
                        { EKhaaosSupportedLanguage::frFR, TEXT("Mort") },
                        { EKhaaosSupportedLanguage::deDE, TEXT("Tot") },
                        { EKhaaosSupportedLanguage::ruRU, TEXT("Мёртвый") }
                };

                // Female variant
                GenderedEntry.FemaleVariant = {
                        { EKhaaosSupportedLanguage::ptBR, TEXT("Morta") },
                        { EKhaaosSupportedLanguage::enUS, TEXT("Dead") },
                        { EKhaaosSupportedLanguage::esES, TEXT("Muerta") },
                        { EKhaaosSupportedLanguage::frFR, TEXT("Morte") },
                        { EKhaaosSupportedLanguage::deDE, TEXT("Tot") },
                        { EKhaaosSupportedLanguage::ruRU, TEXT("Мёртвая") }
                };
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Default string tables initialized (%d strings)"), LocalizedStrings.Num());
}

// ─── Private: Cultural Adaptations ──────────────────────────────────────────────

void UKhaaosLocalizationManager::InitializeCulturalAdaptations()
{
        // ─── ptBR: PEGI 12, permissive ────────────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::ptBR);
                Adapt.ContentRating = TEXT("PEGI 12");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = true;
                Adapt.bProfanityFiltered = false;
        }

        // ─── enUS: ESRB T, permissive ─────────────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::enUS);
                Adapt.ContentRating = TEXT("ESRB T");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = true;
                Adapt.bProfanityFiltered = false;
        }

        // ─── esES: PEGI 12, gambling restricted ───────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::esES);
                Adapt.ContentRating = TEXT("PEGI 12");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
        }

        // ─── frFR: PEGI 12, gambling restricted ───────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::frFR);
                Adapt.ContentRating = TEXT("PEGI 12");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
        }

        // ─── deDE: USK 12, strict ─────────────────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::deDE);
                Adapt.ContentRating = TEXT("USK 12");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
        }

        // ─── jaJP: CERO B, gambling restricted ────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::jaJP);
                Adapt.ContentRating = TEXT("CERO B");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
                Adapt.CensorshipRules.Add(TEXT("GoreReduction"), TEXT("True"));
        }

        // ─── koKR: GRAC 12, strict profanity ─────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::koKR);
                Adapt.ContentRating = TEXT("GRAC 12");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
        }

        // ─── zhCN: CADPA 16+, strict ─────────────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::zhCN);
                Adapt.ContentRating = TEXT("CADPA 16+");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
                Adapt.CensorshipRules.Add(TEXT("SkeletonCensor"), TEXT("True"));
        }

        // ─── zhTW: GSRR 12+, moderate ────────────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::zhTW);
                Adapt.ContentRating = TEXT("GSRR 12+");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
        }

        // ─── ruRU: RU 12+, gambling restricted ────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::ruRU);
                Adapt.ContentRating = TEXT("RU 12+");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = false;
        }

        // ─── arSA: GCAM 12+, strict profanity and cultural rules ──────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::arSA);
                Adapt.ContentRating = TEXT("GCAM 12+");
                Adapt.bViolenceAllowed = false;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
                Adapt.CensorshipRules.Add(TEXT("NoCrossReferences"), TEXT("True"));
                Adapt.CensorshipRules.Add(TEXT("AlcoholRemoval"), TEXT("True"));
        }

        // ─── hiIN: IGRB 12+, moderate ─────────────────────────────────────
        {
                FKhaaosCulturalAdaptation& Adapt = CulturalAdaptations.FindOrAdd(EKhaaosSupportedLanguage::hiIN);
                Adapt.ContentRating = TEXT("IGRB 12+");
                Adapt.bViolenceAllowed = true;
                Adapt.bGamblingAllowed = false;
                Adapt.bProfanityFiltered = true;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Cultural adaptations initialized (%d regions)"), CulturalAdaptations.Num());
}

// ─── Private: Locale Overrides ──────────────────────────────────────────────────

void UKhaaosLocalizationManager::ApplyLocaleOverrides(EKhaaosSupportedLanguage Language)
{
        // Apply locale-specific config overrides when language changes
        switch (Language)
        {
        case EKhaaosSupportedLanguage::ptBR:
                Config.DateFormat = TEXT("DD/MM/YYYY");
                Config.TimeFormat = TEXT("24h");
                Config.NumberGroupSeparator = TEXT(".");
                Config.DecimalSeparator = TEXT(",");
                Config.bUseMetricUnits = true;
                break;

        case EKhaaosSupportedLanguage::enUS:
                Config.DateFormat = TEXT("MM/DD/YYYY");
                Config.TimeFormat = TEXT("12h");
                Config.NumberGroupSeparator = TEXT(",");
                Config.DecimalSeparator = TEXT(".");
                Config.bUseMetricUnits = false;
                break;

        case EKhaaosSupportedLanguage::esES:
        case EKhaaosSupportedLanguage::frFR:
        case EKhaaosSupportedLanguage::deDE:
        case EKhaaosSupportedLanguage::ruRU:
        case EKhaaosSupportedLanguage::hiIN:
                Config.DateFormat = TEXT("DD/MM/YYYY");
                Config.TimeFormat = TEXT("24h");
                Config.NumberGroupSeparator = TEXT(".");
                Config.DecimalSeparator = TEXT(",");
                Config.bUseMetricUnits = true;
                break;

        case EKhaaosSupportedLanguage::jaJP:
                Config.DateFormat = TEXT("YYYY/MM/DD");
                Config.TimeFormat = TEXT("24h");
                Config.NumberGroupSeparator = TEXT(",");
                Config.DecimalSeparator = TEXT(".");
                Config.bUseMetricUnits = true;
                break;

        case EKhaaosSupportedLanguage::koKR:
                Config.DateFormat = TEXT("YYYY.MM.DD");
                Config.TimeFormat = TEXT("24h");
                Config.NumberGroupSeparator = TEXT(",");
                Config.DecimalSeparator = TEXT(".");
                Config.bUseMetricUnits = true;
                break;

        case EKhaaosSupportedLanguage::zhCN:
        case EKhaaosSupportedLanguage::zhTW:
                Config.DateFormat = TEXT("YYYY/MM/DD");
                Config.TimeFormat = TEXT("24h");
                Config.NumberGroupSeparator = TEXT(",");
                Config.DecimalSeparator = TEXT(".");
                Config.bUseMetricUnits = true;
                break;

        case EKhaaosSupportedLanguage::arSA:
                Config.DateFormat = TEXT("DD/MM/YYYY");
                Config.TimeFormat = TEXT("12h");
                Config.NumberGroupSeparator = TEXT(",");
                Config.DecimalSeparator = TEXT(".");
                Config.bUseMetricUnits = true;
                break;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLocalizationManager: Locale overrides applied for lang=%d (dateFormat=%s, timeFormat=%s)"),
                (int32)Language, *Config.DateFormat, *Config.TimeFormat);
}
