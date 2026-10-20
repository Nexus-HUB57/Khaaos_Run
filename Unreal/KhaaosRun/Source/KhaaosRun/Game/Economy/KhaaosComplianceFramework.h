// ============================================================================
// Khaaos Run — Compliance Review Framework (Fase 4)
// ============================================================================
// Compliance review system for real-money KRC economy.
//
// Features:
//   - Audit trail generation (all KRC flows documented)
//   - KYC integration stubs (identity verification for large transactions)
//   - AML (Anti-Money Laundering) checks
//   - Transaction limits (daily, per-transaction, cumulative)
//   - Suspicious activity detection (rapid KRC movement, circular transfers)
//   - Regulatory reporting (Banco Central do Brasil compliance)
//   - Tax reporting stubs (IRPF, ganhos de capital)
//   - Compliance status levels: Pending, Approved, Restricted, Suspended
//   - Automated compliance checks on every transaction > threshold
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Economy/KhaaosAtomicLedger.h"
#include "KhaaosComplianceFramework.generated.h"

// ─── Compliance Status ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosComplianceStatus : uint8
{
    Pending    UMETA(DisplayName = "Pending — Awaiting review"),
    Approved   UMETA(DisplayName = "Approved — Cleared for transactions"),
    Restricted UMETA(DisplayName = "Restricted — Limited transactions allowed"),
    Suspended  UMETA(DisplayName = "Suspended — No transactions allowed"),
};

// ─── Compliance Alert ────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosAlertType : uint8
{
    LargeTransaction      UMETA(DisplayName = "Large Transaction — Exceeds threshold"),
    RapidMovement         UMETA(DisplayName = "Rapid Movement — Many transactions in short time"),
    CircularTransfer      UMETA(DisplayName = "Circular Transfer — KRC returning to source"),
    UnusualPattern        UMETA(DisplayName = "Unusual Pattern — Deviation from normal behavior"),
    DailyLimitExceeded    UMETA(DisplayName = "Daily Limit Exceeded"),
    CumulativeLimitExceeded UMETA(DisplayName = "Cumulative Limit Exceeded"),
    AMLFlag              UMETA(DisplayName = "AML Flag — Anti-Money Laundering"),
    KYCRequired          UMETA(DisplayName = "KYC Required — Identity verification needed"),
};

USTRUCT(BlueprintType)
struct FKhaaosComplianceAlert
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) FGuid AlertId;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) EKhaaosAlertType AlertType = EKhaaosAlertType::LargeTransaction;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) FString AccountId;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) FString Description;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) int64 Timestamp = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) bool bResolved = false;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) FString Resolution;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) FGuid RelatedTransactionId;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) float Severity = 1.0f;  // 0-1
};

// ─── KYC Status ──────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosKYCStatus
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AccountId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EKhaaosComplianceStatus Status = EKhaaosComplianceStatus::Pending;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString IdentityDocumentType;  // CPF, RG, CNH
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIdentityVerified = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bAddressVerified = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bAgeVerified = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int64 VerificationDate = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString VerificationSource;
};

// ─── Transaction Limits ──────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosTransactionLimits
{
    GENERATED_BODY()

    /** Maximum KRC per single transaction */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) int64 MaxPerTransaction = 10000;
    /** Maximum KRC per day (per account) */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) int64 MaxDailyTotal = 50000;
    /** Maximum KRC cumulative (lifetime, per account) */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) int64 MaxCumulativeTotal = 500000;
    /** KYC threshold — transactions above this require KYC */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) int64 KYCThreshold = 5000;
    /** AML threshold — transactions above this trigger AML check */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) int64 AMLThreshold = 20000;
    /** Rapid movement threshold (transactions per hour) */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) int32 RapidMovementThreshold = 20;
    /** Circular transfer detection window (seconds) */
    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite) float CircularTransferWindow = 3600.0f;
};

// ─── Delegates ───────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnComplianceAlert, const FKhaaosComplianceAlert&, Alert, bool, bRequiresAction);

// ─── Compliance Framework Subsystem ──────────────────────────────────────────

/**
 * UKhaaosComplianceFramework
 * Compliance review system for real-money KRC economy.
 *
 * Integrates with UKhaaosAtomicLedger to enforce:
 *   - Transaction limits (per-tx, daily, cumulative)
 *   - KYC verification for large transactions
 *   - AML checks for suspicious patterns
 *   - Regulatory reporting (Banco Central do Brasil)
 *   - Tax reporting stubs (IRPF)
 */
UCLASS()
class KHAAOSRUN_API UKhaaosComplianceFramework : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosComplianceFramework();

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Pre-Transaction Checks ──────────────────────────────────────────────

    /** Check if a transaction is allowed (returns true if compliant) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    bool IsTransactionAllowed(const FString& AccountId, int64 AmountKRC, EKhaaosTransactionType Type) const;

    /** Pre-check a transaction and return violation reason (empty = allowed) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    FString GetTransactionViolation(const FString& AccountId, int64 AmountKRC, EKhaaosTransactionType Type) const;

    // ─── Post-Transaction Analysis ───────────────────────────────────────────

    /** Analyze a completed transaction for suspicious activity */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    void AnalyzeTransaction(const FKhaaosLedgerTransaction& Tx);

    // ─── KYC Management ──────────────────────────────────────────────────────

    /** Get KYC status for an account */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Compliance")
    FKhaaosKYCStatus GetKYCStatus(const FString& AccountId) const;

    /** Update KYC status (after verification) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    void UpdateKYCStatus(const FString& AccountId, bool bIdentityVerified, bool bAddressVerified, bool bAgeVerified, const FString& DocumentType);

    /** Check if account requires KYC verification */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Compliance")
    bool RequiresKYC(const FString& AccountId) const;

    // ─── AML Checks ──────────────────────────────────────────────────────────

    /** Detect rapid KRC movement (many transactions in short time) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    bool DetectRapidMovement(const FString& AccountId) const;

    /** Detect circular transfers (KRC returning to source) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    bool DetectCircularTransfer(const FString& AccountId) const;

    /** Run full AML analysis on an account */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    TArray<EKhaaosAlertType> RunAMLCheck(const FString& AccountId);

    // ─── Alert Management ────────────────────────────────────────────────────

    /** Get active compliance alerts for an account */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    TArray<FKhaaosComplianceAlert> GetAlerts(const FString& AccountId) const;

    /** Resolve a compliance alert */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    void ResolveAlert(const FGuid& AlertId, const FString& Resolution);

    /** Get all unresolved alerts */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    TArray<FKhaaosComplianceAlert> GetUnresolvedAlerts() const;

    // ─── Regulatory Reporting ────────────────────────────────────────────────

    /** Generate audit report for Banco Central do Brasil */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    FString GenerateAuditReport(int64 StartTimestamp, int64 EndTimestamp) const;

    /** Generate tax report (IRPF — ganhos de capital) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    FString GenerateTaxReport(const FString& AccountId, int32 Year) const;

    // ─── Account Status ──────────────────────────────────────────────────────

    /** Get compliance status for an account */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Compliance")
    EKhaaosComplianceStatus GetComplianceStatus(const FString& AccountId) const;

    /** Set compliance status (admin action) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Compliance")
    void SetComplianceStatus(const FString& AccountId, EKhaaosComplianceStatus Status);

    // ─── Configuration ──────────────────────────────────────────────────────

    UPROPERTY(Config, EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Compliance")
    FKhaaosTransactionLimits Limits;

    /** Enable automated compliance checks */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Compliance")
    bool bAutoComplianceEnabled = true;

    /** Banco Central do Brasil reporting enabled */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Compliance")
    bool bBCBReportingEnabled = true;

private:

    /** KYC status per account */
    TMap<FString, FKhaaosKYCStatus> KYCStatusMap;

    /** Compliance alerts */
    UPROPERTY()
    TArray<FKhaaosComplianceAlert> Alerts;

    /** Compliance status per account */
    TMap<FString, EKhaaosComplianceStatus> ComplianceStatusMap;

    /** Daily transaction totals (AccountId -> total KRC today) */
    TMap<FString, int64> DailyTotals;

    /** Cumulative transaction totals (AccountId -> total KRC lifetime) */
    TMap<FString, int64> CumulativeTotals;

    /** Transaction timestamps per account (for rapid movement detection) */
    TMap<FString, TArray<int64>> RecentTransactionTimes;

    /** Create a compliance alert */
    void CreateAlert(EKhaaosAlertType Type, const FString& AccountId, const FString& Description, float Severity = 1.0f, const FGuid& RelatedTxId = FGuid());

    /** Update daily totals */
    void UpdateDailyTotals(const FString& AccountId, int64 AmountKRC);

    /** Get current timestamp */
    int64 GetCurrentTimestamp() const;
};
