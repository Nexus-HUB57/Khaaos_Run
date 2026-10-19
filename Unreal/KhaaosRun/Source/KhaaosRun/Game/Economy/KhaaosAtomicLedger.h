// ============================================================================
// Khaaos Run — Atomic Ledger for KRC Economy (Fase 4)
// ============================================================================
// Production-grade immutable ledger for KRC (Khaaos Run Coin) economy.
//
// Features:
//   - Append-only immutable transactions
//   - Idempotency keys prevent duplicate transactions
//   - Atomic operations: Mint, Burn, Transfer, Escrow, Release, Refund
//   - Balance computed from transaction history (never stored directly)
//   - SHA256 hash chain (each tx links to previous hash)
//   - Double-entry bookkeeping (every debit has a credit)
//   - Compliance fields: Reason, Source, ActorType
//   - Transaction types: Earn, Spend, Loot, Trade, BankDeposit, BankWithdraw,
//     FBM, Cashback, Prize, Penalty
//   - Query functions: GetBalance, GetTransactionHistory, VerifyIntegrity
//   - Rollback via compensating transactions (never delete)
//   - In-memory with periodic flush to EOS Cloud Save
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosAtomicLedger.generated.h"

// ─── Transaction Types ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosTransactionType : uint8
{
    Earn          UMETA(DisplayName = "Earn — KRC earned from gameplay"),
    Spend         UMETA(DisplayName = "Spend — KRC spent on purchase"),
    Loot          UMETA(DisplayName = "Loot — KRC from loot pickup"),
    Trade         UMETA(DisplayName = "Trade — KRC from player trade"),
    BankDeposit   UMETA(DisplayName = "Bank Deposit — KRC to bank"),
    BankWithdraw  UMETA(DisplayName = "Bank Withdraw — KRC from bank"),
    FBM           UMETA(DisplayName = "FBM — Fee-Based Mechanism"),
    Cashback      UMETA(DisplayName = "Cashback — KRC return"),
    Prize         UMETA(DisplayName = "Prize — KRC from event/prize"),
    Penalty       UMETA(DisplayName = "Penalty — KRC deducted as penalty"),
    EscrowLock    UMETA(DisplayName = "Escrow Lock — KRC locked in escrow"),
    EscrowRelease UMETA(DisplayName = "Escrow Release — KRC released from escrow"),
    EscrowRefund  UMETA(DisplayName = "Escrow Refund — KRC refunded from escrow"),
    Burn          UMETA(DisplayName = "Burn — KRC burned (supply reduction)"),
    Mint          UMETA(DisplayName = "Mint — KRC minted (supply increase)"),
};

UENUM(BlueprintType)
enum class EKhaaosActorType : uint8
{
    Player  UMETA(DisplayName = "Player"),
    System  UMETA(DisplayName = "System"),
    Event   UMETA(DisplayName = "Event"),
};

// ─── Ledger Transaction ──────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosLedgerTransaction
{
    GENERATED_BODY()

    /** Unique transaction ID */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FGuid TransactionId;

    /** Idempotency key (prevents duplicates) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString IdempotencyKey;

    /** Transaction type */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaosTransactionType Type = EKhaaosTransactionType::Earn;

    /** Debit account (source) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString DebitAccount;

    /** Credit account (destination) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString CreditAccount;

    /** Amount in KRC (always positive, direction from Type) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 AmountKRC = 0;

    /** SHA256 hash of this transaction */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString Hash;

    /** SHA256 hash of previous transaction (chain link) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString PreviousHash;

    /** Timestamp (UTC epoch seconds) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 Timestamp = 0;

    /** Reason for transaction */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString Reason;

    /** Actor who initiated this transaction */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString ActorId;

    /** Actor type */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaosActorType ActorType = EKhaaosActorType::System;

    /** World where transaction occurred (CIGKV/W1/W2/W3/W4) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString WorldId;

    /** Is this a compensating (rollback) transaction? */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bIsCompensating = false;

    /** Original transaction ID if compensating */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FGuid CompensatesTransactionId;
};

// ─── Ledger Milestone ────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosLedgerMilestone
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 SequenceNumber = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString Hash;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 Timestamp = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 TotalTransactions = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 TotalKRCInCirculation = 0;
};

// ─── Delegates ───────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnTransactionComplete, bool, bSuccess, const FKhaaosLedgerTransaction&, Tx, const FString&, ErrorMsg);

// ─── Atomic Ledger Subsystem ─────────────────────────────────────────────────

/**
 * UKhaaosAtomicLedger
 * Production-grade immutable ledger for KRC economy.
 *
 * All KRC flows go through this subsystem. Every transaction is:
 *   - Immutable (append-only, never deleted)
 *   - Idempotent (duplicate keys rejected)
 *   - Hash-chained (SHA256 link to previous tx)
 *   - Double-entry (debit + credit balanced)
 *   - Compliant (reason, source, actor type recorded)
 */
UCLASS()
class KHAAOSRUN_API UKhaaosAtomicLedger : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosAtomicLedger();

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Core Operations ────────────────────────────────────────────────────

    /** Mint KRC (supply increase — System only) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool Mint(const FString& Account, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId = TEXT("System"));

    /** Burn KRC (supply reduction) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool Burn(const FString& Account, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId = TEXT("System"));

    /** Transfer KRC between accounts */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool Transfer(const FString& FromAccount, const FString& ToAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, EKhaaosTransactionType Type = EKhaaosTransactionType::Trade, const FString& WorldId = TEXT("System"));

    /** Lock KRC in escrow */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool EscrowLock(const FString& Account, const FString& EscrowAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId = TEXT("System"));

    /** Release KRC from escrow to destination */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool EscrowRelease(const FString& EscrowAccount, const FString& ToAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId = TEXT("System"));

    /** Refund KRC from escrow back to source */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool EscrowRefund(const FString& EscrowAccount, const FString& ToAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId = TEXT("System"));

    // ─── Rollback ────────────────────────────────────────────────────────────

    /** Create a compensating transaction (never deletes original) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool Rollback(const FGuid& OriginalTxId, const FString& Reason, const FString& ActorId);

    // ─── Query Functions ─────────────────────────────────────────────────────

    /** Get balance for an account (computed from history, never stored) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ledger")
    int64 GetBalance(const FString& Account) const;

    /** Get escrow balance for an account */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ledger")
    int64 GetEscrowBalance(const FString& Account) const;

    /** Get transaction history for an account (paginated) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    TArray<FKhaaosLedgerTransaction> GetTransactionHistory(const FString& Account, int32 Offset = 0, int32 Limit = 50) const;

    /** Get all transactions of a specific type */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    TArray<FKhaaosLedgerTransaction> GetTransactionsByType(EKhaaosTransactionType Type, int32 Limit = 100) const;

    /** Get total KRC in circulation */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ledger")
    int64 GetTotalCirculation() const;

    /** Verify hash chain integrity (returns true if valid) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool VerifyIntegrity() const;

    /** Get transaction by ID */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    bool GetTransaction(const FGuid& TxId, FKhaaosLedgerTransaction& OutTx) const;

    // ─── Persistence ─────────────────────────────────────────────────────────

    /** Flush ledger to EOS Cloud Save (called periodically) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    void FlushToCloudSave();

    /** Load ledger from EOS Cloud Save */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ledger")
    void LoadFromCloudSave();

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Maximum KRC that can be minted (supply cap) */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ledger")
    int64 MaxKRCSupply = 1000000000;  // 1 billion KRC

    /** Flush interval in seconds */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ledger")
    float CloudSaveFlushInterval = 60.0f;

    /** Enable integrity verification on every write */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ledger")
    bool bVerifyOnWrite = true;

private:

    /** All transactions (append-only) */
    UPROPERTY()
    TArray<FKhaaosLedgerTransaction> Transactions;

    /** Idempotency key index (for duplicate detection) */
    TMap<FString, FGuid> IdempotencyIndex;

    /** Transaction ID index */
    TMap<FGuid, int32> TransactionIdIndex;

    /** SHA256 hash of the last transaction */
    FString LastHash;

    /** Total KRC ever minted */
    int64 TotalMinted = 0;

    /** Total KRC ever burned */
    int64 TotalBurned = 0;

    /** Sequence counter */
    int64 SequenceCounter = 0;

    /** Append a transaction to the ledger */
    bool AppendTransaction(FKhaaosLedgerTransaction& Tx);

    /** Compute SHA256 hash for a transaction */
    FString ComputeHash(const FKhaaosLedgerTransaction& Tx) const;

    /** Check idempotency key */
    bool IsIdempotencyKeyUsed(const FString& Key) const;

    /** Get current UTC timestamp */
    int64 GetCurrentTimestamp() const;

    /** Validate that account has sufficient balance */
    bool HasSufficientBalance(const FString& Account, int64 AmountKRC) const;
};
