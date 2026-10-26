// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Polish/KhaaosCrashHandler.generated.h"

/**
 * FKhaaosCrashReport
 * Structured crash report for analytics.
 */
USTRUCT(BlueprintType)
struct FKhaaosCrashReport
{
        GENERATED_BODY()

        /** Crash ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString CrashId;

        /** Server/Client. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString BuildTarget;

        /** Build version. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString BuildVersion;

        /** Platform. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString Platform;

        /** Crash type (assert, access violation, etc). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString CrashType;

        /** Callstack (first 20 frames). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        TArray<FString> Callstack;

        /** Match ID (if in match). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString MatchId;

        /** Players in match (for server crashes). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        int32 PlayersInMatch = 0;

        /** Timestamp (unix ms). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        int64 Timestamp = 0;

        /** Memory usage at crash (MB). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        double MemoryAtCrashMB = 0.0;
};

/**
 * UKhaaosCrashHandler
 *
 * Production crash handler with structured reporting, graceful shutdown,
 * and player migration on server crashes.
 *
 * Features:
 *   - Structured crash reports (JSON) with callstack
 *   - Automatic upload to crash analytics backend
 *   - Graceful shutdown: save match state, notify players
 *   - Server crash: Migrate players to backup server
 *   - Client crash: Auto-reconnect with session recovery
 *   - Crash deduplication by callstack hash
 *   - Rate limit: Max 10 crash reports/minute
 *   - Memory tracking: Snapshot usage at crash time
 *
 * Free Fire Parity:
 *   - Zero-downtime: Players migrated on server crash
 *   - Crash analytics dashboard (frequency, top crashes)
 *   - Hot-fix deployment for crash fixes (no patch)
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosCrashHandler : public UEngineSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Crash Reporting ──────────────────────────────────────────────────

        /** Submit a crash report. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Crash")
        void SubmitCrashReport(const FKhaaosCrashReport& Report);

        /** Get recent crash count. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Crash")
        int32 GetRecentCrashCount() const { return RecentCrashCount; }

        // ─── Graceful Shutdown ────────────────────────────────────────────────

        /** Initiate graceful shutdown (save state, notify players). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Crash")
        void InitiateGracefulShutdown(const FString& Reason);

        /** Is server shutting down? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Crash")
        uint8 bIsShuttingDown : 1;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Crash backend URL. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Crash")
        FString CrashBackendUrl;

        /** Graceful shutdown timeout (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Crash")
        float ShutdownTimeout;

        /** Max crash reports per minute. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Crash")
        int32 MaxReportsPerMinute;

private:

        /** Recent crash count (last minute). */
        int32 RecentCrashCount;

        /** Crash rate limit timer. */
        float CrashRateLimitTimer;

        /** Deduplication cache (callstack hash → last timestamp). */
        TMap<uint32, int64> CrashDedupCache;

        /** Generate crash ID. */
        FString GenerateCrashId() const;

        /** Compute callstack hash for deduplication. */
        uint32 ComputeCallstackHash(const TArray<FString>& Callstack) const;

        /** Upload crash report to backend. */
        void UploadCrashReport(const FKhaaosCrashReport& Report);
};
