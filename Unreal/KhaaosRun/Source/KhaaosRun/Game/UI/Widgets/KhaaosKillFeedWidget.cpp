// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosKillFeedWidget.h"
#include "KhaaosRun.h"

// ─── Native Lifecycle ──────────────────────────────────────────────────────────

void UKhaaosKillFeedWidget::NativeConstruct()
{
	Super::NativeConstruct();

	MaxVisibleEntries   = 5;
	EntryDisplayDuration = 8.0f;
	FadeOutDuration     = 1.0f;
}

// ─── Feed Management ────────────────────────────────────────────────────────────

void UKhaaosKillFeedWidget::AddEntry(const FKhaaosKillFeedEntry& Entry)
{
	Entries.Add(Entry);

	// Trim if over max visible
	while (Entries.Num() > MaxVisibleEntries)
	{
		Entries.RemoveAt(0);
	}

	OnKillFeedEntryAdded.Broadcast(Entry);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosKillFeedWidget: %s → %s (%s)"),
		*Entry.KillerName, *Entry.VictimName, *Entry.WeaponId);
}

void UKhaaosKillFeedWidget::PruneOldEntries()
{
	float Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
	float Cutoff = Now - (EntryDisplayDuration + FadeOutDuration);

	Entries.RemoveAll([Cutoff](const FKhaaosKillFeedEntry& Entry)
	{
		return Entry.Timestamp < Cutoff;
	});
}

void UKhaaosKillFeedWidget::ClearFeed()
{
	Entries.Empty();
}
