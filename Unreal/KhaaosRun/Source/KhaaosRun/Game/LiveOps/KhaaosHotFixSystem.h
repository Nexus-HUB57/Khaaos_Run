// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/LiveOps/KhaaosHotFixSystem.generated.h"

/**
 * EKhaaosHotFixType
 * Types of hot-fixes that can be applied without server restart.
 */
UENUM(BlueprintType)
enum class EKhaaosHotFixType : uint8
{
        ConfigOverride  UMETA(DisplayName = "CONFIG_OVERRIDE"),  // Override .ini values
        FeatureFlag     UMETA(DisplayName = "FEATURE_FLAG"),     // Toggle feature flags
        EconomyTweak    UMETA(DisplayName = "ECONOMY_TWEAK"),    // KRC prices, loot rates
        BalanceTweak    UMETA(DisplayName = "BALANCE_TWEAK"),    // Damage, zone speed, etc
        MessageOfTheDay UMETA(DisplayName = "MOTD"),             // In-game messages
        EventSchedule   UMETA(DisplayName = "EVENT_SCHEDULE"),   // Limited-time events
        MaintenanceMode UMETA(DisplayName = "MAINTENANCE")       // Server maintenance flag
};

/**
 * FKhaaosHotFixEntry
 * A single hot-fix entry.
 */
USTRUCT(BlueprintType)
struct FKhaaosHotFixEntry
{
        GENERATED_BODY()

        /** Hot-fix ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HotFix")
        FString Id;

        /** Type. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HotFix")
        EKhaaosHotFixType Type = EKhaaosHotFixType::ConfigOverride;

        /** Key path (e.g., "Economy.WeaponPrice.AssaultRifle"). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HotFix")
        FString KeyPath;

        /** New value (string-encoded, parsed by type). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HotFix")
        FString Value;

        /** Expiry timestamp (0 = no expiry). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HotFix")
        int64 ExpiresAt = 0;

        /** Apply version (only apply if >= current). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HotFix")
        int32 Version = 0;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnHotFixApplied, const FString&, Id, EKhaaosHotFixType, Type);

/**
 * UKhaaosHotFixSystem
 *
 * Live operations hot-fix system for applying server-side configuration
 * changes without restart. Pulled from backend API on interval and on-demand.
 *
 * Features:
 *   - Config overrides: Change .ini values at runtime
 *   - Feature flags: Toggle features per-region/per-platform
 *   - Economy tweaks: KRC prices, shop rotation, loot rates
 *   - Balance tweaks: Damage values, zone speed, weapon stats
 *   - MOTD: Push in-game messages/announcements
 *   - Event schedule: Limited-time event activation
 *   - Maintenance mode: Graceful server shutdown flag
 *   - Version gate: Only apply hot-fixes with version >= current
 *   - Expiry: Auto-expire hot-fixes at specified timestamp
 *   - Rollback: Remove any hot-fix by ID
 *
 * Free Fire Parity:
 *   - Live shop rotation (no patch required)
 *   - Event activation during matches (e.g., 2x KRC weekend)
 *   - Emergency server shutdown with player notification
 *   - A/B test configuration pushed from backend
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosHotFixSystem : public UEngineSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Hot-Fix Management ───────────────────────────────────────────────

        /** Apply a hot-fix entry. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|HotFix")
        void ApplyHotFix(const FKhaaosHotFixEntry& Entry);

        /** Remove a hot-fix by ID. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|HotFix")
        void RemoveHotFix(const FString& Id);

        /** Check if a hot-fix is active. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HotFix")
        bool IsHotFixActive(const FString& Id) const;

        /** Get hot-fix value for a key path. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HotFix")
        FString GetHotFixValue(const FString& KeyPath, const FString& DefaultValue = TEXT("")) const;

        /** Get all active hot-fixes. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HotFix")
        TArray<FKhaaosHotFixEntry> GetActiveHotFixes() const;

        // ─── Feature Flags ────────────────────────────────────────────────────

        /** Check if a feature flag is enabled. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HotFix|Feature")
        bool IsFeatureEnabled(const FString& FeatureName) const;

        /** Set a feature flag. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|HotFix|Feature")
        void SetFeatureFlag(const FString& FeatureName, bool bEnabled);

        // ─── Pull from Backend ────────────────────────────────────────────────

        /** Pull latest hot-fixes from backend API. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|HotFix")
        void PullFromBackend();

        /** Auto-pull interval (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|HotFix")
        float PullInterval;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Backend URL for hot-fix API. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|HotFix")
        FString HotFixApiUrl;

        /** Current hot-fix version (only apply if >= this). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|HotFix")
        int32 CurrentVersion;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|HotFix")
        FOnHotFixApplied OnHotFixApplied;

private:

        /** Active hot-fixes (Id → Entry). */
        TMap<FString, FKhaaosHotFixEntry> ActiveHotFixes;

        /** Feature flags cache. */
        TMap<FString, bool> FeatureFlags;

        /** Time since last pull. */
        float TimeSinceLastPull;

        /** Check and expire old hot-fixes. */
        void CheckExpiry();
};
