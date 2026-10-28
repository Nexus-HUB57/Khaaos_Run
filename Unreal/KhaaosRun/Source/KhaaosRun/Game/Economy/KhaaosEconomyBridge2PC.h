// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosEconomyBridge2PC
// PROPÓSITO: Two-Phase Commit (2PC) para transações atômicas de KRC.
//            Garante consistência entre UE5 client → Node.js → PostgreSQL/Drizzle
//            com bloqueio de KRC durante prepare, commit atômico, e abort com refund.
//
//            Protocolo:
//              1. BeginTransaction() → cria transação com idempotency key
//              2. PreparePhase()     → HTTP POST /api/economy/2pc/prepare
//                                       (locks KRC nos participantes)
//              3. CommitPhase()      → HTTP POST /api/economy/2pc/commit
//                                       (finaliza débito)
//              4. AbortPhase()       → HTTP POST /api/economy/2pc/abort
//                                       (release lock, refund)
//
//            Safety:
//              - Idempotency keys previnem double-spend
//              - Timeout recovery para transações stuck em PREPARED
//              - Max concurrent transactions para resource limiting
//              - GUID generation para transaction IDs
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Http.h"
#include "TimerManager.h"
#include "KhaaosEconomyBridge2PC.generated.h"

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Fase atual do 2PC */
UENUM(BlueprintType)
enum class EKhaaos2PCPhase : uint8
{
    None    UMETA(DisplayName = "None"),
    Prepare UMETA(DisplayName = "Prepare"),
    Commit  UMETA(DisplayName = "Commit"),
    Abort   UMETA(DisplayName = "Abort")
};

/** Status da transação 2PC */
UENUM(BlueprintType)
enum class EKhaaos2PCStatus : uint8
{
    Idle       UMETA(DisplayName = "Idle"),
    Preparing  UMETA(DisplayName = "Preparing"),
    Prepared   UMETA(DisplayName = "Prepared"),
    Committing UMETA(DisplayName = "Committing"),
    Committed  UMETA(DisplayName = "Committed"),
    Aborting   UMETA(DisplayName = "Aborting"),
    Aborted    UMETA(DisplayName = "Aborted"),
    Timeout    UMETA(DisplayName = "Timeout")
};

// ─── Structs ────────────────────────────────────────────────────────────────

/** Representação de uma transação 2PC */
USTRUCT(BlueprintType)
struct FKhaaos2PCTransaction
{
    GENERATED_BODY()

    /** ID único da transação (GUID) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString TransactionID;

    /** Fase atual */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaos2PCPhase Phase = EKhaaos2PCPhase::None;

    /** Status atual */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaos2PCStatus Status = EKhaaos2PCStatus::Idle;

    /** Chave de idempotência (previne double-spend) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString IdempotencyKey;

    /** Quantidade de KRC envolvida */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 AmountKRC = 0;

    /** Descrição da transação */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString Description;

    /** ID do jogador */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 PlayerID = 0;

    /** ID do item (se compra de item) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString ItemID;

    /** Timestamp de criação (ISO 8601) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString CreatedTimestamp;

    /** Timestamp de expiração */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString ExpiryTimestamp;

    /** ID do nó coordenador */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString CoordinatorNodeID;

    /** Razão do abort (se aplicável) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString AbortReason;
};

// ─── Delegates ──────────────────────────────────────────────────────────────

/** Disparado quando transação 2PC completa com sucesso */
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOn2PCCompleted, const FString&, TransactionID, int32, AmountKRC);

/** Disparado quando transação 2PC falha */
DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOn2PCFailed, const FString&, TransactionID, EKhaaos2PCStatus, FinalStatus, const FString&, Reason);

// ─── Subsystem ──────────────────────────────────────────────────────────────

/**
 * UKhaaosEconomyBridge2PC
 *
 * Engine subsystem para Two-Phase Commit de transações KRC.
 * Protocolo: Prepare (lock KRC) → Commit (finalize debit) ou Abort (release + refund).
 *
 * Integração HTTP com Node.js Economy API:
 *   POST /api/economy/2pc/prepare  — {transactionId, idempotencyKey, amount, playerId}
 *   POST /api/economy/2pc/commit   — {transactionId}
 *   POST /api/economy/2pc/abort    — {transactionId, reason}
 *
 * Features:
 *   - Idempotency key validation (prevenção de double-spend)
 *   - Timeout recovery para transações stuck em PREPARED
 *   - Max concurrent transactions (resource limiting)
 *   - GUID generation para transaction IDs
 *   - Periodic recovery check (a cada 10s)
 */
UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosEconomyBridge2PC : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosEconomyBridge2PC();

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Transaction Lifecycle ──────────────────────────────────────────────

    /**
     * Cria nova transação 2PC com idempotency key.
     * Retorna TransactionID vazio se falha (max concurrent atingido ou idempotency duplicada).
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|2PC")
    FString BeginTransaction(int32 PlayerID, int32 AmountKRC, const FString& ItemID, const FString& IdempotencyKey, const FString& Description = TEXT(""));

    /**
     * Envia PREPARE para todos os participantes (UE5 → Node.js → PostgreSQL/Drizzle).
     * Locks KRC no servidor. Chamado após BeginTransaction.
     * Dispara On2PCCompleted ou On2PCFailed ao final.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|2PC")
    void PreparePhase(const FString& TransactionID, const FOn2PCCompleted& OnCompleted, const FOn2PCFailed& OnFailed);

    /**
     * Envia COMMIT após todos participantes ACK.
     * Finaliza débito de KRC. Chamado após PreparePhase sucesso.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|2PC")
    void CommitPhase(const FString& TransactionID, const FOn2PCCompleted& OnCompleted, const FOn2PCFailed& OnFailed);

    /**
     * Envia ABORT. Release lock + refund.
     * Chamado quando prepare falha ou timeout.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|2PC")
    void AbortPhase(const FString& TransactionID, const FString& Reason = TEXT(""), const FOn2PCFailed& OnFailed = FOn2PCFailed());

    // ─── Query ─────────────────────────────────────────────────────────────

    /** Obtém status de uma transação */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|2PC")
    EKhaaos2PCStatus GetTransactionStatus(const FString& TransactionID) const;

    /** Obtém dados completos de uma transação */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|2PC")
    bool GetTransaction(const FString& TransactionID, FKhaaos2PCTransaction& OutTransaction) const;

    /** Número de transações ativas */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|2PC")
    int32 GetActiveTransactionCount() const { return ActiveTransactions.Num(); }

    // ─── Recovery ──────────────────────────────────────────────────────────

    /** Recupera transações stuck em PREPARED state (timeout recovery) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|2PC")
    void RecoverStaleTransactions();

    /** Valida idempotency key — previne double-spend */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|2PC")
    bool ValidateIdempotencyKey(const FString& IdempotencyKey) const;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Timeout de transação em segundos (default: 30) */
    UPROPERTY(Config, EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|2PC")
    float TransactionTimeoutSec = 30.0f;

    /** Máximo de transações concorrentes (default: 50) */
    UPROPERTY(Config, EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|2PC")
    int32 MaxConcurrentTransactions = 50;

    /** ID do nó coordenador */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|2PC")
    FString CoordinatorNodeID;

    /** Base URL para API Economy (Node.js) */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|2PC")
    FString ApiBaseUrl;

    /** Timeout de HTTP request em segundos */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|2PC")
    float RequestTimeout = 15.0f;

private:
    /** Transações ativas (TransactionID → dados) */
    UPROPERTY()
    TMap<FString, FKhaaos2PCTransaction> ActiveTransactions;

    /** Chaves de idempotência já usadas (previne double-spend) */
    TSet<FString> UsedIdempotencyKeys;

    /** Timer handle para recovery periódico */
    FTimerHandle RecoveryTimer;

    /** HTTP module */
    FHttpModule* HttpModule;

    /** Timestamp de criação mapeado por TransactionID (para timeout check) */
    TMap<FString, double> TransactionCreatedTimes;

    // ─── Internal ──────────────────────────────────────────────────────────

    /** Gera GUID para TransactionID */
    FString GenerateTransactionGUID() const;

    /** Gera timestamp ISO 8601 */
    FString GenerateTimestampISO8601() const;

    /** Envia HTTP POST request para API Economy */
    void SendPostRequest(const FString& Endpoint, const FString& JsonBody, TFunction<void(bool, const FString&)> Callback);

    /** Atualiza status de transação */
    void UpdateTransactionStatus(const FString& TransactionID, EKhaaos2PCPhase Phase, EKhaaos2PCStatus Status);

    /** Remove transação completada */
    void CleanupTransaction(const FString& TransactionID);

    /** Inicia timer de recovery periódico */
    void StartRecoveryTimer();

    /** Para timer de recovery */
    void StopRecoveryTimer();
};
