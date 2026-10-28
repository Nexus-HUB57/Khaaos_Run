// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosCosmeticValidator
// Server-side cosmetic loadout validation com anti-cheat integration.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosCosmeticValidator.h"
#include "Misc/DateTime.h"

void UKhaaosCosmeticValidator::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    TotalValidations = 0;
    FailedValidations = 0;

    UE_LOG(LogTemp, Display, TEXT("[CosmeticValidator] Subsystem inicializado. Server-side validation ativa."));
}

FKhaaosValidationReport UKhaaosCosmeticValidator::ValidateLoadout(int32 PlayerId, const FKhaaosCosmeticLoadout& Loadout, const FKhaaosCosmeticOwnership& Ownership)
{
    TotalValidations++;

    FKhaaosValidationReport Report;
    Report.Timestamp = FDateTime::UtcNow();

    // Track equipped skin IDs para detectar duplicatas
    TSet<FName> EquippedSkinIds;

    for (const auto& Pair : Loadout.EquippedSkins)
    {
        const EKhaaosCosmeticSlot Slot = Pair.Key;
        const FName SkinId = Pair.Value;

        // Slot vazio = sempre válido
        if (SkinId == NAME_None) continue;

        // 1. Verificar duplicata
        if (EquippedSkinIds.Contains(SkinId))
        {
            Report.Result = EKhaaosValidationResult::InvalidDuplicateItem;
            Report.FailedSlot = Slot;
            Report.FailedSkinId = SkinId;
            Report.Message = FString::Printf(TEXT("Skin %s equipada em múltiplos slots"), *SkinId.ToString());
            FailedValidations++;
            ReportValidationFailure(PlayerId, Report);
            return Report;
        }
        EquippedSkinIds.Add(SkinId);

        // 2. Verificar ban
        if (!ValidateNotBanned(SkinId, Ownership))
        {
            Report.Result = EKhaaosValidationResult::InvalidBannedCosmetic;
            Report.FailedSlot = Slot;
            Report.FailedSkinId = SkinId;
            Report.Message = FString::Printf(TEXT("Skin %s está banida (anti-cheat)"), *SkinId.ToString());
            FailedValidations++;
            ReportValidationFailure(PlayerId, Report);
            return Report;
        }

        // 3. Verificar ownership
        if (!ValidateOwnership(SkinId, Ownership))
        {
            Report.Result = EKhaaosValidationResult::InvalidNotOwned;
            Report.FailedSlot = Slot;
            Report.FailedSkinId = SkinId;
            Report.Message = FString::Printf(TEXT("Jogador não possui skin %s"), *SkinId.ToString());
            FailedValidations++;
            ReportValidationFailure(PlayerId, Report);
            return Report;
        }

        // 4. Verificar species compatibility
        if (!ValidateSpeciesCompatibility(SkinId, Ownership))
        {
            Report.Result = EKhaaosValidationResult::InvalidSpeciesMismatch;
            Report.FailedSlot = Slot;
            Report.FailedSkinId = SkinId;
            Report.Message = FString::Printf(TEXT("Skin %s é incompatível com espécie %s"), *SkinId.ToString(), *Ownership.ActiveSpeciesId.ToString());
            FailedValidations++;
            ReportValidationFailure(PlayerId, Report);
            return Report;
        }

        // 5. Verificar battle pass tier
        if (!ValidateBattlePassTier(SkinId, Ownership))
        {
            Report.Result = EKhaaosValidationResult::InvalidRarityLocked;
            Report.FailedSlot = Slot;
            Report.FailedSkinId = SkinId;
            Report.Message = FString::Printf(TEXT("Skin %s requer Battle Pass tier não alcançado"), *SkinId.ToString());
            FailedValidations++;
            ReportValidationFailure(PlayerId, Report);
            return Report;
        }
    }

    // Tudo válido
    Report.Result = EKhaaosValidationResult::Valid;
    Report.Message = TEXT("Loadout válido");
    return Report;
}

FKhaaosValidationReport UKhaaosCosmeticValidator::ValidateEquipSingle(int32 PlayerId, EKhaaosCosmeticSlot Slot, FName SkinId, const FKhaaosCosmeticOwnership& Ownership)
{
    TotalValidations++;

    FKhaaosValidationReport Report;
    Report.FailedSlot = Slot;
    Report.FailedSkinId = SkinId;
    Report.Timestamp = FDateTime::UtcNow();

    if (SkinId == NAME_None)
    {
        Report.Result = EKhaaosValidationResult::Valid;
        Report.Message = TEXT("Slot vazio — sempre válido");
        return Report;
    }

    if (!ValidateNotBanned(SkinId, Ownership))
    {
        Report.Result = EKhaaosValidationResult::InvalidBannedCosmetic;
        Report.Message = TEXT("Cosmético banido");
        FailedValidations++;
        ReportValidationFailure(PlayerId, Report);
        return Report;
    }

    if (!ValidateOwnership(SkinId, Ownership))
    {
        Report.Result = EKhaaosValidationResult::InvalidNotOwned;
        Report.Message = TEXT("Skin não pertence ao jogador");
        FailedValidations++;
        ReportValidationFailure(PlayerId, Report);
        return Report;
    }

    if (!ValidateSpeciesCompatibility(SkinId, Ownership))
    {
        Report.Result = EKhaaosValidationResult::InvalidSpeciesMismatch;
        Report.Message = TEXT("Species incompatível");
        FailedValidations++;
        ReportValidationFailure(PlayerId, Report);
        return Report;
    }

    if (!ValidateBattlePassTier(SkinId, Ownership))
    {
        Report.Result = EKhaaosValidationResult::InvalidRarityLocked;
        Report.Message = TEXT("Battle Pass tier insuficiente");
        FailedValidations++;
        ReportValidationFailure(PlayerId, Report);
        return Report;
    }

    Report.Result = EKhaaosValidationResult::Valid;
    Report.Message = TEXT("Equip válido");
    return Report;
}

bool UKhaaosCosmeticValidator::ValidateOwnership(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const
{
    return Ownership.OwnedSkinIds.Contains(SkinId);
}

bool UKhaaosCosmeticValidator::ValidateSpeciesCompatibility(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const
{
    // Universal cosmetics (banners, gliders) são compatíveis com qualquer espécie
    // Species-specific skins requerem matching

    // Convenção: skin IDs começam com SKN_<SPECIES> (ex: SKN_HURAN_ABYSS_F)
    // Se o prefixo não é uma espécie, é universal
    const FString SkinIdStr = SkinId.ToString();

    if (SkinIdStr.StartsWith(TEXT("SKN_HURAN")) ||
        SkinIdStr.StartsWith(TEXT("SKN_KHAEL")) ||
        SkinIdStr.StartsWith(TEXT("SKN_VENEX")) ||
        SkinIdStr.StartsWith(TEXT("SKN_ONITH")) ||
        SkinIdStr.StartsWith(TEXT("SKN_ZHEERS")) ||
        SkinIdStr.StartsWith(TEXT("SKN_SKEETW")))
    {
        // Species-specific: verificar se a espécie do skin bate com a do operative
        FString SkinSpecies;
        if (SkinIdStr.StartsWith(TEXT("SKN_HURAN")))  SkinSpecies = TEXT("HURAN");
        else if (SkinIdStr.StartsWith(TEXT("SKN_KHAEL")))  SkinSpecies = TEXT("KHAEL");
        else if (SkinIdStr.StartsWith(TEXT("SKN_VENEX")))  SkinSpecies = TEXT("VENEX");
        else if (SkinIdStr.StartsWith(TEXT("SKN_ONITH")))  SkinSpecies = TEXT("ONITH");
        else if (SkinIdStr.StartsWith(TEXT("SKN_ZHEERS"))) SkinSpecies = TEXT("ZHEERS");
        else if (SkinIdStr.StartsWith(TEXT("SKN_SKEETW"))) SkinSpecies = TEXT("SKEETW");

        return Ownership.ActiveSpeciesId.ToString() == SkinSpecies;
    }

    // Universal (ACC_, GLD_, BNR_, WSKN_) — sempre compatível
    return true;
}

bool UKhaaosCosmeticValidator::ValidateBattlePassTier(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const
{
    // Skins do Battle Pass requerem tier alcançado + premium se necessário
    // Convenção: se o skin é do BP, está em skin_shop_catalog.json com battle_pass_tier

    // Simplificação: skins LENDARIO+ requerem tier >= 60
    // Skins MITICO requerem tier >= 100
    const FString SkinIdStr = SkinId.ToString();

    if (SkinIdStr.Contains(TEXT("ARCANELORD")) || SkinIdStr.Contains(TEXT("WARLORD")))
    {
        return Ownership.BattlePassTier >= 60 && Ownership.bHasPremiumPass;
    }

    if (SkinIdStr.Contains(TEXT("SOLAR")) || SkinIdStr.Contains(TEXT("OVERLORD")))
    {
        return Ownership.BattlePassTier >= 100 && Ownership.bHasPremiumPass;
    }

    // Outros skins não requerem BP específico
    return true;
}

bool UKhaaosCosmeticValidator::ValidateNotBanned(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const
{
    return !Ownership.BannedCosmetics.Contains(SkinId);
}

void UKhaaosCosmeticValidator::ReportValidationFailure(int32 PlayerId, const FKhaaosValidationReport& Report)
{
    TArray<FKhaaosValidationReport>& Failures = RecentFailures.FindOrAdd(PlayerId);
    Failures.Add(Report);

    // Rate limiting: se > MAX_FAILURES_BEFORE_FLAG em FAILURE_WINDOW_SEC, flag anti-cheat
    if (Failures.Num() >= MAX_FAILURES_BEFORE_FLAG)
    {
        UE_LOG(LogTemp, Error, TEXT("[CosmeticValidator] ANTI-CHEAT FLAG: Player %d teve %d falhas de validação em janela de %.0fs. Possível spoofing!"),
            PlayerId, Failures.Num(), FAILURE_WINDOW_SEC);

        // Em produção: enviar evento para sistema anti-cheat (EAC/BE)
        // Por enquanto, log como warning grave
    }

    UE_LOG(LogTemp, Warning, TEXT("[CosmeticValidator] Falha: Player=%d, Result=%s, Slot=%s, Skin=%s, Msg=%s"),
        PlayerId,
        *UEnum::GetDisplayValueAsText(Report.Result).ToString(),
        *UEnum::GetDisplayValueAsText(Report.FailedSlot).ToString(),
        *Report.FailedSkinId.ToString(),
        *Report.Message);
}

float UKhaaosCosmeticValidator::GetValidationPassRate() const
{
    if (TotalValidations == 0) return 1.0f;
    return 1.0f - (static_cast<float>(FailedValidations) / static_cast<float>(TotalValidations));
}

void UKhaaosCosmeticValidator::DumpValidationStats() const
{
    UE_LOG(LogTemp, Display, TEXT("[CosmeticValidator] === Validation Stats ==="));
    UE_LOG(LogTemp, Display, TEXT("  Total: %d | Passed: %d | Failed: %d | Pass Rate: %.1f%%"),
        TotalValidations, TotalValidations - FailedValidations, FailedValidations,
        GetValidationPassRate() * 100.0f);
    UE_LOG(LogTemp, Display, TEXT("  Players flagged: %d/%d"),
        RecentFailures.Num(), MAX_FAILURES_BEFORE_FLAG);
}
