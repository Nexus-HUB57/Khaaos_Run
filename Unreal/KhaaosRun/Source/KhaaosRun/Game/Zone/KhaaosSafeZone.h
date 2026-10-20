// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosSafeZone.generated.h"

class UNiagaraComponent;
class UNiagaraSystem;

// ─── Zone Phase Config (from schema.ts ZONE_PHASES) ───────────────────────────

/**
 * FZonePhaseConfig
 *
 * Configuration for a single zone shrink phase.
 * Ported from schema.ts ZONE_PHASES array.
 */
USTRUCT(BlueprintType)
struct FZonePhaseConfig
{
	GENERATED_BODY()

	/** Phase index (1-5). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	int32 Phase = 1;

	/** Radius as percentage of map (0-100). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	float RadiusPct = 75.0f;

	/** Wait time before shrink begins (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	float WaitSeconds = 30.0f;

	/** Time to shrink to target radius (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	float ShrinkSeconds = 15.0f;

	/** Damage per tick for players outside the zone. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	float DamagePerTick = 5.0f;
};

/**
 * AKhaaosSafeZone
 *
 * Shrinking safe zone actor for Battle Royale ring.
 * Ported from TS RoomManager zone logic and schema.ts ZONE_PHASES.
 *
 * 5 phases of shrinking:
 *   Phase 1: 75% radius, 30s wait, 15s shrink,  5 dmg/tick
 *   Phase 2: 55% radius, 25s wait, 12s shrink, 10 dmg/tick
 *   Phase 3: 35% radius, 20s wait, 10s shrink, 18 dmg/tick
 *   Phase 4: 18% radius, 15s wait,  8s shrink, 28 dmg/tick
 *   Phase 5:  5% radius, 10s wait,  6s shrink, 45 dmg/tick
 *
 * Server-authoritative: clients receive replicated center/radius
 * for visual ring rendering.
 */
UCLASS(Abstract)
class AKhaaosSafeZone : public AActor
{
	GENERATED_BODY()

public:
	AKhaaosSafeZone();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// ─── Zone State (Replicated) ────────────────────────────────────────────

	/** Current zone center (normalized 0-100 map space). */
	UPROPERTY(ReplicatedUsing = OnRep_ZoneCenter, BlueprintReadOnly, Category = "Khaaos|Zone")
	FVector2D ZoneCenter;

	/** Current zone radius (as percentage of map, 0-100). */
	UPROPERTY(ReplicatedUsing = OnRep_ZoneRadius, BlueprintReadOnly, Category = "Khaaos|Zone")
	float ZoneRadius;

	/** Target radius the zone is shrinking toward. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	float TargetRadius;

	/** Rate of shrink (units/second). Computed from phase config. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	float ShrinkRate;

	/** Current phase (1-5). */
	UPROPERTY(ReplicatedUsing = OnRep_Phase, BlueprintReadOnly, Category = "Khaaos|Zone")
	int32 CurrentPhase;

	/** Whether the zone is currently shrinking. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	uint8 bIsShrinking : 1;

	/** Whether the zone system is active. */
	UPROPERTY(ReplicatedUsing = OnRep_ZoneVisual, BlueprintReadOnly, Category = "Khaaos|Zone")
	uint8 bIsActive : 1;

	/** Damage per tick for players outside the zone. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone")
	float DamagePerTick;

	/** World-space zone state used by the CIGKV map. */
	UPROPERTY(ReplicatedUsing = OnRep_ZoneVisual, BlueprintReadOnly, Category = "Khaaos|Zone|World")
	FVector WorldZoneCenter;

	UPROPERTY(ReplicatedUsing = OnRep_ZoneVisual, BlueprintReadOnly, Category = "Khaaos|Zone|World")
	float WorldZoneRadius;

	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Zone|World")
	uint8 bWorldSpaceZone : 1;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Total map size in world units (for radius conversion). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	float MapSize;

	/** Zone phase configurations (5 phases from schema.ts ZONE_PHASES). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	TArray<FZonePhaseConfig> ZonePhases;

	/** Tick interval for zone damage (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone")
	float DamageTickInterval;

	/** XY bounds of the CIGKV map, used to publish normalized minimap coordinates. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|World")
	FVector2D WorldMapMin;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|World")
	FVector2D WorldMapMax;

	/** Niagara boundary asset; its user parameters are configurable below. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|VFX")
	TSoftObjectPtr<UNiagaraSystem> ZoneBoundarySystem;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|VFX")
	FName ZoneCenterParameter = TEXT("User.ZoneCenter");

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|VFX")
	FName ZoneRadiusParameter = TEXT("User.ZoneRadius");

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|VFX")
	FName ZoneColorParameter = TEXT("User.ZoneColor");

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|VFX")
	FLinearColor ZoneBoundaryColor = FLinearColor(0.08f, 0.75f, 1.0f, 1.0f);

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Zone|VFX", meta = (ClampMin = "0.0"))
	float ZoneVisualHeightOffset = 150.0f;

	// ─── RepNotify ──────────────────────────────────────────────────────────

	UFUNCTION()
	void OnRep_ZoneCenter();

	UFUNCTION()
	void OnRep_ZoneRadius();

	UFUNCTION()
	void OnRep_Phase();

	UFUNCTION()
	void OnRep_ZoneVisual();

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when a zone phase transition occurs. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPhaseChanged, int32, OldPhase, int32, NewPhase);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zone")
	FOnPhaseChanged OnPhaseChanged;

	/** Broadcast when zone starts shrinking. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnZoneShrinkStart);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zone")
	FOnZoneShrinkStart OnZoneShrinkStart;

	// ─── Server Methods ─────────────────────────────────────────────────────

	/** Activate the zone system (call when match starts). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone")
	void ActivateZone();

	/** Deactivate the zone (match end). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone")
	void DeactivateZone();

	/** Configure a server-authoritative safe zone using world-space units. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zone|World")
	void SetWorldZone(const FVector& Center, float Radius, float DamagePerSecond, float TransitionSeconds = 0.0f);

	/** Test a world-space position against the CIGKV safe zone. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone|World")
	bool IsInsideWorldZone(const FVector& Position) const;

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone|World")
	bool UsesWorldSpaceZone() const { return bWorldSpaceZone; }

	/** Check if a position is inside the safe zone. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
	bool IsInsideZone(const FVector2D& Position) const;

	/** Get distance from position to zone edge (negative = inside). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
	float DistanceToZoneEdge(const FVector2D& Position) const;

	/** Get the zone status struct (for replication to game state). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Zone")
	void GetZoneStatus(float& OutRadiusPct, float& OutTargetPct, int32& OutPhase, bool& OutShrinking, float& OutDamage, float& OutWaitRemaining, float& OutShrinkRemaining) const;

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

	/** Time remaining in current phase's wait period. */
	UPROPERTY()
	float WaitTimeRemaining;

	/** Time remaining in current phase's shrink period. */
	UPROPERTY()
	float ShrinkTimeRemaining;

	/** Radius at the start of current shrink (for interpolation). */
	UPROPERTY()
	float ShrinkStartRadius;

	FVector WorldZoneStartCenter = FVector::ZeroVector;
	FVector WorldZoneTargetCenter = FVector::ZeroVector;
	float WorldZoneStartRadius = 0.0f;
	float WorldZoneTargetRadius = 0.0f;
	float WorldZoneTransitionElapsed = 0.0f;
	float WorldZoneTransitionDuration = 0.0f;
	bool bWorldZoneTransition = false;
	bool bMissingBoundaryAssetWarningLogged = false;

	UPROPERTY(Transient)
	TObjectPtr<UNiagaraComponent> ZoneBoundaryComponent;

	/** Refresh the client-side Niagara boundary and normalized map coordinates. */
	void RefreshZoneVisual();
	void UpdateNormalizedZoneState();

	/** Randomly pick a new zone center for the next phase. */
	void PickNextZoneCenter();

	/** Advance to the next zone phase. */
	void AdvancePhase();

	/** Begin shrinking toward target radius. */
	void BeginShrink();

	/** Handle timer for damage ticks. */
	FTimerHandle DamageTickHandle;

	/** Initialize default zone phases from schema.ts ZONE_PHASES. */
	void InitDefaultZonePhases();
};
