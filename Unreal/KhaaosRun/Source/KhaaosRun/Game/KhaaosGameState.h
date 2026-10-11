// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "Game/KhaaosGameMode.h"
#include "KhaaosGameState.generated.h"

/**
 * AKhaaosGameState
 *
 * Replicated game state visible to all clients.
 * Mirrors the TS SerializedRoom broadcast payload.
 *
 * All replicated properties are server-authoritative.
 * Client receives updates via RepNotify for UI/visual sync.
 */
UCLASS(Abstract)
class AKhaaosGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	AKhaaosGameState();

	// ─── Replicated Match State ─────────────────────────────────────────────

	/** Current match phase (Lobby/Countdown/InProgress/Finished). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Match")
	EMatchPhase MatchPhase;

	/** Seconds remaining in current phase (countdown or match timer). */
	UPROPERTY(ReplicatedUsing = OnRep_RemainingTime, BlueprintReadOnly, Category = "Khaaos|Match")
	float RemainingTime;

	/** Number of players still alive in the match. */
	UPROPERTY(ReplicatedUsing = OnRep_PlayersAlive, BlueprintReadOnly, Category = "Khaaos|Match")
	int32 PlayersAlive;

	/** Total number of players in the match (alive + eliminated). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Match")
	int32 TotalPlayers;

	/** Winner player ID (set when match finishes). */
	UPROPERTY(ReplicatedUsing = OnRep_WinnerId, BlueprintReadOnly, Category = "Khaaos|Match")
	FString WinnerId;

	// ─── Replicated Zone State ──────────────────────────────────────────────

	/** Current safe zone center in world space. */
	UPROPERTY(ReplicatedUsing = OnRep_ZoneCenter, BlueprintReadOnly, Category = "Khaaos|Zone")
	FVector2D ZoneCenter;

	/** Current safe zone radius (world units). */
	UPROPERTY(ReplicatedUsing = OnRep_ZoneRadius, BlueprintReadOnly, Category = "Khaaos|Zone")
	float ZoneRadius;

	/** Target radius the zone is shrinking toward. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	float TargetRadius;

	/** Whether the zone is currently shrinking. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	uint8 bIsShrinking : 1;

	/** Current zone phase (1-5). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	int32 ZonePhase;

	/** Total number of zone phases. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	int32 TotalZonePhases;

	/** Damage per tick for players outside the zone. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	float ZoneDamagePerTick;

	// ─── RepNotify Callbacks ────────────────────────────────────────────────

	UFUNCTION()
	void OnRep_RemainingTime();

	UFUNCTION()
	void OnRep_PlayersAlive();

	UFUNCTION()
	void OnRep_WinnerId();

	UFUNCTION()
	void OnRep_ZoneCenter();

	UFUNCTION()
	void OnRep_ZoneRadius();

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when match phase changes. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnMatchPhaseChanged, EMatchPhase, OldPhase, EMatchPhase, NewPhase);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Match")
	FOnMatchPhaseChanged OnMatchPhaseChanged;

	/** Broadcast when a player is eliminated. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnPlayerEliminated, const FString&, VictimId, const FString&, Cause, const FString&, EliminatorId);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Match")
	FOnPlayerEliminated OnPlayerEliminated;

	/** Broadcast when zone state updates. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnZoneUpdated);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zone")
	FOnZoneUpdated OnZoneUpdated;

	// ─── Server Authority ───────────────────────────────────────────────────

	/** Set match phase (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void SetMatchPhase(EMatchPhase NewPhase);

	/** Set remaining time (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
	void SetRemainingTime(float NewTime);

	/** Update zone state (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone")
	void UpdateZoneState(const FVector2D& NewCenter, float NewRadius, float NewTargetRadius, bool bShrinking, int32 Phase, float DamagePerTick);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
