// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/KhaaosGameState.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosGameState::AKhaaosGameState()
{
        // ── Default replicated state ──
        MatchPhase      = EMatchPhase::Lobby;
        RemainingTime   = 0.0f;
        PlayersAlive    = 0;
        TotalPlayers    = 0;
        WinnerId        = TEXT("");

        ZoneCenter      = FVector2D::ZeroVector;
        ZoneRadius      = 100.0f;
        TargetRadius    = 100.0f;
        bIsShrinking    = false;
        ZonePhase       = 0;
        TotalZonePhases = 5;
        ZoneDamagePerTick = 0.0f;
}

// ─── RepNotify Callbacks ────────────────────────────────────────────────────────

void AKhaaosGameState::OnRep_RemainingTime()
{
        // Client-side UI sync when remaining time updates
}

void AKhaaosGameState::OnRep_PlayersAlive()
{
        // Client-side UI sync for alive count
}

void AKhaaosGameState::OnRep_WinnerId()
{
        // Client-side winner announcement
}

void AKhaaosGameState::OnRep_ZoneCenter()
{
        // Client-side zone ring visual update
        OnZoneUpdated.Broadcast();
}

void AKhaaosGameState::OnRep_ZoneRadius()
{
        // Client-side zone ring visual update
        OnZoneUpdated.Broadcast();
}

// ─── Server Authority ───────────────────────────────────────────────────────────

void AKhaaosGameState::SetMatchPhase(EMatchPhase NewPhase)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        EMatchPhase OldPhase = MatchPhase;
        MatchPhase = NewPhase;

        if (OldPhase != NewPhase)
        {
                OnMatchPhaseChanged.Broadcast(OldPhase, NewPhase);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameState: Match phase changed %d → %d"),
                        static_cast<int32>(OldPhase), static_cast<int32>(NewPhase));
        }
}

void AKhaaosGameState::SetRemainingTime(float NewTime)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        RemainingTime = FMath::Max(0.0f, NewTime);
}

void AKhaaosGameState::UpdateZoneState(const FVector2D& NewCenter, float NewRadius, float NewTargetRadius, bool bShrinking, int32 Phase, float DamagePerTick)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        ZoneCenter = NewCenter;
        ZoneRadius = NewRadius;
        TargetRadius = NewTargetRadius;
        bIsShrinking = bShrinking ? 1 : 0;
        ZonePhase = Phase;
        ZoneDamagePerTick = DamagePerTick;

        OnZoneUpdated.Broadcast();
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosGameState, MatchPhase, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosGameState, RemainingTime, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosGameState, PlayersAlive, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosGameState, TotalPlayers);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosGameState, WinnerId, COND_None, REPNOTIFY_Always);

        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosGameState, ZoneCenter, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosGameState, ZoneRadius, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosGameState, TargetRadius);
        DOREPLIFETIME(AKhaaosGameState, bIsShrinking);
        DOREPLIFETIME(AKhaaosGameState, ZonePhase);
        DOREPLIFETIME(AKhaaosGameState, TotalZonePhases);
        DOREPLIFETIME(AKhaaosGameState, ZoneDamagePerTick);
}
