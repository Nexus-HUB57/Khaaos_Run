// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "KhaaosGameMode.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosSafeZone;
class AKhaaosLootPickup;
class USpatialGridSubsystem;
class UKhaaosAttributeSet;
class AKhaaosGameState;
class APlayerController;

// ─── Match Phase Enum (mirrors TS RoomStatus) ─────────────────────────────────

UENUM(BlueprintType)
enum class EMatchPhase : uint8
{
	Lobby       UMETA(DisplayName = "LOBBY"),
	Countdown   UMETA(DisplayName = "COUNTDOWN"),
	InProgress  UMETA(DisplayName = "IN_PROGRESS"),
	Finished    UMETA(DisplayName = "FINISHED")
};

/**
 * AKhaaosGameMode
 *
 * Authoritative match lifecycle manager ported from TS RoomManager.
 *
 * Lifecycle: LOBBY → COUNTDOWN → IN_PROGRESS → FINISHED
 *
 * Server is the single source of truth (no client-side authority on
 * damage, loot, or zone). In-memory active match for low-latency tick.
 * Hybrid persistence: critical events (eliminations, loot pickups) are
 * written to DB via EconomyBridge.
 */
UCLASS(Abstract, config=Game, defaultconfig)
class AKhaaosGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AKhaaosGameMode();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void InitGameState() override;
	virtual void StartPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	/** Begin countdown when min players are ready (or host force-starts). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void StartCountdown();

	/** Cancel countdown (host only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void CancelCountdown();

	/** Transition from countdown to active match. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void StartMatch();

	/** End match, compute rankings, broadcast results. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void FinishMatch(const FString& WinnerId);

	/** Per-tick zone damage, loot validation, win-condition check. */
	virtual void Tick(float DeltaSeconds) override;

	// ─── Player Management ──────────────────────────────────────────────────

	virtual void OnPostLogin(AController* NewPlayer) override;
	virtual void HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer) override;
	virtual void Logout(AController* Exiting) override;

	/** Handle player elimination (death). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void EliminatePlayer(APlayerState* Victim, APlayerState* Eliminator, const FString& Cause);

	/** Check if only one player remains alive. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	bool CheckWinCondition() const;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Maximum players per match (from TS maxPlayers). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
	int32 MaxPlayers;

	/** Minimum players required to start countdown. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
	int32 MinPlayersToStart;

	/** Countdown duration in seconds before match begins. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
	float CountdownDuration;

	/** Match time limit in seconds (0 = no limit). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
	float MatchTimeLimit;

	/** Tick interval for zone damage application (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
	float ZoneTickInterval;

	// ─── Subsystem References ───────────────────────────────────────────────

	/** Spatial grid for O(1) neighbor queries & interest management. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Systems")
	USpatialGridSubsystem* SpatialGrid;

	/** Safe zone actor (shrinking ring). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Systems")
	TObjectPtr<AKhaaosSafeZone> SafeZone;

protected:

	/** Internal countdown timer (seconds remaining). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Match")
	float CountdownRemaining;

	/** Current match phase. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Match")
	EMatchPhase MatchPhase;

	/** Cached game state pointer. */
	UPROPERTY()
	TObjectPtr<AKhaaosGameState> KhaaosGameState;

	/** Handle zone damage tick timer. */
	FTimerHandle ZoneTickTimerHandle;

	/** Handle countdown timer. */
	FTimerHandle CountdownTimerHandle;

	/** Apply zone damage to all players outside the safe zone. */
	void ApplyZoneDamage();

	/** Countdown tick callback. */
	void CountdownTick();

	/** Spawn loot items from LOOT_PRESETS at match start. */
	void SpawnLoot();

	/** Compute and apply ELO rankings at match end. */
	void ComputeRankings();
};
