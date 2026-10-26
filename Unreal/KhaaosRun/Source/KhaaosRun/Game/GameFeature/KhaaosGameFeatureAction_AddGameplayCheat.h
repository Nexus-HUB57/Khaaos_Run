// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFeatures/GameFeatureAction.h"
#include "KhaaosGameFeatureAction_AddGameplayCheat.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class IConsoleObject;
class UWorld;

// ─── Cheat Entry ───────────────────────────────────────────────────────────────

/**
 * FKhaaosCheatEntry
 *
 * Defines a single gameplay cheat command registered by this game feature action.
 */
USTRUCT(BlueprintType)
struct FKhaaosCheatEntry
{
    GENERATED_BODY()

    /** Console command name (e.g., "Khaaos.SkipZoneWait"). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|GameFeature|Cheat")
    FString CheatName;

    /** Help text displayed in console. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|GameFeature|Cheat")
    FString HelpText;

    FKhaaosCheatEntry() = default;
    FKhaaosCheatEntry(const FString& InName, const FString& InHelp)
        : CheatName(InName), HelpText(InHelp) {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCheatActivated, const FString&, CheatName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCheatDeactivated, const FString&, CheatName);

/**
 * UKhaaosGameFeatureAction_AddGameplayCheat
 *
 * Game Feature Plugin Action that registers gameplay cheats for Khaaos Run.
 *
 * Architecture:
 *   - Extends UGameFeatureAction for UE5 modular plugin system
 *   - Registers IConsoleObject cheats when the game feature plugin activates
 *   - Unregisters cheats when the plugin deactivates
 *   - DevelopmentOnly — only available in development/debug builds
 *
 * Registered Cheats:
 *   - Khaaos.SkipZoneWait   — Skip current zone wait phase
 *   - Khaaos.ForceNextPhase — Force advance to next zone phase
 *   - Khaaos.GiveAllWeapons — Give all weapons to executing player
 *   - Khaaos.GodMode        — Toggle invulnerability
 *   - Khaaos.SpawnLoot      — Spawn loot from data assets
 *   - Khaaos.TeleportToZone — Teleport player to current zone center
 *
 * All cheats require ROLE_Authority (server-only execution).
 *
 * Integration:
 *   - Defined in .uplugin GameFeatureDependencies
 *   - Activated automatically when the KhaaosRun game feature plugin loads
 *   - Cheats accessible via console in development builds
 *   - Production builds: cheats are compiled out via DevelopmentOnly meta
 */
UCLASS(meta=(DevelopmentOnly))
class UKhaaosGameFeatureAction_AddGameplayCheat : public UGameFeatureAction
{
    GENERATED_BODY()

public:
    UKhaaosGameFeatureAction_AddGameplayCheat();

    // ─── UGameFeatureAction Interface ─────────────────────────────────────

    virtual void OnGameFeatureRegistering() override;
    virtual void OnGameFeatureUnregistering() override;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Cheat entries to register. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|GameFeature|Cheat")
    TArray<FKhaaosCheatEntry> CheatEntries;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|GameFeature|Cheat")
    FOnCheatActivated OnCheatActivated;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|GameFeature|Cheat")
    FOnCheatDeactivated OnCheatDeactivated;

protected:

    // ─── Cheat Implementations ─────────────────────────────────────────────

    /** Skip the current zone wait phase. */
    static void Cheat_SkipZoneWait(const TArray<FString>& Args);

    /** Force advance to the next zone phase. */
    static void Cheat_ForceNextPhase(const TArray<FString>& Args);

    /** Give all weapons to the executing player. */
    static void Cheat_GiveAllWeapons(const TArray<FString>& Args);

    /** Toggle god mode (invulnerability). */
    static void Cheat_GodMode(const TArray<FString>& Args);

    /** Spawn loot from data assets. */
    static void Cheat_SpawnLoot(const TArray<FString>& Args);

    /** Teleport player to the current zone center. */
    static void Cheat_TeleportToZone(const TArray<FString>& Args);

    // ─── Internal ──────────────────────────────────────────────────────────

    /** Initialize default cheat entries. */
    void InitDefaultCheatEntries();

    /** Get the game world from the current context. */
    static UWorld* GetGameWorld();

    /** Registered console objects (for cleanup on unregister). */
    UPROPERTY()
    TArray<IConsoleObject*> RegisteredConsoleObjects;

    /** Whether cheats are currently registered. */
    UPROPERTY()
    uint8 bCheatsRegistered : 1;
};
