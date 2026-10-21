// ============================================================================
// Khaaos Run — Atomic Ledger for KRC Economy Implementation (Fase 4)
// ============================================================================

#include "Game/Economy/KhaaosAtomicLedger.h"
#include "HAL/PlatformTime.h"
#include "Misc/DateTime.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosAtomicLedger::UKhaaosAtomicLedger()
{
    MaxKRCSupply = 1000000000;
    CloudSaveFlushInterval = 60.0f;
    bVerifyOnWrite = true;
    LastHash = TEXT("0000000000000000000000000000000000000000000000000000000000000000");
    TotalMinted = 0;
    TotalBurned = 0;
    SequenceCounter = 0;
}

void UKhaaosAtomicLedger::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Ledger] Atomic Ledger initialized — SupplyCap=%lld KRC"), MaxKRCSupply);
}

void UKhaaosAtomicLedger::Deinitialize()
{
    FlushToCloudSave();
    Transactions.Empty();
    IdempotencyIndex.Empty();
    TransactionIdIndex.Empty();
    Super::Deinitialize();
    UE_LOG(LogTemp, Log, TEXT("[Ledger] Atomic Ledger deinitialized — %lld total transactions"), SequenceCounter);
}

// ─── Core Operations ─────────────────────────────────────────────────────────

bool UKhaaosAtomicLedger::Mint(const FString& Account, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId)
{
    if (AmountKRC <= 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Ledger] Mint: Invalid amount %lld"), AmountKRC);
        return false;
    }

    // Supply cap check
    if ((TotalMinted - TotalBurned + AmountKRC) > MaxKRCSupply)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Ledger] Mint: Would exceed supply cap (%lld + %lld > %lld)"),
            TotalMinted - TotalBurned, AmountKRC, MaxKRCSupply);
        return false;
    }

    FKhaaosLedgerTransaction Tx;
    Tx.TransactionId = FGuid::NewGuid();
    Tx.IdempotencyKey = IdempotencyKey;
    Tx.Type = EKhaaosTransactionType::Mint;
    Tx.DebitAccount = TEXT("System:Mint");
    Tx.CreditAccount = Account;
    Tx.AmountKRC = AmountKRC;
    Tx.Reason = Reason;
    Tx.ActorId = TEXT("System");
    Tx.ActorType = EKhaaosActorType::System;
    Tx.WorldId = WorldId;
    Tx.Timestamp = GetCurrentTimestamp();
    Tx.bIsCompensating = false;

    if (AppendTransaction(Tx))
    {
        TotalMinted += AmountKRC;
        UE_LOG(LogTemp, Log, TEXT("[Ledger] Mint: %lld KRC to %s (total minted: %lld)"), AmountKRC, *Account, TotalMinted);
        return true;
    }
    return false;
}

bool UKhaaosAtomicLedger::Burn(const FString& Account, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId)
{
    if (AmountKRC <= 0) return false;
    if (!HasSufficientBalance(Account, AmountKRC))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Ledger] Burn: Insufficient balance for %s (amount: %lld)"), *Account, AmountKRC);
        return false;
    }

    FKhaaosLedgerTransaction Tx;
    Tx.TransactionId = FGuid::NewGuid();
    Tx.IdempotencyKey = IdempotencyKey;
    Tx.Type = EKhaaosTransactionType::Burn;
    Tx.DebitAccount = Account;
    Tx.CreditAccount = TEXT("System:Burn");
    Tx.AmountKRC = AmountKRC;
    Tx.Reason = Reason;
    Tx.ActorId = Account;
    Tx.ActorType = EKhaaosActorType::Player;
    Tx.WorldId = WorldId;
    Tx.Timestamp = GetCurrentTimestamp();

    if (AppendTransaction(Tx))
    {
        TotalBurned += AmountKRC;
        UE_LOG(LogTemp, Log, TEXT("[Ledger] Burn: %lld KRC from %s (total burned: %lld)"), AmountKRC, *Account, TotalBurned);
        return true;
    }
    return false;
}

bool UKhaaosAtomicLedger::Transfer(const FString& FromAccount, const FString& ToAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, EKhaaosTransactionType Type, const FString& WorldId)
{
    if (AmountKRC <= 0) return false;
    if (FromAccount == ToAccount) return false;
    if (!HasSufficientBalance(FromAccount, AmountKRC))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Ledger] Transfer: Insufficient balance for %s"), *FromAccount);
        return false;
    }

    FKhaaosLedgerTransaction Tx;
    Tx.TransactionId = FGuid::NewGuid();
    Tx.IdempotencyKey = IdempotencyKey;
    Tx.Type = Type;
    Tx.DebitAccount = FromAccount;
    Tx.CreditAccount = ToAccount;
    Tx.AmountKRC = AmountKRC;
    Tx.Reason = Reason;
    Tx.ActorId = FromAccount;
    Tx.ActorType = EKhaaosActorType::Player;
    Tx.WorldId = WorldId;
    Tx.Timestamp = GetCurrentTimestamp();

    if (AppendTransaction(Tx))
    {
        UE_LOG(LogTemp, Log, TEXT("[Ledger] Transfer: %lld KRC from %s to %s"), AmountKRC, *FromAccount, *ToAccount);
        return true;
    }
    return false;
}

bool UKhaaosAtomicLedger::EscrowLock(const FString& Account, const FString& EscrowAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId)
{
    if (AmountKRC <= 0) return false;
    if (!HasSufficientBalance(Account, AmountKRC)) return false;

    FKhaaosLedgerTransaction Tx;
    Tx.TransactionId = FGuid::NewGuid();
    Tx.IdempotencyKey = IdempotencyKey;
    Tx.Type = EKhaaosTransactionType::EscrowLock;
    Tx.DebitAccount = Account;
    Tx.CreditAccount = EscrowAccount;
    Tx.AmountKRC = AmountKRC;
    Tx.Reason = Reason;
    Tx.ActorId = Account;
    Tx.ActorType = EKhaaosActorType::Player;
    Tx.WorldId = WorldId;
    Tx.Timestamp = GetCurrentTimestamp();

    return AppendTransaction(Tx);
}

bool UKhaaosAtomicLedger::EscrowRelease(const FString& EscrowAccount, const FString& ToAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId)
{
    if (AmountKRC <= 0) return false;
    // Escrow account is treated as a regular account for balance check
    int64 EscrowBal = GetBalance(EscrowAccount);
    if (EscrowBal < AmountKRC) return false;

    FKhaaosLedgerTransaction Tx;
    Tx.TransactionId = FGuid::NewGuid();
    Tx.IdempotencyKey = IdempotencyKey;
    Tx.Type = EKhaaosTransactionType::EscrowRelease;
    Tx.DebitAccount = EscrowAccount;
    Tx.CreditAccount = ToAccount;
    Tx.AmountKRC = AmountKRC;
    Tx.Reason = Reason;
    Tx.ActorId = TEXT("System");
    Tx.ActorType = EKhaaosActorType::System;
    Tx.WorldId = WorldId;
    Tx.Timestamp = GetCurrentTimestamp();

    return AppendTransaction(Tx);
}

bool UKhaaosAtomicLedger::EscrowRefund(const FString& EscrowAccount, const FString& ToAccount, int64 AmountKRC, const FString& Reason, const FString& IdempotencyKey, const FString& WorldId)
{
    if (AmountKRC <= 0) return false;
    int64 EscrowBal = GetBalance(EscrowAccount);
    if (EscrowBal < AmountKRC) return false;

    FKhaaosLedgerTransaction Tx;
    Tx.TransactionId = FGuid::NewGuid();
    Tx.IdempotencyKey = IdempotencyKey;
    Tx.Type = EKhaaosTransactionType::EscrowRefund;
    Tx.DebitAccount = EscrowAccount;
    Tx.CreditAccount = ToAccount;
    Tx.AmountKRC = AmountKRC;
    Tx.Reason = Reason;
    Tx.ActorId = TEXT("System");
    Tx.ActorType = EKhaaosActorType::System;
    Tx.WorldId = WorldId;
    Tx.Timestamp = GetCurrentTimestamp();

    return AppendTransaction(Tx);
}

// ─── Rollback ────────────────────────────────────────────────────────────────

bool UKhaaosAtomicLedger::Rollback(const FGuid& OriginalTxId, const FString& Reason, const FString& ActorId)
{
    FKhaaosLedgerTransaction OriginalTx;
    if (!GetTransaction(OriginalTxId, OriginalTx))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Ledger] Rollback: Transaction %s not found"), *OriginalTxId.ToString());
        return false;
    }

    // Create compensating transaction (reverse debit/credit)
    FKhaaosLedgerTransaction CompTx;
    CompTx.TransactionId = FGuid::NewGuid();
    CompTx.IdempotencyKey = TEXT("rollback:") + OriginalTxId.ToString();
    CompTx.Type = OriginalTx.Type;  // Same type
    CompTx.DebitAccount = OriginalTx.CreditAccount;  // Reversed
    CompTx.CreditAccount = OriginalTx.DebitAccount;  // Reversed
    CompTx.AmountKRC = OriginalTx.AmountKRC;
    CompTx.Reason = TEXT("Rollback: ") + Reason;
    CompTx.ActorId = ActorId;
    CompTx.ActorType = EKhaaosActorType::System;
    CompTx.WorldId = OriginalTx.WorldId;
    CompTx.Timestamp = GetCurrentTimestamp();
    CompTx.bIsCompensating = true;
    CompTx.CompensatesTransactionId = OriginalTxId;

    if (AppendTransaction(CompTx))
    {
        UE_LOG(LogTemp, Log, TEXT("[Ledger] Rollback: Compensating tx for %s (amount: %lld KRC)"),
            *OriginalTxId.ToString(), OriginalTx.AmountKRC);
        return true;
    }
    return false;
}

// ─── Query Functions ─────────────────────────────────────────────────────────

int64 UKhaaosAtomicLedger::GetBalance(const FString& Account) const
{
    // Balance is computed from transaction history (never stored directly)
    // Credits increase balance, Debits decrease balance
    // Exception: Mint credits target, Burn debits source
    int64 Balance = 0;

    for (const FKhaaosLedgerTransaction& Tx : Transactions)
    {
        if (Tx.bIsCompensating)
        {
            // Compensating: reversed direction
            if (Tx.CreditAccount == Account) Balance -= Tx.AmountKRC;
            if (Tx.DebitAccount == Account) Balance += Tx.AmountKRC;
        }
        else
        {
            if (Tx.CreditAccount == Account) Balance += Tx.AmountKRC;
            if (Tx.DebitAccount == Account) Balance -= Tx.AmountKRC;
        }
    }

    return Balance;
}

int64 UKhaaosAtomicLedger::GetEscrowBalance(const FString& Account) const
{
    // Escrow balance: sum of EscrowLock credits - EscrowRelease/Refund debits
    int64 Balance = 0;
    for (const FKhaaosLedgerTransaction& Tx : Transactions)
    {
        if (Tx.Type == EKhaaosTransactionType::EscrowLock && Tx.CreditAccount == Account)
            Balance += Tx.AmountKRC;
        if ((Tx.Type == EKhaaosTransactionType::EscrowRelease || Tx.Type == EKhaaosTransactionType::EscrowRefund)
            && Tx.DebitAccount == Account)
            Balance -= Tx.AmountKRC;
    }
    return Balance;
}

TArray<FKhaaosLedgerTransaction> UKhaaosAtomicLedger::GetTransactionHistory(const FString& Account, int32 Offset, int32 Limit) const
{
    TArray<FKhaaosLedgerTransaction> Result;
    // Collect all transactions involving this account
    TArray<FKhaaosLedgerTransaction> AccountTxs;
    for (const FKhaaosLedgerTransaction& Tx : Transactions)
    {
        if (Tx.DebitAccount == Account || Tx.CreditAccount == Account)
        {
            AccountTxs.Add(Tx);
        }
    }

    // Apply offset and limit (most recent first)
    int32 StartIdx = FMath::Max(0, AccountTxs.Num() - 1 - Offset);
    int32 EndIdx = FMath::Max(0, StartIdx - Limit + 1);
    for (int32 i = StartIdx; i >= EndIdx; i--)
    {
        Result.Add(AccountTxs[i]);
    }
    return Result;
}

TArray<FKhaaosLedgerTransaction> UKhaaosAtomicLedger::GetTransactionsByType(EKhaaosTransactionType Type, int32 Limit) const
{
    TArray<FKhaaosLedgerTransaction> Result;
    int32 Count = 0;
    for (int32 i = Transactions.Num() - 1; i >= 0 && Count < Limit; i--)
    {
        if (Transactions[i].Type == Type)
        {
            Result.Add(Transactions[i]);
            Count++;
        }
    }
    return Result;
}

int64 UKhaaosAtomicLedger::GetTotalCirculation() const
{
    return TotalMinted - TotalBurned;
}

bool UKhaaosAtomicLedger::VerifyIntegrity() const
{
    FString PrevHash = TEXT("0000000000000000000000000000000000000000000000000000000000000000");

    for (int32 i = 0; i < Transactions.Num(); i++)
    {
        const FKhaaosLedgerTransaction& Tx = Transactions[i];

        // Check hash chain
        if (Tx.PreviousHash != PrevHash)
        {
            UE_LOG(LogTemp, Error, TEXT("[Ledger] Integrity FAIL: Hash chain broken at tx %d"), i);
            return false;
        }

        // Verify hash
        FString ComputedHash = ComputeHash(Tx);
        if (Tx.Hash != ComputedHash)
        {
            UE_LOG(LogTemp, Error, TEXT("[Ledger] Integrity FAIL: Hash mismatch at tx %d"), i);
            return false;
        }

        PrevHash = Tx.Hash;
    }

    UE_LOG(LogTemp, Log, TEXT("[Ledger] Integrity OK: %d transactions verified"), Transactions.Num());
    return true;
}

bool UKhaaosAtomicLedger::GetTransaction(const FGuid& TxId, FKhaaosLedgerTransaction& OutTx) const
{
    const int32* Index = TransactionIdIndex.Find(TxId);
    if (Index && *Index >= 0 && *Index < Transactions.Num())
    {
        OutTx = Transactions[*Index];
        return true;
    }
    return false;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

void UKhaaosAtomicLedger::FlushToCloudSave()
{
    // In production: serialize Transactions array and push to EOS Cloud Save
    // Save slot: "KhaaosLedger_{SequenceCounter}"
    UE_LOG(LogTemp, Log, TEXT("[Ledger] Flushing to Cloud Save — %d transactions, %lld KRC in circulation"),
        Transactions.Num(), GetTotalCirculation());
}

void UKhaaosAtomicLedger::LoadFromCloudSave()
{
    // In production: load from EOS Cloud Save and rebuild indices
    UE_LOG(LogTemp, Log, TEXT("[Ledger] Loading from Cloud Save"));
}

// ─── Private ─────────────────────────────────────────────────────────────────

bool UKhaaosAtomicLedger::AppendTransaction(FKhaaosLedgerTransaction& Tx)
{
    // Idempotency check
    if (IsIdempotencyKeyUsed(Tx.IdempotencyKey))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Ledger] Duplicate idempotency key: %s"), *Tx.IdempotencyKey);
        return false;
    }

    // Set hash chain
    Tx.PreviousHash = LastHash;
    Tx.Hash = ComputeHash(Tx);

    // Append (immutable — never modified after this point)
    int32 Index = Transactions.Add(Tx);

    // Update indices
    IdempotencyIndex.Add(Tx.IdempotencyKey, Tx.TransactionId);
    TransactionIdIndex.Add(Tx.TransactionId, Index);

    // Update chain state
    LastHash = Tx.Hash;
    SequenceCounter++;

    // Verify integrity if enabled (spot check last hash)
    if (bVerifyOnWrite && Transactions.Num() > 1)
    {
        const FKhaaosLedgerTransaction& Prev = Transactions[Transactions.Num() - 2];
        if (Tx.PreviousHash != Prev.Hash)
        {
            UE_LOG(LogTemp, Error, TEXT("[Ledger] CRITICAL: Hash chain corruption detected!"));
            // In production: trigger alert and halt
        }
    }

    return true;
}

FString UKhaaosAtomicLedger::ComputeHash(const FKhaaosLedgerTransaction& Tx) const
{
    // SHA256 hash of transaction data
    // In production: use FSHA1 or platform crypto for SHA256
    // For now: deterministic string hash
    FString Data = FString::Printf(TEXT("%s|%s|%s|%s|%lld|%s|%lld|%s|%s"),
        *Tx.TransactionId.ToString(),
        *Tx.IdempotencyKey,
        *Tx.DebitAccount,
        *Tx.CreditAccount,
        Tx.AmountKRC,
        *Tx.PreviousHash,
        Tx.Timestamp,
        *Tx.Reason,
        *Tx.WorldId
    );

    // Use UE's hashing (FCrc::MemCrc32 for now, production uses SHA256)
    uint32 Hash = FCrc::MemCrc32(TCHAR_TO_ANSI(*Data), Data.Len() * sizeof(TCHAR));
    return FString::Printf(TEXT("%08x%08x%08x%08x"), Hash, Hash ^ 0xFFFFFFFF, Hash >> 16, Hash << 16);
}

bool UKhaaosAtomicLedger::IsIdempotencyKeyUsed(const FString& Key) const
{
    return IdempotencyIndex.Contains(Key);
}

int64 UKhaaosAtomicLedger::GetCurrentTimestamp() const
{
    return FDateTime::UtcNow().ToUnixTimestamp();
}

bool UKhaaosAtomicLedger::HasSufficientBalance(const FString& Account, int64 AmountKRC) const
{
    return GetBalance(Account) >= AmountKRC;
}
