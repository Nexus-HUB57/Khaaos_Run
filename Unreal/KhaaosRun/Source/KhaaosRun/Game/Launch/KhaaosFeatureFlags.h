// ============================================================================
// Khaaos Run — Feature Flags System (Fase 3)
// ============================================================================
// Runtime feature flags for alpha/beta/production gating.
// All flags default OFF and are enabled per-environment.
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosFeatureFlags.generated.h"

// ─── Feature Flag Categories ─────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosFeatureCategory : uint8
{
    Gameplay,
    Economy,
    Network,
    Security,
    UI,
    Audio,
    EOS,
    Debug,
};

// ─── Single Feature Flag ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosFeatureFlag
{
    GENERATED_BODY()

    /** Flag name (e.g., "CIGKV.ZuCinematic") */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    /** Description */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    /** Category */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EKhaaosFeatureCategory Category = EKhaaosFeatureCategory::Gameplay;

    /** Is this feature enabled? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bEnabled = false;

    /** Is this feature locked (cannot be changed at runtime)? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bLocked = false;

    /** Rollout percentage (0-100, for gradual rollout) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 RolloutPercentage = 100;
};

// ─── Feature Flags Subsystem ─────────────────────────────────────────────────

/**
 * UKhaaosFeatureFlags
 * Runtime feature flag system for Khaaos Run.
 *
 * Three environment presets:
 *   - Alpha:  Debug ON, new features ON, economy limited
 *   - Beta:   Debug OFF, new features ON, economy enabled
 *   - Prod:   Debug OFF, only stable features, economy locked
 *
 * Flags are loaded from DefaultFeatureFlags.ini and can be
 * overridden at runtime via console commands:
 *   khaaos.feature.<Name> 0|1
 */
UCLASS(Config=Game, defaultconfig)
class KHAAOSRUN_API UKhaaosFeatureFlags : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:

    virtual void Initialize(FSubsystemCollectionInitializationContext& Context) override;

    // ─── Query ───────────────────────────────────────────────────────────────

    /** Check if a feature flag is enabled */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Features")
    bool IsEnabled(const FString& FlagName) const;

    /** Check if a feature is enabled for this player (rollout %) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Features")
    bool IsEnabledForPlayer(const FString& FlagName, int64 PlayerId) const;

    /** Get all flags */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Features")
    const TArray<FKhaaosFeatureFlag>& GetAllFlags() const { return Flags; }

    // ─── Modify ──────────────────────────────────────────────────────────────

    /** Enable a feature flag (runtime only, not persisted) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Features")
    bool EnableFlag(const FString& FlagName);

    /** Disable a feature flag */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Features")
    bool DisableFlag(const FString& FlagName);

    // ─── Environment Presets ─────────────────────────────────────────────────

    /** Apply alpha environment preset */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Features")
    void ApplyAlphaPreset();

    /** Apply beta environment preset */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Features")
    void ApplyBetaPreset();

    /** Apply production environment preset (locks critical flags) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Features")
    void ApplyProductionPreset();

    // ─── Console Commands ────────────────────────────────────────────────────

    UFUNCTION(Exec)
    void KhaaosFeatureSet(const FString& FlagName, bool bValue);

private:

    /** All feature flags */
    UPROPERTY(Config)
    TArray<FKhaaosFeatureFlag> Flags;

    /** Current environment */
    UPROPERTY()
    FString CurrentEnvironment = TEXT("Alpha");

    /** Initialize default flags */
    void InitializeDefaultFlags();

    /** Find flag by name */
    FKhaaosFeatureFlag* FindFlag(const FString& FlagName);
    const FKhaaosFeatureFlag* FindFlag(const FString& FlagName) const;
};
