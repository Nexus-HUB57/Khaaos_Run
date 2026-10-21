// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/LiveOps/KhaaosHotFixSystem.h"
#include "KhaaosRun.h"

#include "Misc/DateTime.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosHotFixSystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        PullInterval = 60.0f; // Pull every 60 seconds
        CurrentVersion = 0;
        TimeSinceLastPull = 0.0f;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosHotFixSystem: Initialized (pull every %.0fs)"), PullInterval);
}

void UKhaaosHotFixSystem::Deinitialize()
{
        ActiveHotFixes.Empty();
        FeatureFlags.Empty();
        Super::Deinitialize();
}

// ─── Hot-Fix Management ────────────────────────────────────────────────────────

void UKhaaosHotFixSystem::ApplyHotFix(const FKhaaosHotFixEntry& Entry)
{
        // Version gate: only apply if version >= current
        if (Entry.Version < CurrentVersion && CurrentVersion > 0)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosHotFixSystem: Skipped hot-fix %s (version %d < current %d)"),
                        *Entry.Id, Entry.Version, CurrentVersion);
                return;
        }

        // Store the hot-fix
        ActiveHotFixes.Add(Entry.Id, Entry);

        // Apply by type
        switch (Entry.Type)
        {
        case EKhaaosHotFixType::FeatureFlag:
                SetFeatureFlag(Entry.KeyPath, Entry.Value == TEXT("true") || Entry.Value == TEXT("1"));
                break;

        case EKhaaosHotFixType::MaintenanceMode:
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosHotFixSystem: MAINTENANCE MODE %s"), *Entry.Value);
                break;

        default:
                // Generic application
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosHotFixSystem: Applied %s: %s = %s"),
                        *Entry.Id, *Entry.KeyPath, *Entry.Value);
                break;
        }

        OnHotFixApplied.Broadcast(Entry.Id, Entry.Type);
}

void UKhaaosHotFixSystem::RemoveHotFix(const FString& Id)
{
        if (ActiveHotFixes.Contains(Id))
        {
                ActiveHotFixes.Remove(Id);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosHotFixSystem: Removed hot-fix %s"), *Id);
        }
}

bool UKhaaosHotFixSystem::IsHotFixActive(const FString& Id) const
{
        return ActiveHotFixes.Contains(Id);
}

FString UKhaaosHotFixSystem::GetHotFixValue(const FString& KeyPath, const FString& DefaultValue) const
{
        for (const auto& Pair : ActiveHotFixes)
        {
                if (Pair.Value.KeyPath == KeyPath)
                {
                        // Check expiry
                        if (Pair.Value.ExpiresAt > 0)
                        {
                                const int64 Now = FDateTime::UtcNow().ToUnixTimestampMilli();
                                if (Now > Pair.Value.ExpiresAt)
                                {
                                        continue; // Expired
                                }
                        }
                        return Pair.Value.Value;
                }
        }
        return DefaultValue;
}

TArray<FKhaaosHotFixEntry> UKhaaosHotFixSystem::GetActiveHotFixes() const
{
        TArray<FKhaaosHotFixEntry> Result;
        ActiveHotFixes.GenerateValueArray(Result);
        return Result;
}

// ─── Feature Flags ──────────────────────────────────────────────────────────────

bool UKhaaosHotFixSystem::IsFeatureEnabled(const FString& FeatureName) const
{
        if (const bool* Enabled = FeatureFlags.Find(FeatureName))
        {
                return *Enabled;
        }
        return false; // Disabled by default
}

void UKhaaosHotFixSystem::SetFeatureFlag(const FString& FeatureName, bool bEnabled)
{
        FeatureFlags.Add(FeatureName, bEnabled);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosHotFixSystem: Feature %s = %s"),
                *FeatureName, bEnabled ? TEXT("ON") : TEXT("OFF"));
}

// ─── Pull from Backend ──────────────────────────────────────────────────────────

void UKhaaosHotFixSystem::PullFromBackend()
{
        // In production, this would HTTP GET from HotFixApiUrl
        // and deserialize the response into FKhaaosHotFixEntry array
        CheckExpiry();

        TimeSinceLastPull = 0.0f;
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosHotFixSystem: Pulled from %s (%d active)"),
                *HotFixApiUrl, ActiveHotFixes.Num());
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UKhaaosHotFixSystem::CheckExpiry()
{
        const int64 Now = FDateTime::UtcNow().ToUnixTimestampMilli();
        TArray<FString> ExpiredIds;

        for (const auto& Pair : ActiveHotFixes)
        {
                if (Pair.Value.ExpiresAt > 0 && Now > Pair.Value.ExpiresAt)
                {
                        ExpiredIds.Add(Pair.Key);
                }
        }

        for (const FString& Id : ExpiredIds)
        {
                ActiveHotFixes.Remove(Id);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosHotFixSystem: Expired hot-fix %s"), *Id);
        }
}
