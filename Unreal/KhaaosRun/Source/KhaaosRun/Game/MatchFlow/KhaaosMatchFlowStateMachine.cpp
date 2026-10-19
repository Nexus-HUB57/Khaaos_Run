// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/MatchFlow/KhaaosMatchFlowStateMachine.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosMatchFlowStateMachine::UKhaaosMatchFlowStateMachine()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;

    CurrentState       = EKhaaosMatchFlowState::Lobby;
    StateTimeElapsed   = 0.0f;
    PlayersAlive       = 0;
    LastLandingTimestamp = 0.0f;
    bAllPlayersLanded  = false;
    bFirstShotFired    = false;

    EndgamePlayerThreshold   = 10;
    LootingToCombatGraceSeconds = 30.0f;
    MinPlayersToStart        = 2;

    InitializeDefaultTransitions();
}

// ─── Default Transitions & State Configs ────────────────────────────────────────

void UKhaaosMatchFlowStateMachine::InitializeDefaultTransitions()
{
    Transitions.Empty(7);

    // Lobby → Deploy: requires minimum players
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::Lobby;
        T.ToState       = EKhaaosMatchFlowState::Deploy;
        T.Condition     = FName("MinPlayersReady");
        T.MinPlayers    = MinPlayersToStart;
        T.MaxTimeSeconds = 300.0f; // 5 min lobby timeout
        Transitions.Add(T);
    }

    // Deploy → Parachute: players enter the aircraft
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::Deploy;
        T.ToState       = EKhaaosMatchFlowState::Parachute;
        T.Condition     = FName("DeployComplete");
        T.MinPlayers    = 1;
        T.MaxTimeSeconds = 30.0f; // 30s deploy window
        Transitions.Add(T);
    }

    // Parachute → Looting: all players have landed
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::Parachute;
        T.ToState       = EKhaaosMatchFlowState::Looting;
        T.Condition     = FName("AllPlayersLanded");
        T.MinPlayers    = 1;
        T.MaxTimeSeconds = 180.0f; // 3 min max parachute time
        Transitions.Add(T);
    }

    // Looting → Combat: first shot fired or grace period expires
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::Looting;
        T.ToState       = EKhaaosMatchFlowState::Combat;
        T.Condition     = FName("FirstShotOrGraceExpired");
        T.MinPlayers    = 1;
        T.MaxTimeSeconds = 60.0f; // Fallback max
        Transitions.Add(T);
    }

    // Combat → Endgame: players alive <= threshold
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::Combat;
        T.ToState       = EKhaaosMatchFlowState::Endgame;
        T.Condition     = FName("PlayersBelowEndgameThreshold");
        T.MinPlayers    = 1;
        T.MaxTimeSeconds = 0.0f; // No timeout — condition-driven
        Transitions.Add(T);
    }

    // Endgame → WorldTransition: match ends or winner determined
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::Endgame;
        T.ToState       = EKhaaosMatchFlowState::WorldTransition;
        T.Condition     = FName("MatchEndOrWin");
        T.MinPlayers    = 1;
        T.MaxTimeSeconds = 600.0f; // 10 min endgame max
        Transitions.Add(T);
    }

    // WorldTransition → Results: transition sequence completes
    {
        FKhaaosMatchFlowTransition T;
        T.FromState     = EKhaaosMatchFlowState::WorldTransition;
        T.ToState       = EKhaaosMatchFlowState::Results;
        T.Condition     = FName("WorldTransitionComplete");
        T.MinPlayers    = 1;
        T.MaxTimeSeconds = 30.0f; // 30s max for world transition
        Transitions.Add(T);
    }

    // ─── State Configurations ──────────────────────────────────────────────

    StateConfigs.Empty(8);

    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Lobby");
        C.DurationSeconds = 0.0f; // Indefinite — waits for players
        C.bAutoAdvanceOnTimeout = false;
        StateConfigs.Add(EKhaaosMatchFlowState::Lobby, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Deploy");
        C.DurationSeconds = 15.0f; // 15s deploy cinematic
        C.bAutoAdvanceOnTimeout = true;
        StateConfigs.Add(EKhaaosMatchFlowState::Deploy, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Parachute");
        C.DurationSeconds = 0.0f; // Waits for all players to land
        C.bAutoAdvanceOnTimeout = false;
        StateConfigs.Add(EKhaaosMatchFlowState::Parachute, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Looting");
        C.DurationSeconds = 0.0f; // Waits for first shot or grace
        C.bAutoAdvanceOnTimeout = false;
        StateConfigs.Add(EKhaaosMatchFlowState::Looting, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Combat");
        C.DurationSeconds = 0.0f; // Indefinite — condition-driven
        C.bAutoAdvanceOnTimeout = false;
        StateConfigs.Add(EKhaaosMatchFlowState::Combat, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Endgame");
        C.DurationSeconds = 0.0f; // Condition-driven
        C.bAutoAdvanceOnTimeout = false;
        StateConfigs.Add(EKhaaosMatchFlowState::Endgame, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("World Transition");
        C.DurationSeconds = 10.0f; // 10s world transition cinematic
        C.bAutoAdvanceOnTimeout = true;
        StateConfigs.Add(EKhaaosMatchFlowState::WorldTransition, C);
    }
    {
        FKhaaosMatchFlowStateConfig C;
        C.DisplayName = TEXT("Results");
        C.DurationSeconds = 30.0f; // 30s results screen
        C.bAutoAdvanceOnTimeout = false;
        StateConfigs.Add(EKhaaosMatchFlowState::Results, C);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine::InitializeDefaultTransitions - %d transitions, %d state configs"),
        Transitions.Num(), StateConfigs.Num());
}

// ─── Condition System ──────────────────────────────────────────────────────────

void UKhaaosMatchFlowStateMachine::RegisterCondition(FName ConditionName, TFunction<bool()> Resolver)
{
    ConditionResolvers.Add(ConditionName, MoveTemp(Resolver));
    UE_LOG(LogKhaaosRun, Verbose, TEXT("MatchFlowStateMachine::RegisterCondition - Registered: %s"), *ConditionName.ToString());
}

void UKhaaosMatchFlowStateMachine::NotifyEvent(FName EventName)
{
    FiredEvents.Add(EventName);

    if (EventName == FName("FirstShotFired"))
    {
        bFirstShotFired = true;
        UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine::NotifyEvent - FirstShotFired"));
    }
    else if (EventName == FName("AllPlayersLanded"))
    {
        bAllPlayersLanded = true;
        LastLandingTimestamp = StateTimeElapsed;
        UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine::NotifyEvent - AllPlayersLanded at elapsed=%.2f"), StateTimeElapsed);
    }
    else if (EventName == FName("WorldTransitionComplete"))
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine::NotifyEvent - WorldTransitionComplete"));
    }
    else if (EventName == FName("MatchEndOrWin"))
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine::NotifyEvent - MatchEndOrWin"));
    }
    else
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("MatchFlowStateMachine::NotifyEvent - %s"), *EventName.ToString());
    }
}

// ─── Player Count ──────────────────────────────────────────────────────────────

void UKhaaosMatchFlowStateMachine::SetPlayersAlive(int32 Count)
{
    PlayersAlive = FMath::Max(0, Count);
}

// ─── Transition Logic ──────────────────────────────────────────────────────────

bool UKhaaosMatchFlowStateMachine::CanTransition(EKhaaosMatchFlowState ToState) const
{
    // Cannot transition to the same state
    if (ToState == CurrentState)
    {
        return false;
    }

    // Find the transition definition
    const FKhaaosMatchFlowTransition* TransDef = FindTransition(CurrentState, ToState);
    if (!TransDef)
    {
        return false;
    }

    // Check minimum players
    if (PlayersAlive < TransDef->MinPlayers)
    {
        return false;
    }

    // Check named condition via resolver
    if (TransDef->Condition != NAME_None)
    {
        const TFunction<bool()>* Resolver = ConditionResolvers.Find(TransDef->Condition);
        if (Resolver && *Resolver)
        {
            if (!(*Resolver)())
            {
                return false;
            }
        }
        // If no resolver registered, condition is considered unresolved (blocking)
        // unless the event has been fired directly
        else if (!FiredEvents.Contains(TransDef->Condition))
        {
            // Fall through to event-based check for known conditions
            // These are handled in EvaluateAutoTransitions
        }
    }

    return true;
}

bool UKhaaosMatchFlowStateMachine::TransitionTo(EKhaaosMatchFlowState NewState)
{
    // Server-authoritative: only authority may drive transitions
    if (GetOwnerRole() != ROLE_Authority)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("MatchFlowStateMachine::TransitionTo - Rejected: non-authority attempted transition"));
        return false;
    }

    // Cannot transition to the same state
    if (NewState == CurrentState)
    {
        return false;
    }

    // Find the transition definition
    const FKhaaosMatchFlowTransition* TransDef = FindTransition(CurrentState, NewState);
    if (!TransDef)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("MatchFlowStateMachine::TransitionTo - No transition defined: %s → %s"),
            *GetStateDisplayName(CurrentState), *GetStateDisplayName(NewState));
        return false;
    }

    // Check minimum players
    if (PlayersAlive < TransDef->MinPlayers)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("MatchFlowStateMachine::TransitionTo - Insufficient players: %d < %d"),
            PlayersAlive, TransDef->MinPlayers);
        return false;
    }

    // Check named condition via resolver
    if (TransDef->Condition != NAME_None)
    {
        const TFunction<bool()>* Resolver = ConditionResolvers.Find(TransDef->Condition);
        if (Resolver && *Resolver)
        {
            if (!(*Resolver)())
            {
                UE_LOG(LogKhaaosRun, Warning, TEXT("MatchFlowStateMachine::TransitionTo - Condition not satisfied: %s"),
                    *TransDef->Condition.ToString());
                return false;
            }
        }
    }

    // ─── Execute Transition ────────────────────────────────────────────────

    EKhaaosMatchFlowState OldState = CurrentState;

    // Broadcast exit
    OnMatchPhaseExit.Broadcast(OldState);

    // Update state
    CurrentState = NewState;
    StateTimeElapsed = 0.0f;

    // Broadcast enter
    OnMatchPhaseEnter.Broadcast(NewState);

    // Broadcast state changed
    OnMatchFlowStateChanged.Broadcast(OldState, NewState);

    UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine::TransitionTo - %s → %s (Players=%d)"),
        *GetStateDisplayName(OldState), *GetStateDisplayName(NewState), PlayersAlive);

    return true;
}

const FKhaaosMatchFlowTransition* UKhaaosMatchFlowStateMachine::FindTransition(
    EKhaaosMatchFlowState From, EKhaaosMatchFlowState To) const
{
    for (const FKhaaosMatchFlowTransition& T : Transitions)
    {
        if (T.FromState == From && T.ToState == To)
        {
            return &T;
        }
    }
    return nullptr;
}

// ─── Auto-Transition Evaluation ────────────────────────────────────────────────

void UKhaaosMatchFlowStateMachine::EvaluateAutoTransitions()
{
    switch (CurrentState)
    {
        case EKhaaosMatchFlowState::Lobby:
        {
            // Auto-transition Lobby → Deploy when min players ready
            if (PlayersAlive >= MinPlayersToStart)
            {
                // Check if a resolver exists; otherwise use player count alone
                const TFunction<bool()>* Resolver = ConditionResolvers.Find(FName("MinPlayersReady"));
                if (!Resolver || (Resolver && *Resolver && (*Resolver)()))
                {
                    TransitionTo(EKhaaosMatchFlowState::Deploy);
                }
            }
            break;
        }

        case EKhaaosMatchFlowState::Deploy:
        {
            // Deploy auto-advances on timeout (handled in TickComponent via StateConfig)
            // Also check explicit event
            if (FiredEvents.Contains(FName("DeployComplete")))
            {
                TransitionTo(EKhaaosMatchFlowState::Parachute);
            }
            break;
        }

        case EKhaaosMatchFlowState::Parachute:
        {
            // All players landed → Looting
            if (bAllPlayersLanded || FiredEvents.Contains(FName("AllPlayersLanded")))
            {
                TransitionTo(EKhaaosMatchFlowState::Looting);
            }
            break;
        }

        case EKhaaosMatchFlowState::Looting:
        {
            // Looting → Combat: first shot fired OR grace period after landing
            if (bFirstShotFired || FiredEvents.Contains(FName("FirstShotFired")))
            {
                TransitionTo(EKhaaosMatchFlowState::Combat);
            }
            else if (bAllPlayersLanded && (StateTimeElapsed - LastLandingTimestamp) >= LootingToCombatGraceSeconds)
            {
                UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine - Looting→Combat: grace period expired (%.1fs)"),
                    LootingToCombatGraceSeconds);
                TransitionTo(EKhaaosMatchFlowState::Combat);
            }
            break;
        }

        case EKhaaosMatchFlowState::Combat:
        {
            // Combat → Endgame: players alive <= threshold
            if (PlayersAlive <= EndgamePlayerThreshold && PlayersAlive > 0)
            {
                UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine - Combat→Endgame: players alive %d <= threshold %d"),
                    PlayersAlive, EndgamePlayerThreshold);
                TransitionTo(EKhaaosMatchFlowState::Endgame);
            }
            break;
        }

        case EKhaaosMatchFlowState::Endgame:
        {
            // Endgame → WorldTransition on match end or win
            if (FiredEvents.Contains(FName("MatchEndOrWin")) || PlayersAlive <= 1)
            {
                if (PlayersAlive <= 1)
                {
                    UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine - Endgame→WorldTransition: last player standing"));
                }
                TransitionTo(EKhaaosMatchFlowState::WorldTransition);
            }
            break;
        }

        case EKhaaosMatchFlowState::WorldTransition:
        {
            // WorldTransition → Results after world transition completes
            if (FiredEvents.Contains(FName("WorldTransitionComplete")))
            {
                TransitionTo(EKhaaosMatchFlowState::Results);
            }
            break;
        }

        case EKhaaosMatchFlowState::Results:
        {
            // Terminal state — no auto-transitions
            break;
        }
    }
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosMatchFlowStateMachine::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Server-authoritative: only authority evaluates transitions
    if (GetOwnerRole() != ROLE_Authority)
    {
        return;
    }

    // Advance state timer
    StateTimeElapsed += DeltaTime;

    // Check timeout-based auto-advance
    const FKhaaosMatchFlowStateConfig* Config = StateConfigs.Find(CurrentState);
    if (Config && Config->bAutoAdvanceOnTimeout && Config->DurationSeconds > 0.0f)
    {
        if (StateTimeElapsed >= Config->DurationSeconds)
        {
            // Determine next state from transition table
            for (const FKhaaosMatchFlowTransition& T : Transitions)
            {
                if (T.FromState == CurrentState)
                {
                    UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine - Auto-advance: %s timeout (%.1fs)"),
                        *GetStateDisplayName(CurrentState), Config->DurationSeconds);
                    TransitionTo(T.ToState);
                    break;
                }
            }
            return;
        }
    }

    // Check max-time constraint on current state transitions
    for (const FKhaaosMatchFlowTransition& T : Transitions)
    {
        if (T.FromState == CurrentState && T.MaxTimeSeconds > 0.0f)
        {
            if (StateTimeElapsed >= T.MaxTimeSeconds)
            {
                UE_LOG(LogKhaaosRun, Log, TEXT("MatchFlowStateMachine - MaxTime exceeded for %s→%s (%.1fs)"),
                    *GetStateDisplayName(T.FromState), *GetStateDisplayName(T.ToState), T.MaxTimeSeconds);
                TransitionTo(T.ToState);
                return;
            }
        }
    }

    // Evaluate condition-based auto-transitions
    EvaluateAutoTransitions();
}

// ─── Query Helpers ──────────────────────────────────────────────────────────────

float UKhaaosMatchFlowStateMachine::GetStateTimeRemaining() const
{
    const FKhaaosMatchFlowStateConfig* Config = StateConfigs.Find(CurrentState);
    if (Config && Config->DurationSeconds > 0.0f)
    {
        return FMath::Max(0.0f, Config->DurationSeconds - StateTimeElapsed);
    }
    return 0.0f;
}

FKhaaosMatchFlowStateConfig UKhaaosMatchFlowStateMachine::GetStateConfig(EKhaaosMatchFlowState State) const
{
    const FKhaaosMatchFlowStateConfig* Config = StateConfigs.Find(State);
    if (Config)
    {
        return *Config;
    }
    return FKhaaosMatchFlowStateConfig();
}

FString UKhaaosMatchFlowStateMachine::GetStateDisplayName(EKhaaosMatchFlowState State)
{
    switch (State)
    {
        case EKhaaosMatchFlowState::Lobby:           return TEXT("Lobby");
        case EKhaaosMatchFlowState::Deploy:          return TEXT("Deploy");
        case EKhaaosMatchFlowState::Parachute:       return TEXT("Parachute");
        case EKhaaosMatchFlowState::Looting:         return TEXT("Looting");
        case EKhaaosMatchFlowState::Combat:          return TEXT("Combat");
        case EKhaaosMatchFlowState::Endgame:         return TEXT("Endgame");
        case EKhaaosMatchFlowState::WorldTransition: return TEXT("WorldTransition");
        case EKhaaosMatchFlowState::Results:         return TEXT("Results");
        default:                                     return TEXT("Unknown");
    }
}
