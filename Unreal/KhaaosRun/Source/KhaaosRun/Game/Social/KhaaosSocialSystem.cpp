// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Social/KhaaosSocialSystem.h"
#include "KhaaosRun.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosSocialSystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        bInParty = false;
        bIsPartyLeader = false;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem: Initialized"));
}

void UKhaaosSocialSystem::Deinitialize()
{
        FriendsList.Empty();
        PartyMembers.Empty();
        RecentPlayers.Empty();
        BlockedPlayers.Empty();
        Super::Deinitialize();
}

// ─── Friends ────────────────────────────────────────────────────────────────────

void UKhaaosSocialSystem::RefreshFriendsList()
{
        // In production, this would query EOS Friends API
        // and populate FriendsList with current data
        const int32 OnlineCount = GetOnlineFriendsCount();
        OnFriendsListUpdated.Broadcast(OnlineCount, FriendsList.Num());

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem::RefreshFriendsList - %d friends (%d online)"),
                FriendsList.Num(), OnlineCount);
}

int32 UKhaaosSocialSystem::GetOnlineFriendsCount() const
{
        int32 Count = 0;
        for (const FKhaaosFriendEntry& Friend : FriendsList)
        {
                if (Friend.Status != EKhaaosFriendStatus::Offline)
                {
                        ++Count;
                }
        }
        return Count;
}

void UKhaaosSocialSystem::SendFriendRequest(const FString& TargetEosId)
{
        if (BlockedPlayers.Contains(TargetEosId))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSocialSystem: Cannot send request to blocked player %s"), *TargetEosId);
                return;
        }

        // In production: EOS Friends API call
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem: Friend request sent to %s"), *TargetEosId);
}

void UKhaaosSocialSystem::RemoveFriend(const FString& TargetEosId)
{
        FriendsList.RemoveAll([&TargetEosId](const FKhaaosFriendEntry& Entry)
        {
                return Entry.EosId == TargetEosId;
        });

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem: Removed friend %s"), *TargetEosId);
}

void UKhaaosSocialSystem::BlockPlayer(const FString& TargetEosId)
{
        BlockedPlayers.Add(TargetEosId);
        RemoveFriend(TargetEosId); // Also remove from friends

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem: Blocked player %s"), *TargetEosId);
}

// ─── Clan ───────────────────────────────────────────────────────────────────────

void UKhaaosSocialSystem::CreateClan(const FString& Name, const FString& Tag)
{
        MyClan.ClanId = FString::Printf(TEXT("clan_%s_%d"), *Tag, FMath::RandRange(1000, 9999));
        MyClan.ClanName = Name;
        MyClan.ClanTag = Tag;
        MyClan.MemberCount = 1;
        MyClan.ClanLevel = 1;

        OnClanUpdated.Broadcast(true, MyClan);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem::CreateClan - %s [%s] created"), *Name, *Tag);
}

void UKhaaosSocialSystem::JoinClan(const FString& ClanId)
{
        // In production: Backend API call to join clan
        MyClan.ClanId = ClanId;
        OnClanUpdated.Broadcast(true, MyClan);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem::JoinClan - Joined clan %s"), *ClanId);
}

void UKhaaosSocialSystem::LeaveClan()
{
        if (!IsInClan()) return;

        const FString OldClan = MyClan.ClanId;
        MyClan = FKhaaosClanInfo();
        OnClanUpdated.Broadcast(true, MyClan);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem::LeaveClan - Left clan %s"), *OldClan);
}

// ─── Party ──────────────────────────────────────────────────────────────────────

void UKhaaosSocialSystem::InviteToParty(const FString& FriendEosId)
{
        if (PartyMembers.Num() >= 4)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSocialSystem: Party is full (4/4)"));
                return;
        }

        // In production: EOS Lobby invite
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem: Party invite sent to %s"), *FriendEosId);
}

void UKhaaosSocialSystem::KickFromParty(const FString& MemberEosId)
{
        if (!bIsPartyLeader)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSocialSystem: Only party leader can kick"));
                return;
        }

        PartyMembers.Remove(MemberEosId);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSocialSystem: Kicked %s from party"), *MemberEosId);
}
