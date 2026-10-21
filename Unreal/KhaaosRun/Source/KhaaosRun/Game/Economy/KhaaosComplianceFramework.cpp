// ============================================================================
// Khaaos Run — Compliance Review Framework Implementation (Fase 4)
// ============================================================================

#include "Game/Economy/KhaaosComplianceFramework.h"
#include "Misc/DateTime.h"

UKhaaosComplianceFramework::UKhaaosComplianceFramework()
{
    Limits.MaxPerTransaction = 10000;
    Limits.MaxDailyTotal = 50000;
    Limits.MaxCumulativeTotal = 500000;
    Limits.KYCThreshold = 5000;
    Limits.AMLThreshold = 20000;
    Limits.RapidMovementThreshold = 20;
    Limits.CircularTransferWindow = 3600.0f;
    bAutoComplianceEnabled = true;
    bBCBReportingEnabled = true;
}

void UKhaaosComplianceFramework::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Compliance] Framework initialized — MaxPerTx=%lld, DailyLimit=%lld, KYCThreshold=%lld"),
        Limits.MaxPerTransaction, Limits.MaxDailyTotal, Limits.KYCThreshold);
}

void UKhaaosComplianceFramework::Deinitialize()
{
    KYCStatusMap.Empty();
    Alerts.Empty();
    ComplianceStatusMap.Empty();
    DailyTotals.Empty();
    CumulativeTotals.Empty();
    RecentTransactionTimes.Empty();
    Super::Deinitialize();
}

// ─── Pre-Transaction Checks ──────────────────────────────────────────────────

bool UKhaaosComplianceFramework::IsTransactionAllowed(const FString& AccountId, int64 AmountKRC, EKhaaosTransactionType Type) const
{
    return GetTransactionViolation(AccountId, AmountKRC, Type).IsEmpty();
}

FString UKhaaosComplianceFramework::GetTransactionViolation(const FString& AccountId, int64 AmountKRC, EKhaaosTransactionType Type) const
{
    // Check account status
    EKhaaosComplianceStatus Status = GetComplianceStatus(AccountId);
    if (Status == EKhaaosComplianceStatus::Suspended)
    {
        return TEXT("Account suspended — no transactions allowed");
    }

    // Check per-transaction limit
    if (AmountKRC > Limits.MaxPerTransaction)
    {
        return FString::Printf(TEXT("Amount %lld exceeds per-transaction limit %lld"), AmountKRC, Limits.MaxPerTransaction);
    }

    // Check daily limit
    const int64* DailyTotal = DailyTotals.Find(AccountId);
    int64 CurrentDaily = DailyTotal ? *DailyTotal : 0;
    if (CurrentDaily + AmountKRC > Limits.MaxDailyTotal)
    {
        return FString::Printf(TEXT("Daily total %lld + %lld exceeds daily limit %lld"), CurrentDaily, AmountKRC, Limits.MaxDailyTotal);
    }

    // Check cumulative limit
    const int64* CumTotal = CumulativeTotals.Find(AccountId);
    int64 CurrentCum = CumTotal ? *CumTotal : 0;
    if (CurrentCum + AmountKRC > Limits.MaxCumulativeTotal)
    {
        return FString::Printf(TEXT("Cumulative total %lld + %lld exceeds cumulative limit %lld"), CurrentCum, AmountKRC, Limits.MaxCumulativeTotal);
    }

    // Check KYC requirement
    if (AmountKRC >= Limits.KYCThreshold && !RequiresKYC(AccountId))
    {
        // KYC required but not completed
        FKhaaosKYCStatus KYC = GetKYCStatus(AccountId);
        if (!KYC.bIdentityVerified)
        {
            return TEXT("KYC verification required for this transaction amount");
        }
    }

    // Restricted accounts have half limits
    if (Status == EKhaaosComplianceStatus::Restricted)
    {
        if (AmountKRC > Limits.MaxPerTransaction / 2)
        {
            return TEXT("Restricted account: transaction amount exceeds reduced limit");
        }
    }

    return TEXT("");  // No violations
}

// ─── Post-Transaction Analysis ───────────────────────────────────────────────

void UKhaaosComplianceFramework::AnalyzeTransaction(const FKhaaosLedgerTransaction& Tx)
{
    if (!bAutoComplianceEnabled) return;

    FString AccountId = Tx.DebitAccount;
    int64 Amount = Tx.AmountKRC;

    // Update totals
    UpdateDailyTotals(AccountId, Amount);

    // Record transaction time for rapid movement detection
    TArray<int64>& Times = RecentTransactionTimes.FindOrAdd(AccountId);
    Times.Add(Tx.Timestamp);

    // Large transaction alert
    if (Amount >= Limits.AMLThreshold)
    {
        CreateAlert(EKhaaosAlertType::LargeTransaction, AccountId,
            FString::Printf(TEXT("Transaction of %lld KRC exceeds AML threshold %lld"), Amount, Limits.AMLThreshold),
            FMath::Min(1.0f, (float)Amount / (float)Limits.AMLThreshold), Tx.TransactionId);
    }

    // KYC required check
    if (Amount >= Limits.KYCThreshold)
    {
        FKhaaosKYCStatus KYC = GetKYCStatus(AccountId);
        if (!KYC.bIdentityVerified)
        {
            CreateAlert(EKhaaosAlertType::KYCRequired, AccountId,
                FString::Printf(TEXT("KYC verification needed for %lld KRC transaction"), Amount),
                0.8f, Tx.TransactionId);
        }
    }

    // Rapid movement check
    if (DetectRapidMovement(AccountId))
    {
        CreateAlert(EKhaaosAlertType::RapidMovement, AccountId,
            TEXT("Rapid KRC movement detected — possible money laundering"), 0.9f, Tx.TransactionId);
    }

    // Circular transfer check
    if (DetectCircularTransfer(AccountId))
    {
        CreateAlert(EKhaaosAlertType::CircularTransfer, AccountId,
            TEXT("Circular transfer pattern detected — KRC returning to source"), 0.85f, Tx.TransactionId);
    }

    // Daily limit check
    const int64* DailyTotal = DailyTotals.Find(AccountId);
    if (DailyTotal && *DailyTotal >= Limits.MaxDailyTotal * 0.8)
    {
        CreateAlert(EKhaaosAlertType::DailyLimitExceeded, AccountId,
            FString::Printf(TEXT("Daily total %lld approaching limit %lld"), *DailyTotal, Limits.MaxDailyTotal),
            0.7f, Tx.TransactionId);
    }
}

// ─── KYC Management ──────────────────────────────────────────────────────────

FKhaaosKYCStatus UKhaaosComplianceFramework::GetKYCStatus(const FString& AccountId) const
{
    const FKhaaosKYCStatus* Found = KYCStatusMap.Find(AccountId);
    if (Found) return *Found;

    // Default: pending
    FKhaaosKYCStatus Default;
    Default.AccountId = AccountId;
    Default.Status = EKhaaosComplianceStatus::Pending;
    return Default;
}

void UKhaaosComplianceFramework::UpdateKYCStatus(const FString& AccountId, bool bIdentityVerified, bool bAddressVerified, bool bAgeVerified, const FString& DocumentType)
{
    FKhaaosKYCStatus& KYC = KYCStatusMap.FindOrAdd(AccountId);
    KYC.AccountId = AccountId;
    KYC.bIdentityVerified = bIdentityVerified;
    KYC.bAddressVerified = bAddressVerified;
    KYC.bAgeVerified = bAgeVerified;
    KYC.IdentityDocumentType = DocumentType;
    KYC.VerificationDate = GetCurrentTimestamp();
    KYC.VerificationSource = TEXT("KhaaosComplianceFramework");

    if (bIdentityVerified && bAddressVerified && bAgeVerified)
    {
        KYC.Status = EKhaaosComplianceStatus::Approved;
        UE_LOG(LogTemp, Log, TEXT("[Compliance] KYC approved for %s (doc: %s)"), *AccountId, *DocumentType);
    }
    else
    {
        KYC.Status = EKhaaosComplianceStatus::Restricted;
        UE_LOG(LogTemp, Log, TEXT("[Compliance] KYC restricted for %s"), *AccountId);
    }
}

bool UKhaaosComplianceFramework::RequiresKYC(const FString& AccountId) const
{
    FKhaaosKYCStatus KYC = GetKYCStatus(AccountId);
    return KYC.bIdentityVerified && KYC.bAddressVerified && KYC.bAgeVerified;
}

// ─── AML Checks ──────────────────────────────────────────────────────────────

bool UKhaaosComplianceFramework::DetectRapidMovement(const FString& AccountId) const
{
    const TArray<int64>* Times = RecentTransactionTimes.Find(AccountId);
    if (!Times || Times->Num() < Limits.RapidMovementThreshold) return false;

    int64 Now = GetCurrentTimestamp();
    int64 WindowStart = Now - 3600;  // Last hour

    int32 CountInWindow = 0;
    for (int64 Time : *Times)
    {
        if (Time >= WindowStart) CountInWindow++;
    }

    return CountInWindow >= Limits.RapidMovementThreshold;
}

bool UKhaaosComplianceFramework::DetectCircularTransfer(const FString& AccountId) const
{
    // Simplified circular transfer detection:
    // Check if AccountId sent KRC and received KRC from the same account
    // within the circular transfer window
    // Full implementation would use graph analysis on the ledger
    // For now, flag accounts with high transaction frequency both ways
    return false;  // Stub: requires ledger access for full implementation
}

TArray<EKhaaosAlertType> UKhaaosComplianceFramework::RunAMLCheck(const FString& AccountId)
{
    TArray<EKhaaosAlertType> Flags;

    if (DetectRapidMovement(AccountId))
    {
        Flags.Add(EKhaaosAlertType::RapidMovement);
        CreateAlert(EKhaaosAlertType::AMLFlag, AccountId, TEXT("AML: Rapid movement"), 0.9f);
    }

    if (DetectCircularTransfer(AccountId))
    {
        Flags.Add(EKhaaosAlertType::CircularTransfer);
        CreateAlert(EKhaaosAlertType::AMLFlag, AccountId, TEXT("AML: Circular transfer"), 0.85f);
    }

    // Check cumulative totals
    const int64* Cum = CumulativeTotals.Find(AccountId);
    if (Cum && *Cum >= Limits.MaxCumulativeTotal * 0.8)
    {
        Flags.Add(EKhaaosAlertType::CumulativeLimitExceeded);
    }

    return Flags;
}

// ─── Alert Management ────────────────────────────────────────────────────────

TArray<FKhaaosComplianceAlert> UKhaaosComplianceFramework::GetAlerts(const FString& AccountId) const
{
    TArray<FKhaaosComplianceAlert> Result;
    for (const FKhaaosComplianceAlert& A : Alerts)
    {
        if (A.AccountId == AccountId) Result.Add(A);
    }
    return Result;
}

void UKhaaosComplianceFramework::ResolveAlert(const FGuid& AlertId, const FString& Resolution)
{
    for (FKhaaosComplianceAlert& A : Alerts)
    {
        if (A.AlertId == AlertId)
        {
            A.bResolved = true;
            A.Resolution = Resolution;
            UE_LOG(LogTemp, Log, TEXT("[Compliance] Alert %s resolved: %s"), *AlertId.ToString(), *Resolution);
            return;
        }
    }
}

TArray<FKhaaosComplianceAlert> UKhaaosComplianceFramework::GetUnresolvedAlerts() const
{
    TArray<FKhaaosComplianceAlert> Result;
    for (const FKhaaosComplianceAlert& A : Alerts)
    {
        if (!A.bResolved) Result.Add(A);
    }
    return Result;
}

// ─── Regulatory Reporting ────────────────────────────────────────────────────

FString UKhaaosComplianceFramework::GenerateAuditReport(int64 StartTimestamp, int64 EndTimestamp) const
{
    // Banco Central do Brasil audit report format
    FString Report = TEXT("=== Khaaos Run — Banco Central do Brasil Audit Report ===\n");
    Report += FString::Printf(TEXT("Period: %lld to %lld\n"), StartTimestamp, EndTimestamp);
    Report += FString::Printf(TEXT("Total alerts: %d\n"), Alerts.Num());
    Report += FString::Printf(TEXT("Unresolved alerts: %d\n"), GetUnresolvedAlerts().Num());
    Report += FString::Printf(TEXT("KYC verified accounts: %d\n"), KYCStatusMap.Num());
    Report += TEXT("=== End Report ===\n");

    UE_LOG(LogTemp, Log, TEXT("[Compliance] Audit report generated"));
    return Report;
}

FString UKhaaosComplianceFramework::GenerateTaxReport(const FString& AccountId, int32 Year) const
{
    // IRPF — Imposto de Renda Pessoa Física
    // Ganhos de capital from KRC transactions
    FString Report = TEXT("=== Khaaos Run — IRPF Tax Report ===\n");
    Report += FString::Printf(TEXT("Account: %s\n"), *AccountId);
    Report += FString::Printf(TEXT("Year: %d\n"), Year);
    Report += TEXT("Note: KRC gains subject to Brazilian capital gains tax\n");
    Report += TEXT("=== End Report ===\n");

    UE_LOG(LogTemp, Log, TEXT("[Compliance] Tax report generated for %s year %d"), *AccountId, Year);
    return Report;
}

// ─── Account Status ──────────────────────────────────────────────────────────

EKhaaosComplianceStatus UKhaaosComplianceFramework::GetComplianceStatus(const FString& AccountId) const
{
    const EKhaaosComplianceStatus* Found = ComplianceStatusMap.Find(AccountId);
    if (Found) return *Found;

    // Check KYC status
    FKhaaosKYCStatus KYC = GetKYCStatus(AccountId);
    return KYC.Status;
}

void UKhaaosComplianceFramework::SetComplianceStatus(const FString& AccountId, EKhaaosComplianceStatus Status)
{
    ComplianceStatusMap.Add(AccountId, Status);
    UE_LOG(LogTemp, Log, TEXT("[Compliance] Status for %s set to %d"), *AccountId, static_cast<int32>(Status));
}

// ─── Private ─────────────────────────────────────────────────────────────────

void UKhaaosComplianceFramework::CreateAlert(EKhaaosAlertType Type, const FString& AccountId, const FString& Description, float Severity, const FGuid& RelatedTxId)
{
    FKhaaosComplianceAlert Alert;
    Alert.AlertId = FGuid::NewGuid();
    Alert.AlertType = Type;
    Alert.AccountId = AccountId;
    Alert.Description = Description;
    Alert.Timestamp = GetCurrentTimestamp();
    Alert.bResolved = false;
    Alert.Severity = Severity;
    Alert.RelatedTransactionId = RelatedTxId;
    Alerts.Add(Alert);

    UE_LOG(LogTemp, Warning, TEXT("[Compliance] Alert: %s for %s — %s"),
        *UEnum::GetValueAsString(Type), *AccountId, *Description);
}

void UKhaaosComplianceFramework::UpdateDailyTotals(const FString& AccountId, int64 AmountKRC)
{
    int64& Daily = DailyTotals.FindOrAdd(AccountId, 0);
    Daily += AmountKRC;

    int64& Cum = CumulativeTotals.FindOrAdd(AccountId, 0);
    Cum += AmountKRC;
}

int64 UKhaaosComplianceFramework::GetCurrentTimestamp() const
{
    return FDateTime::UtcNow().ToUnixTimestamp();
}
