// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Ranked/KhaaosRankedSystem.generated.h"

// ─── Ranked Types ────────────────────────────────────────────────────────────────

/**
 * EKhaaosRankedTier
 * Competitive tiers for ranked play (Free Fire Bronze→Hero parity).
 */
UENUM(BlueprintType)
enum class EKhaaosRankedTier : uint8
{
        Bronze1     UMETA(DisplayName = "BRONZE_I"),
        Bronze2     UMETA(DisplayName = "BRONZE_II"),
        Bronze3     UMETA(DisplayName = "BRONZE_III"),
        Silver1     UMETA(DisplayName = "SILVER_I"),
        Silver2     UMETA(DisplayName = "SILVER_II"),
        Silver3     UMETA(DisplayName = "SILVER_III"),
        Gold1       UMETA(DisplayName = "GOLD_I"),
        Gold2       UMETA(DisplayName = "GOLD_II"),
        Gold3       UMETA(DisplayName = "GOLD_III"),
        Platinum1   UMETA(DisplayName = "PLATINUM_I"),
        Platinum2   UMETA(DisplayName = "PLATINUM_II"),
        Platinum3   UMETA(DisplayName = "PLATINUM_III"),
        Diamond1    UMETA(DisplayName = "DIAMOND_I"),
        Diamond2    UMETA(DisplayName = "DIAMOND_II"),
        Diamond3    UMETA(DisplayName = "DIAMOND_III"),
        Heroic      UMETA(DisplayName = "HEROIC"),
        Grandmaster UMETA(DisplayName = "GRANDMASTER")
};

/**
 * EKhaaosRankedQueueType
 * Available ranked queue types.
 */
UENUM(BlueprintType)
enum class EKhaaosRankedQueueType : uint8
{
        Solo      UMETA(DisplayName = "SOLO"),
        Duo      UMETA(DisplayName = "DUO"),
        Squad    UMETA(DisplayName = "SQUAD"),
        SoloVSquad UMETA(DisplayName = "SOLO_VS_SQUAD")
};

/**
 * EKhaaosTournamentState
 * Tournament lifecycle states.
 */
UENUM(BlueprintType)
enum class EKhaaosTournamentState : uint8
{
        Registration UMETA(DisplayName = "REGISTRATION"),
        CheckIn      UMETA(DisplayName = "CHECK_IN"),
        InProgress   UMETA(DisplayName = "IN_PROGRESS"),
        Finals       UMETA(DisplayName = "FINALS"),
        Completed    UMETA(DisplayName = "COMPLETED"),
        Cancelled    UMETA(DisplayName = "CANCELLED")
};

/**
 * FKhaaosRankedScore
 * Player's competitive rating data.
 */
USTRUCT(BlueprintType)
struct FKhaaosRankedScore
{
        GENERATED_BODY()

        /** ELO rating (1200 starting). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 ELO = 1200;

        /** MMR (Matchmaking Rating, hidden). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        float MMR = 1200.0f;

        /** Current tier. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        EKhaaosRankedTier Tier = EKhaaosRankedTier::Bronze1;

        /** Tier progression 0-100%. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        float TierProgress = 0.0f;

        /** Ranked matches played this season. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 MatchesPlayed = 0;

        /** Ranked wins this season. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 Wins = 0;

        /** Peak ELO this season. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 PeakELO = 1200;

        /** Win streak (consecutive wins). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 WinStreak = 0;

        /** Demotion protection remaining (games). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 DemotionProtection = 3;
};

/**
 * FKhaaosTournamentInfo
 * Tournament bracket and configuration.
 */
USTRUCT(BlueprintType)
struct FKhaaosTournamentInfo
{
        GENERATED_BODY()

        /** Tournament ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        FString TournamentId;

        /** Display name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        FString DisplayName;

        /** Current state. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        EKhaaosTournamentState State = EKhaaosTournamentState::Registration;

        /** Max participants. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 MaxParticipants = 100;

        /** Current registrations. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 RegisteredCount = 0;

        /** Entry fee (KRC). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 EntryFeeKRC = 0;

        /** Prize pool (KRC). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 PrizePoolKRC = 10000;

        /** Round count (bracket depth). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 Rounds = 4;

        /** Current round. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 CurrentRound = 0;

        /** Start time (UTC epoch). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int64 StartTimeUtc = 0;

        /** Minimum ELO to enter. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Tournament")
        int32 MinELO = 0;
};

/**
 * FKhaaosSeasonInfo
 * Seasonal ladder reset and rewards.
 */
USTRUCT(BlueprintType)
struct FKhaaosSeasonInfo
{
        GENERATED_BODY()

        /** Season number. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Season")
        int32 SeasonNumber = 1;

        /** Season name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Season")
        FString SeasonName;

        /** Start date (UTC). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Season")
        int64 StartDateUtc = 0;

        /** End date (UTC). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Season")
        int64 EndDateUtc = 0;

        /** Duration in days. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Season")
        int32 DurationDays = 90;

        /** Soft reset fraction (0.5 = retain 50% above 1200). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Season")
        float SoftResetFraction = 0.5f;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnELOUpdated, int32, NewELO, EKhaaosRankedTier, NewTier);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnTierChanged, EKhaaosRankedTier, NewTier, EKhaaosRankedTier, OldTier);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnTournamentStateChanged, EKhaaosTournamentState, NewState);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnSeasonChanged, int32, NewSeasonNumber);

/**
 * UKhaaosRankedSystem
 *
 * Competitive ranked play and tournament system for Khaaos Run.
 *
 * Ranked System:
 *   - ELO rating: 1200 starting, ±16-32 per match (K-factor based on games played)
 *   - MMR: Hidden matchmaking rating with sigma uncertainty (Glicko-2 inspired)
 *   - 17 tiers: Bronze I-III → Silver I-III → Gold I-III → Platinum I-III → Diamond I-III → Heroic → Grandmaster
 *   - Tier progression: 0-100% within each tier, promotion at 100%
 *   - Demotion protection: 3 games after promotion (can't drop tier)
 *   - Win streak bonus: +50% ELO gain at 3+ consecutive wins
 *   - Placement matches: 10 games to establish initial rating
 *   - Queue types: Solo, Duo, Squad, SoloVSquad
 *   - Crossplay: Input-based matchmaking (controller vs KBM pools)
 *
 * Tournament System:
 *   - Single elimination brackets (100p → 50 → 25 → 12 → 6 → 3 → 1)
 *   - Custom matches: Entry fee, prize pool, admin-created
 *   - Check-in phase: 15 min before start, auto-drop no-shows
 *   - Live brackets: Real-time updates, spectator access
 *   - Prizes: KRC pool distributed by placement (1st: 50%, 2nd: 30%, 3rd: 20%)
 *   - Anti-cheat: Strict mode for tournaments (EAC required)
 *
 * Seasonal Ladder:
 *   - 90-day seasons with soft reset (retain 50% of ELO above 1200)
 *   - Season rewards: KRC, exclusive skins, titles per tier
 *   - Leaderboard: Top 100 per region, real-time updates
 *   - Placement carries over: Previous season peak determines starting tier
 *
 * Free Fire Parity:
 *   - Bronze→Heroic tier system (17 tiers)
 *   - Ranked points with win streak multiplier
 *   - Seasonal reset with partial retention
 *   - Tournament custom rooms with entry fees
 */
UCLASS(BlueprintType)
class UKhaaosRankedSystem : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── ELO / Rating ───────────────────────────────────────────────────────

        /** Calculate ELO change after a ranked match. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Ranked")
        int32 CalculateELOChange(int32 PlayerELO, int32 AvgOpponentELO, bool bWon, int32 MatchesPlayed) const;

        /** Update player's ranked score after match. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Ranked")
        void UpdateRankedScore(const FString& PlayerEosId, int32 Placement, int32 Kills, float SurvivedTime);

        /** Get player's ranked score. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ranked")
        FKhaaosRankedScore GetRankedScore(const FString& PlayerEosId) const;

        /** Get tier from ELO value. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ranked")
        EKhaaosRankedTier GetTierFromELO(int32 ELO) const;

        /** Get tier name for display. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ranked")
        FText GetTierDisplayName(EKhaaosRankedTier Tier) const;

        // ─── Ranked Queue ──────────────────────────────────────────────────────

        /** Enter ranked queue (checks placement/requirements). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Ranked")
        bool EnterRankedQueue(EKhaaosRankedQueueType QueueType);

        /** Leave ranked queue. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Ranked")
        void LeaveRankedQueue();

        /** Is player in ranked queue? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        uint8 bInRankedQueue : 1;

        /** Active queue type. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ranked")
        EKhaaosRankedQueueType ActiveQueueType;

        // ─── Tournament ────────────────────────────────────────────────────────

        /** Register for a tournament. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Tournament")
        bool RegisterForTournament(const FString& TournamentId, const FString& PlayerEosId);

        /** Check-in for tournament (within 15 min of start). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Tournament")
        bool CheckInForTournament(const FString& TournamentId, const FString& PlayerEosId);

        /** Get tournament info. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Tournament")
        FKhaaosTournamentInfo GetTournamentInfo(const FString& TournamentId) const;

        /** Get active tournaments. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Tournament")
        TArray<FKhaaosTournamentInfo> GetActiveTournaments() const;

        /** Advance tournament bracket (admin). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Tournament")
        void AdvanceTournamentBracket(const FString& TournamentId);

        // ─── Seasonal Ladder ───────────────────────────────────────────────────

        /** Get current season info. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ranked|Season")
        FKhaaosSeasonInfo GetCurrentSeason() const { return CurrentSeason; }

        /** Perform seasonal soft reset. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Ranked|Season")
        void PerformSeasonalReset();

        /** Get leaderboard (top N for region). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ranked|Season")
        TArray<FKhaaosRankedScore> GetLeaderboard(int32 TopN) const;

        // ─── Configuration ────────────────────────────────────────────────────

        /** K-factor for ELO calculation (new players). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ranked")
        float KFactorNew = 32.0f;

        /** K-factor for ELO calculation (experienced players). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ranked")
        float KFactorExperienced = 16.0f;

        /** Matches threshold for experienced K-factor. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 ExperiencedThreshold = 30;

        /** Placement matches count. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 PlacementMatches = 10;

        /** Win streak bonus multiplier. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ranked")
        float WinStreakBonus = 1.5f;

        /** Win streak threshold for bonus. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Ranked")
        int32 WinStreakThreshold = 3;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ranked")
        FOnELOUpdated OnELOUpdated;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ranked")
        FOnTierChanged OnTierChanged;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Tournament")
        FOnTournamentStateChanged OnTournamentStateChanged;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ranked|Season")
        FOnSeasonChanged OnSeasonChanged;

private:

        /** Player scores indexed by EOS ID. */
        TMap<FString, FKhaaosRankedScore> PlayerScores;

        /** Active tournaments indexed by ID. */
        TMap<FString, FKhaaosTournamentInfo> ActiveTournamentsMap;

        /** Current season. */
        FKhaaosSeasonInfo CurrentSeason;

        /** Leaderboard cache (sorted by ELO desc). */
        TArray<FKhaaosRankedScore> LeaderboardCache;

        /** ELO thresholds for each tier. */
        static constexpr int32 TierELOThresholds[] = {
                0, 200, 400, 600, 800, 1000, 1200, 1400, 1600,
                1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200
        };

        /** Apply win streak bonus to ELO change. */
        int32 ApplyWinStreakBonus(int32 BaseChange, int32 WinStreak) const;
};
