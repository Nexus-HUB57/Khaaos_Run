// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosScoreboardWidget.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosScoreboardWidget
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosScoreboardWidget::UKhaaosScoreboardWidget()
{
}

void UKhaaosScoreboardWidget::UpdateEntries(const TArray<FKhaaosScoreboardEntry>& NewEntries)
{
	Entries = NewEntries;

	// Default sort by rank
	SortByRank();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sorting
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosScoreboardWidget::SortByKills()
{
	Entries.Sort([](const FKhaaosScoreboardEntry& A, const FKhaaosScoreboardEntry& B)
	{
		return A.Kills > B.Kills;
	});
}

void UKhaaosScoreboardWidget::SortByDamage()
{
	Entries.Sort([](const FKhaaosScoreboardEntry& A, const FKhaaosScoreboardEntry& B)
	{
		return A.Damage > B.Damage;
	});
}

void UKhaaosScoreboardWidget::SortByRank()
{
	Entries.Sort([](const FKhaaosScoreboardEntry& A, const FKhaaosScoreboardEntry& B)
	{
		return A.Rank < B.Rank;
	});
}

void UKhaaosScoreboardWidget::SortByKDA()
{
	Entries.Sort([](const FKhaaosScoreboardEntry& A, const FKhaaosScoreboardEntry& B)
	{
		return A.GetKDA() > B.GetKDA();
	});
}
