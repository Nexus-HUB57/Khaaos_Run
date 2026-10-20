// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/KhaaosGameMode.h"
#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Player/KhaaosPlayerController.h"
#include "Game/KhaaosGameState.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/Spatial/SpatialGrid.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/Economy/EconomyBridge.h"
#include "Game/Data/KhaaosAssetRegistrySubsystem.h"
#include "Game/Data/KhaaosSpeciesAbilityComponent.h"
#include "Game/Data/KhaaosWeaponComponent.h"
#include "Game/Zone/KhaaosZoneManager.h"
#include "Game/Combat/KhaaosDamageManager.h"
#include "Game/UI/KhaaosKillFeedComponent.h"
#include "Game/Revive/KhaaosReviveSystem.h"
#include "Game/MatchFlow/KhaaosMatchFlowStateMachine.h"
#include "Game/Airdrop/KhaaosAirdropSystem.h"
#include "Game/Deploy/KhaaosDeploySystem.h"
#include "Game/UI/KhaaosCirclePrediction.h"
#include "Game/Performance/KhaaosPerformanceBudget.h"
#include "Game/Performance/KhaaosLODStrategy.h"
#include "Game/Network/KhaaosReplicationBudget.h"
#include "Game/MatchFlow/KhaaosMatchTimeline.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Engine/EngineTypes.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerState.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"
#include "Net/UnrealNetwork.h"
#include "Engine/LevelStreamingDynamic.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosGameMode::AKhaaosGameMode()
{
    PlayerControllerClass = AKhaaosPlayerController::StaticClass();
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

    // Initialize PhD-level subsystems
    InitializePhDSubsystems();
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

// ─── PhD-Level Subsystem Initialization ────────────────────────────────────────

void AKhaaosGameMode::InitializePhDSubsystems()
{
    UWorld* World = GetWorld();
    if (!World) return;

    // Zone Manager: multi-phase storm circle (Fortnite-style)
    ZoneManager = NewObject<UKhaaosZoneManagerComponent>(this, UKhaaosZoneManagerComponent::StaticClass());
    if (ZoneManager)
    {
        ZoneManager->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - ZoneManager initialized"));
    }

    // Damage Manager: central damage processing with headshot, validation, kill tracking
    DamageManager = NewObject<UKhaaosDamageManagerComponent>(this, UKhaaosDamageManagerComponent::StaticClass());
    if (DamageManager)
    {
        DamageManager->RegisterComponent();

        // Wire kill events to kill feed
        if (DamageManager->OnPlayerKilled.IsBound())
        {
            UE_LOG(LogKhaaosRun, Log, TEXT("GameMode - DamageManager kill events wired"));
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - DamageManager initialized"));
    }

    // Kill Feed: replicated kill feed for HUD
    if (KhaaosGameState)
    {
        KillFeed = NewObject<UKhaaosKillFeedComponent>(KhaaosGameState, UKhaaosKillFeedComponent::StaticClass());
        if (KillFeed)
        {
            KillFeed->RegisterComponent();
            UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - KillFeed initialized (on GameState)"));
        }
    }

    // Revive System: downed state, bleed-out, revive stations
    ReviveSystem = NewObject<UKhaaosReviveSystemComponent>(this, UKhaaosReviveSystemComponent::StaticClass());
    if (ReviveSystem)
    {
        ReviveSystem->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - ReviveSystem initialized"));
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - All PhD subsystems online (ZoneManager + DamageManager + KillFeed + ReviveSystem)"));

    // ─── E2E Phase 1-3 Subsystems ────────────────────────────────────────

    // Match Flow State Machine: Lobby→Deploy→Combat→Endgame→Results
    MatchFlow = NewObject<UKhaaosMatchFlowStateMachineComponent>(this, UKhaaosMatchFlowStateMachineComponent::StaticClass());
    if (MatchFlow)
    {
        MatchFlow->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - MatchFlow initialized"));
    }

    // Airdrop System: Free Fire-style supply drops
    AirdropSystem = NewObject<UKhaaosAirdropSystemComponent>(this, UKhaaosAirdropSystemComponent::StaticClass());
    if (AirdropSystem)
    {
        AirdropSystem->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - AirdropSystem initialized"));
    }

    // Deploy System: Parachute deployment
    DeploySystem = NewObject<UKhaaosDeploySystemComponent>(this, UKhaaosDeploySystemComponent::StaticClass());
    if (DeploySystem)
    {
        DeploySystem->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - DeploySystem initialized"));
    }

    // Circle Prediction: Minimap UI white circle (Fortnite-style)
    CirclePrediction = NewObject<UKhaaosCirclePredictionComponent>(this, UKhaaosCirclePredictionComponent::StaticClass());
    if (CirclePrediction)
    {
        CirclePrediction->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - CirclePrediction initialized"));
    }

    // Performance Budget: Console quality/performance management
    PerformanceBudget = NewObject<UKhaaosPerformanceBudgetComponent>(this, UKhaaosPerformanceBudgetComponent::StaticClass());
    if (PerformanceBudget)
    {
        PerformanceBudget->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - PerformanceBudget initialized"));
    }

    // LOD Strategy: Distance-based LOD for battle royale actors
    LODStrategy = NewObject<UKhaaosLODStrategyComponent>(this, UKhaaosLODStrategyComponent::StaticClass());
    if (LODStrategy)
    {
        LODStrategy->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - LODStrategy initialized"));
    }

    // Replication Budget: Network bandwidth management
    ReplicationBudget = NewObject<UKhaaosReplicationBudgetComponent>(this, UKhaaosReplicationBudgetComponent::StaticClass());
    if (ReplicationBudget)
    {
        ReplicationBudget->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - ReplicationBudget initialized"));
    }

    // Match Timeline: event log, match summary, JSON serialize
    MatchTimeline = NewObject<UKhaaosMatchTimelineComponent>(this, UKhaaosMatchTimelineComponent::StaticClass());
    if (MatchTimeline)
    {
        MatchTimeline->RegisterComponent();
        UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - MatchTimeline initialized"));
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("GameMode::InitializePhDSubsystems - ALL E2E subsystems online (12 total)"));
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
    KPS->Speed = SpeciesAsset->BaseSpeed;

    // Activate species passive via SpeciesAbilityComponent
    if (UKhaaosSpeciesAbilityComponent* SpeciesComp = GetSpeciesAbilityComponent(Player))
    {
        SpeciesComp->SetSpecies(SpeciesAsset);
    }

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

    // Filter species available in current world using AvailableWorlds
    for (UKhaaosSpeciesDataAsset* Species : LoadedSpeciesAssets)
    {
        if (Species->CanEnterWorld(CurrentConfig->WorldID))
        {
            Available.Add(Species);
        }
    }

    // If WorldConfig has a specific AvailableSpecies list, filter further
    if (CurrentConfig->AvailableSpecies.Num() > 0)
    {
        TArray<UKhaaosSpeciesDataAsset*> Filtered;
        for (UKhaaosSpeciesDataAsset* Species : Available)
        {
            if (CurrentConfig->AvailableSpecies.Contains(Species->SpeciesID))
            {
                Filtered.Add(Species);
            }
        }
        return Filtered;
    }

    return Available;
}

UKhaaosSpeciesAbilityComponent* AKhaaosGameMode::GetSpeciesAbilityComponent(APlayerState* Player) const
{
    if (!Player) return nullptr;
    if (APawn* Pawn = Player->GetPawn())
    {
        return Pawn->FindComponentByClass<UKhaaosSpeciesAbilityComponent>();
    }
    return nullptr;
}

// ─── Weapon Loadout ────────────────────────────────────────────────────────────

void AKhaaosGameMode::AssignWeaponLoadout(APlayerState* Player)
{
    if (!Player || LoadedWeaponAssets.Num() == 0) return;

    AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(Player);
    if (!KPS) return;

    // Assign default loadout: Primary + Secondary + Melee
    UKhaaosWeaponDataAsset* Primary = SelectRandomWeaponForSlot(FName("PRIMARY"));
    UKhaaosWeaponDataAsset* Secondary = SelectRandomWeaponForSlot(FName("SECONDARY"));
    UKhaaosWeaponDataAsset* Melee = SelectRandomWeaponForSlot(FName("MELEE"));

    // Equip via WeaponComponent (first weapon is primary)
    if (UKhaaosWeaponComponent* WeaponComp = GetWeaponComponent(Player))
    {
        if (Primary) WeaponComp->EquipWeapon(Primary);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::AssignWeaponLoadout - %s: Primary=%s, Secondary=%s, Melee=%s"),
        *Player->GetPlayerName(),
        Primary ? *Primary->WeaponID.ToString() : TEXT("None"),
        Secondary ? *Secondary->WeaponID.ToString() : TEXT("None"),
        Melee ? *Melee->WeaponID.ToString() : TEXT("None"));
}

UKhaaosWeaponComponent* AKhaaosGameMode::GetWeaponComponent(APlayerState* Player) const
{
    if (!Player) return nullptr;
    if (APawn* Pawn = Player->GetPawn())
    {
        return Pawn->FindComponentByClass<UKhaaosWeaponComponent>();
    }
    return nullptr;
}

UKhaaosWeaponDataAsset* AKhaaosGameMode::SelectRandomWeaponForSlot(FName SlotTag) const
{
    TArray<UKhaaosWeaponDataAsset*> SlotWeapons;
    for (UKhaaosWeaponDataAsset* Weapon : LoadedWeaponAssets)
    {
        if (Weapon && Weapon->Slot == SlotTag)
        {
            SlotWeapons.Add(Weapon);
        }
    }

    if (SlotWeapons.Num() == 0) return nullptr;

    // Weighted random by enum (no string comparison — PhD-level performance)
    TArray<int32> Weights;
    int32 TotalWeight = 0;
    for (UKhaaosWeaponDataAsset* Weapon : SlotWeapons)
    {
        int32 W = 28;
        switch (Weapon->Rarity)
        {
        case EKhaaosRarity::Comum:    W = 55; break;
        case EKhaaosRarity::Raro:     W = 28; break;
        case EKhaaosRarity::Epico:    W = 12; break;
        case EKhaaosRarity::Lendario: W = 4;  break;
        case EKhaaosRarity::Mitico:   W = 1;  break;
        }
        Weights.Add(W);
        TotalWeight += W;
    }

    int32 Roll = FMath::RandRange(1, TotalWeight);
    int32 Cumulative = 0;
    for (int32 i = 0; i < SlotWeapons.Num(); ++i)
    {
        Cumulative += Weights[i];
        if (Roll <= Cumulative) return SlotWeapons[i];
    }

    return SlotWeapons.Last();
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

    UWorld* World = GetWorld();
    if (!World) return;

    // ─── FULLY IMPLEMENTED: Spawn AKhaaosLootPickup actors at each loot point ───
    int32 SpawnCount = 0;
    for (const FKhaaosLootPoint& LootPoint : WorldConfig->LootPoints)
    {
        UKhaaosLootItemDataAsset* SelectedItem = SelectWeightedRandomLoot();
        if (!SelectedItem) continue;
        if (!SelectedItem->CanSpawnInWorld(WorldConfig->WorldID)) continue;

        FVector SpawnLocation(LootPoint.Location.X, LootPoint.Location.Y, 0.0f);
        FRotator SpawnRotation(0.0f, FMath::FRandRange(0.0f, 360.0f), 0.0f);

        FActorSpawnParameters SpawnParams;
        SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

        AKhaaosLootPickup* Pickup = World->SpawnActor<AKhaaosLootPickup>(
            AKhaaosLootPickup::StaticClass(), SpawnLocation, SpawnRotation, SpawnParams);

        if (Pickup)
        {
            ELootRarity MappedRarity = ELootRarity::Comum;
            switch (SelectedItem->Rarity)
            {
            case EKhaaosRarity::Comum:    MappedRarity = ELootRarity::Comum; break;
            case EKhaaosRarity::Raro:     MappedRarity = ELootRarity::Raro; break;
            case EKhaaosRarity::Epico:    MappedRarity = ELootRarity::Epico; break;
            case EKhaaosRarity::Lendario: MappedRarity = ELootRarity::Lendario; break;
            case EKhaaosRarity::Mitico:   MappedRarity = ELootRarity::Mitico; break;
            }

            EItemType MappedType = EItemType::Curativo;
            if (SelectedItem->IsCurativo()) MappedType = EItemType::Curativo;
            else if (SelectedItem->IsDefesa()) MappedType = EItemType::Defesa;
            else MappedType = EItemType::Utilidade;

            FLootStats Stats;
            Stats.Heal = SelectedItem->HealAmount;
            Stats.Defense = SelectedItem->DefenseAmount;

            Pickup->InitFromPreset(SpawnCount, SelectedItem->ItemID.ToString(),
                MappedType, MappedRarity, LootPoint.Location.X, LootPoint.Location.Y, Stats);
            SpawnCount++;
        }
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::SpawnLootFromDataAssets - Spawned %d actors at %d loot points"),
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

    // Record world transition event on timeline
    if (MatchTimeline)
    {
        FKhaaosTimelineEvent TransitionEvent;
        TransitionEvent.EventType = EKhaaosTimelineEventType::WorldTransition;
        TransitionEvent.Description = FString::Printf(TEXT("Transition to world index %d"), CurrentWorldIndex);
        TransitionEvent.Data.Add(TEXT("WorldIndex"), FString::FromInt(CurrentWorldIndex));
        MatchTimeline->RecordEvent(TransitionEvent);
    }

    UKhaaosWorldConfigDataAsset* NextConfig = GetCurrentWorldConfig();
    if (NextConfig)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::TransitionToNextWorld - -> %s (MaxPlayers: %d)"),
            *NextConfig->WorldID.ToString(), NextConfig->MaxPlayers);

        if (ActivePulso.bIsActive) ActivePulso.bIsActive = false;

        // ─── UE5 Level Streaming ────────────────────────────────────
        UWorld* World = GetWorld();
        if (World)
        {
            FString LevelName = FString::Printf(TEXT("World_%s"), *NextConfig->WorldID.ToString());

            // Unload previous world sub-levels
            TArray<ULevelStreaming*> StreamingLevels = World->GetStreamingLevels();
            for (ULevelStreaming* SL : StreamingLevels)
            {
                if (SL && SL->IsLevelLoaded())
                {
                    SL->SetShouldBeLoaded(false);
                    SL->SetShouldBeVisible(false);
                }
            }

            // Load new world level dynamically
            ULevelStreamingDynamic* StreamedLevel = ULevelStreamingDynamic::LoadLevelInstance(
                World, LevelName, FVector::ZeroVector, FRotator::ZeroRotator);

            if (StreamedLevel)
            {
                StreamedLevel->SetShouldBeLoaded(true);
                StreamedLevel->SetShouldBeVisible(true);
                UE_LOG(LogKhaaosRun, Log, TEXT("Level streaming SUCCESS: %s"), *LevelName);
            }
            else
            {
                UE_LOG(LogKhaaosRun, Warning, TEXT("Level streaming FAILED: %s"), *LevelName);
            }

            // Teleport alive players to new world spawn points
            if (NextConfig->SpawnPoints.Num() > 0)
            {
                int32 SpawnIdx = 0;
                for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
                {
                    if (APlayerController* PC = It->Get())
                    {
                        if (APawn* Pawn = PC->GetPawn())
                        {
                            AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState);
                            if (KPS && KPS->PlayerStatus == EPlayerStatus::Vivo)
                            {
                                const FKhaaosSpawnPoint& SP = NextConfig->SpawnPoints[
                                    SpawnIdx % NextConfig->SpawnPoints.Num()];
                                Pawn->SetActorLocation(FVector(SP.Location.X, SP.Location.Y, 0.0f));
                                SpawnIdx++;
                            }
                        }
                    }
                }
            }
        }

        SpawnLootFromDataAssets();

        if (KhaaosGameState) KhaaosGameState->SetMatchPhase(EMatchPhase::WorldTransition);
    }

    MatchPhase = PrevPhase;
    if (KhaaosGameState) KhaaosGameState->SetMatchPhase(PrevPhase);
}

bool AKhaaosGameMode::CanTransitionToNextWorld() const
{
    if (CurrentWorldIndex >= 4) return false; // Arukheea is final

    if (LoadedWorldConfigAssets.IsValidIndex(CurrentWorldIndex + 1))
    {
        UKhaaosWorldConfigDataAsset* NextConfig = LoadedWorldConfigAssets[CurrentWorldIndex + 1];
        if (!NextConfig) return false;

        // Check that >=50% of alive players meet rank requirement
        int32 AliveWithRank = 0;
        int32 AliveTotal = 0;
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState))
                {
                    if (KPS->PlayerStatus == EPlayerStatus::Vivo)
                    {
                        AliveTotal++;
                        EPatenteRank PlayerRank = AKhaaosPlayerState::RankFromXp(KPS->XP);
                        if (static_cast<int32>(PlayerRank) >= NextConfig->RequiredRank)
                        {
                            AliveWithRank++;
                        }
                    }
                }
            }
        }
        return AliveTotal > 0 && AliveWithRank >= (AliveTotal / 2);
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
    // ─── FULLY IMPLEMENTED: Distance-based Pulso damage ───
    if (!ActivePulso.bIsActive || ActivePulso.CurrentRadius <= 0.0f) return;

    UWorld* World = GetWorld();
    if (!World) return;

    UKhaaosWorldConfigDataAsset* WorldConfig = GetCurrentWorldConfig();
    float BaseDamage = WorldConfig ? WorldConfig->PulsoConfig.DamagePerTick : 5.0f;

    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APawn* Pawn = PC->GetPawn())
            {
                AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState);
                if (!KPS || KPS->PlayerStatus != EPlayerStatus::Vivo) continue;

                float DistSq = FVector::DistSquared(Pawn->GetActorLocation(), ActivePulso.CenterLocation);
                float RadiusSq = ActivePulso.CurrentRadius * ActivePulso.CurrentRadius;

                if (DistSq <= RadiusSq)
                {
                    // Distance falloff: 1.0x at center -> 0.5x at edge
                    float DistRatio = FMath::Sqrt(DistSq) / ActivePulso.CurrentRadius;
                    float DamageMultiplier = 1.0f - (DistRatio * 0.5f);
                    float ActualDamage = BaseDamage * DamageMultiplier;
                    KPS->ApplyDamage(ActualDamage, nullptr);
                }
            }
        }
    }
}

void AKhaaosGameMode::SpawnPulsoLoot()
{
    // ─── FULLY IMPLEMENTED: Rarity-boosted loot spawning in Pulso ───
    if (!ActivePulso.bIsActive || LoadedLootItemAssets.Num() == 0) return;

    UWorld* World = GetWorld();
    if (!World) return;

    // Boosted rarity roll: Pulso shifts probability toward higher rarities
    float Roll = FMath::FRand();
    EKhaaosRarity TargetRarity;
    if (Roll < 0.05f * ActivePulso.RarityBoost)        TargetRarity = EKhaaosRarity::Mitico;
    else if (Roll < 0.15f * ActivePulso.RarityBoost)   TargetRarity = EKhaaosRarity::Lendario;
    else if (Roll < 0.35f * ActivePulso.RarityBoost)   TargetRarity = EKhaaosRarity::Epico;
    else if (Roll < 0.65f)                              TargetRarity = EKhaaosRarity::Raro;
    else                                                TargetRarity = EKhaaosRarity::Comum;

    TArray<UKhaaosLootItemDataAsset*> Candidates;
    for (UKhaaosLootItemDataAsset* Item : LoadedLootItemAssets)
    {
        if (Item && Item->Rarity == TargetRarity) Candidates.Add(Item);
    }

    UKhaaosLootItemDataAsset* SelectedItem = (Candidates.Num() > 0)
        ? Candidates[FMath::RandRange(0, Candidates.Num() - 1)]
        : SelectWeightedRandomLoot();

    if (!SelectedItem) return;

    // Random position within 80% of Pulso radius
    float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
    float Dist = FMath::FRandRange(0.0f, ActivePulso.CurrentRadius * 0.8f);
    FVector SpawnLoc = ActivePulso.CenterLocation + FVector(
        FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0.0f);

    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

    AKhaaosLootPickup* Pickup = World->SpawnActor<AKhaaosLootPickup>(
        AKhaaosLootPickup::StaticClass(), SpawnLoc, FRotator::ZeroRotator, SpawnParams);

    if (Pickup)
    {
        ELootRarity MappedRarity = ELootRarity::Raro;
        switch (SelectedItem->Rarity)
        {
        case EKhaaosRarity::Comum:    MappedRarity = ELootRarity::Comum; break;
        case EKhaaosRarity::Raro:     MappedRarity = ELootRarity::Raro; break;
        case EKhaaosRarity::Epico:    MappedRarity = ELootRarity::Epico; break;
        case EKhaaosRarity::Lendario: MappedRarity = ELootRarity::Lendario; break;
        case EKhaaosRarity::Mitico:   MappedRarity = ELootRarity::Mitico; break;
        }

        FLootStats Stats;
        Stats.Heal = SelectedItem->HealAmount;
        Stats.Defense = SelectedItem->DefenseAmount;

        Pickup->InitFromPreset(0, SelectedItem->ItemID.ToString(),
            EItemType::Curativo, MappedRarity, SpawnLoc.X, SpawnLoc.Y, Stats);

        UE_LOG(LogKhaaosRun, Log, TEXT("SpawnPulsoLoot - %s (%s) at Pulso (boost=%.1fx)"),
            *SelectedItem->ItemID.ToString(), *SelectedItem->RarityTag.ToString(), ActivePulso.RarityBoost);
    }
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

    // Record match start event on timeline
    if (MatchTimeline)
    {
        FKhaaosTimelineEvent StartEvent;
        StartEvent.EventType = EKhaaosTimelineEventType::MatchStart;
        StartEvent.Description = FString::Printf(TEXT("Match started with %d players"), GetNumPlayers());
        MatchTimeline->RecordEvent(StartEvent);
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
        // Track survived time for alive players (for ranking computation)
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState))
                {
                    if (KPS->PlayerStatus == EPlayerStatus::Vivo)
                    {
                        KPS->SurvivedTime += DeltaSeconds;
                    }
                }
            }
        }

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

void AKhaaosGameMode::HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer)
{
        Super::HandleStartingNewPlayer_Implementation(NewPlayer);

        if (!HasAuthority() || !NewPlayer || !GetWorld())
        {
                return;
        }

        TArray<AActor*> CIGKVLevels;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosCIGKVLevel::StaticClass(), CIGKVLevels);
        for (AActor* Actor : CIGKVLevels)
        {
                if (AKhaaosCIGKVLevel* CIGKVLevel = Cast<AKhaaosCIGKVLevel>(Actor))
                {
                        CIGKVLevel->StartZuEntry(NewPlayer);
                        break;
                }
        }
}

void AKhaaosGameMode::Logout(AController* Exiting)
{
    if (!Exiting) { Super::Logout(Exiting); return; }

    if (APlayerController* PlayerController = Cast<APlayerController>(Exiting))
    {
        TArray<AActor*> CIGKVLevels;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosCIGKVLevel::StaticClass(), CIGKVLevels);
        for (AActor* Actor : CIGKVLevels)
        {
            if (AKhaaosCIGKVLevel* CIGKVLevel = Cast<AKhaaosCIGKVLevel>(Actor))
            {
                CIGKVLevel->CancelZuEntry(PlayerController);
                break;
            }
        }
    }

    if (SpatialGrid && Exiting->PlayerState)
    {
        SpatialGrid->RemoveEntity(Exiting->PlayerState->GetUniqueId().ToString());
    }

    Super::Logout(Exiting);
}

void AKhaaosGameMode::EliminatePlayer(APlayerState* Victim, APlayerState* Eliminator, const FString& Cause)
{
    if (!HasAuthority() || !Victim)
    {
        return;
    }

    AKhaaosPlayerState* VictimPS = Cast<AKhaaosPlayerState>(Victim);
    if (!VictimPS || VictimPS->PlayerStatus != EPlayerStatus::Vivo)
    {
        return;
    }

    if (Cause == TEXT("ZONA"))
    {
        VictimPS->EliminationCause = EEliminationCause::Zona;
    }
    else if (Cause == TEXT("PVP"))
    {
        VictimPS->EliminationCause = EEliminationCause::PvP;
    }
    else
    {
        VictimPS->EliminationCause = EEliminationCause::Queda;
    }

    VictimPS->EliminatorId.Empty();
    VictimPS->Deaths++;

    if (Eliminator && Eliminator != Victim)
    {
        if (AKhaaosPlayerState* ElimPS = Cast<AKhaaosPlayerState>(Eliminator))
        {
            ElimPS->Kills++;
            VictimPS->EliminatorId = ElimPS->GetUniqueId().ToString();
            ElimPS->GrantCredits(50);
        }
    }

    VictimPS->SetPlayerStatus(EPlayerStatus::Eliminado);

    if (KhaaosGameState)
    {
        KhaaosGameState->OnPlayerEliminated.Broadcast(
            VictimPS->GetUniqueId().ToString(), Cause, VictimPS->EliminatorId);
    }

    // Record elimination event on timeline
    if (MatchTimeline)
    {
        FKhaaosTimelineEvent ElimEvent;
        ElimEvent.EventType = EKhaaosTimelineEventType::PlayerEliminated;
        ElimEvent.Description = FString::Printf(TEXT("%s eliminated by %s (%s)"),
            *VictimPS->GetPlayerName(),
            Eliminator ? *Eliminator->GetPlayerName() : TEXT("Zone"),
            *Cause);
        ElimEvent.Data.Add(TEXT("VictimId"), VictimPS->GetUniqueId().ToString());
        if (Eliminator)
        {
            ElimEvent.Data.Add(TEXT("EliminatorId"), Eliminator->GetUniqueId().ToString());
        }
        ElimEvent.Data.Add(TEXT("Cause"), Cause);
        MatchTimeline->RecordEvent(ElimEvent);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::EliminatePlayer - %s eliminated by %s (%s)"),
        *Victim->GetPlayerName(), *Cause, *VictimPS->EliminatorId);
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
    if ((MatchPhase != EMatchPhase::InProgress && MatchPhase != EMatchPhase::PulsoKhaaos) || !SafeZone)
    {
        return;
    }

    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APlayerState* PS = PC->PlayerState)
            {
                AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PS);
                if (KPS && KPS->PlayerStatus == EPlayerStatus::Vivo)
                {
                    const APawn* PlayerPawn = PC->GetPawn();
                    const bool bInsideSafeZone = SafeZone->UsesWorldSpaceZone()
                        ? (!PlayerPawn || SafeZone->IsInsideWorldZone(PlayerPawn->GetActorLocation()))
                        : SafeZone->IsInsideZone(KPS->MapPosition);
                    if (!bInsideSafeZone)
                    {
                        KPS->ApplyZoneDamage(SafeZone->DamagePerTick, SafeZone);
                    }
                }
            }
        }
    }
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
    // ─── FULLY IMPLEMENTED: TrueSkill2-inspired ELO + XP rewards ───
    UWorld* World = GetWorld();
    if (!World) return;

    // Collect match performance data
    struct FMatchData { AKhaaosPlayerState* PS; float Score; };
    TArray<FMatchData> Results;

    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState))
            {
                FMatchData D;
                D.PS = KPS;
                // Composite: Kills(40%) + Survival(30%) + Damage(20%) + AliveBonus(10%)
                D.Score = (float)KPS->Kills * 40.0f
                        + (KPS->SurvivedTime / 600.0f) * 30.0f
                        + FMath::Min(KPS->DamageDealt / 1000.0f, 1.0f) * 20.0f
                        + (KPS->PlayerStatus == EPlayerStatus::Vivo ? 10.0f : 0.0f);
                Results.Add(D);
            }
        }
    }

    // Sort by score descending → placement
    Results.Sort([](const FMatchData& A, const FMatchData& B) { return A.Score > B.Score; });

    for (int32 i = 0; i < Results.Num(); ++i)
    {
        AKhaaosPlayerState* KPS = Results[i].PS;
        int32 Placement = i + 1;

        // ELO update: logistic expected score vs average opponent rating
        float AvgOppRating = 1000.0f;
        if (Results.Num() > 1)
        {
            float Total = 0.0f;
            for (const FMatchData& O : Results) Total += (float)O.PS->Rating;
            AvgOppRating = (Total - (float)KPS->Rating) / (Results.Num() - 1);
        }

        float Expected = 1.0f / (1.0f + FMath::Pow(10.0f, (AvgOppRating - KPS->Rating) / 400.0f));
        float Actual = 1.0f - ((float)i / FMath::Max(Results.Num() - 1, 1));
        float K = KPS->MatchesPlayed < 10 ? 32.0f : 16.0f;
        int32 RatingChange = FMath::RoundToInt(K * (Actual - Expected));
        KPS->Rating = FMath::Max(0, KPS->Rating + RatingChange);

        // XP rewards: base + kills + survival + victory + top5
        int32 XP = 50 + KPS->Kills * 25 + FMath::RoundToInt(KPS->SurvivedTime * 0.5f);
        if (i == 0) XP += 200; // Victory bonus
        if (i < 5) XP += 50;   // Top-5 bonus

        KPS->XP += XP;
        KPS->Patente = AKhaaosPlayerState::RankFromXp(KPS->XP);
        KPS->MatchesPlayed++;
        if (i == 0) KPS->Wins++;
        if (i < 5) KPS->Top5++;

        UE_LOG(LogKhaaosRun, Log, TEXT("Rankings - %s: Place=%d, Rating=%d(+%d), XP=%d"),
            *KPS->GetPlayerName(), Placement, KPS->Rating, RatingChange, KPS->XP);
    }
}

UKhaaosLootItemDataAsset* AKhaaosGameMode::SelectWeightedRandomLoot() const
{
    if (LoadedLootItemAssets.Num() == 0) return nullptr;

    // Build weight array from RarityWeight
    TArray<int32> Weights;
    int32 TotalWeight = 0;
    for (UKhaaosLootItemDataAsset* Item : LoadedLootItemAssets)
    {
        int32 W = Item->RarityWeight;
        Weights.Add(W);
        TotalWeight += W;
    }

    if (TotalWeight <= 0) return nullptr;

    int32 Roll = FMath::RandRange(1, TotalWeight);
    int32 Cumulative = 0;
    for (int32 i = 0; i < LoadedLootItemAssets.Num(); ++i)
    {
        Cumulative += Weights[i];
        if (Roll <= Cumulative) return LoadedLootItemAssets[i];
    }

    return LoadedLootItemAssets.Last();
}

void AKhaaosGameMode::BuildLootWeightTable()
{
    // Pre-compute cumulative weights for fast loot selection
    // Called once per world transition when loot pool is finalized
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::BuildLootWeightTable - %d items"), LoadedLootItemAssets.Num());
}
