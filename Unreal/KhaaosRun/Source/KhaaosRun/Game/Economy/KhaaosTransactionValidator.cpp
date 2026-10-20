// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Economy/KhaaosTransactionValidator.h"
#include "KhaaosRun.h"
#include "HAL/PlatformProcess.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosTransactionValidator::UKhaaosTransactionValidator()
{
	MaxTxPerMinute    = 20;
	MaxTxAmount       = 1000000;
	MaxTimestampDrift = 30.0f;
	SuspiciousThreshold = 5;
	DuplicateWindow   = 1000;

	TotalValidated   = 0;
	TotalRejected    = 0;
	TotalSuspicious  = 0;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosTransactionValidator::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosTransactionValidator: Initialized"));
}

void UKhaaosTransactionValidator::Deinitialize()
{
	PlayerTxHashes.Empty();
	PlayerTxTimestamps.Empty();
	PurchasePatterns.Empty();
	Super::Deinitialize();
}

// ─── Validation ─────────────────────────────────────────────────────────────────

EKhaaosValidationResult UKhaaosTransactionValidator::ValidateTransaction(const FKhaaosTransaction& Tx, FString& OutReason)
{
	int64 Now = FDateTime::UtcNow().ToUnixTimestamp();

	// Rule 1: Duplicate detection
	FString TxHash = ComputeTxHash(Tx);
	if (IsDuplicate(Tx.PlayerEosId, TxHash))
	{
		OutReason = TEXT("Duplicate transaction detected");
		++TotalRejected;
		++TotalValidated;
		return EKhaaosValidationResult::Duplicate;
	}

	// Rule 2: Rate limit
	if (IsRateLimited(Tx.PlayerEosId, Now))
	{
		OutReason = TEXT("Transaction rate limit exceeded");
		++TotalRejected;
		++TotalValidated;
		return EKhaaosValidationResult::Rejected;
	}

	// Rule 3: Amount cap
	if (FMath::Abs(Tx.KrcAmount) > MaxTxAmount)
	{
		OutReason = FString::Printf(TEXT("Amount %lld exceeds cap %lld"), Tx.KrcAmount, MaxTxAmount);
		++TotalRejected;
		++TotalValidated;
		return EKhaaosValidationResult::Rejected;
	}

	// Rule 4: Timestamp drift
	int64 Drift = FMath::Abs(Now - Tx.ClientTimestamp);
	if (Drift > static_cast<int64>(MaxTimestampDrift))
	{
		OutReason = FString::Printf(TEXT("Timestamp drift %llds exceeds max %.0fs"), Drift, MaxTimestampDrift);
		++TotalRejected;
		++TotalValidated;
		return EKhaaosValidationResult::Rejected;
	}

	// Rule 5: Suspicious pattern
	if (Tx.Type == EKhaaosTransactionType::Purchase && IsSuspiciousPattern(Tx.PlayerEosId, Tx.ItemId, Now))
	{
		OutReason = TEXT("Suspicious purchase pattern detected");
		++TotalSuspicious;
		++TotalValidated;
		// Still record and allow, but flagged
		RecordTransaction(Tx.PlayerEosId, TxHash, Now);
		return EKhaaosValidationResult::Suspicious;
	}

	// All checks passed
	OutReason = TEXT("Approved");
	RecordTransaction(Tx.PlayerEosId, TxHash, Now);
	++TotalValidated;
	return EKhaaosValidationResult::Approved;
}

void UKhaaosTransactionValidator::SubmitTransaction(const FKhaaosTransaction& Tx, const FOnTransactionValidated& Callback)
{
	FString Reason;
	EKhaaosValidationResult Result = ValidateTransaction(Tx, Reason);
	Callback.ExecuteIfBound(Tx.TransactionId, Result, Reason);
}

// ─── Private ────────────────────────────────────────────────────────────────────

FString UKhaaosTransactionValidator::ComputeTxHash(const FKhaaosTransaction& Tx) const
{
	// SHA-256 of (PlayerEosId + Type + Amount + ItemId + Timestamp)
	FString Input = FString::Printf(TEXT("%s|%d|%lld|%s|%lld"),
		*Tx.PlayerEosId,
		static_cast<int32>(Tx.Type),
		Tx.KrcAmount,
		*Tx.ItemId,
		Tx.Timestamp);

	// Use FSHA1 for hashing (UE5 built-in, SHA-256 not directly available)
	// In production, use OpenSSL SHA-256
	uint32 Hash[5];
	FSHA1::HashBufferAnsi(*Input, Input.Len(), Hash);
	return FString::Printf(TEXT("%08X%08X%08X%08X%08X"), Hash[0], Hash[1], Hash[2], Hash[3], Hash[4]);
}

bool UKhaaosTransactionValidator::IsRateLimited(const FString& PlayerEosId, int64 Now) const
{
	const TArray<int64>* Timestamps = PlayerTxTimestamps.Find(PlayerEosId);
	if (!Timestamps) return false;

	int64 WindowStart = Now - 60; // 1 minute window
	int32 Count = 0;
	for (int64 Ts : *Timestamps)
	{
		if (Ts >= WindowStart) ++Count;
	}
	return Count >= MaxTxPerMinute;
}

bool UKhaaosTransactionValidator::IsSuspiciousPattern(const FString& PlayerEosId, const FString& ItemId, int64 Now)
{
	FString Key = PlayerEosId + TEXT(":") + ItemId;
	TArray<int64>& Timestamps = PurchasePatterns.FindOrAdd(Key);

	int64 WindowStart = Now - 120; // 2 minute window
	int32 Count = 0;
	for (int64 Ts : Timestamps)
	{
		if (Ts >= WindowStart) ++Count;
	}

	Timestamps.Add(Now);
	// Clean old entries
	Timestamps.RemoveAll([WindowStart](int64 Ts) { return Ts < WindowStart; });

	return Count >= SuspiciousThreshold;
}

bool UKhaaosTransactionValidator::IsDuplicate(const FString& PlayerEosId, const FString& Hash) const
{
	const TArray<FString>* Hashes = PlayerTxHashes.Find(PlayerEosId);
	if (!Hashes) return false;
	return Hashes->Contains(Hash);
}

void UKhaaosTransactionValidator::RecordTransaction(const FString& PlayerEosId, const FString& Hash, int64 Now)
{
	// Record hash (ring buffer)
	TArray<FString>& Hashes = PlayerTxHashes.FindOrAdd(PlayerEosId);
	Hashes.Add(Hash);
	if (Hashes.Num() > DuplicateWindow)
	{
		Hashes.RemoveAt(0, Hashes.Num() - DuplicateWindow);
	}

	// Record timestamp (for rate limit)
	TArray<int64>& Timestamps = PlayerTxTimestamps.FindOrAdd(PlayerEosId);
	Timestamps.Add(Now);
	int64 WindowStart = Now - 120;
	Timestamps.RemoveAll([WindowStart](int64 Ts) { return Ts < WindowStart; });
}
