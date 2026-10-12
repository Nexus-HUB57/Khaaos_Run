// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosSaveGame.generated.h"

// ─── Save Data Structures ─────────────────────────────────────────────────────

/**
 * FPlayerSaveStats
 *
 * Per-player persistent statistics saved between sessions.
 * Mirrors schema.ts playerStats table + matchResults aggregates.
 */
USTRUCT(BlueprintType)
struct FPlayerSaveStats
{
	GENERATED_BODY()

	/** Player user ID (from auth system). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString UserId;

	/** Current patente rank. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	EPatenteRank Patente = EPatenteRank::Zheers;

	/** Total XP accumulated. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 XP = 0;

	/** ELO competitive rating. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 Rating = 1000;

	/** Total matches played. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 MatchesPlayed = 0;

	/** Total wins. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 Wins = 0;

	/** Total top-5 finishes. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 Top5 = 0;

	/** Total kills (lifetime). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 TotalKills = 0;

	/** Total deaths (lifetime). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 TotalDeaths = 0;

	/** Season kills. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 SeasonKills = 0;

	/** Weapon balance (KRC). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int64 WeaponsBalance = 0;

	/** Bonus balance (KRC). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int64 BonusBalance = 0;

	/** FBM balance (KRC). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int64 FbmBalance = 0;
};

/**
 * FUnlockedItem
 *
 * An item owned by the player (from schema.ts items table).
 */
USTRUCT(BlueprintType)
struct FUnlockedItem
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString ItemId;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString ItemName;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString ItemType;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString Rarity;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	float Durability = 100.0f;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	uint8 bIsEquipped : 1;
};

/**
 * UKhaaosSaveGame
 *
 * Save game object following ActionRoguelike pattern.
 * Slot-based save/restore with JSON serialization for complex data.
 *
 * Stores:
 *   - Player stats and rank progression
 *   - Unlocked items and equipment
 *   - Match history (last N results)
 *   - Settings and preferences
 *   - Economy state (balances, active loans)
 */
UCLASS(Abstract)
class UKhaaosSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	UKhaaosSaveGame();

	// ─── Player Stats ───────────────────────────────────────────────────────

	/** Primary player statistics. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FPlayerSaveStats PlayerStats;

	/** Unlocked items in player inventory. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	TArray<FUnlockedItem> UnlockedItems;

	/** Currently equipped item IDs (one per slot). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	TMap<FString, FString> EquippedItems; // SlotName → ItemId

	// ─── Match History ──────────────────────────────────────────────────────

	/** Recent match results (limited to last N matches). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	TArray<FString> RecentMatchResults; // JSON strings

	/** Maximum match history entries to keep. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 MaxMatchHistory;

	// ─── Settings ───────────────────────────────────────────────────────────

	/** Player preferences (JSON serialized). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString SettingsJson;

	/** Selected queue mode preference. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString PreferredQueueMode; // solo, duo, squad

	/** Preferred region for matchmaking. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString PreferredRegion;

	// ─── Economy State ──────────────────────────────────────────────────────

	/** Active loan IDs (JSON serialized loan details). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	TArray<FString> ActiveLoans; // JSON strings

	/** Timestamp of last daily salary claim. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString LastSalaryDate;

	// ─── Save/Load Interface ────────────────────────────────────────────────

	/** Save slot name for this save game. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString SaveSlotName;

	/** Save slot index. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	int32 SaveSlotIndex;

	/** Timestamp of last save. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Save")
	FString LastSaveTimestamp;

	// ─── Static Save/Load Helpers ───────────────────────────────────────────

	/**
	 * Save this object to the specified slot.
	 * Returns true if save succeeded.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Save")
	bool SaveToSlot(const FString& SlotName, int32 UserIndex);

	/**
	 * Load save game from the specified slot.
	 * Returns nullptr if slot doesn't exist.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Save")
	static UKhaaosSaveGame* LoadFromSlot(const FString& SlotName, int32 UserIndex);

	/** Check if a save slot exists. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Save")
	static bool DoesSaveExist(const FString& SlotName, int32 UserIndex);

	/** Delete a save slot. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Save")
	static bool DeleteSaveSlot(const FString& SlotName, int32 UserIndex);

	// ─── JSON Serialization ─────────────────────────────────────────────────

	/** Serialize this save to JSON string (for complex data export). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Save")
	FString ToJson() const;

	/** Deserialize from JSON string. Returns true on success. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Save")
	bool FromJson(const FString& JsonString);

	/** Add a match result to history (evicts oldest if over limit). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Save")
	void AddMatchResult(const FString& MatchResultJson);
};
