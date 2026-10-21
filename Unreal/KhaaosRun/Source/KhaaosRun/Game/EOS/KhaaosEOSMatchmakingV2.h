// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/EOS/KhaaosEOSMatchmakingV2.generated.h"

// ─── Matchmaking Types ─────────────────────────────────────────────────────────

/**
 * EKhaaosMatchmakingState
 * State machine for matchmaking flow.
 */
UENUM(BlueprintType)
enum class EKhaaosMatchmakingState : uint8
{
	Idle           UMETA(DisplayName = "IDLE"),
	Searching      UMETA(DisplayName = "SEARCHING"),
	FoundMatch     UMETA(DisplayName = "FOUND_MATCH"),
	JoiningServer  UMETA(DisplayName = "JOINING_SERVER"),
	InMatch        UMETA(DisplayName = "IN_MATCH"),
	Cancelled      UMETA(DisplayName = "CANCELLED"),
	Failed         UMETA(DisplayName = "FAILED")
};

/**
 * FKhaaosSkillRating
 * Skill-Based Matchmaking (SBMM) rating.
 */
USTRUCT(BlueprintType)
struct FKhaaosSkillRating
{
	GENERATED_BODY()

	/** Mu (mean skill estimate). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|SBMM")
	float Mu = 25.0f;

	/** Sigma (skill uncertainty). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SBMM")
	float Sigma = 8.333f;

	/** Games played. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SBMM")
	int32 GamesPlayed = 0;

	/** Win rate (0-1). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SBMM")
	float WinRate = 0.0f;

	/** Conservative rating (mu - 3*sigma). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|SBMM")
	float ConservativeRating = 0.0f;
};

/**
 * FKhaaosMatchmakingTicket
 * A player's matchmaking request.
 */
USTRUCT(BlueprintType)
struct FKhaaosMatchmakingTicket
{
	GENERATED_BODY()

	/** Player EOS ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	FString PlayerEosId;

	/** Skill rating. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	FKhaaosSkillRating SkillRating;

	/** Preferred region. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	FString PreferredRegion;

	/** Party ID (empty = solo). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	FString PartyId;

	/** Max acceptable ping (ms). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	int32 MaxPing = 150;

	/** Queue time (seconds). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	float QueueTime = 0.0f;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnMatchFound, bool, bSuccess, const FString&, SessionId);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnMatchmakingStateChanged, EKhaaosMatchmakingState, NewState);

/**
 * UKhaaosEOSMatchmakingV2
 *
 * Enhanced matchmaking with Skill-Based Matchmaking (SBMM), region routing,
 * party support, and queue time expansion. Replaces basic EOS matchmaking
 * with Khaaos-specific logic.
 *
 * SBMM Algorithm (TrueSkill-inspired):
 *   1. Compute conservative rating: mu - 3*sigma
 *   2. Match players within ±2 sigma of each other
 *   3. Expand skill band over time: ±2σ → ±3σ → ±4σ (at 30s, 60s)
 *   4. Prioritize low-ping regions (<80ms optimal, <150ms acceptable)
 *   5. Party members always on same team (avg skill of party)
 *
 * Region Routing:
 *   - sa1 (São Paulo): Primary for LATAM
 *   - us-east-1: Fallback for SA players with high ping
 *   - eu-west-1: EU players
 *   - ap-southeast-1: Asia-Pacific players
 *
 * Queue Expansion:
 *   - 0-30s: Strict skill matching (±2σ)
 *   - 30-60s: Expanded (±3σ)
 *   - 60s+: Wide (±4σ), prioritizing any available match
 *   - 120s+: Fill any slot to prevent infinite queue
 */
UCLASS(BlueprintType)
class UKhaaosEOSMatchmakingV2 : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Matchmaking API ────────────────────────────────────────────────────

	/** Start matchmaking as solo player. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|MM")
	void StartMatchmaking(const FString& PlayerEosId, const FKhaaosSkillRating& Rating, const FString& Region);

	/** Start matchmaking as party. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|MM")
	void StartPartyMatchmaking(const FString& PartyId, const TArray<FString>& MemberIds, const TArray<FKhaaosSkillRating>& Ratings, const FString& Region);

	/** Cancel matchmaking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|MM")
	void CancelMatchmaking();

	/** Get current state. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|MM")
	EKhaaosMatchmakingState GetState() const { return State; }

	/** Get current queue time. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|MM")
	float GetQueueTime() const { return QueueTime; }

	// ─── Skill Rating ──────────────────────────────────────────────────────

	/** Update skill rating after a match. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|SBMM")
	FKhaaosSkillRating UpdateSkillRating(const FKhaaosSkillRating& Current, bool bWon, int32 Placement, int32 TotalPlayers);

	/** Compute skill band width based on queue time. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|SBMM")
	float GetSkillBandWidth(float InQueueTime) const;

	// ─── Region Routing ────────────────────────────────────────────────────

	/** Select best region based on ping measurements. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|MM")
	FString SelectBestRegion(const TMap<FString, int32>& RegionPings);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Max search time before forced match (seconds). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	float MaxSearchTime;

	/** Initial skill band (in sigma units). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	float InitialSkillBand;

	/** Queue time threshold for band expansion (seconds). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	float BandExpansionTime1;

	/** Second expansion threshold. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	float BandExpansionTime2;

	/** Optimal ping threshold (ms). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	int32 OptimalPingThreshold;

	/** Acceptable ping threshold (ms). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EOS|MM")
	int32 AcceptablePingThreshold;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|MM")
	FOnMatchFound OnMatchFound;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|MM")
	FOnMatchmakingStateChanged OnMatchmakingStateChanged;

private:

	/** Current matchmaking state. */
	EKhaaosMatchmakingState State;

	/** Active matchmaking ticket. */
	FKhaaosMatchmakingTicket ActiveTicket;

	/** Queue time accumulator. */
	float QueueTime;

	/** Set state and broadcast. */
	void SetState(EKhaaosMatchmakingState NewState);
};
