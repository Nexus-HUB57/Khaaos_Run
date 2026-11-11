// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Revive/KhaaosReviveSystem.h"
#include "KhaaosRun.h"
#include "Game/KhaaosGameMode.h"
#include "Player/KhaaosCharacter.h"
#include "Player/KhaaosPlayerState.h"

#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Net/UnrealNetwork.h"

namespace
{
    bool MatchesPlayerId(const AKhaaosPlayerState* PlayerState, const FString& PlayerId)
    {
        return PlayerState && (PlayerState->GetPlayerName() == PlayerId ||
            PlayerState->GetUniqueId().ToString() == PlayerId);
    }

    AKhaaosPlayerState* FindPlayerStateById(UWorld* World, const FString& PlayerId)
    {
        if (!World || PlayerId.IsEmpty()) return nullptr;

        for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
        {
            APlayerController* PlayerController = It->Get();
            AKhaaosPlayerState* PlayerState = PlayerController
                ? Cast<AKhaaosPlayerState>(PlayerController->PlayerState)
                : nullptr;
            if (MatchesPlayerId(PlayerState, PlayerId)) return PlayerState;
        }
        return nullptr;
    }

    AKhaaosCharacter* FindCharacterById(UWorld* World, const FString& PlayerId)
    {
        if (!World || PlayerId.IsEmpty()) return nullptr;

        for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
        {
            APlayerController* PlayerController = It->Get();
            AKhaaosPlayerState* PlayerState = PlayerController
                ? Cast<AKhaaosPlayerState>(PlayerController->PlayerState)
                : nullptr;
            if (MatchesPlayerId(PlayerState, PlayerId))
            {
                return Cast<AKhaaosCharacter>(PlayerController->GetPawn());
            }
        }
        return nullptr;
    }
}

UKhaaosReviveSystemComponent::UKhaaosReviveSystemComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    DownedTimeLimit = 7.0f;
    ReviveInteractionTime = 5.0f;
    ReviveStationCooldown = 120.0f;
    ReviveStationRadius = 300.0f;
}

void UKhaaosReviveSystemComponent::DownPlayer(const FString& PlayerId)
{
    if (PlayerId.IsEmpty() || GetReviveState(PlayerId) == EKhaaosReviveState::Downed) return;

    if (GetOwnerRole() == ROLE_Authority)
    {
        if (AKhaaosPlayerState* PlayerState = FindPlayerStateById(GetWorld(), PlayerId))
        {
            PlayerState->StartDownedWindow(nullptr);
        }
    }

    PlayerReviveStates.Add(PlayerId, EKhaaosReviveState::Downed);
    SyncReplicatedPlayerStates();
    OnPlayerDowned.Broadcast(PlayerId);
    UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::DownPlayer - %s downed (%.0fs to bleed out)"),
        *PlayerId, DownedTimeLimit);
}

void UKhaaosReviveSystemComponent::RevivePlayer(const FString& PlayerId, const FString& ReviverId)
{
    const EKhaaosReviveState CurrentState = GetReviveState(PlayerId);
    if (CurrentState != EKhaaosReviveState::Downed && CurrentState != EKhaaosReviveState::Revivable) return;

    if (GetOwnerRole() == ROLE_Authority)
    {
        if (AKhaaosPlayerState* PlayerState = FindPlayerStateById(GetWorld(), PlayerId))
        {
            if (AKhaaosCharacter* Character = FindCharacterById(GetWorld(), PlayerId))
            {
                Character->Heal(30.0f);
                if (PlayerState->IsDowned()) PlayerState->Heal(30.0f);
            }
            else
            {
                PlayerState->Heal(30.0f);
            }

            // Do not report a successful revive if the authoritative recovery window remains active.
            if (PlayerState->IsDowned()) return;
        }
    }

    PlayerReviveStates.Add(PlayerId, EKhaaosReviveState::Alive);
    SyncReplicatedPlayerStates();
    OnPlayerRevived.Broadcast(PlayerId);
    UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::RevivePlayer - %s revived by %s"), *PlayerId, *ReviverId);
}

void UKhaaosReviveSystemComponent::KillDownedPlayer(const FString& PlayerId)
{
    const EKhaaosReviveState CurrentState = GetReviveState(PlayerId);
    if (CurrentState != EKhaaosReviveState::Downed && CurrentState != EKhaaosReviveState::Revivable) return;

    if (GetOwnerRole() == ROLE_Authority)
    {
        if (AKhaaosPlayerState* PlayerState = FindPlayerStateById(GetWorld(), PlayerId))
        {
            // The component never owns or advances a second timer; the PlayerState deadline is canonical.
            if (PlayerState->GetDownedTimeRemaining() > 0.0f) return;
            PlayerState->FinalizeDownedTimeout();
            if (PlayerState->PlayerStatus == EPlayerStatus::Vivo) return;
        }
    }

    PlayerReviveStates.Add(PlayerId, EKhaaosReviveState::Dead);
    SyncReplicatedPlayerStates();
    UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::KillDownedPlayer - %s bled out"), *PlayerId);
}

bool UKhaaosReviveSystemComponent::UseReviveStation(FName StationID, const FString& RequestingPlayerId, const FString& TargetPlayerId)
{
    if (GetOwnerRole() != ROLE_Authority) return false;

    for (FKhaaosReviveStation& Station : ReviveStations)
    {
        if (Station.StationID != StationID) continue;
        if (!Station.bIsActive || Station.CooldownRemaining > 0.0f) return false;

        const EKhaaosReviveState TargetState = GetReviveState(TargetPlayerId);
        if (TargetState != EKhaaosReviveState::Downed && TargetState != EKhaaosReviveState::Revivable) return false;
        RevivePlayer(TargetPlayerId, RequestingPlayerId);
        if (GetReviveState(TargetPlayerId) != EKhaaosReviveState::Alive) return false;

        Station.bIsActive = false;
        Station.CooldownRemaining = ReviveStationCooldown;
        OnReviveStationUsed.Broadcast(StationID);
        UE_LOG(LogKhaaosRun, Log, TEXT("ReviveSystem::UseReviveStation - %s rebooted %s at %s"),
            *RequestingPlayerId, *TargetPlayerId, *StationID.ToString());
        return true;
    }
    return false;
}

EKhaaosReviveState UKhaaosReviveSystemComponent::GetReviveState(const FString& PlayerId) const
{
    if (AKhaaosPlayerState* PlayerState = FindPlayerStateById(GetWorld(), PlayerId))
    {
        if (PlayerState->PlayerStatus != EPlayerStatus::Vivo) return EKhaaosReviveState::Dead;
        return PlayerState->IsDowned() ? EKhaaosReviveState::Downed : EKhaaosReviveState::Alive;
    }

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
    // Rebuild the compatibility projection from the replicated array on clients.
    PlayerReviveStates.Empty();
    for (const FKhaaosPlayerRevivePair& Pair : ReplicatedPlayerStates)
    {
        PlayerReviveStates.Add(Pair.PlayerId, Pair.State);
    }
}

void UKhaaosReviveSystemComponent::SyncReplicatedPlayerStates()
{
    if (GetOwnerRole() != ROLE_Authority) return;

    ReplicatedPlayerStates.Empty(PlayerReviveStates.Num());
    for (const auto& Pair : PlayerReviveStates)
    {
        FKhaaosPlayerRevivePair Entry;
        Entry.PlayerId = Pair.Key;
        Entry.State = Pair.Value;
        ReplicatedPlayerStates.Add(Entry);
    }
}

void UKhaaosReviveSystemComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (GetOwnerRole() != ROLE_Authority) return;

    // Keep the legacy replicated map as a projection of the PlayerState, never as a second authority.
    bool bStateChanged = false;
    for (auto& Pair : PlayerReviveStates)
    {
        AKhaaosPlayerState* PlayerState = FindPlayerStateById(GetWorld(), Pair.Key);
        if (!PlayerState) continue;

        const EKhaaosReviveState AuthoritativeState = PlayerState->PlayerStatus != EPlayerStatus::Vivo
            ? EKhaaosReviveState::Dead
            : (PlayerState->IsDowned() ? EKhaaosReviveState::Downed : EKhaaosReviveState::Alive);
        if (Pair.Value != AuthoritativeState)
        {
            Pair.Value = AuthoritativeState;
            bStateChanged = true;
            if (AuthoritativeState == EKhaaosReviveState::Alive)
            {
                OnPlayerRevived.Broadcast(Pair.Key);
            }
        }
    }
    if (bStateChanged) SyncReplicatedPlayerStates();

    // Revive station cooldowns are independent resources; bleed-out is ticked only by PlayerState.
    for (FKhaaosReviveStation& Station : ReviveStations)
    {
        if (Station.CooldownRemaining <= 0.0f) continue;
        Station.CooldownRemaining -= DeltaTime;
        if (Station.CooldownRemaining <= 0.0f)
        {
            Station.bIsActive = true;
            Station.CooldownRemaining = 0.0f;
        }
    }
}
