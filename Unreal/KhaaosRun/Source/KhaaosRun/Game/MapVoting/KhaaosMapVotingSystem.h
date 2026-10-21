// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Game/MapVoting/KhaaosMapVotingSystem.generated.h"

// ─── Map Voting Types ────────────────────────────────────────────────────────────

/**
 * EKhaaosMatchVariant
 * Game mode variants for the same map.
 */
UENUM(BlueprintType)
enum class EKhaaosMatchVariant : uint8
{
        Classic      UMETA(DisplayName = "CLASSIC"),       // Standard battle royale
        Rush        UMETA(DisplayName = "RUSH"),           // Fast circles, 8 min matches
        ClashSquad  UMETA(DisplayName = "CLASH_SQUAD"),   // 4v4 team deathmatch
        LoneWolf    UMETA(DisplayName = "LONE_WOLF"),      // Solo-only, no bots
        Custom      UMETA(DisplayName = "CUSTOM")          // Custom rules
};

/**
 * FKhaaosMapVoteOption
 * A single map/variant option in the vote.
 */
USTRUCT(BlueprintType)
struct FKhaaosMapVoteOption
{
        GENERATED_BODY()

        /** World name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        FString WorldName;

        /** Display name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        FString DisplayName;

        /** Match variant. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        EKhaaosMatchVariant Variant = EKhaaosMatchVariant::Classic;

        /** Vote count. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        int32 Votes = 0;

        /** Thumbnail texture path. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        FString ThumbnailPath;

        /** Is this option enabled? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        uint8 bEnabled : 1;
};

/**
 * FKhaaosCustomRules
 * Custom match rule overrides.
 */
USTRUCT(BlueprintType)
struct FKhaaosCustomRules
{
        GENERATED_BODY()

        /** Max players override. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Custom")
        int32 MaxPlayers = 60;

        /** Zone shrink speed multiplier. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Custom")
        float ZoneSpeedMultiplier = 1.0f;

        /** Loot rarity boost. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Custom")
        float LootRarityBoost = 1.0f;

        /** Bot count override. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Custom")
        int32 BotCount = -1;

        /** Respawn enabled? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Custom")
        uint8 bRespawnEnabled : 1;

        /** Friendly fire? */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Custom")
        uint8 bFriendlyFire : 1;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnVoteComplete, const FString&, WinningWorld, EKhaaosMatchVariant, Variant);
DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnVoteCast, const FString&, PlayerEosId, int32, OptionIndex, int32, TotalVotes);

/**
 * UKhaaosMapVotingSystem
 *
 * Map voting and match variant selection system.
 *
 * Voting Flow:
 *   1. After match end, 30s voting phase begins
 *   2. 3-5 map/variant options shown to players
 *   3. Each player casts 1 vote (or random if no vote)
 *   4. Highest vote wins; ties broken by random
 *   5. Winner → next match loads that world + variant
 *
 * Map Pool:
 *   - CIGKV (Urban Ruins): Classic, Rush
 *   - Barburhen (Tropical): Classic, ClashSquad
 *   - Priadus (Volcanic): Classic, LoneWolf
 *   - Ckesalth (Frozen): Classic, Rush
 *   - Arukheea (Desert): Classic, ClashSquad
 *
 * Match Variants:
 *   - Classic: Standard BR (20 min, shrinking zone)
 *   - Rush: Fast circles, 8 min, increased loot
 *   - ClashSquad: 4v4 TDM on smaller zone
 *   - LoneWolf: Solo-only, no bots, hard mode
 *   - Custom: Admin-defined rules (room creator)
 *
 * Custom Rooms:
 *   - Players can create custom rooms with FKhaaosCustomRules
 *   - Room code: 6-digit alphanumeric for friends
 *   - Max 50 active custom rooms per server region
 *   - Entry: Free or KRC entry fee (tournament mode)
 *
 * Free Fire Parity:
 *   - Map voting after match (3 options)
 *   - Clash Squad mode (4v4 TDM)
 *   - Custom room codes for friend groups
 *   - Rush mode (fast matches)
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosMapVotingSystem : public UWorldSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Voting ────────────────────────────────────────────────────────────

        /** Start voting phase with options. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|MapVote")
        void StartVotingPhase();

        /** Cast a vote for an option index. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|MapVote")
        void CastVote(const FString& PlayerEosId, int32 OptionIndex);

        /** End voting and determine winner. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|MapVote")
        void EndVotingPhase();

        /** Get vote options. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MapVote")
        const TArray<FKhaaosMapVoteOption>& GetVoteOptions() const { return VoteOptions; }

        /** Is voting active? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        uint8 bVotingActive : 1;

        /** Voting time remaining (seconds). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        float VotingTimeRemaining;

        // ─── Map Pool ──────────────────────────────────────────────────────────

        /** Get available maps for a variant. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MapVote")
        TArray<FString> GetMapsForVariant(EKhaaosMatchVariant Variant) const;

        /** Get all available variants. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MapVote")
        TArray<EKhaaosMatchVariant> AvailableVariants;

        // ─── Custom Rooms ──────────────────────────────────────────────────────

        /** Create a custom room with rules. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|MapVote")
        FString CreateCustomRoom(const FString& CreatorEosId, const FKhaaosCustomRules& Rules);

        /** Join custom room by code. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|MapVote")
        bool JoinCustomRoom(const FString& RoomCode, const FString& PlayerEosId);

        /** Get custom room rules. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MapVote")
        FKhaaosCustomRules GetCustomRoomRules(const FString& RoomCode) const;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|MapVote")
        FOnVoteComplete OnVoteComplete;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|MapVote")
        FOnVoteCast OnVoteCast;

private:

        /** Vote options for current phase. */
        TArray<FKhaaosMapVoteOption> VoteOptions;

        /** Players who have voted this phase. */
        TSet<FString> VotedPlayers;

        /** Custom rooms by code. */
        TMap<FString, FKhaaosCustomRules> CustomRooms;

        /** Custom room creators. */
        TMap<FString, FString> CustomRoomCreators;

        /** Generate vote options from map pool. */
        void GenerateVoteOptions();

        /** Pick random unvoted option for a player. */
        void AutoVoteForPlayer(const FString& PlayerEosId);
};
