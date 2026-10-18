// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/KhaaosGameMode.h"
#include "Game/KhaaosGameState.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/Spatial/SpatialGrid.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

// ─── E2E Phases 5-8 Includes ───────────────────────────────────────────────────
#include "Game/Economy/KhaaosEconomySync.h"
#include "Game/Economy/KhaaosShopSystem.h"
#include "Game/Economy/KhaaosTransactionValidator.h"
#include "Game/EOS/KhaaosEOSCrossplay.h"
#include "Game/EOS/KhaaosEOSMatchmakingV2.h"
#include "Game/EOS/KhaaosEOSSessionRecovery.h"
#include "Game/Audio/KhaaosZoneWarningSystem.h"

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

        // ── Default configuration (from TS RoomManager) ──
        MaxPlayers          = 60;
        MinPlayersToStart   = 2;
        CountdownDuration   = 15.0f;
        MatchTimeLimit      = 0.0f;   // 0 = no limit
        ZoneTickInterval    = 1.0f;

        CountdownRemaining  = 0.0f;
        MatchPhase          = EMatchPhase::Lobby;

        SpatialGrid         = nullptr;
        SafeZone            = nullptr;
        KhaaosGameState     = nullptr;

        // E2E Phases 5-8 subsystems (initialized in InitializeE2ESubsystems)
        EconomySync         = nullptr;
        ShopSystem          = nullptr;
        TransactionValidator = nullptr;
        CrossplayManager    = nullptr;
        MatchmakingV2       = nullptr;
        SessionRecovery     = nullptr;
        ZoneWarning         = nullptr;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosGameMode::InitGameState()
{
        Super::InitGameState();

        KhaaosGameState = Cast<AKhaaosGameState>(GameState);
        if (!KhaaosGameState)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode: GameState is not AKhaaosGameState"));
        }
}

void AKhaaosGameMode::StartPlay()
{
        Super::StartPlay();

        // Cache subsystem references
        if (UWorld* World = GetWorld())
        {
                SpatialGrid = World->GetSubsystem<USpatialGridSubsystem>();
                if (!SpatialGrid)
                {
                        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode: SpatialGridSubsystem not available"));
                }
        }

        // Find the safe zone actor
        TArray<AActor*> SafeZones;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);
        if (SafeZones.Num() > 0)
        {
                SafeZone = Cast<AKhaaosSafeZone>(SafeZones[0]);
        }

        // Initialize E2E Phases 5-8 subsystems
        InitializeE2ESubsystems();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::StartPlay - Match phase: Lobby"));
}

void AKhaaosGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
        // Clear timers
        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().ClearTimer(ZoneTickTimerHandle);
                World->GetTimerManager().ClearTimer(CountdownTimerHandle);
        }

        Super::EndPlay(EndPlayReason);
}

// ─── Match Lifecycle ────────────────────────────────────────────────────────────

void AKhaaosGameMode::StartCountdown()
{
        if (MatchPhase != EMatchPhase::Lobby)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::StartCountdown - Not in Lobby phase"));
                return;
        }

        // Check minimum players
        int32 PlayerCount = GetNumPlayers();
        if (PlayerCount < MinPlayersToStart)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::StartCountdown - Not enough players (%d/%d)"),
                        PlayerCount, MinPlayersToStart);
                return;
        }

        MatchPhase = EMatchPhase::Countdown;
        CountdownRemaining = CountdownDuration;

        if (KhaaosGameState)
        {
                KhaaosGameState->SetMatchPhase(EMatchPhase::Countdown);
                KhaaosGameState->SetRemainingTime(CountdownDuration);
        }

        // Start countdown tick timer
        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().SetTimer(CountdownTimerHandle, this,
                        &AKhaaosGameMode::CountdownTick, 1.0f, true);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::StartCountdown - Countdown started (%.0fs)"), CountdownDuration);
}

void AKhaaosGameMode::CancelCountdown()
{
        if (MatchPhase != EMatchPhase::Countdown)
        {
                return;
        }

        MatchPhase = EMatchPhase::Lobby;
        CountdownRemaining = 0.0f;

        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().ClearTimer(CountdownTimerHandle);
        }

        if (KhaaosGameState)
        {
                KhaaosGameState->SetMatchPhase(EMatchPhase::Lobby);
                KhaaosGameState->SetRemainingTime(0.0f);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::CancelCountdown - Countdown cancelled"));
}

void AKhaaosGameMode::StartMatch()
{
        if (MatchPhase != EMatchPhase::Countdown)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameMode::StartMatch - Not in Countdown phase"));
                return;
        }

        MatchPhase = EMatchPhase::InProgress;

        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().ClearTimer(CountdownTimerHandle);

                // Start zone damage tick
                World->GetTimerManager().SetTimer(ZoneTickTimerHandle, this,
                        &AKhaaosGameMode::ApplyZoneDamage, ZoneTickInterval, true);
        }

        // Activate the safe zone
        if (SafeZone)
        {
                SafeZone->ActivateZone();
        }

        // Spawn loot for the match
        SpawnLoot();

        if (KhaaosGameState)
        {
                KhaaosGameState->SetMatchPhase(EMatchPhase::InProgress);
                KhaaosGameState->SetRemainingTime(MatchTimeLimit);
                KhaaosGameState->TotalPlayers = GetNumPlayers();
                KhaaosGameState->PlayersAlive = GetNumPlayers();
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::StartMatch - Match started with %d players"), GetNumPlayers());
}

void AKhaaosGameMode::FinishMatch(const FString& WinnerId)
{
        if (MatchPhase != EMatchPhase::InProgress)
        {
                return;
        }

        MatchPhase = EMatchPhase::Finished;

        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().ClearTimer(ZoneTickTimerHandle);
        }

        // Deactivate zone
        if (SafeZone)
        {
                SafeZone->DeactivateZone();
        }

        // Compute ELO rankings
        ComputeRankings();

        if (KhaaosGameState)
        {
                KhaaosGameState->SetMatchPhase(EMatchPhase::Finished);
                KhaaosGameState->WinnerId = WinnerId;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::FinishMatch - Match finished. Winner: %s"), *WinnerId);
}

// ─── Tick ───────────────────────────────────────────────────────────────────────

void AKhaaosGameMode::Tick(float DeltaSeconds)
{
        Super::Tick(DeltaSeconds);

        if (MatchPhase != EMatchPhase::InProgress)
        {
                return;
        }

        // Check win condition each tick
        if (CheckWinCondition())
        {
                // Find the last alive player
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

        // Update match time on game state
        if (KhaaosGameState && MatchTimeLimit > 0.0f)
        {
                float NewTime = KhaaosGameState->RemainingTime - DeltaSeconds;
                if (NewTime <= 0.0f)
                {
                        // Time limit reached — finish match
                        FinishMatch(TEXT(""));
                }
                else
                {
                        KhaaosGameState->SetRemainingTime(NewTime);
                }
        }

        // Update alive count
        if (KhaaosGameState)
        {
                int32 AliveCount = 0;
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
                                                        ++AliveCount;
                                                }
                                        }
                                }
                        }
                }
                KhaaosGameState->PlayersAlive = AliveCount;
        }
}

// ─── Player Management ──────────────────────────────────────────────────────────

void AKhaaosGameMode::OnPostLogin(AController* NewPlayer)
{
        Super::OnPostLogin(NewPlayer);

        if (!NewPlayer)
        {
                return;
        }

        // Initialize player state
        if (APlayerState* PS = NewPlayer->PlayerState)
        {
                if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PS))
                {
                        KPS->bIsConnected = true;

                        // First player is host
                        if (GetNumPlayers() == 1)
                        {
                                KPS->bIsHost = true;
                        }

                        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::OnPostLogin - Player joined: %s"),
                                *PS->GetPlayerName());
                }
        }

        // Insert into spatial grid
        if (SpatialGrid && NewPlayer->PlayerState)
        {
                SpatialGrid->InsertEntity(
                        NewPlayer->PlayerState->GetUniqueId().ToString(),
                        FVector2D::ZeroVector
                );
        }
}

void AKhaaosGameMode::Logout(AController* Exiting)
{
        if (!Exiting)
        {
                Super::Logout(Exiting);
                return;
        }

        // Remove from spatial grid
        if (SpatialGrid && Exiting->PlayerState)
        {
                SpatialGrid->RemoveEntity(Exiting->PlayerState->GetUniqueId().ToString());
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::Logout - Player left: %s"),
                Exiting->PlayerState ? *Exiting->PlayerState->GetPlayerName() : TEXT("Unknown"));

        Super::Logout(Exiting);
}

void AKhaaosGameMode::EliminatePlayer(APlayerState* Victim, APlayerState* Eliminator, const FString& Cause)
{
        if (!Victim)
        {
                return;
        }

        AKhaaosPlayerState* VictimPS = Cast<AKhaaosPlayerState>(Victim);
        if (!VictimPS || VictimPS->PlayerStatus != EPlayerStatus::Vivo)
        {
                return;
        }

        // Set victim status
        VictimPS->SetPlayerStatus(EPlayerStatus::Eliminado);

        // Set elimination cause
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

        // Credit eliminator with kill
        if (Eliminator && Eliminator != Victim)
        {
                AKhaaosPlayerState* ElimPS = Cast<AKhaaosPlayerState>(Eliminator);
                if (ElimPS)
                {
                        ElimPS->Kills++;
                        VictimPS->EliminatorId = ElimPS->GetUniqueId().ToString();
                }
        }

        // Broadcast elimination
        if (KhaaosGameState)
        {
                KhaaosGameState->OnPlayerEliminated.Broadcast(
                        VictimPS->GetUniqueId().ToString(),
                        Cause,
                        VictimPS->EliminatorId
                );
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::EliminatePlayer - %s eliminated by %s (%s)"),
                *Victim->GetPlayerName(), *Cause, *VictimPS->EliminatorId);
}

bool AKhaaosGameMode::CheckWinCondition() const
{
        if (MatchPhase != EMatchPhase::InProgress)
        {
                return false;
        }

        // Win condition: only one player alive
        int32 AliveCount = 0;
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
                                                ++AliveCount;
                                        }
                                }
                        }
                }
        }

        return AliveCount <= 1;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void AKhaaosGameMode::ApplyZoneDamage()
{
        if (MatchPhase != EMatchPhase::InProgress || !SafeZone)
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
                                                                // Check if player is outside safe zone
                                                                const APawn* PlayerPawn = PC->GetPawn();
                                                                const bool bInsideSafeZone = SafeZone->UsesWorldSpaceZone()
                                                                        ? (!PlayerPawn || SafeZone->IsInsideWorldZone(PlayerPawn->GetActorLocation()))
                                                                        : SafeZone->IsInsideZone(KPS->MapPosition);
                                                                if (!bInsideSafeZone)
                                                                {
                                                float ZoneDamage = SafeZone->DamagePerTick;
                                                KPS->ApplyDamage(ZoneDamage, nullptr);

                                                // If killed by zone damage, eliminate
                                                if (KPS->Health <= 0.0f)
                                                {
                                                        EliminatePlayer(PS, nullptr, TEXT("ZONA"));
                                                }
                                        }
                                }
                        }
                }
        }
}

void AKhaaosGameMode::CountdownTick()
{
        CountdownRemaining -= 1.0f;

        if (KhaaosGameState)
        {
                KhaaosGameState->SetRemainingTime(CountdownRemaining);
        }

        if (CountdownRemaining <= 0.0f)
        {
                StartMatch();
        }
}

void AKhaaosGameMode::SpawnLoot()
{
        // Loot spawning from LOOT_PRESETS would be done via data table or
        // config-driven spawn. This is a placeholder for the server-side
        // loot generation logic ported from TS RoomManager.
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::SpawnLoot - Spawning loot from presets"));
}

void AKhaaosGameMode::ComputeRankings()
{
        // ELO ranking computation ported from TS matchmaking logic.
        // For each player in the match, compute ELO delta based on:
        //   - Final placement
        //   - Kills
        //   - Time survived
        //   - Average ELO of opponents
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::ComputeRankings - Computing ELO rankings"));
}

// ─── E2E Phases 5-8 Subsystems Initialization ──────────────────────────────────

void AKhaaosGameMode::InitializeE2ESubsystems()
{
	if (!GetWorld()) return;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::InitializeE2ESubsystems - Starting"));

	// Phase 5: Economy Bridge
	EconomySync = NewObject<UKhaaosEconomySync>(this, UKhaaosEconomySync::StaticClass());
	if (EconomySync)
	{
		EconomySync->RegisterComponent();
		UE_LOG(LogKhaaosRun, Log, TEXT("  EconomySync initialized"));
	}

	ShopSystem = NewObject<UKhaaosShopSystem>(this, UKhaaosShopSystem::StaticClass());
	if (ShopSystem)
	{
		ShopSystem->RegisterComponent();
		UE_LOG(LogKhaaosRun, Log, TEXT("  ShopSystem initialized"));
	}

	// Phase 6: EOS Enhancement
	SessionRecovery = NewObject<UKhaaosEOSSessionRecovery>(this, UKhaaosEOSSessionRecovery::StaticClass());
	if (SessionRecovery)
	{
		SessionRecovery->RegisterComponent();
		UE_LOG(LogKhaaosRun, Log, TEXT("  SessionRecovery initialized"));
	}

	// Phase 8: Audio
	ZoneWarning = NewObject<UKhaaosZoneWarningSystem>(this, UKhaaosZoneWarningSystem::StaticClass());
	if (ZoneWarning)
	{
		ZoneWarning->RegisterComponent();
		UE_LOG(LogKhaaosRun, Log, TEXT("  ZoneWarning initialized"));
	}

	// Note: TransactionValidator is UEngineSubsystem (auto-initialized)
	// Note: CrossplayManager and MatchmakingV2 are UGameInstanceSubsystem (auto-initialized)

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameMode::InitializeE2ESubsystems - Complete (4 actor components + 3 engine/game-instance subsystems)"));
}
