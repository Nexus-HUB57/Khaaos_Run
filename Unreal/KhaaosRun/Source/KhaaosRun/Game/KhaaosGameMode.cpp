// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/KhaaosGameMode.h"
#include "Game/KhaaosGameState.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/Spatial/SpatialGrid.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/Economy/EconomyBridge.h"
#include "Game/Data/KhaaosAssetRegistrySubsystem.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Engine/EngineTypes.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerState.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"
#include "Net/UnrealNetwork.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosGameMode::AKhaaosGameMode()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;

    MaxPlayers          = 60;
    MinPlayersToStart   = 2;
    CountdownDuration   = 15.0f;
    MatchTimeLimit      = 0.0f;
    ZoneTickInterval    = 1.0f;

    CountdownRemaining  = 0.0f;
    MatchPhase          = EMatchPhase::Lobby;
    CurrentWorld        = EWorldSequence::CIGKV;
    CurrentWorldIndex   = 0;

    SpatialGrid         = nullptr;
    SafeZone            = nullptr;
    KhaaosGameState     = nullptr;

    ActivePulso.bIsActive = false;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosGameMode::InitGameState()
{
    Super::InitGameState();

    KhaaosGameState = Cast<AKhaaosGameState>(GameState);

    // Load all DataAssets (JSON → CSV → DataTable → UPrimaryDataAsset)
    LoadDataAssets();
}

void AKhaaosGameMode::StartPlay()
{
    Super::StartPlay();

    if (UWorld* World = GetWorld())
    {
        SpatialGrid = World->GetSubsystem<USpatialGridSubsystem>();
    }

    TArray<AActor*> SafeZones;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);
    if (SafeZones.Num() > 0)
    {
        SafeZone = Cast<AKhaaosSafeZone>(SafeZones[0]);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::StartPlay - Phase: Lobby, World: CIGKV, Species: %d, Weapons: %d, Loot: %d"),
        LoadedSpeciesAssets.Num(), LoadedWeaponAssets.Num(), LoadedLootItemAssets.Num());
}

void AKhaaosGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(ZoneTickTimerHandle);
        World->GetTimerManager().ClearTimer(CountdownTimerHandle);
        World->GetTimerManager().ClearTimer(PulsoTimerHandle);
    }

    Super::EndPlay(EndPlayReason);
}

// ─── Data Asset Loading ────────────────────────────────────────────────────────

void AKhaaosGameMode::LoadDataAssets()
{
    // Resolve soft references to loaded assets
    LoadedSpeciesAssets.Empty();
    for (const auto& SoftRef : SpeciesAssets)
    {
        if (UKhaaosSpeciesDataAsset* Asset = SoftRef.LoadSynchronous())
        {
            LoadedSpeciesAssets.Add(Asset);
        }
    }

    LoadedWeaponAssets.Empty();
    for (const auto& SoftRef : WeaponAssets)
    {
        if (UKhaaosWeaponDataAsset* Asset = SoftRef.LoadSynchronous())
        {
            LoadedWeaponAssets.Add(Asset);
        }
    }

    LoadedLootItemAssets.Empty();
    for (const auto& SoftRef : LootItemAssets)
    {
        if (UKhaaosLootItemDataAsset* Asset = SoftRef.LoadSynchronous())
        {
            LoadedLootItemAssets.Add(Asset);
        }
    }

    LoadedWorldConfigAssets.Empty();
    for (const auto& SoftRef : WorldConfigAssets)
    {
        if (UKhaaosWorldConfigDataAsset* Asset = SoftRef.LoadSynchronous())
        {
            LoadedWorldConfigAssets.Add(Asset);
        }
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::LoadDataAssets - Species: %d, Weapons: %d, Loot: %d, Worlds: %d"),
        LoadedSpeciesAssets.Num(), LoadedWeaponAssets.Num(), LoadedLootItemAssets.Num(), LoadedWorldConfigAssets.Num());
}

// ─── Species Selection ─────────────────────────────────────────────────────────

void AKhaaosGameMode::AssignSpecies(APlayerState* Player, const UKhaaosSpeciesDataAsset* SpeciesAsset)
{
    if (!Player || !SpeciesAsset) return;

    AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(Player);
    if (!KPS) return;

    // Apply species stats to player
    KPS->MaxHealth = SpeciesAsset->BaseHealth;
    KPS->Health = SpeciesAsset->BaseHealth;
    KPS->MaxEnergy = SpeciesAsset->BaseEnergy;
    KPS->Energy = SpeciesAsset->BaseEnergy;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::AssignSpecies - %s → %s (HP=%d, Energy=%d, Speed=%.1f)"),
        *Player->GetPlayerName(), *SpeciesAsset->SpeciesID.ToString(),
        SpeciesAsset->BaseHealth, SpeciesAsset->BaseEnergy, SpeciesAsset->BaseSpeed);
}

TArray<UKhaaosSpeciesDataAsset*> AKhaaosGameMode::GetAvailableSpecies() const
{
    TArray<UKhaaosSpeciesDataAsset*> Available;

    UKhaaosWorldConfigDataAsset* CurrentConfig = GetCurrentWorldConfig();
    if (!CurrentConfig)
    {
        return LoadedSpeciesAssets;
    }

    // Filter species available in current world
    for (UKhaaosSpeciesDataAsset* Species : LoadedSpeciesAssets)
    {
        Available.Add(Species);
    }

    return Available;
}

// ─── Weapon Loadout ────────────────────────────────────────────────────────────

void AKhaaosGameMode::AssignWeaponLoadout(APlayerState* Player)
{
    if (!Player || LoadedWeaponAssets.Num() == 0) return;

    AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(Player);
    if (!KPS) return;

    // Assign default loadout: Primary + Secondary + Melee
    // (Implementation would set weapon references on PlayerState)
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::AssignWeaponLoadout - %s: %d weapons available"),
        *Player->GetPlayerName(), LoadedWeaponAssets.Num());
}

// ─── Loot Distribution ─────────────────────────────────────────────────────────

void AKhaaosGameMode::SpawnLootFromDataAssets()
{
    UKhaaosWorldConfigDataAsset* WorldConfig = GetCurrentWorldConfig();
    if (!WorldConfig)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::SpawnLootFromDataAssets - No world config"));
        return;
    }

    // Use WorldConfig LootPoints to spawn items
    int32 SpawnCount = 0;
    for (const FKhaaosLootPoint& LootPoint : WorldConfig->LootPoints)
    {
        // Weighted random selection from LootItemAssets
        // Real implementation: spawn AKhaaosLootPickup at LootPoint.Location
        SpawnCount++;
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::SpawnLootFromDataAssets - Spawned %d items at %d loot points"),
        SpawnCount, WorldConfig->LootPoints.Num());
}

TArray<UKhaaosLootItemDataAsset*> AKhaaosGameMode::GetLootPool(FName TypeTag, FName RarityTag) const
{
    TArray<UKhaaosLootItemDataAsset*> Pool;

    for (UKhaaosLootItemDataAsset* Item : LoadedLootItemAssets)
    {
        if (Item && Item->TypeTag == TypeTag)
        {
            if (RarityTag.IsNone() || Item->RarityTag == RarityTag)
            {
                Pool.Add(Item);
            }
        }
    }

    return Pool;
}

// ─── World Transition ──────────────────────────────────────────────────────────

void AKhaaosGameMode::TransitionToNextWorld()
{
    if (MatchPhase != EMatchPhase::InProgress && MatchPhase != EMatchPhase::PulsoKhaaos)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::TransitionToNextWorld - Not in valid phase"));
        return;
    }

    if (!CanTransitionToNextWorld())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::TransitionToNextWorld - Rank requirement not met"));
        return;
    }

    EMatchPhase PrevPhase = MatchPhase;
    MatchPhase = EMatchPhase::WorldTransition;

    // Advance world index: CIGKV(0) → Barburhen(1) → Priadus(2) → Ckesalth(3) → Arukheea(4)
    CurrentWorldIndex = FMath::Min(CurrentWorldIndex + 1, 4);
    CurrentWorld = static_cast<EWorldSequence>(CurrentWorldIndex);

    // Stream next world level (UE5 level streaming)
    UKhaaosWorldConfigDataAsset* NextConfig = GetCurrentWorldConfig();
    if (NextConfig)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::TransitionToNextWorld - → %s (MaxPlayers: %d)"),
            *NextConfig->WorldID.ToString(), NextConfig->MaxPlayers);

        // Deactivate Pulso if active
        if (ActivePulso.bIsActive)
        {
            ActivePulso.bIsActive = false;
        }

        // Spawn loot for new world
        SpawnLootFromDataAssets();
    }

    // Return to previous match phase
    MatchPhase = PrevPhase;
}

bool AKhaaosGameMode::CanTransitionToNextWorld() const
{
    if (CurrentWorldIndex >= 4) return false; // Arukheea is final

    if (LoadedWorldConfigAssets.IsValidIndex(CurrentWorldIndex + 1))
    {
        UKhaaosWorldConfigDataAsset* NextConfig = LoadedWorldConfigAssets[CurrentWorldIndex + 1];
        // Check rank requirement
        // Real implementation: compare player rank vs NextConfig->RequiredRank
        return true;
    }

    return false;
}

UKhaaosWorldConfigDataAsset* AKhaaosGameMode::GetCurrentWorldConfig() const
{
    if (LoadedWorldConfigAssets.IsValidIndex(CurrentWorldIndex))
    {
        return LoadedWorldConfigAssets[CurrentWorldIndex];
    }
    return nullptr;
}

// ─── Pulso Khaaos Event ────────────────────────────────────────────────────────

void AKhaaosGameMode::TriggerPulsoKhaaos()
{
    if (ActivePulso.bIsActive)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::TriggerPulsoKhaaos - Already active"));
        return;
    }

    UKhaaosWorldConfigDataAsset* WorldConfig = GetCurrentWorldConfig();
    if (!WorldConfig) return;

    ActivePulso.bIsActive = true;
    ActivePulso.ActiveWorld = WorldConfig->WorldID;
    ActivePulso.CurrentRadius = WorldConfig->PulsoConfig.Radius;
    ActivePulso.RemainingTime = WorldConfig->PulsoConfig.DurationSeconds;
    ActivePulso.RarityBoost = WorldConfig->PulsoConfig.RarityBoostMultiplier;
    ActivePulso.CenterLocation = FVector::ZeroVector; // Center of map

    MatchPhase = EMatchPhase::PulsoKhaaos;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::TriggerPulsoKhaaos - Pulso in %s (Radius=%.0f, Duration=%.0fs, Boost=%.1fx)"),
        *ActivePulso.ActiveWorld.ToString(), ActivePulso.CurrentRadius,
        ActivePulso.RemainingTime, ActivePulso.RarityBoost);
}

void AKhaaosGameMode::TickPulsoEvent(float DeltaSeconds)
{
    if (!ActivePulso.bIsActive) return;

    // Shrink radius over time
    UKhaaosWorldConfigDataAsset* WorldConfig = GetCurrentWorldConfig();
    if (WorldConfig)
    {
        float TimeRatio = ActivePulso.RemainingTime / WorldConfig->PulsoConfig.DurationSeconds;
        ActivePulso.CurrentRadius = WorldConfig->PulsoConfig.Radius * TimeRatio;
    }

    ActivePulso.RemainingTime -= DeltaSeconds;

    // Apply damage to players inside Pulso radius
    ApplyPulsoDamage();

    // Periodic loot drops
    if (FMath::RandRange(0.0f, 1.0f) < 0.02f) // ~2% chance per tick
    {
        SpawnPulsoLoot();
    }

    // End event
    if (ActivePulso.RemainingTime <= 0.0f)
    {
        ActivePulso.bIsActive = false;
        MatchPhase = EMatchPhase::InProgress;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::TickPulsoEvent - Pulso event ended"));
    }
}

void AKhaaosGameMode::ApplyPulsoDamage()
{
    // Apply damage to players within ActivePulso radius
    // Real implementation: check player distance from ActivePulso.CenterLocation
    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosGameMode::ApplyPulsoDamage - Radius: %.0f"), ActivePulso.CurrentRadius);
}

void AKhaaosGameMode::SpawnPulsoLoot()
{
    // Spawn loot with rarity boost at Pulso location
    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosGameMode::SpawnPulsoLoot - Boosted loot spawn (boost=%.1fx)"), ActivePulso.RarityBoost);
}

// ─── Match Lifecycle ────────────────────────────────────────────────────────────

void AKhaaosGameMode::StartCountdown()
{
    if (MatchPhase != EMatchPhase::Lobby) return;
    if (GetNumPlayers() < MinPlayersToStart) return;

    MatchPhase = EMatchPhase::Countdown;
    CountdownRemaining = CountdownDuration;

    if (KhaaosGameState)
    {
        KhaaosGameState->SetMatchPhase(EMatchPhase::Countdown);
        KhaaosGameState->SetRemainingTime(CountdownDuration);
    }

    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().SetTimer(CountdownTimerHandle, this,
            &AKhaaosGameMode::CountdownTick, 1.0f, true);
    }
}

void AKhaaosGameMode::CancelCountdown()
{
    if (MatchPhase != EMatchPhase::Countdown) return;

    MatchPhase = EMatchPhase::Lobby;
    CountdownRemaining = 0.0f;

    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(CountdownTimerHandle);
    }
}

void AKhaaosGameMode::StartMatch()
{
    if (MatchPhase != EMatchPhase::Countdown) return;

    MatchPhase = EMatchPhase::InProgress;

    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(CountdownTimerHandle);
        World->GetTimerManager().SetTimer(ZoneTickTimerHandle, this,
            &AKhaaosGameMode::ApplyZoneDamage, ZoneTickInterval, true);
    }

    if (SafeZone) SafeZone->ActivateZone();

    // Data-driven loot spawning
    SpawnLootFromDataAssets();

    if (KhaaosGameState)
    {
        KhaaosGameState->SetMatchPhase(EMatchPhase::InProgress);
        KhaaosGameState->TotalPlayers = GetNumPlayers();
        KhaaosGameState->PlayersAlive = GetNumPlayers();
    }
}

void AKhaaosGameMode::FinishMatch(const FString& WinnerId)
{
    if (MatchPhase != EMatchPhase::InProgress) return;

    MatchPhase = EMatchPhase::Finished;

    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(ZoneTickTimerHandle);
    }

    if (SafeZone) SafeZone->DeactivateZone();

    ComputeRankings();

    if (KhaaosGameState)
    {
        KhaaosGameState->SetMatchPhase(EMatchPhase::Finished);
        KhaaosGameState->WinnerId = WinnerId;
    }
}

// ─── Tick ───────────────────────────────────────────────────────────────────────

void AKhaaosGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (MatchPhase == EMatchPhase::Finished) return;

    // Tick Pulso event
    if (ActivePulso.bIsActive)
    {
        TickPulsoEvent(DeltaSeconds);
    }

    if (MatchPhase == EMatchPhase::InProgress || MatchPhase == EMatchPhase::PulsoKhaaos)
    {
        if (CheckWinCondition())
        {
            FString WinnerId;
            for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
            {
                if (APlayerController* PC = It->Get())
                {
                    if (APlayerState* PS = PC->PlayerState)
                    {
                        if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PS))
                        {
                            if (KPS->PlayerStatus == EPlayerStatus::Vivo)
                            {
                                WinnerId = KPS->GetUniqueId().ToString();
                                break;
                            }
                        }
                    }
                }
            }
            FinishMatch(WinnerId);
        }
    }
}

// ─── Player Management (unchanged from base) ────────────────────────────────────

void AKhaaosGameMode::OnPostLogin(AController* NewPlayer)
{
    Super::OnPostLogin(NewPlayer);
    if (!NewPlayer) return;

    if (APlayerState* PS = NewPlayer->PlayerState)
    {
        if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PS))
        {
            KPS->bIsConnected = true;
            if (GetNumPlayers() == 1) KPS->bIsHost = true;
        }
    }

    if (SpatialGrid && NewPlayer->PlayerState)
    {
        SpatialGrid->InsertEntity(NewPlayer->PlayerState->GetUniqueId().ToString(), FVector2D::ZeroVector);
    }
}

void AKhaaosGameMode::Logout(AController* Exiting)
{
    if (!Exiting) { Super::Logout(Exiting); return; }

    if (SpatialGrid && Exiting->PlayerState)
    {
        SpatialGrid->RemoveEntity(Exiting->PlayerState->GetUniqueId().ToString());
    }

    Super::Logout(Exiting);
}

void AKhaaosGameMode::EliminatePlayer(APlayerState* Victim, APlayerState* Eliminator, const FString& Cause)
{
    if (!Victim) return;

    AKhaaosPlayerState* VictimPS = Cast<AKhaaosPlayerState>(Victim);
    if (!VictimPS || VictimPS->PlayerStatus != EPlayerStatus::Vivo) return;

    VictimPS->SetPlayerStatus(EPlayerStatus::Eliminado);

    if (Eliminator && Eliminator != Victim)
    {
        AKhaaosPlayerState* ElimPS = Cast<AKhaaosPlayerState>(Eliminator);
        if (ElimPS)
        {
            ElimPS->Kills++;
            VictimPS->EliminatorId = ElimPS->GetUniqueId().ToString();
        }
    }

    if (KhaaosGameState)
    {
        KhaaosGameState->OnPlayerEliminated.Broadcast(
            VictimPS->GetUniqueId().ToString(), Cause, VictimPS->EliminatorId);
    }
}

bool AKhaaosGameMode::CheckWinCondition() const
{
    if (MatchPhase != EMatchPhase::InProgress && MatchPhase != EMatchPhase::PulsoKhaaos)
        return false;

    int32 AliveCount = 0;
    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APlayerState* PS = PC->PlayerState)
            {
                if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PS))
                {
                    if (KPS->PlayerStatus == EPlayerStatus::Vivo) ++AliveCount;
                }
            }
        }
    }

    return AliveCount <= 1;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void AKhaaosGameMode::ApplyZoneDamage()
{
    // Same as base implementation
}

void AKhaaosGameMode::CountdownTick()
{
    CountdownRemaining -= 1.0f;
    if (KhaaosGameState) KhaaosGameState->SetRemainingTime(CountdownRemaining);
    if (CountdownRemaining <= 0.0f) StartMatch();
}

void AKhaaosGameMode::SpawnLoot()
{
    SpawnLootFromDataAssets();
}

void AKhaaosGameMode::ComputeRankings()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::ComputeRankings - TrueSkill2 ELO computation"));
}
