// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/KhaaosKillFeedComponent.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

UKhaaosKillFeedComponent::UKhaaosKillFeedComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    MaxEntries = 20;
    EntryLifetimeSeconds = 15.0f;
}

void UKhaaosKillFeedComponent::AddKillEntry(const FKhaaosKillFeedEntry& Entry)
{
    if (GetOwnerRole() != ROLE_Authority) return;

    RecentKills.Add(Entry);

    // Trim to max entries
    while (RecentKills.Num() > MaxEntries)
    {
        RecentKills.RemoveAt(0);
    }

    OnKillFeedUpdated.Broadcast(Entry);

    UE_LOG(LogKhaaosRun, Log, TEXT("KillFeed: %s eliminated %s (%s) Headshot=%d Dist=%.0fm"),
        *Entry.EliminatorName, *Entry.VictimName, *Entry.WeaponID.ToString(),
        Entry.bIsHeadshot ? 1 : 0, Entry.DistanceM);
}

void UKhaaosKillFeedComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority) return;

    const float CurrentTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    // Remove expired entries
    RecentKills.RemoveAll([this, CurrentTime](const FKhaaosKillFeedEntry& E) {
        return (CurrentTime - E.Timestamp) > EntryLifetimeSeconds;
    });
}

// ─── Replication ────────────────────────────────────────────────────────────────

void UKhaaosKillFeedComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME_CONDITION(UKhaaosKillFeedComponent, RecentKills, COND_None);
}
