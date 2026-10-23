// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/WorldGen/KhaaosWorldTransition.generated.h"

// ─── Transition Phase Enum ────────────────────────────────────────────────────

/**
 * EKhaaosTransitionPhase
 * Phases of a world-to-world transition pipeline.
 */
UENUM(BlueprintType)
enum class EKhaaosTransitionPhase : uint8
{
	Idle		UMETA(DisplayName = "IDLE"),
	PreTransition	UMETA(DisplayName = "PRE_TRANSITION"),  // Countdown before loading
	Loading		UMETA(DisplayName = "LOADING"),            // Streaming target world
	Active		UMETA(DisplayName = "ACTIVE"),              // Players moving between worlds
	PostTransition	UMETA(DisplayName = "POST_TRANSITION")   // Cleanup after transition
};

// ─── Transition Config ────────────────────────────────────────────────────────

/**
 * FKhaaosTransitionConfig
 * Configuration for a world transition request.
 */
USTRUCT(BlueprintType)
struct FKhaaosTransitionConfig
{
	GENERATED_BODY()

	/** Source world ID (0=CIGKV, 1=Barburhen, 2=Priadus, 3=Ckesalth, 4=Arukheea). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	int32 SourceWorldId = 0;

	/** Target world ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	int32 TargetWorldId = 1;

	/** Duration of the transition in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	float TransitionDurationSeconds = 5.0f;

	/** Whether players can return to the source world. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	uint8 bAllowReturn : 1;

	/** Maximum concurrent transitions. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	int32 MaxConcurrentTransitions = 50;

	FKhaaosTransitionConfig()
		: SourceWorldId(0)
		, TargetWorldId(1)
		, TransitionDurationSeconds(5.0f)
		, bAllowReturn(true)
		, MaxConcurrentTransitions(50)
	{}
};

// ─── World Transition State ──────────────────────────────────────────────────

/**
 * FKhaaosWorldTransitionState
 * Runtime state of an active world transition.
 */
USTRUCT(BlueprintType)
struct FKhaaosWorldTransitionState
{
	GENERATED_BODY()

	/** Current phase of the transition. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	EKhaaosTransitionPhase Phase = EKhaaosTransitionPhase::Idle;

	/** Source world ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	int32 SourceWorldId = 0;

	/** Target world ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	int32 TargetWorldId = 0;

	/** Elapsed time since transition started. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	float ElapsedTime = 0.0f;

	/** Player IDs currently in transit. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	TArray<int32> PlayersInTransit;

	/** Whether the transition is currently active. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	uint8 bIsActive : 1;

	FKhaaosWorldTransitionState()
		: Phase(EKhaaosTransitionPhase::Idle)
		, SourceWorldId(0)
		, TargetWorldId(0)
		, ElapsedTime(0.0f)
		, bIsActive(false)
	{}
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnWorldTransitionStarted, int32, SourceWorldId, int32, TargetWorldId);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnWorldTransitionCompleted, int32, SourceWorldId, int32, TargetWorldId);

/**
 * UKhaaosWorldTransitionComponent
 *
 * Handles multi-world pipeline transitions for the 5-world sequence:
 *   CIGKV (0) → W1 Barburhen (1) → W2 Priadus (2) → W3 Ckesalth (3) → W4 Arukheea (4)
 *
 * Architecture:
 *   - Phase-based transition: Idle → PreTransition → Loading → Active → PostTransition
 *   - Concurrent transitions up to MaxConcurrentTransitions limit
 *   - Return transitions allowed per-config (bAllowReturn)
 *   - Player tracking: maintains list of players in transit
 *   - World streaming: integrates with UE5 World Partition / Level Streaming
 *
 * Pipeline Sequence:
 *   World 0: CIGKV    — 50p lobby, post-apoc city (UrbanRuins)
 *   World 1: Barburhen — 100p, dense jungle (TropicalForest)
 *   World 2: Priadus  — 75p, lava fields (VolcanicWastes)
 *   World 3: Ckesalth — 60p, ice/snow (FrozenTundra)
 *   World 4: Arukheea — 80p, sand/canyon (DesertCanyon)
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosWorldTransitionComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	UKhaaosWorldTransitionComponent();

	// ─── Transition Control ─────────────────────────────────────────────────

	/** Request a transition from source to target world for given players. Returns true if accepted. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Transition")
	bool RequestTransition(int32 SourceWorldId, int32 TargetWorldId, const TArray<int32>& PlayerIds);

	/** Get the current transition state for a world. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen|Transition")
	FKhaaosWorldTransitionState GetTransitionState(int32 WorldId) const;

	/** Cancel an active transition for a world. Returns true if cancelled. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Transition")
	bool CancelTransition(int32 WorldId);

	/** Complete a transition for a world (moves to PostTransition then Idle). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Transition")
	void CompleteTransition(int32 WorldId);

	/** Get the 5-world pipeline sequence (CIGKV, Barburhen, Priadus, Ckesalth, Arukheea). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen|Transition")
	TArray<FString> GetWorldPipeline() const;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Default transition configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	FKhaaosTransitionConfig DefaultConfig;

	/** World pipeline names in order. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Transition")
	TArray<FString> WorldPipelineNames;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when a world transition starts. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Transition")
	FOnWorldTransitionStarted OnWorldTransitionStarted;

	/** Broadcast when a world transition completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Transition")
	FOnWorldTransitionCompleted OnWorldTransitionCompleted;

	// ─── Tick ────────────────────────────────────────────────────────────────

	virtual void TickComponent(float DeltaTime, ELevelTick TickType,
		FActorComponentTickFunction* ThisTickFunction) override;

private:

	/** Active transitions keyed by target world ID. */
	TMap<int32, FKhaaosWorldTransitionState> ActiveTransitions;

	/** Transition configs keyed by target world ID. */
	TMap<int32, FKhaaosTransitionConfig> TransitionConfigs;

	/** Current count of concurrent transitions. */
	int32 CurrentConcurrentCount = 0;

	/** Validate that a world ID is within the pipeline range. */
	bool IsValidWorldId(int32 WorldId) const;

	/** Advance transition phase for a world. */
	void AdvanceTransitionPhase(int32 WorldId, float DeltaTime);
};
