// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Revive/KhaaosReviveSystem.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

UKhaaosReviveSystemComponent::UKhaaosReviveSystemComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    DownedTimeLimit = 60.0f;
    ReviveInteractionTime = 5.0f;
    ReviveStationCooldown = 120.0f;
    ReviveStationRadius = 300.0f;
}

void UKhaaosReviveSystemComponent::DownPlayer(const FString& PlayerId)
{
    if (PlayerId.IsEmpty()) return;

    PlayerReviveStates.Add(PlayerId, EKhaaosReviveState::Downed);
    DownedTimers.Add(PlayerId, DownedTimeLimit);

    SyncReplicatedPlayerStates();

    OnPlayerDowned.Broadcast(PlayerId);
    UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::DownPlayer - %s downed (%.0fs to bleed out)"),
        *PlayerId, DownedTimeLimit);
}

void UKhaaosReviveSystemComponent::RevivePlayer(const FString& PlayerId, const FString& ReviverId)
{
    EKhaaosReviveState* State = PlayerReviveStates.Find(PlayerId);
    if (!State || (*State != EKhaaosReviveState::Downed && *State != EKhaaosReviveState::Revivable)) return;

    *State = EKhaaosReviveState::Alive;
    DownedTimers.Remove(PlayerId);

    SyncReplicatedPlayerStates();

    OnPlayerRevived.Broadcast(PlayerId);
    UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::RevivePlayer - %s revived by %s"), *PlayerId, *ReviverId);
}

void UKhaaosReviveSystemComponent::KillDownedPlayer(const FString& PlayerId)
{
    EKhaaosReviveState* State = PlayerReviveStates.Find(PlayerId);
    if (!State) return;

    *State = EKhaaosReviveState::Dead;
    DownedTimers.Remove(PlayerId);

    SyncReplicatedPlayerStates();

    UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::KillDownedPlayer - %s bled out"), *PlayerId);
}

bool UKhaaosReviveSystemComponent::UseReviveStation(FName StationID, const FString& RequestingPlayerId, const FString& TargetPlayerId)
{
    for (FKhaaosReviveStation& Station : ReviveStations)
    {
        if (Station.StationID == StationID)
        {
            if (!Station.bIsActive || Station.CooldownRemaining > 0.0f) return false;

            Station.bIsActive = false;
            Station.CooldownRemaining = ReviveStationCooldown;

            RevivePlayer(TargetPlayerId, RequestingPlayerId);
            OnReviveStationUsed.Broadcast(StationID);

            UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::UseReviveStation - %s rebooted %s at %s"),
                *RequestingPlayerId, *TargetPlayerId, *StationID.ToString());
            return true;
        }
    }
    return false;
}

EKhaaosReviveState UKhaaosReviveSystemComponent::GetReviveState(const FString& PlayerId) const
{
    const EKhaaosReviveState* State = PlayerReviveStates.Find(PlayerId);
    return State ? *State : EKhaaosReviveState::Alive;
}

// ─── Replication ────────────────────────────────────────────────────────────────

void UKhaaosReviveSystemComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME_CONDITION(UKhaaosReviveSystemComponent, ReviveStations, COND_None);
    DOREPLIFETIME_CONDITION(UKhaaosReviveSystemComponent, ReplicatedPlayerStates, COND_None);
}

void UKhaaosReviveSystemComponent::OnRep_PlayerReviveStates()
{
    // Rebuild the PlayerReviveStates map from the replicated array on client
    PlayerReviveStates.Empty();
    for (const FKhaaosPlayerRevivePair& Pair : ReplicatedPlayerStates)
    {
        PlayerReviveStates.Add(Pair.PlayerId, Pair.State);
    }
}

void UKhaaosReviveSystemComponent::SyncReplicatedPlayerStates()
{
    // Server-side: mirror the TMap into the replicated TArray
    if (GetOwnerRole() != ROLE_Authority) return;

    ReplicatedPlayerStates.Empty(PlayerReviveStates.Num());
    for (const auto& Pair : PlayerReviveStates)
    {
        FKhaaosPlayerRevivePair Entry;
        Entry.PlayerId = Pair.Key;
        Entry.State    = Pair.Value;
        ReplicatedPlayerStates.Add(Entry);
    }
}

void UKhaaosReviveSystemComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority) return;

    // Tick downed player bleed-out timers
    TArray<FString> BleedOutPlayers;
    for (auto& Pair : DownedTimers)
    {
        Pair.Value -= DeltaTime;
        if (Pair.Value <= 0.0f)
        {
            BleedOutPlayers.Add(Pair.Key);
        }
    }

    for (const FString& PlayerId : BleedOutPlayers)
    {
        KillDownedPlayer(PlayerId);
    }

    // Tick revive station cooldowns
    for (FKhaaosReviveStation& Station : ReviveStations)
    {
        if (Station.CooldownRemaining > 0.0f)
        {
            Station.CooldownRemaining -= DeltaTime;
            if (Station.CooldownRemaining <= 0.0f)
            {
                Station.bIsActive = true;
                Station.CooldownRemaining = 0.0f;
            }
        }
    }
}
