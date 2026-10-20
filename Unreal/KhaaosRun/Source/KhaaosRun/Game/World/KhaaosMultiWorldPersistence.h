// ============================================================================
// Khaaos Run — Multi-World Persistence System (Fase 4)
// ============================================================================
// Gerenciamento de progressão e persistência entre mundos.
//
// Hierarquia de mundos: CIGKV (treino) → W1/Barburhen → W2/Priadus
//                        → W3/Ckesalth → W4/Arukheea
//
// Features:
//   - Player profile per world (stats, inventory, progression)
//   - Progression gates (CIGKV→W1→W2→W3→W4)
//   - Cross-world inventory (cosmetics transfer, weapons world-locked)
//   - World-specific leaderboards (ranking por mundo)
//   - Transition validation (check requirements before world change)
//   - EOS Cloud Save integration (persistent storage)
//   - Inventory classification: Cosmetics (cross-world) vs Weapons (world-locked)
//   - Match history per world
//   - Achievement tracking per world
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosMultiWorldPersistence.generated.h"

// ─── World Identifier ────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosWorldId : uint8
{
    CIGKV    UMETA(DisplayName = "CIGKV — Campo de Instrução (Training)"),
    W1       UMETA(DisplayName = "W1/C1 Barburhen — Primeiro competitivo"),
    W2       UMETA(DisplayName = "W2/C2 Priadus — Arquipélago aquático"),
    W3       UMETA(DisplayName = "W3/C3 Ckesalth — Montanha vertical"),
    W4       UMETA(DisplayName = "W4/C4 Arukheea — Deserto de cânions"),
};

// ─── Inventory Classification ────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosInventoryScope : uint8
{
    Cosmetics   UMETA(DisplayName = "Cosmetics — Transfer between worlds"),
    Weapons     UMETA(DisplayName = "Weapons — Locked to specific world"),
    Consumables UMETA(DisplayName = "Consumables — Reset per match"),
    Achievements UMETA(DisplayName = "Achievements — Permanent, cross-world"),
};

// ─── Inventory Item ──────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosInventoryItem
{
    GENERATED_BODY()

    /** Unique item instance ID */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FGuid ItemId;

    /** Item template ID (references DataTable) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ItemTemplateId;

    /** Display name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString DisplayName;

    /** Inventory scope (determines transferability) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EKhaaosInventoryScope Scope = EKhaaosInventoryScope::Cosmetics;

    /** World this item is locked to (only valid for Weapons) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EKhaaosWorldId LockedToWorld = EKhaaosWorldId::CIGKV;

    /** Quantity (for stackable items) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Quantity = 1;

    /** Acquisition timestamp */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 AcquiredTimestamp = 0;

    /** Is this item currently equipped? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsEquipped = false;

    /** Rarity */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 RarityLevel = 0;
};

// ─── World Progression Stats ─────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosWorldStats
{
    GENERATED_BODY()

    /** Which world these stats belong to */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaosWorldId WorldId = EKhaaosWorldId::CIGKV;

    /** Total matches played in this world */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MatchesPlayed = 0;

    /** Total matches won (last standing) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MatchesWon = 0;

    /** Total kills across all matches */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TotalKills = 0;

    /** Total deaths */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TotalDeaths = 0;

    /** Total KRC earned in this world */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 TotalKRCEarned = 0;

    /** Total XP earned */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 TotalXPEarned = 0;

    /** Best finish position (1 = won) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 BestFinishPosition = 999;

    /** Total time played in seconds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 TotalPlayTimeSeconds = 0;

    /** Number of ZEX extractions completed */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ExtractionsCompleted = 0;

    /** Number of Zu entries completed */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ZuEntriesCompleted = 0;

    /** Last match timestamp */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 LastMatchTimestamp = 0;
};

// ─── Progression Gate ────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosProgressionGate
{
    GENERATED_BODY()

    /** World this gate unlocks */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EKhaaosWorldId TargetWorld = EKhaaosWorldId::W1;

    /** Required previous world */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EKhaaosWorldId RequiredWorld = EKhaaosWorldId::CIGKV;

    /** Minimum matches in RequiredWorld to unlock TargetWorld */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MinMatchesRequired = 10;

    /** Minimum wins in RequiredWorld (optional) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MinWinsRequired = 0;

    /** Minimum KRC balance (optional) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 MinKRCBalance = 0;

    /** Is this gate currently satisfied? */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bIsSatisfied = false;
};

// ─── Leaderboard Entry ───────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosLeaderboardEntry
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString PlayerId;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString PlayerName;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 Score = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 Rank = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 MatchesWon = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 KRCEarned = 0;
};

// ─── Match Result ────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosMatchResult
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FGuid MatchId;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    EKhaaosWorldId World = EKhaaosWorldId::CIGKV;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 FinishPosition = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 Kills = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 KRCEarned = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 XPEarned = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float MatchDuration = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 Timestamp = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bExtracted = false;
};

// ─── Player World Profile ────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosPlayerWorldProfile
{
    GENERATED_BODY()

    /** Player unique ID */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FString PlayerId;

    /** Display name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString DisplayName;

    /** Stats per world */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TMap<EKhaaosWorldId, FKhaaosWorldStats> WorldStats;

    /** Inventory items */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FKhaaosInventoryItem> Inventory;

    /** Match history (recent 100) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TArray<FKhaaosMatchResult> MatchHistory;

    /** Unlocked worlds */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TArray<EKhaaosWorldId> UnlockedWorlds;

    /** Currently selected world */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EKhaaosWorldId CurrentWorld = EKhaaosWorldId::CIGKV;

    /** Total KRC balance */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 TotalKRCBalance = 0;

    /** Profile last saved timestamp */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int64 LastSavedTimestamp = 0;
};

// ─── Delegates ───────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnWorldTransition, bool, bSuccess, EKhaaosWorldId, FromWorld, EKhaaosWorldId, ToWorld);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnProfileSaved, bool, bSuccess, const FString&, PlayerId);

// ─── Multi-World Persistence Subsystem ───────────────────────────────────────

/**
 * UKhaaosMultiWorldPersistence
 * Manages player progression, inventory, and leaderboards across all worlds.
 *
 * Progression chain: CIGKV → W1 → W2 → W3 → W4
 *   - CIGKV: Always unlocked (training)
 *   - W1: Requires 10 CIGKV matches
 *   - W2: Requires 5 W1 matches
 *   - W3: Requires 5 W2 matches
 *   - W4: Requires 5 W3 matches
 *
 * Inventory rules:
 *   - Cosmetics: Transfer freely between worlds
 *   - Weapons: Locked to specific world (cannot transfer)
 *   - Consumables: Reset each match
 *   - Achievements: Permanent, cross-world
 */
UCLASS()
class KHAAOSRUN_API UKhaaosMultiWorldPersistence : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosMultiWorldPersistence();

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Profile Management ────────────────────────────────────────────────

    /** Get or create player profile */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    FKhaaosPlayerWorldProfile GetPlayerProfile(const FString& PlayerId);

    /** Save player profile to EOS Cloud Save */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    bool SavePlayerProfile(const FString& PlayerId);

    /** Load player profile from EOS Cloud Save */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    bool LoadPlayerProfile(const FString& PlayerId);

    // ─── Progression Gates ─────────────────────────────────────────────────

    /** Check if a player can access a specific world */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    bool CanAccessWorld(const FString& PlayerId, EKhaaosWorldId World) const;

    /** Get all worlds a player has unlocked */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    TArray<EKhaaosWorldId> GetUnlockedWorlds(const FString& PlayerId) const;

    /** Validate transition from one world to another */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    bool ValidateWorldTransition(const FString& PlayerId, EKhaaosWorldId FromWorld, EKhaaosWorldId ToWorld) const;

    /** Get the progression gates */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    const TArray<FKhaaosProgressionGate>& GetProgressionGates() const { return ProgressionGates; }

    // ─── World Stats ───────────────────────────────────────────────────────

    /** Get stats for a player in a specific world */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    FKhaaosWorldStats GetWorldStats(const FString& PlayerId, EKhaaosWorldId World) const;

    /** Record a match result */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    void RecordMatchResult(const FString& PlayerId, const FKhaaosMatchResult& Result);

    /** Get matches played in a world */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    int32 GetMatchesPlayed(const FString& PlayerId, EKhaaosWorldId World) const;

    // ─── Inventory Management ──────────────────────────────────────────────

    /** Add item to player inventory */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    bool AddInventoryItem(const FString& PlayerId, const FKhaaosInventoryItem& Item);

    /** Remove item from player inventory */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    bool RemoveInventoryItem(const FString& PlayerId, const FGuid& ItemId);

    /** Transfer cosmetic item between worlds (weapons cannot be transferred) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    bool TransferItemToWorld(const FString& PlayerId, const FGuid& ItemId, EKhaaosWorldId TargetWorld);

    /** Get all items in player inventory */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    TArray<FKhaaosInventoryItem> GetInventory(const FString& PlayerId) const;

    /** Get items available in a specific world (cosmetics + world-locked weapons) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    TArray<FKhaaosInventoryItem> GetItemsForWorld(const FString& PlayerId, EKhaaosWorldId World) const;

    /** Check if an item can be transferred to another world */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    bool CanTransferItem(const FKhaaosInventoryItem& Item, EKhaaosWorldId TargetWorld) const;

    // ─── Leaderboards ──────────────────────────────────────────────────────

    /** Update world leaderboard with a match result */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    void UpdateLeaderboard(EKhaaosWorldId World, const FString& PlayerId, const FString& PlayerName, int32 Score, int32 Wins, int64 KRC);

    /** Get leaderboard for a world (top N) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    TArray<FKhaaosLeaderboardEntry> GetLeaderboard(EKhaaosWorldId World, int32 TopN = 100) const;

    /** Get player rank in a specific world */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Persistence")
    int32 GetPlayerRank(EKhaaosWorldId World, const FString& PlayerId) const;

    // ─── EOS Cloud Save Integration ────────────────────────────────────────

    /** Flush all dirty profiles to cloud */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    void FlushAllProfiles();

    /** Load all active profiles from cloud */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Persistence")
    void LoadAllProfiles();

    // ─── Configuration ────────────────────────────────────────────────────

    /** Maximum match history entries per player */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Persistence")
    int32 MaxMatchHistory = 100;

    /** Leaderboard max entries per world */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Persistence")
    int32 LeaderboardMaxEntries = 1000;

    /** Auto-save interval in seconds */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Persistence")
    float AutoSaveInterval = 120.0f;

    /** Enable EOS Cloud Save */
    UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Persistence")
    bool bCloudSaveEnabled = true;

private:

    /** Player profiles (in-memory cache) */
    TMap<FString, FKhaaosPlayerWorldProfile> PlayerProfiles;

    /** Progression gates (initialized in Initialize) */
    TArray<FKhaaosProgressionGate> ProgressionGates;

    /** World leaderboards: WorldId → sorted entries */
    TMap<EKhaaosWorldId, TArray<FKhaaosLeaderboardEntry>> Leaderboards;

    /** Dirty profiles that need saving */
    TSet<FString> DirtyProfiles;

    /** Initialize the progression gates */
    void InitializeProgressionGates();

    /** Re-evaluate progression gates for a player */
    void EvaluateProgressionGates(const FString& PlayerId);

    /** Trim match history to MaxMatchHistory */
    void TrimMatchHistory(FKhaaosPlayerWorldProfile& Profile);

    /** Sort leaderboard for a world */
    void SortLeaderboard(EKhaaosWorldId World);

    /** Get current timestamp */
    int64 GetCurrentTimestamp() const;

    /** Ensure profile exists for a player */
    void EnsureProfileExists(const FString& PlayerId);
};
