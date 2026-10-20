// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Social/KhaaosSocialSystem.generated.h"

// ─── Social Data Types ──────────────────────────────────────────────────────────

/**
 * EKhaaosFriendStatus
 * Online status for friends list.
 */
UENUM(BlueprintType)
enum class EKhaaosFriendStatus : uint8
{
        Offline      UMETA(DisplayName = "OFFLINE"),
        Online       UMETA(DisplayName = "ONLINE"),
        InLobby      UMETA(DisplayName = "IN_LOBBY"),
        InMatch      UMETA(DisplayName = "IN_MATCH"),
        Away         UMETA(DisplayName = "AWAY"),
        DND          UMETA(DisplayName = "DND")
};

/**
 * FKhaaosFriendEntry
 * A friend entry in the social list.
 */
USTRUCT(BlueprintType)
struct FKhaaosFriendEntry
{
        GENERATED_BODY()

        /** Friend EOS ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social")
        FString EosId;

        /** Display name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social")
        FString DisplayName;

        /** Online status. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social")
        EKhaaosFriendStatus Status = EKhaaosFriendStatus::Offline;

        /** Platform (PS5/XSX/PC/Switch2). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social")
        FString Platform;

        /** Species preference. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social")
        uint8 FavoriteSpecies = 0;

        /** Can join this friend's match? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social")
        uint8 bCanJoin : 1;
};

/**
 * FKhaaosClanInfo
 * Clan (guild) information.
 */
USTRUCT(BlueprintType)
struct FKhaaosClanInfo
{
        GENERATED_BODY()

        /** Clan ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        FString ClanId;

        /** Clan name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        FString ClanName;

        /** Clan tag (3-4 chars). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        FString ClanTag;

        /** Member count. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        int32 MemberCount = 0;

        /** Max members. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        int32 MaxMembers = 50;

        /** Clan XP level. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        int32 ClanLevel = 1;

        /** Clan description. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Clan")
        FString Description;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnFriendsListUpdated, int32, OnlineCount, int32, TotalCount);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnClanUpdated, bool, bSuccess, const FKhaaosClanInfo&, Clan);
DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnFriendRequest, const FString&, FromEosId, const FString&, FromName, bool, bIsClanInvite);

/**
 * UKhaaosSocialSystem
 *
 * Social features: friends list, clan management, party invites.
 * Integrates with EOS Friends API and custom clan backend.
 *
 * Features:
 *   - Friends: Up to 200 friends, online status tracking, platform info
 *   - Clan: 50-member guilds with clan tag, XP, and chat
 *   - Party: Group of 1-4 for matchmaking, leader controls
 *   - Recent Players: Auto-track last 20 played-with players
 *   - Block List: Up to 100 blocked players
 *   - Privacy: Online status visibility, friend request settings
 *
 * Free Fire Parity:
 *   - Clan system with tag display in kill feed
 *   - Party quick-join from friends list
 *   - Cross-platform friends (EOS ID based)
 *   - Recent players for post-match friend requests
 */
UCLASS(BlueprintType)
class UKhaaosSocialSystem : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Friends ──────────────────────────────────────────────────────────

        /** Request friends list from EOS. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Friends")
        void RefreshFriendsList();

        /** Get cached friends list. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Social|Friends")
        const TArray<FKhaaosFriendEntry>& GetFriendsList() const { return FriendsList; }

        /** Get online friends count. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Social|Friends")
        int32 GetOnlineFriendsCount() const;

        /** Send friend request. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Friends")
        void SendFriendRequest(const FString& TargetEosId);

        /** Remove friend. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Friends")
        void RemoveFriend(const FString& TargetEosId);

        /** Block player. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Friends")
        void BlockPlayer(const FString& TargetEosId);

        // ─── Clan ─────────────────────────────────────────────────────────────

        /** Get player's clan info. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Social|Clan")
        const FKhaaosClanInfo& GetMyClan() const { return MyClan; }

        /** Create a clan. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Clan")
        void CreateClan(const FString& Name, const FString& Tag);

        /** Join a clan by ID. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Clan")
        void JoinClan(const FString& ClanId);

        /** Leave current clan. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Clan")
        void LeaveClan();

        /** Is player in a clan? */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Social|Clan")
        bool IsInClan() const { return !MyClan.ClanId.IsEmpty(); }

        // ─── Party ────────────────────────────────────────────────────────────

        /** Invite a friend to party. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Party")
        void InviteToParty(const FString& FriendEosId);

        /** Kick from party. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Social|Party")
        void KickFromParty(const FString& MemberEosId);

        /** Get party members. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Social|Party")
        const TArray<FString>& GetPartyMembers() const { return PartyMembers; }

        /** Is in a party? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Party")
        uint8 bInParty : 1;

        /** Is party leader? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Social|Party")
        uint8 bIsPartyLeader : 1;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Social")
        FOnFriendsListUpdated OnFriendsListUpdated;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Social")
        FOnClanUpdated OnClanUpdated;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Social")
        FOnFriendRequest OnFriendRequest;

private:

        /** Cached friends list. */
        TArray<FKhaaosFriendEntry> FriendsList;

        /** Player's clan. */
        FKhaaosClanInfo MyClan;

        /** Party members (EOS IDs). */
        TArray<FString> PartyMembers;

        /** Recent players (last 20). */
        TArray<FString> RecentPlayers;

        /** Blocked players. */
        TSet<FString> BlockedPlayers;
};
