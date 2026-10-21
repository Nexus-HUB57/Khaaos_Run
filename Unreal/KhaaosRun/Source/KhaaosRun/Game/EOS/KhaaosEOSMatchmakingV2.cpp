// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSMatchmakingV2.h"
#include "KhaaosRun.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosEOSMatchmakingV2::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	State = EKhaaosMatchmakingState::Idle;
	QueueTime = 0.0f;
	MaxSearchTime = 120.0f;
	InitialSkillBand = 2.0f;
	BandExpansionTime1 = 30.0f;
	BandExpansionTime2 = 60.0f;
	OptimalPingThreshold = 80;
	AcceptablePingThreshold = 150;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSMatchmakingV2: Initialized"));
}

void UKhaaosEOSMatchmakingV2::Deinitialize()
{
	if (State == EKhaaosMatchmakingState::Searching)
	{
		CancelMatchmaking();
	}
	Super::Deinitialize();
}

// ─── Matchmaking API ────────────────────────────────────────────────────────────

void UKhaaosEOSMatchmakingV2::StartMatchmaking(const FString& PlayerEosId, const FKhaaosSkillRating& Rating, const FString& Region)
{
	if (State != EKhaaosMatchmakingState::Idle && State != EKhaaosMatchmakingState::Cancelled && State != EKhaaosMatchmakingState::Failed)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSMatchmakingV2: Already in matchmaking"));
		return;
	}

	ActiveTicket.PlayerEosId = PlayerEosId;
	ActiveTicket.SkillRating = Rating;
	ActiveTicket.PreferredRegion = Region;
	ActiveTicket.PartyId.Empty();
	ActiveTicket.QueueTime = 0.0f;
	QueueTime = 0.0f;

	SetState(EKhaaosMatchmakingState::Searching);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSMatchmakingV2: Started matchmaking for %s in %s (rating: %.1f)"),
		*PlayerEosId, *Region, Rating.ConservativeRating);
}

void UKhaaosEOSMatchmakingV2::StartPartyMatchmaking(const FString& PartyId, const TArray<FString>& MemberIds, const TArray<FKhaaosSkillRating>& Ratings, const FString& Region)
{
	if (MemberIds.Num() != Ratings.Num())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosEOSMatchmakingV2: Member/Rating count mismatch"));
		return;
	}

	// Compute average party skill
	FKhaaosSkillRating AvgRating;
	float TotalMu = 0.0f, TotalSigma = 0.0f;
	for (const auto& R : Ratings)
	{
		TotalMu += R.Mu;
		TotalSigma += R.Sigma;
	}
	AvgRating.Mu = TotalMu / Ratings.Num();
	AvgRating.Sigma = TotalSigma / Ratings.Num();
	AvgRating.ConservativeRating = AvgRating.Mu - 3.0f * AvgRating.Sigma;
	AvgRating.GamesPlayed = 0;

	ActiveTicket.PlayerEosId = MemberIds[0]; // Party leader
	ActiveTicket.SkillRating = AvgRating;
	ActiveTicket.PreferredRegion = Region;
	ActiveTicket.PartyId = PartyId;
	ActiveTicket.QueueTime = 0.0f;
	QueueTime = 0.0f;

	SetState(EKhaaosMatchmakingState::Searching);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSMatchmakingV2: Party matchmaking started (%d members) in %s"),
		MemberIds.Num(), *Region);
}

void UKhaaosEOSMatchmakingV2::CancelMatchmaking()
{
	if (State == EKhaaosMatchmakingState::Searching)
	{
		SetState(EKhaaosMatchmakingState::Cancelled);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSMatchmakingV2: Matchmaking cancelled after %.1fs"), QueueTime);
	}
}

// ─── Skill Rating ───────────────────────────────────────────────────────────────

FKhaaosSkillRating UKhaaosEOSMatchmakingV2::UpdateSkillRating(const FKhaaosSkillRating& Current, bool bWon, int32 Placement, int32 TotalPlayers)
{
	FKhaaosSkillRating NewRating = Current;

	// TrueSkill-inspired update (simplified)
	float ExpectedPlacement = static_cast<float>(TotalPlayers + 1) / 2.0f;
	float PlacementDelta = (ExpectedPlacement - static_cast<float>(Placement)) / static_cast<float>(TotalPlayers);

	// Update mu based on performance
	float MuUpdate = PlacementDelta * 4.0f; // K-factor = 4
	NewRating.Mu = Current.Mu + MuUpdate;

	// Reduce sigma (certainty increases with more games)
	float SigmaDecay = 0.95f;
	NewRating.Sigma = FMath::Max(1.0f, Current.Sigma * SigmaDecay);

	// Update conservative rating
	NewRating.ConservativeRating = NewRating.Mu - 3.0f * NewRating.Sigma;

	// Update stats
	NewRating.GamesPlayed = Current.GamesPlayed + 1;
	float OldWins = Current.WinRate * Current.GamesPlayed;
	NewRating.WinRate = (OldWins + (bWon ? 1.0f : 0.0f)) / NewRating.GamesPlayed;

	return NewRating;
}

float UKhaaosEOSMatchmakingV2::GetSkillBandWidth(float InQueueTime) const
{
	if (InQueueTime < BandExpansionTime1)
	{
		return InitialSkillBand; // ±2σ
	}
	else if (InQueueTime < BandExpansionTime2)
	{
		return InitialSkillBand + 1.0f; // ±3σ
	}
	else if (InQueueTime < MaxSearchTime)
	{
		return InitialSkillBand + 2.0f; // ±4σ
	}
	else
	{
		return 100.0f; // Effectively no limit
	}
}

// ─── Region Routing ─────────────────────────────────────────────────────────────

FString UKhaaosEOSMatchmakingV2::SelectBestRegion(const TMap<FString, int32>& RegionPings)
{
	FString BestRegion;
	int32 BestPing = INT32_MAX;

	// Prefer regions under optimal threshold
	for (const auto& Pair : RegionPings)
	{
		if (Pair.Value < BestPing)
		{
			BestPing = Pair.Value;
			BestRegion = Pair.Key;
		}
	}

	// If best ping exceeds acceptable, still use it but log warning
	if (BestPing > AcceptablePingThreshold)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSMatchmakingV2: Best ping %dms exceeds threshold (%dms) in %s"),
			BestPing, AcceptablePingThreshold, *BestRegion);
	}

	return BestRegion;
}

// ─── Private ────────────────────────────────────────────────────────────────────

void UKhaaosEOSMatchmakingV2::SetState(EKhaaosMatchmakingState NewState)
{
	if (NewState != State)
	{
		State = NewState;
		OnMatchmakingStateChanged.Broadcast(NewState);
	}
}
