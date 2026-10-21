// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Ranked/KhaaosRankedSystem.h"
#include "KhaaosRun.h"

#include "Math/UnrealMathUtility.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosRankedSystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        bInRankedQueue = false;
        ActiveQueueType = EKhaaosRankedQueueType::Solo;

        // Initialize current season
        CurrentSeason.SeasonNumber = 1;
        CurrentSeason.SeasonName = TEXT("Temporada 1: Despertar Khaaos");
        CurrentSeason.DurationDays = 90;
        CurrentSeason.SoftResetFraction = 0.5f;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: Initialized (Season %d: %s, %d days)"),
                CurrentSeason.SeasonNumber, *CurrentSeason.SeasonName, CurrentSeason.DurationDays);
}

void UKhaaosRankedSystem::Deinitialize()
{
        PlayerScores.Empty();
        ActiveTournamentsMap.Empty();
        LeaderboardCache.Empty();
        Super::Deinitialize();
}

// ─── ELO / Rating ───────────────────────────────────────────────────────────────

int32 UKhaaosRankedSystem::CalculateELOChange(int32 PlayerELO, int32 AvgOpponentELO, bool bWon, int32 MatchesPlayed) const
{
        // K-factor: higher for new players, lower for experienced
        const float K = (MatchesPlayed < ExperiencedThreshold) ? KFactorNew : KFactorExperienced;

        // Expected score (logistic function)
        const float Expected = 1.0f / (1.0f + FMath::Pow(10.0f, (float)(AvgOpponentELO - PlayerELO) / 400.0f));

        // Actual score: 1.0 for win, 0.0 for loss
        const float Actual = bWon ? 1.0f : 0.0f;

        // Base ELO change
        int32 Change = FMath::RoundToInt(K * (Actual - Expected));

        // Clamp to prevent extreme swings
        Change = FMath::Clamp(Change, -32, 32);

        return Change;
}

void UKhaaosRankedSystem::UpdateRankedScore(const FString& PlayerEosId, int32 Placement, int32 Kills, float SurvivedTime)
{
        FKhaaosRankedScore& Score = PlayerScores.FindOrAdd(PlayerEosId);

        const EKhaaosRankedTier OldTier = Score.Tier;

        // Calculate average opponent ELO (use current ELO as baseline)
        const int32 AvgOppELO = Score.ELO; // In production: compute from actual opponents

        // Win condition: top placement (1st in solo, top 2 in duo, top 1 in squad)
        const bool bWon = (Placement == 1);

        // Base ELO change
        int32 ELOChange = CalculateELOChange(Score.ELO, AvgOppELO, bWon, Score.MatchesPlayed);

        // Placement modifier: better placement = more ELO
        const float PlacementMod = FMath::Clamp(1.0f - ((float)Placement - 1.0f) * 0.1f, 0.3f, 1.0f);
        ELOChange = FMath::RoundToInt((float)ELOChange * PlacementMod);

        // Apply win streak bonus
        if (bWon)
        {
                Score.WinStreak++;
                ELOChange = ApplyWinStreakBonus(ELOChange, Score.WinStreak);
        }
        else
        {
                Score.WinStreak = 0;
        }

        // Apply ELO change
        Score.ELO = FMath::Max(0, Score.ELO + ELOChange);
        Score.MatchesPlayed++;
        if (bWon) Score.Wins++;
        if (Score.ELO > Score.PeakELO) Score.PeakELO = Score.ELO;

        // Update tier
        Score.Tier = GetTierFromELO(Score.ELO);

        // Calculate tier progress (0-100% within tier range)
        const int32 TierIdx = (int32)Score.Tier;
        const int32 LowThreshold = TierELOThresholds[TierIdx];
        const int32 HighThreshold = (TierIdx < 16) ? TierELOThresholds[TierIdx + 1] : LowThreshold + 200;
        if (HighThreshold > LowThreshold)
        {
                Score.TierProgress = ((float)(Score.ELO - LowThreshold) / (float)(HighThreshold - LowThreshold)) * 100.0f;
        }

        // Tier change notification
        if (Score.Tier != OldTier)
        {
                // Handle demotion protection
                if ((int32)Score.Tier < (int32)OldTier && Score.DemotionProtection > 0)
                {
                        Score.Tier = OldTier;
                        Score.DemotionProtection--;
                }
                else
                {
                        // Promotion: grant demotion protection
                        if ((int32)Score.Tier > (int32)OldTier)
                        {
                                Score.DemotionProtection = 3;
                        }
                        OnTierChanged.Broadcast(Score.Tier, OldTier);
                }
        }

        OnELOUpdated.Broadcast(Score.ELO, Score.Tier);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: %s ELO=%d(+%d), Tier=%d, Streak=%d, Place=%d"),
                *PlayerEosId, Score.ELO, ELOChange, (int32)Score.Tier, Score.WinStreak, Placement);
}

FKhaaosRankedScore UKhaaosRankedSystem::GetRankedScore(const FString& PlayerEosId) const
{
        const FKhaaosRankedScore* Found = PlayerScores.Find(PlayerEosId);
        return Found ? *Found : FKhaaosRankedScore();
}

EKhaaosRankedTier UKhaaosRankedSystem::GetTierFromELO(int32 ELO) const
{
        // Map ELO to tier using thresholds
        for (int32 i = 16; i >= 0; --i)
        {
                if (ELO >= TierELOThresholds[i])
                {
                        return (EKhaaosRankedTier)i;
                }
        }
        return EKhaaosRankedTier::Bronze1;
}

FText UKhaaosRankedSystem::GetTierDisplayName(EKhaaosRankedTier Tier) const
{
        const TArray<FString> TierNames = {
                TEXT("Bronze I"), TEXT("Bronze II"), TEXT("Bronze III"),
                TEXT("Silver I"), TEXT("Silver II"), TEXT("Silver III"),
                TEXT("Gold I"), TEXT("Gold II"), TEXT("Gold III"),
                TEXT("Platinum I"), TEXT("Platinum II"), TEXT("Platinum III"),
                TEXT("Diamond I"), TEXT("Diamond II"), TEXT("Diamond III"),
                TEXT("Heroic"), TEXT("Grandmaster")
        };

        const int32 Idx = (int32)Tier;
        if (Idx >= 0 && Idx < TierNames.Num())
        {
                return FText::FromString(TierNames[Idx]);
        }
        return FText::FromString(TEXT("Unknown"));
}

// ─── Ranked Queue ───────────────────────────────────────────────────────────────

bool UKhaaosRankedSystem::EnterRankedQueue(EKhaaosRankedQueueType QueueType)
{
        if (bInRankedQueue) return false;

        // Check if player has completed placements or has enough matches
        // (In production: also check anti-cheat status, account age, etc.)

        ActiveQueueType = QueueType;
        bInRankedQueue = true;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: Entered ranked queue (type=%d)"), (int32)QueueType);
        return true;
}

void UKhaaosRankedSystem::LeaveRankedQueue()
{
        bInRankedQueue = false;
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: Left ranked queue"));
}

// ─── Tournament ─────────────────────────────────────────────────────────────────

bool UKhaaosRankedSystem::RegisterForTournament(const FString& TournamentId, const FString& PlayerEosId)
{
        FKhaaosTournamentInfo* Tournament = ActiveTournamentsMap.Find(TournamentId);
        if (!Tournament)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosRankedSystem: Tournament %s not found"), *TournamentId);
                return false;
        }

        if (Tournament->State != EKhaaosTournamentState::Registration)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosRankedSystem: Tournament %s not in registration phase"), *TournamentId);
                return false;
        }

        if (Tournament->RegisteredCount >= Tournament->MaxParticipants)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosRankedSystem: Tournament %s is full"), *TournamentId);
                return false;
        }

        // Check ELO requirement
        const FKhaaosRankedScore* Score = PlayerScores.Find(PlayerEosId);
        if (Score && Score->ELO < Tournament->MinELO)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosRankedSystem: ELO %d below minimum %d"), Score->ELO, Tournament->MinELO);
                return false;
        }

        Tournament->RegisteredCount++;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: %s registered for tournament %s (%d/%d)"),
                *PlayerEosId, *TournamentId, Tournament->RegisteredCount, Tournament->MaxParticipants);
        return true;
}

bool UKhaaosRankedSystem::CheckInForTournament(const FString& TournamentId, const FString& PlayerEosId)
{
        FKhaaosTournamentInfo* Tournament = ActiveTournamentsMap.Find(TournamentId);
        if (!Tournament) return false;

        if (Tournament->State != EKhaaosTournamentState::CheckIn)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosRankedSystem: Tournament %s not in check-in phase"), *TournamentId);
                return false;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: %s checked in for tournament %s"), *PlayerEosId, *TournamentId);
        return true;
}

FKhaaosTournamentInfo UKhaaosRankedSystem::GetTournamentInfo(const FString& TournamentId) const
{
        const FKhaaosTournamentInfo* Found = ActiveTournamentsMap.Find(TournamentId);
        return Found ? *Found : FKhaaosTournamentInfo();
}

TArray<FKhaaosTournamentInfo> UKhaaosRankedSystem::GetActiveTournaments() const
{
        TArray<FKhaaosTournamentInfo> Result;
        ActiveTournamentsMap.GenerateValueArray(Result);
        return Result;
}

void UKhaaosRankedSystem::AdvanceTournamentBracket(const FString& TournamentId)
{
        FKhaaosTournamentInfo* Tournament = ActiveTournamentsMap.Find(TournamentId);
        if (!Tournament) return;

        const EKhaaosTournamentState OldState = Tournament->State;

        if (Tournament->CurrentRound < Tournament->Rounds)
        {
                Tournament->CurrentRound++;

                if (Tournament->CurrentRound == Tournament->Rounds)
                {
                        Tournament->State = EKhaaosTournamentState::Finals;
                }
        }
        else
        {
                Tournament->State = EKhaaosTournamentState::Completed;
        }

        if (Tournament->State != OldState)
        {
                OnTournamentStateChanged.Broadcast(Tournament->State);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: Tournament %s advanced to round %d, state=%d"),
                *TournamentId, Tournament->CurrentRound, (int32)Tournament->State);
}

// ─── Seasonal Ladder ────────────────────────────────────────────────────────────

void UKhaaosRankedSystem::PerformSeasonalReset()
{
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: Performing seasonal reset (fraction=%.1f)"),
                CurrentSeason.SoftResetFraction);

        // Soft reset: players retain a fraction of their ELO above 1200
        for (auto& Pair : PlayerScores)
        {
                FKhaaosRankedScore& Score = Pair.Value;

                if (Score.ELO > 1200)
                {
                        const int32 AboveBase = Score.ELO - 1200;
                        Score.ELO = 1200 + FMath::RoundToInt((float)AboveBase * CurrentSeason.SoftResetFraction);
                }

                // Reset season stats
                Score.MatchesPlayed = 0;
                Score.Wins = 0;
                Score.WinStreak = 0;
                Score.Tier = GetTierFromELO(Score.ELO);
                Score.TierProgress = 0.0f;
                Score.DemotionProtection = 3;
        }

        // Advance season
        CurrentSeason.SeasonNumber++;
        CurrentSeason.SeasonName = FString::Printf(TEXT("Temporada %d"), CurrentSeason.SeasonNumber);

        OnSeasonChanged.Broadcast(CurrentSeason.SeasonNumber);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRankedSystem: Season %d started (%s)"),
                CurrentSeason.SeasonNumber, *CurrentSeason.SeasonName);
}

TArray<FKhaaosRankedScore> UKhaaosRankedSystem::GetLeaderboard(int32 TopN) const
{
        TArray<FKhaaosRankedScore> Sorted = LeaderboardCache;

        Sorted.Sort([](const FKhaaosRankedScore& A, const FKhaaosRankedScore& B)
        {
                return A.ELO > B.ELO;
        });

        if (Sorted.Num() > TopN)
        {
                Sorted.SetNum(TopN);
        }

        return Sorted;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

int32 UKhaaosRankedSystem::ApplyWinStreakBonus(int32 BaseChange, int32 WinStreak) const
{
        if (WinStreak >= WinStreakThreshold && BaseChange > 0)
        {
                return FMath::RoundToInt((float)BaseChange * WinStreakBonus);
        }
        return BaseChange;
}

// Static tier ELO thresholds
constexpr int32 UKhaaosRankedSystem::TierELOThresholds[];
