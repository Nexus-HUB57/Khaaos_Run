// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/MapVoting/KhaaosMapVotingSystem.h"
#include "KhaaosRun.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosMapVotingSystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        bVotingActive = false;
        VotingTimeRemaining = 0.0f;

        AvailableVariants = {
                EKhaaosMatchVariant::Classic,
                EKhaaosMatchVariant::Rush,
                EKhaaosMatchVariant::ClashSquad,
                EKhaaosMatchVariant::LoneWolf
        };

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosMapVotingSystem: Initialized (%d variants)"), AvailableVariants.Num());
}

void UKhaaosMapVotingSystem::Deinitialize()
{
        VoteOptions.Empty();
        VotedPlayers.Empty();
        CustomRooms.Empty();
        CustomRoomCreators.Empty();
        Super::Deinitialize();
}

// ─── Voting ─────────────────────────────────────────────────────────────────────

void UKhaaosMapVotingSystem::StartVotingPhase()
{
        if (bVotingActive) return;

        bVotingActive = true;
        VotingTimeRemaining = 30.0f;
        VotedPlayers.Empty();

        GenerateVoteOptions();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosMapVotingSystem: Voting started (%d options, 30s)"), VoteOptions.Num());
}

void UKhaaosMapVotingSystem::CastVote(const FString& PlayerEosId, int32 OptionIndex)
{
        if (!bVotingActive) return;

        if (VotedPlayers.Contains(PlayerEosId)) return;

        if (!VoteOptions.IsValidIndex(OptionIndex)) return;

        VoteOptions[OptionIndex].Votes++;
        VotedPlayers.Add(PlayerEosId);

        OnVoteCast.Broadcast(PlayerEosId, OptionIndex, VoteOptions[OptionIndex].Votes);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosMapVotingSystem: %s voted for option %d (%s)"),
                *PlayerEosId, OptionIndex, *VoteOptions[OptionIndex].DisplayName);
}

void UKhaaosMapVotingSystem::EndVotingPhase()
{
        if (!bVotingActive) return;

        bVotingActive = false;

        // Auto-vote for players who didn't vote
        // (In production: iterate all lobby players and call AutoVoteForPlayer)

        // Find winning option (highest votes)
        int32 BestIdx = 0;
        int32 BestVotes = 0;

        for (int32 i = 0; i < VoteOptions.Num(); ++i)
        {
                if (VoteOptions[i].Votes > BestVotes)
                {
                        BestVotes = VoteOptions[i].Votes;
                        BestIdx = i;
                }
        }

        // Tie-breaking: random among tied options
        TArray<int32> TiedOptions;
        for (int32 i = 0; i < VoteOptions.Num(); ++i)
        {
                if (VoteOptions[i].Votes == BestVotes)
                {
                        TiedOptions.Add(i);
                }
        }

        if (TiedOptions.Num() > 1)
        {
                BestIdx = TiedOptions[FMath::RandRange(0, TiedOptions.Num() - 1)];
        }

        const FKhaaosMapVoteOption& Winner = VoteOptions[BestIdx];

        OnVoteComplete.Broadcast(Winner.WorldName, Winner.Variant);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosMapVotingSystem: Vote complete! Winner: %s (%s) with %d votes"),
                *Winner.WorldName, *Winner.DisplayName, Winner.Votes);
}

// ─── Map Pool ───────────────────────────────────────────────────────────────────

TArray<FString> UKhaaosMapVotingSystem::GetMapsForVariant(EKhaaosMatchVariant Variant) const
{
        TArray<FString> Maps;

        switch (Variant)
        {
        case EKhaaosMatchVariant::Classic:
                Maps = { TEXT("CIGKV"), TEXT("Barburhen"), TEXT("Priadus"), TEXT("Ckesalth"), TEXT("Arukheea") };
                break;
        case EKhaaosMatchVariant::Rush:
                Maps = { TEXT("CIGKV"), TEXT("Ckesalth") };
                break;
        case EKhaaosMatchVariant::ClashSquad:
                Maps = { TEXT("Barburhen"), TEXT("Arukheea") };
                break;
        case EKhaaosMatchVariant::LoneWolf:
                Maps = { TEXT("Priadus") };
                break;
        case EKhaaosMatchVariant::Custom:
                Maps = { TEXT("CIGKV"), TEXT("Barburhen"), TEXT("Priadus"), TEXT("Ckesalth"), TEXT("Arukheea") };
                break;
        }

        return Maps;
}

// ─── Custom Rooms ───────────────────────────────────────────────────────────────

FString UKhaaosMapVotingSystem::CreateCustomRoom(const FString& CreatorEosId, const FKhaaosCustomRules& Rules)
{
        // Generate 6-digit alphanumeric room code
        FString RoomCode;
        do
        {
                RoomCode.Empty();
                const TCHAR Chars[] = TEXT("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
                for (int32 i = 0; i < 6; ++i)
                {
                        RoomCode += Chars[FMath::RandRange(0, 31)];
                }
        } while (CustomRooms.Contains(RoomCode));

        CustomRooms.Add(RoomCode, Rules);
        CustomRoomCreators.Add(RoomCode, CreatorEosId);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosMapVotingSystem: Custom room %s created by %s"), *RoomCode, *CreatorEosId);
        return RoomCode;
}

bool UKhaaosMapVotingSystem::JoinCustomRoom(const FString& RoomCode, const FString& PlayerEosId)
{
        if (!CustomRooms.Contains(RoomCode))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosMapVotingSystem: Room %s not found"), *RoomCode);
                return false;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosMapVotingSystem: %s joined room %s"), *PlayerEosId, *RoomCode);
        return true;
}

FKhaaosCustomRules UKhaaosMapVotingSystem::GetCustomRoomRules(const FString& RoomCode) const
{
        const FKhaaosCustomRules* Found = CustomRooms.Find(RoomCode);
        return Found ? *Found : FKhaaosCustomRules();
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UKhaaosMapVotingSystem::GenerateVoteOptions()
{
        VoteOptions.Empty();

        // Generate 3-5 random map/variant combos
        const TArray<FString> AllWorlds = { TEXT("CIGKV"), TEXT("Barburhen"), TEXT("Priadus"), TEXT("Ckesalth"), TEXT("Arukheea") };
        const TArray<FString> DisplayNames = {
                TEXT("CIGKV — Ruínas Urbanas"),
                TEXT("Barburhen — Floresta Tropical"),
                TEXT("Priadus — Wastes Vulcânicos"),
                TEXT("Ckesalth — Tundra Congelada"),
                TEXT("Arukheea — Deserto Canyon")
        };

        // Always include Classic variant for 3 random worlds
        TArray<int32> UsedIndices;
        for (int32 i = 0; i < 3; ++i)
        {
                int32 WorldIdx;
                do
                {
                        WorldIdx = FMath::RandRange(0, AllWorlds.Num() - 1);
                } while (UsedIndices.Contains(WorldIdx));

                UsedIndices.Add(WorldIdx);

                FKhaaosMapVoteOption Option;
                Option.WorldName = AllWorlds[WorldIdx];
                Option.DisplayName = DisplayNames[WorldIdx];
                Option.Variant = EKhaaosMatchVariant::Classic;
                Option.Votes = 0;
                Option.bEnabled = true;
                VoteOptions.Add(Option);
        }

        // Add 1 Rush mode option
        if (AvailableVariants.Contains(EKhaaosMatchVariant::Rush))
        {
                FKhaaosMapVoteOption Option;
                Option.WorldName = TEXT("CIGKV");
                Option.DisplayName = TEXT("CIGKV — Rush Mode");
                Option.Variant = EKhaaosMatchVariant::Rush;
                Option.Votes = 0;
                Option.bEnabled = true;
                VoteOptions.Add(Option);
        }

        // Add 1 ClashSquad option
        if (AvailableVariants.Contains(EKhaaosMatchVariant::ClashSquad))
        {
                FKhaaosMapVoteOption Option;
                Option.WorldName = TEXT("Barburhen");
                Option.DisplayName = TEXT("Barburhen — Clash Squad");
                Option.Variant = EKhaaosMatchVariant::ClashSquad;
                Option.Votes = 0;
                Option.bEnabled = true;
                VoteOptions.Add(Option);
        }
}

void UKhaaosMapVotingSystem::AutoVoteForPlayer(const FString& PlayerEosId)
{
        if (VoteOptions.Num() == 0) return;
        const int32 RandomOption = FMath::RandRange(0, VoteOptions.Num() - 1);
        CastVote(PlayerEosId, RandomOption);
}
