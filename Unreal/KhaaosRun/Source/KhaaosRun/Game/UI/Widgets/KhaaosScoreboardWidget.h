// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "CommonUI/Public/Widgets/CommonActivatableWidget.h"
#include "Game/UI/Widgets/KhaaosScoreboardWidget.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEntryClicked, const FKhaaosScoreboardEntry&, ClickedEntry);

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FKhaaosScoreboardEntry
 *
 * A single row in the scoreboard showing player match statistics.
 */
USTRUCT(BlueprintType)
struct FKhaaosScoreboardEntry
{
	GENERATED_BODY()

	/** Player display name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	FString PlayerName;

	/** Kill count. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	int32 Kills = 0;

	/** Death count. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	int32 Deaths = 0;

	/** Assist count. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	int32 Assists = 0;

	/** Total damage dealt. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	float Damage = 0.0f;

	/** Survival time in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	float SurvivalTime = 0.0f;

	/** Whether the player is still alive. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	uint8 bIsAlive : 1;

	/** Rank in the match (1=first place). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	int32 Rank = 0;

	/** KDA ratio (computed). */
	float GetKDA() const
	{
		const int32 Denom = FMath::Max(1, Deaths);
		return static_cast<float>(Kills + Assists) / static_cast<float>(Denom);
	}
};

/**
 * UKhaaosScoreboardWidget
 *
 * Scoreboard widget built on CommonUI.
 * Displays per-player match statistics in a scrollable list.
 *
 * Features:
 *   - UpdateEntries: Refresh the scoreboard with new data
 *   - SortByKills, SortByDamage, SortByRank: Sort the display
 *   - OnEntryClicked: Delegate for player detail view
 *
 * CommonUI Integration:
 *   - UCommonActivatableWidget for input/action binding
 *   - UCommonListView (or UListView) for entry display
 */
UCLASS(Abstract, Blueprintable, meta = (Category = "Khaaos|UI"))
class UKhaaosScoreboardWidget : public UCommonActivatableWidget
{
	GENERATED_BODY()

public:
	UKhaaosScoreboardWidget();

	// ─── Data ─────────────────────────────────────────────────────────────────

	/** Update scoreboard entries with new data. Triggers list refresh. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Scoreboard")
	void UpdateEntries(const TArray<FKhaaosScoreboardEntry>& NewEntries);

	// ─── Sorting ──────────────────────────────────────────────────────────────

	/** Sort entries by kills (descending). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Scoreboard")
	void SortByKills();

	/** Sort entries by damage (descending). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Scoreboard")
	void SortByDamage();

	/** Sort entries by rank (ascending). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Scoreboard")
	void SortByRank();

	/** Sort entries by KDA (descending). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Scoreboard")
	void SortByKDA();

	// ─── State ────────────────────────────────────────────────────────────────

	/** Current scoreboard entries. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Scoreboard")
	TArray<FKhaaosScoreboardEntry> Entries;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when a scoreboard entry is clicked. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Scoreboard")
	FOnEntryClicked OnEntryClicked;
};
