// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosCosmeticValidator
// PROPÓSITO: Validação server-side de loadouts cosméticos para prevenir spoofing.
//            Verifica: ownership de skins, species compatibility, rarity restrictions,
//            slot conflicts, e battle pass tier requirements. Executado no server
//            antes de replicar loadout para outros jogadores.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Character/KhaaosSkinSystem.h"
#include "KhaaosCosmeticValidator.generated.h"

UENUM(BlueprintType)
enum class EKhaaosValidationResult : uint8
{
    Valid,                  // Loadout válido
    InvalidNotOwned,        // Skin não pertence ao jogador
    InvalidSpeciesMismatch, // Skin é de outra espécie
    InvalidSlotConflict,    // Conflito de slot (ex: 2 skins no HEAD)
    InvalidRarityLocked,    // Rarity requer tier de Battle Pass não alcançado
    InvalidDuplicateItem,   // Mesmo item equipado em múltiplos slots
    InvalidExpiredSeasonal, // Item sazonal expirado
    InvalidBannedCosmetic   // Cosmético banido (anti-cheat)
};

USTRUCT(BlueprintType)
struct FKhaaosValidationReport
{
    GENERATED_BODY()

    /** Resultado geral */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaosValidationResult Result = EKhaaosValidationResult::Valid;

    /** Slot com falha */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaosCosmeticSlot FailedSlot = EKhaaosCosmeticSlot::HEAD;

    /** Skin ID que falhou validação */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FName FailedSkinId;

    /** Mensagem descritiva */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString Message;

    /** Timestamp da validação */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FDateTime Timestamp;
};

USTRUCT(BlueprintType)
struct FKhaaosCosmeticOwnership
{
    GENERATED_BODY()

    /** Player ID */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 PlayerId = 0;

    /** Skins owned (SkinId → true) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TSet<FName> OwnedSkinIds;

    /** Battle Pass tier atual */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 BattlePassTier = 0;

    /** Battle Pass premium ativo */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bHasPremiumPass = false;

    /** Species do operative ativo */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName ActiveSpeciesId;

    /** Bans de cosméticos (anti-cheat) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TSet<FName> BannedCosmetics;
};

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosCosmeticValidator : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Valida um loadout completo (chamado no server antes de replicar) */
    FKhaaosValidationReport ValidateLoadout(int32 PlayerId, const FKhaaosCosmeticLoadout& Loadout, const FKhaaosCosmeticOwnership& Ownership);

    /** Valida equipar uma skin em um slot específico */
    FKhaaosValidationReport ValidateEquipSingle(int32 PlayerId, EKhaaosCosmeticSlot Slot, FName SkinId, const FKhaaosCosmeticOwnership& Ownership);

    /** Verifica ownership de uma skin */
    bool ValidateOwnership(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const;

    /** Verifica species compatibility */
    bool ValidateSpeciesCompatibility(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const;

    /** Verifica battle pass tier requirement */
    bool ValidateBattlePassTier(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const;

    /** Verifica se cosmético está banido */
    bool ValidateNotBanned(FName SkinId, const FKhaaosCosmeticOwnership& Ownership) const;

    /** Registra validação falha para monitoring/anti-cheat */
    void ReportValidationFailure(int32 PlayerId, const FKhaaosValidationReport& Report);

    /** Estatísticas: contagem de validações */
    int32 GetTotalValidations() const { return TotalValidations; }
    int32 GetFailedValidations() const { return FailedValidations; }
    float GetValidationPassRate() const;

    /** Debug: dump stats */
    void DumpValidationStats() const;

private:
    /** Contadores de validação */
    int32 TotalValidations = 0;
    int32 FailedValidations = 0;

    /** Últimas falhas por player (para rate limiting / anti-cheat) */
    TMap<int32, TArray<FKhaaosValidationReport>> RecentFailures;

    /** Máximo de falhas antes de flag para anti-cheat */
    static constexpr int32 MAX_FAILURES_BEFORE_FLAG = 10;

    /** Threshold de tempo para limpar falhas antigas (segundos) */
    static constexpr float FAILURE_WINDOW_SEC = 300.0f;
};
