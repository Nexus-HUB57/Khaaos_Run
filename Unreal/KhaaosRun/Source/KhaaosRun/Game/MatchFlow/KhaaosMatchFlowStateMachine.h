// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosMatchFlowStateMachine.generated.h"

// ─── Match Flow State Enum ────────────────────────────────────────────────────

/** Complete match lifecycle states for the Khaaos Run battle royale.
 *  Lobby → Deploy → Parachute → Looting → Combat → Endgame → WorldTransition → Results
 *  Each state has configurable duration, entry/exit delegates, and transition conditions.
 *  Server-authoritative: only the dedicated server may drive state transitions. */
UENUM(BlueprintType)
enum class EKhaaosMatchFlowState : uint8
{
    Lobby            UMETA(DisplayName = "LOBBY"),
    Deploy           UMETA(DisplayName = "DEPLOY"),
    Parachute        UMETA(DisplayName = "PARACHUTE"),
    Looting          UMETA(DisplayName = "LOOTING"),
    Combat           UMETA(DisplayName = "COMBAT"),
    Endgame          UMETA(DisplayName = "ENDGAME"),
    WorldTransition  UMETA(DisplayName = "WORLD_TRANSITION"),
    Results          UMETA(DisplayName = "RESULTS")
};

// ─── Transition Definition ────────────────────────────────────────────────────

/** Defines a valid state transition with gating conditions.
 *  A transition is allowed only when: MinPlayers threshold met AND
 *  condition FName resolved by the GameMode AND time constraints satisfied. */
USTRUCT(BlueprintType)
struct FKhaaosMatchFlowTransition
{
    GENERATED_BODY()

    /** Source state for this transition. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    EKhaaosMatchFlowState FromState = EKhaaosMatchFlowState::Lobby;

    /** Destination state for this transition. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    EKhaaosMatchFlowState ToState = EKhaaosMatchFlowState::Deploy;

    /** Named condition that must be satisfied (GameMode resolves via function map). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    FName Condition;

    /** Minimum number of players required for this transition to be valid. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    int32 MinPlayers = 1;

    /** Maximum time (seconds) the source state can persist before auto-transition. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    float MaxTimeSeconds = 0.0f;

    FKhaaosMatchFlowTransition()
        : FromState(EKhaaosMatchFlowState::Lobby)
        , ToState(EKhaaosMatchFlowState::Deploy)
        , Condition(NAME_None)
        , MinPlayers(1)
        , MaxTimeSeconds(0.0f)
    {}
};

// ─── State Configuration ──────────────────────────────────────────────────────

/** Per-state configuration: duration, display name, and whether it auto-advances. */
USTRUCT(BlueprintType)
struct FKhaaosMatchFlowStateConfig
{
    GENERATED_BODY()

    /** Display name for UI / debugging. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    FString DisplayName;

    /** Duration of this state in seconds (0 = indefinite, waits for conditions). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    float DurationSeconds = 0.0f;

    /** Whether the state automatically transitions when duration expires. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    uint8 bAutoAdvanceOnTimeout : 1;

    FKhaaosMatchFlowStateConfig()
        : DisplayName(TEXT("Unknown"))
        , DurationSeconds(0.0f)
        , bAutoAdvanceOnTimeout(false)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnMatchFlowStateChanged, EKhaaosMatchFlowState, OldState, EKhaaosMatchFlowState, NewState);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMatchPhaseEnter, EKhaaosMatchFlowState, EnteredState);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMatchPhaseExit, EKhaaosMatchFlowState, ExitedState);

/**
 * UKhaaosMatchFlowStateMachine
 *
 * PhD-Level match flow state machine for the complete Khaaos Run game loop.
 *
 * Architecture:
 *   - 8-state lifecycle: Lobby → Deploy → Parachute → Looting → Combat →
 *     Endgame → WorldTransition → Results
 *   - Transition table: each transition is gated by condition FName,
 *     minimum player count, and maximum time constraint.
 *   - Server-authoritative: only ROLE_Authority may call TransitionTo().
 *     Clients read replicated CurrentState for UI rendering.
 *   - TickComponent evaluates auto-transition rules:
 *     • Looting→Combat when first shot fired OR 30s after last player lands
 *     • Combat→Endgame when players alive <= threshold (default 10)
 *     • Endgame→WorldTransition on match end or win
 *     • WorldTransition→Results after world transition completes
 *   - Per-state duration & config: each state has a configurable timer
 *     and auto-advance behavior.
 *
 * Integration:
 *   - GameMode creates and owns this component
 *   - GameMode registers condition callbacks via ConditionMap
 *   - GameState replicates CurrentState to clients
 *   - UI binds OnMatchFlowStateChanged for phase banners
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosMatchFlowStateMachine : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosMatchFlowStateMachine();

    // ─── State Control ──────────────────────────────────────────────────────

    /** Attempt a state transition. Validates conditions before allowing.
     *  Returns true if transition was executed successfully. Server-only. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MatchFlow")
    bool TransitionTo(EKhaaosMatchFlowState NewState);

    /** Check whether a transition to the given state is currently valid. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MatchFlow")
    bool CanTransition(EKhaaosMatchFlowState ToState) const;

    /** Get the current match flow state. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MatchFlow")
    EKhaaosMatchFlowState GetCurrentState() const { return CurrentState; }

    /** Get time elapsed in the current state. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MatchFlow")
    float GetStateTimeElapsed() const { return StateTimeElapsed; }

    /** Get remaining time in the current state (0 if indefinite). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MatchFlow")
    float GetStateTimeRemaining() const;

    /** Get the state config for a given state. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MatchFlow")
    FKhaaosMatchFlowStateConfig GetStateConfig(EKhaaosMatchFlowState State) const;

    // ─── Condition System ───────────────────────────────────────────────────

    /** Register a condition resolver by name. The GameMode provides callbacks
     *  that the state machine evaluates to gate transitions. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MatchFlow")
    void RegisterCondition(FName ConditionName, TFunction<bool()> Resolver);

    /** Notify the state machine of an external event (e.g., "FirstShotFired"). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MatchFlow")
    void NotifyEvent(FName EventName);

    // ─── Player Count ───────────────────────────────────────────────────────

    /** Set the current number of alive players (called by GameMode each tick). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MatchFlow")
    void SetPlayersAlive(int32 Count);

    /** Get current players alive count. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MatchFlow")
    int32 GetPlayersAlive() const { return PlayersAlive; }

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Transition table defining all valid state transitions and their gates. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    TArray<FKhaaosMatchFlowTransition> Transitions;

    /** Per-state configuration map. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    TMap<EKhaaosMatchFlowState, FKhaaosMatchFlowStateConfig> StateConfigs;

    /** Players alive threshold to trigger Combat → Endgame. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    int32 EndgamePlayerThreshold = 10;

    /** Seconds after all players land before Looting → Combat auto-transitions. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    float LootingToCombatGraceSeconds = 30.0f;

    /** Minimum players to start the match (Lobby → Deploy). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    int32 MinPlayersToStart = 2;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|MatchFlow")
    FOnMatchFlowStateChanged OnMatchFlowStateChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|MatchFlow")
    FOnMatchPhaseEnter OnMatchPhaseEnter;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|MatchFlow")
    FOnMatchPhaseExit OnMatchPhaseExit;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Replicated State ───────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    EKhaaosMatchFlowState CurrentState = EKhaaosMatchFlowState::Lobby;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    float StateTimeElapsed = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|MatchFlow")
    int32 PlayersAlive = 0;

    // ─── Internal State ─────────────────────────────────────────────────────

    /** Condition resolver function map. */
    TMap<FName, TFunction<bool()>> ConditionResolvers;

    /** Set of events that have been fired this match. */
    TSet<FName> FiredEvents;

    /** Timestamp when the last player landed (for Looting→Combat timer). */
    float LastLandingTimestamp = 0.0f;

    /** Whether all players have landed. */
    uint8 bAllPlayersLanded : 1;

    /** Whether a shot has been fired this match. */
    uint8 bFirstShotFired : 1;

    // ─── Internal Methods ───────────────────────────────────────────────────

    /** Build default transition table and state configs. */
    void InitializeDefaultTransitions();

    /** Find the transition definition from current state to target. */
    const FKhaaosMatchFlowTransition* FindTransition(EKhaaosMatchFlowState From, EKhaaosMatchFlowState To) const;

    /** Evaluate automatic transition rules based on current state. */
    void EvaluateAutoTransitions();

    /** Get the UENUM display name string for a state. */
    static FString GetStateDisplayName(EKhaaosMatchFlowState State);
};
