// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosLaunchChecklist.generated.h"

// ─── Check Severity ────────────────────────────────────────────────────────────

/** Severity level for a launch check. */
UENUM(BlueprintType)
enum class ECheckSeverity : uint8
{
	Critical  UMETA(DisplayName = "Critical"),
	Warning   UMETA(DisplayName = "Warning"),
	Info      UMETA(DisplayName = "Info")
};

// ─── Check Entry ───────────────────────────────────────────────────────────────

/**
 * FCheckEntry
 *
 * A single pre-launch check result.
 */
USTRUCT(BlueprintType)
struct FCheckEntry
{
	GENERATED_BODY()

	/** Name of the check. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	FString Name;

	/** Whether the check passed. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	uint8 bPassed : 1 = false;

	/** Details about the check result. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	FString Details;

	/** Severity of a failure (Critical = must fix before launch). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	ECheckSeverity Severity = ECheckSeverity::Critical;
};

// ─── Launch Check Result ───────────────────────────────────────────────────────

/**
 * FLaunchCheckResult
 *
 * Result of running all pre-launch checks.
 * bIsReady is true only if ALL Critical checks pass.
 */
USTRUCT(BlueprintType)
struct FLaunchCheckResult
{
	GENERATED_BODY()

	/** Whether the server is ready for launch. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	uint8 bIsReady : 1 = false;

	/** Individual check results. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	TArray<FCheckEntry> Checks;

	/** Number of critical failures. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	int32 CriticalFailures = 0;

	/** Number of warnings. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	int32 Warnings = 0;

	/** Number of passed checks. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
	int32 PassedCount = 0;
};

// ── Launch Checklist Subsystem ─────────────────────────────────────────────────

/**
 * UKhaaosLaunchChecklist
 *
 * Pre-launch validation subsystem that verifies all systems
 * are configured correctly before allowing the server to
 * accept player connections.
 *
 * Checks include:
 *   - Server build integrity
 *   - EOS configuration
 *   - Anti-cheat enabled
 *   - Rate limiting enabled
 *   - DDoS protection enabled
 *   - Production config applied
 *   - Secrets/webhooks configured
 *   - Max players set
 *   - Tick rate adequate (>= 60)
 *   - LFS configured
 *   - Crash reporting enabled
 *   - Monitoring enabled
 *   - Cloud save enabled
 *   - Dedicated server binary exists
 *
 * A server must pass ALL Critical checks before going live.
 * Warning checks are logged but do not block launch.
 */
UCLASS(meta=(DisplayName="Khaaos Launch Checklist"))
class UKhaaosLaunchChecklist : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosLaunchChecklist();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Launch Checks ──────────────────────────────────────────────────────

	/**
	 * Run all pre-launch checks and return the result.
	 * Call before accepting player connections in production.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Launch")
	FLaunchCheckResult RunPreLaunchChecks();

	/**
	 * Generate a formatted text report of the checklist results.
	 * Suitable for logging and admin display.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Launch")
	FString GetChecklistReport();

private:

	/** Last cached check result. */
	UPROPERTY()
	FLaunchCheckResult LastResult;

	// ── Individual Check Methods ────────────────────────────────────────────

	FCheckEntry CheckServerBuildVerified();
	FCheckEntry CheckEOSConfigured();
	FCheckEntry CheckAntiCheatEnabled();
	FCheckEntry CheckRateLimitingEnabled();
	FCheckEntry CheckDDoSProtectionEnabled();
	FCheckEntry CheckProductionConfigApplied();
	FCheckEntry CheckSecretsConfigured();
	FCheckEntry CheckMaxPlayersSet();
	FCheckEntry CheckTickRateAdequate();
	FCheckEntry CheckLFSConfigured();
	FCheckEntry CheckCrashReportingEnabled();
	FCheckEntry CheckMonitoringEnabled();
	FCheckEntry CheckCloudSaveEnabled();
	FCheckEntry CheckDedicatedServerExeExists();
};
