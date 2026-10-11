// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosEOSMatchmaking.generated.h"

// ─── Matchmaking Config Struct ─────────────────────────────────────────────────

/** Configuration for matchmaking pool. */
USTRUCT(BlueprintType)
struct FMatchmakingConfig
{
	GENERATED_BODY()

	/** Pool name (e.g., "KhaaosBR"). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Matchmaking")
	FString PoolName = TEXT("KhaaosBR");

	/** Preferred region (e.g., "sa1", "us-east-1"). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Matchmaking")
	FString Region = TEXT("sa1");

	/** Minimum players to start match. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Matchmaking")
	int32 MinPlayers = 2;

	/** Maximum players per match. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Matchmaking")
	int32 MaxPlayers = 100;

	/** Skill range for matchmaking (± from player rating). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Matchmaking")
	int32 SkillRange = 100;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a match is found. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnMatchFound, const FString&, SessionId, const FString&, ServerAddress);

/** Broadcast when matchmaking fails. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMatchmakingFailed, const FString&, ErrorMessage);

/**
 * UKhaaosEOSMatchmaking
 *
 * GameInstanceSubsystem for EOS Matchmaking.
 * Submits players to matchmaking pools, tracks ticket status,
 * and receives match results with session ID and server address.
 *
 * Depends on UKhaaosEOSManager for authentication.
 *
 * Flow:
 *   1. StartMatchmaking() → submit to pool
 *   2. Poll for match via EOS callbacks
 *   3. OnMatchFound → join dedicated server session
 *   4. CancelMatchmaking() → cancel if needed
 */
UCLASS(BlueprintType)
class UKhaaosEOSMatchmaking : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Matchmaking Operations ────────────────────────────────────────────────

	/**
	 * Start matchmaking for the local player.
	 * @param PoolName     Matchmaking pool (e.g., "KhaaosBR")
	 * @param Region       Preferred region (e.g., "sa1")
	 * @param SkillRating  Player's skill rating for MMR-based matching
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Matchmaking")
	void StartMatchmaking(FString PoolName, FString Region, int32 SkillRating);

	/** Cancel the current matchmaking ticket. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Matchmaking")
	void CancelMatchmaking();

	// ─── Queries ───────────────────────────────────────────────────────────────

	/** Get the current matchmaking ticket ID. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Matchmaking")
	FString GetCurrentTicketId() const { return CurrentTicketId; }

	/** Check if currently searching for a match. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Matchmaking")
	bool IsSearching() const { return bIsSearching; }

	/** Get the matchmaking config. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Matchmaking")
	FMatchmakingConfig GetMatchmakingConfig() const { return Config; }

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when a match is found (provides session ID and server address). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Matchmaking")
	FOnMatchFound OnMatchFound;

	/** Broadcast when matchmaking fails. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Matchmaking")
	FOnMatchmakingFailed OnMatchmakingFailed;

private:

	/** Current matchmaking config. */
	FMatchmakingConfig Config;

	/** Current ticket ID from EOS. */
	FString CurrentTicketId;

	/** Whether we are currently searching. */
	bool bIsSearching = false;

	/** Handle matchmaking notification callback. */
	void HandleMatchNotification(const FString& SessionId, const FString& ServerAddress);

	/** Handle matchmaking failure. */
	void HandleMatchFailure(const FString& ErrorMessage);
};
