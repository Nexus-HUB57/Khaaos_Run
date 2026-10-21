// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Polish/KhaaosLaunchReadiness.generated.h"

// ─── Launch Readiness Checks ────────────────────────────────────────────────────

/**
 * EKhaaosReadinessStatus
 * Status of a launch readiness check.
 */
UENUM(BlueprintType)
enum class EKhaaosReadinessStatus : uint8
{
        NotChecked UMETA(DisplayName = "NOT_CHECKED"),
        Passed     UMETA(DisplayName = "PASSED"),
        Warning    UMETA(DisplayName = "WARNING"),
        Failed     UMETA(DisplayName = "FAILED")
};

/**
 * FKhaaosReadinessCheck
 * A single launch readiness check.
 */
USTRUCT(BlueprintType)
struct FKhaaosReadinessCheck
{
        GENERATED_BODY()

        /** Check name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
        FString Name;

        /** Category. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
        FString Category;

        /** Status. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
        EKhaaosReadinessStatus Status = EKhaaosReadinessStatus::NotChecked;

        /** Message (pass/fail reason). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
        FString Message;

        /** Is this a blocking check? (Failed = cannot launch) */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Launch")
        uint8 bBlocking : 1;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnReadinessCheckComplete, int32, Passed, int32, Total);

/**
 * UKhaaosLaunchReadiness
 *
 * Pre-launch readiness validation system. Runs all checks before
 * allowing server to go live. Integrates with CI/CD pipeline.
 *
5 *
 * Check Categories:
 *   Infrastructure:
 *     - PostgreSQL connectivity
 *     - Redis connectivity
 *     - Economy API health
 *     - EOS backend connectivity
 *     - Prometheus/Grafana connectivity
 *
 *   Game Systems:
 *     - All 11 GameMode subsystems initialized
 *     - 6 species data loaded
 *     - 11 weapons data loaded
 *     - 26 loot items configured
 *     - 5 world configs present
 *     - GAS tags loaded (122 tags)
 *     - Zone config valid
 *
 *   Performance:
 *     - Server FPS ≥ 55 (target 60)
 *     - Memory < 4GB (target)
 *     - Bot AI budget ≤ 50ms total
 *     - Replication budget within limits
 *     - Console targets configured (PS5/XSX/Switch2)
 *
 *   Security:
 *     - Anti-cheat (EAC) initialized
 *     - TLS certificates valid
 *     - Rate limiter configured
 *     - Admin API authentication
 *
 *   Compliance:
 *     - Privacy policy URL configured
 *     - Age rating set
 *     - GDPR/CCPA compliance flags
 *     - Console certification requirements
 *
 * Launch Gate:
 *   - All blocking checks MUST pass
 *   - Warnings allowed but logged
 *   - Failed blocking → Server stays in maintenance mode
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosLaunchReadiness : public UEngineSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Run Checks ──────────────────────────────────────────────────────

        /** Run all readiness checks. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Launch")
        void RunAllChecks();

        /** Get check results. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Launch")
        const TArray<FKhaaosReadinessCheck>& GetResults() const { return Results; }

        /** Is server ready to launch? */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Launch")
        bool IsReadyToLaunch() const;

        /** Get pass/fail counts. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Launch")
        void GetCounts(int32& OutPassed, int32& OutWarnings, int32& OutFailed) const;

        /** Generate launch report. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Launch")
        FString GenerateReport() const;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Server environment (dev/staging/prod). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Launch")
        FString Environment;

        /** Build version. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Launch")
        FString BuildVersion;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Launch")
        FOnReadinessCheckComplete OnReadinessCheckComplete;

private:

        /** Check results. */
        TArray<FKhaaosReadinessCheck> Results;

        /** Run a single check. */
        void RunCheck(const FString& Name, const FString& Category, bool bBlocking,
                bool bCondition, const FString& PassMsg, const FString& FailMsg);

        // ─── Check Categories ─────────────────────────────────────────────────

        void CheckInfrastructure();
        void CheckGameSystems();
        void CheckPerformance();
        void CheckSecurity();
        void CheckCompliance();
};
