// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Economy/KhaaosTransactionValidator.generated.h"

// ─── Transaction Types ─────────────────────────────────────────────────────────

/**
 * EKhaaosTransactionType
 * Types of economy transactions that must be validated.
 */
UENUM(BlueprintType)
enum class EKhaaosTransactionType : uint8
{
	Purchase      UMETA(DisplayName = "PURCHASE"),
	Sell          UMETA(DisplayName = "SELL"),
	LootPickup    UMETA(DisplayName = "LOOT_PICKUP"),
	BattlePass    UMETA(DisplayName = "BATTLE_PASS"),
	Loan          UMETA(DisplayName = "LOAN"),
	LoanRepay     UMETA(DisplayName = "LOAN_REPAY"),
	WorldTransition UMETA(DisplayName = "WORLD_TRANSITION")
};

/**
 * FKhaaosTransaction
 * A single economy transaction awaiting validation.
 */
USTRUCT(BlueprintType)
struct FKhaaosTransaction
{
	GENERATED_BODY()

	/** Transaction ID (UUID). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	FString TransactionId;

	/** Player EOS ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	FString PlayerEosId;

	/** Transaction type. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	EKhaaosTransactionType Type = EKhaaosTransactionType::Purchase;

	/** KRC amount (positive = credit, negative = debit). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	int64 KrcAmount = 0;

	/** Item ID involved (if applicable). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	FString ItemId;

	/** Server timestamp. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	int64 Timestamp = 0;

	/** Client-reported timestamp (for latency check). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Tx")
	int64 ClientTimestamp = 0;
};

/**
 * EKhaaosValidationResult
 * Result of transaction validation.
 */
UENUM(BlueprintType)
enum class EKhaaosValidationResult : uint8
{
	Approved    UMETA(DisplayName = "APPROVED"),
	Rejected    UMETA(DisplayName = "REJECTED"),
	Suspicious  UMETA(DisplayName = "SUSPICIOUS"),
	Duplicate   UMETA(DisplayName = "DUPLICATE")
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnTransactionValidated, const FString&, TxId, EKhaaosValidationResult, Result, const FString&, Reason);

/**
 * UKhaaosTransactionValidator
 *
 * Server-authoritative transaction validation layer.
 * Prevents client-side economy manipulation, duplicate transactions,
 * and rapid-fire purchase exploits.
 *
 * Validation Rules:
 *   1. Duplicate Detection: SHA-256 hash of (PlayerId+Type+Amount+ItemId+Timestamp)
 *      checked against last 1000 transactions per player
 *   2. Rate Limit: Max 20 transactions/minute per player
 *   3. Amount Cap: Single transaction capped at 1,000,000 KRC
 *   4. Timestamp Drift: Client timestamp within ±30s of server time
 *   5. Balance Check: Deduct transactions verified against cached balance
 *   6. Suspicious Pattern: >5 identical purchases in 2 minutes flagged
 *
 * This is the anti-fraud layer between client requests and the AtomicLedger.
 */
UCLASS()
class UKhaaosTransactionValidator : public UEngineSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosTransactionValidator();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Validation ─────────────────────────────────────────────────────────

	/**
	 * Validate a transaction before it reaches the AtomicLedger.
	 * Returns Approved, Rejected, Suspicious, or Duplicate.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Validator")
	EKhaaosValidationResult ValidateTransaction(const FKhaaosTransaction& Tx, FString& OutReason);

	/**
	 * Submit and validate a transaction with callback.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Validator")
	void SubmitTransaction(const FKhaaosTransaction& Tx, const FOnTransactionValidated& Callback);

	// ─── Queries ────────────────────────────────────────────────────────────

	/** Get validation stats. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|Validator")
	int32 GetTotalValidated() const { return TotalValidated; }

	/** Get rejection count. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|Validator")
	int32 GetTotalRejected() const { return TotalRejected; }

	/** Get suspicious count. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|Validator")
	int32 GetTotalSuspicious() const { return TotalSuspicious; }

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Max transactions per minute per player. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|Validator")
	int32 MaxTxPerMinute;

	/** Max KRC per single transaction. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|Validator")
	int64 MaxTxAmount;

	/** Max allowed timestamp drift (seconds). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|Validator")
	float MaxTimestampDrift;

	/** Suspicious pattern threshold (identical purchases in 2 min). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|Validator")
	int32 SuspiciousThreshold;

	/** Duplicate detection window (keep last N hashes per player). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Economy|Validator")
	int32 DuplicateWindow;

private:

	/** Transaction hashes per player (PlayerEosId → ring buffer of hashes). */
	TMap<FString, TArray<FString>> PlayerTxHashes;

	/** Transaction timestamps per player (for rate limit). */
	TMap<FString, TArray<int64>> PlayerTxTimestamps;

	/** Purchase pattern tracker (PlayerEosId:ItemId → timestamps). */
	TMap<FString, TArray<int64>> PurchasePatterns;

	/** Stats. */
	int32 TotalValidated;
	int32 TotalRejected;
	int32 TotalSuspicious;

	/** Compute SHA-256 hash of transaction for duplicate detection. */
	FString ComputeTxHash(const FKhaaosTransaction& Tx) const;

	/** Check rate limit. */
	bool IsRateLimited(const FString& PlayerEosId, int64 Now) const;

	/** Check for suspicious pattern. */
	bool IsSuspiciousPattern(const FString& PlayerEosId, const FString& ItemId, int64 Now);

	/** Check for duplicate. */
	bool IsDuplicate(const FString& PlayerEosId, const FString& Hash) const;

	/** Record transaction for future checks. */
	void RecordTransaction(const FString& PlayerEosId, const FString& Hash, int64 Now);
};
