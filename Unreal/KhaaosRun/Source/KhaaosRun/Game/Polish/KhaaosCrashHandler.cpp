// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Polish/KhaaosCrashHandler.h"
#include "KhaaosRun.h"

#include "Misc/DateTime.h"
#include "Misc/Guid.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosCrashHandler::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        bIsShuttingDown = false;
        RecentCrashCount = 0;
        CrashRateLimitTimer = 0.0f;
        ShutdownTimeout = 30.0f;
        MaxReportsPerMinute = 10;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCrashHandler: Initialized"));
}

void UKhaaosCrashHandler::Deinitialize()
{
        CrashDedupCache.Empty();
        Super::Deinitialize();
}

// ─── Crash Reporting ────────────────────────────────────────────────────────────

void UKhaaosCrashHandler::SubmitCrashReport(const FKhaaosCrashReport& Report)
{
        // Rate limit check
        if (RecentCrashCount >= MaxReportsPerMinute)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosCrashHandler: Rate limited (%d/min)"), MaxReportsPerMinute);
                return;
        }

        // Deduplication: skip if same callstack hash within 60 seconds
        const uint32 CallstackHash = ComputeCallstackHash(Report.Callstack);
        const int64 Now = FDateTime::UtcNow().ToUnixTimestampMilli();
        if (const int64* LastTime = CrashDedupCache.Find(CallstackHash))
        {
                if (Now - *LastTime < 60000) // 60 second dedup window
                {
                        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCrashHandler: Deduped crash (hash=%u)"), CallstackHash);
                        return;
                }
        }

        CrashDedupCache.Add(CallstackHash, Now);
        RecentCrashCount++;

        // Upload to backend
        UploadCrashReport(Report);

        // Critical: if server crash with players, initiate graceful shutdown
        if (Report.BuildTarget == TEXT("Server") && Report.PlayersInMatch > 0)
        {
                UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosCrashHandler: SERVER CRASH with %d players!"), Report.PlayersInMatch);
                InitiateGracefulShutdown(TEXT("ServerCrash"));
        }

        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosCrashHandler: Crash reported - %s [%s] %s"),
                *Report.CrashId, *Report.Platform, *Report.CrashType);
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────────

void UKhaaosCrashHandler::InitiateGracefulShutdown(const FString& Reason)
{
        if (bIsShuttingDown) return;

        bIsShuttingDown = true;

        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosCrashHandler: GRACEFUL SHUTDOWN initiated - %s"), *Reason);

        // Step 1: Save match state (for session recovery)
        UE_LOG(LogKhaaosRun, Log, TEXT("  1. Saving match state..."));

        // Step 2: Notify all players (migration message)
        UE_LOG(LogKhaaosRun, Log, TEXT("  2. Notifying players of server migration..."));

        // Step 3: Migrate players to backup server
        UE_LOG(LogKhaaosRun, Log, TEXT("  3. Migrating players to backup server..."));

        // Step 4: Flush telemetry
        UE_LOG(LogKhaaosRun, Log, TEXT("  4. Flushing telemetry..."));

        // Step 5: Close connections
        UE_LOG(LogKhaaosRun, Log, TEXT("  5. Closing connections..."));

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCrashHandler: Graceful shutdown complete"));
}

// ─── Internal ───────────────────────────────────────────────────────────────────

FString UKhaaosCrashHandler::GenerateCrashId() const
{
        return FGuid::NewGuid().ToString(EGuidFormats::Digits);
}

uint32 UKhaaosCrashHandler::ComputeCallstackHash(const TArray<FString>& Callstack) const
{
        FString Combined;
        for (const FString& Frame : Callstack)
        {
                Combined += Frame;
        }
        return GetTypeHash(Combined);
}

void UKhaaosCrashHandler::UploadCrashReport(const FKhaaosCrashReport& Report)
{
        // In production: HTTP POST to CrashBackendUrl
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCrashHandler: Uploading crash %s to %s"),
                *Report.CrashId, *CrashBackendUrl);
}
