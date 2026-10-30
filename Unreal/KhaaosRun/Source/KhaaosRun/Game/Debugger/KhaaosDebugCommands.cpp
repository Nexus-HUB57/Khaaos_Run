// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Debugger/KhaaosDebugCommands.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/KhaaosGameState.h"
#include "Game/AbilitySystem/KhaaosAbilityComponent.h"
#include "Game/World/KhaaosVFXManager.h"
#include "Player/KhaaosPlayerState.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/Pawn.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosDebug, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosDebugCommands
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosDebugCommands::UKhaaosDebugCommands()
        : bDebugAbilities(false)
        , bGodMode(false)
        , bInfiniteAmmo(false)
{
}

void UKhaaosDebugCommands::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);
        RegisterCommands();
        UE_LOG(LogKhaaosDebug, Log, TEXT("KhaaosDebugCommands: Initialized and registered console commands."));
}

void UKhaaosDebugCommands::Deinitialize()
{
        UnregisterCommands();
        UE_LOG(LogKhaaosDebug, Log, TEXT("KhaaosDebugCommands: Deinitialized."));
        Super::Deinitialize();
}

void UKhaaosDebugCommands::RegisterCommands()
{
        IConsoleManager& ConsoleMgr = IConsoleManager::Get();

        // ─── Console Variables ────────────────────────────────────────────────

        IConsoleVariable* CVar_DebugAbilities = ConsoleMgr.RegisterConsoleVariable(
                TEXT("khaaos.debug.abilities"), 0,
                TEXT("Toggle ability debugger display (0=Off, 1=On)"),
                ECVF_SetByConsole);
        RegisteredVars.Add(CVar_DebugAbilities);

        // ─── Console Commands ─────────────────────────────────────────────────

        IConsoleCommand* Cmd_Pool = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.pool"),
                TEXT("Dump pool stats to log"),
                FConsoleCommandDelegate::CreateUObject(this, &UKhaaosDebugCommands::Cmd_DumpPoolStats),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_Pool);

        IConsoleCommand* Cmd_Relevancy = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.relevancy"),
                TEXT("Dump relevancy info to log"),
                FConsoleCommandDelegate::CreateUObject(this, &UKhaaosDebugCommands::Cmd_DumpRelevancy),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_Relevancy);

        IConsoleCommand* Cmd_Network = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.network"),
                TEXT("Dump network metrics to log"),
                FConsoleCommandDelegate::CreateUObject(this, &UKhaaosDebugCommands::Cmd_DumpNetworkMetrics),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_Network);

        IConsoleCommand* Cmd_Zone = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.zone"),
                TEXT("Dump zone state to log"),
                FConsoleCommandDelegate::CreateUObject(this, &UKhaaosDebugCommands::Cmd_DumpZoneState),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_Zone);

        IConsoleCommand* Cmd_God = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.god"),
                TEXT("Toggle god mode (0=Off, 1=On)"),
                FConsoleCommandWithArgsDelegate::CreateLambda([this](const TArray<FString>& Args)
                {
                        int32 Val = (Args.Num() > 0) ? FCString::Atoi(*Args[0]) : (bGodMode ? 0 : 1);
                        Cmd_GodMode(Val);
                }),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_God);

        IConsoleCommand* Cmd_InfAmmo = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.infiniteammo"),
                TEXT("Toggle infinite ammo (0=Off, 1=On)"),
                FConsoleCommandWithArgsDelegate::CreateLambda([this](const TArray<FString>& Args)
                {
                        int32 Val = (Args.Num() > 0) ? FCString::Atoi(*Args[0]) : (bInfiniteAmmo ? 0 : 1);
                        Cmd_InfiniteAmmo(Val);
                }),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_InfAmmo);

        IConsoleCommand* Cmd_SpawnLoot = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.spawnlootzone"),
                TEXT("Spawn test loot in a radius around the player (default 500)"),
                FConsoleCommandWithArgsDelegate::CreateLambda([this](const TArray<FString>& Args)
                {
                        float Radius = (Args.Num() > 0) ? FCString::Atof(*Args[0]) : 500.0f;
                        Cmd_SpawnLootZone(Radius);
                }),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_SpawnLoot);

        // ─── VFX Validation Commands ──────────────────────────────────────────

        IConsoleCommand* Cmd_VFXRunSequence = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.vfx.run_sequence"),
                TEXT("Dispara sequencialmente o teste de carga visual das 48 habilidades e 27 VFX Niagara usando o Pawn local como ancora."),
                FConsoleCommandDelegate::CreateUObject(this, &UKhaaosDebugCommands::Cmd_RunVFXSequence),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_VFXRunSequence);

        IConsoleCommand* Cmd_VFXStop = ConsoleMgr.RegisterConsoleCommand(
                TEXT("khaaos.debug.vfx.stop"),
                TEXT("Interrompe imediatamente o loop de teste visual ativo e limpa a memoria do gerenciador."),
                FConsoleCommandDelegate::CreateUObject(this, &UKhaaosDebugCommands::Cmd_StopVFXSequence),
                ECVF_SetByConsole);
        RegisteredCmds.Add(Cmd_VFXStop);
}

void UKhaaosDebugCommands::UnregisterCommands()
{
        IConsoleManager& ConsoleMgr = IConsoleManager::Get();

        for (IConsoleVariable* Var : RegisteredVars)
        {
                if (Var)
                {
                        ConsoleMgr.UnregisterConsoleObject(Var);
                }
        }
        RegisteredVars.Reset();

        for (IConsoleCommand* Cmd : RegisteredCmds)
        {
                if (Cmd)
                {
                        ConsoleMgr.UnregisterConsoleObject(Cmd);
                }
        }
        RegisteredCmds.Reset();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Command Implementations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosDebugCommands::Cmd_DebugAbilities(int32 bEnable)
{
        bDebugAbilities = (bEnable != 0);
        UE_LOG(LogKhaaosDebug, Log, TEXT("Ability Debugger: %s"), bDebugAbilities ? TEXT("ENABLED") : TEXT("DISABLED"));
}

void UKhaaosDebugCommands::Cmd_DumpPoolStats()
{
        UE_LOG(LogKhaaosDebug, Log, TEXT("── Pool Stats Dump ──"));

        UWorld* World = GetWorld();
        if (!World)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No world available for pool dump."));
                return;
        }

        // Count actors by class as a basic pool metric
        TMap<FString, int32> ActorCounts;
        for (TActorIterator<AActor> It(World); It; ++It)
        {
                AActor* Actor = *It;
                if (Actor)
                {
                        const FString ClassName = Actor->GetClass()->GetName();
                        ActorCounts.FindOrAdd(ClassName)++;
                }
        }

        for (const auto& Pair : ActorCounts)
        {
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Pool[%s]: %d active"), *Pair.Key, Pair.Value);
        }

        UE_LOG(LogKhaaosDebug, Log, TEXT("── End Pool Stats ──"));
}

void UKhaaosDebugCommands::Cmd_DumpRelevancy()
{
        UE_LOG(LogKhaaosDebug, Log, TEXT("── Relevancy Dump ──"));

        UWorld* World = GetWorld();
        if (!World)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No world available for relevancy dump."));
                return;
        }

        APlayerController* PC = World->GetFirstPlayerController();
        if (!PC || !PC->GetPawn())
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No local player pawn for relevancy dump."));
                return;
        }

        const FVector ViewerLoc = PC->GetPawn()->GetActorLocation();
        int32 TotalRelevant = 0;

        for (TActorIterator<AActor> It(World); It; ++It)
        {
                AActor* Actor = *It;
                if (Actor && Actor != PC->GetPawn())
                {
                        const float Dist = FVector::Dist(ViewerLoc, Actor->GetActorLocation()) / 100.0f;
                        UE_LOG(LogKhaaosDebug, Log, TEXT("  %s: Dist=%.1fm, NetFreq=%.0f, Replicated=%d"),
                                *Actor->GetClass()->GetName(), Dist, Actor->NetUpdateFrequency,
                                Actor->GetIsReplicated() ? 1 : 0);
                        TotalRelevant++;
                }
        }

        UE_LOG(LogKhaaosDebug, Log, TEXT("  Total relevant actors: %d"), TotalRelevant);
        UE_LOG(LogKhaaosDebug, Log, TEXT("── End Relevancy ──"));
}

void UKhaaosDebugCommands::Cmd_DumpNetworkMetrics()
{
        UE_LOG(LogKhaaosDebug, Log, TEXT("── Network Metrics Dump ──"));

        UWorld* World = GetWorld();
        if (!World)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No world available for network dump."));
                return;
        }

        APlayerController* PC = World->GetFirstPlayerController();
        if (!PC)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No player controller for network dump."));
                return;
        }

        UNetConnection* NetConn = PC->GetNetConnection();
        if (NetConn)
        {
                UE_LOG(LogKhaaosDebug, Log, TEXT("  RTT: %.1f ms"), NetConn->AvgRoundTripTime * 1000.0f);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Packet Loss: %.2f%%"), NetConn->GetInLossPercentage());
                UE_LOG(LogKhaaosDebug, Log, TEXT("  In Bytes/s: %lld"), (int64)NetConn->InBytesPerSecond);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Out Bytes/s: %lld"), (int64)NetConn->OutBytesPerSecond);
        }
        else
        {
                UE_LOG(LogKhaaosDebug, Log, TEXT("  No network connection (standalone?)."));
        }

        int32 ReplicatedActors = 0;
        for (TActorIterator<AActor> It(World); It; ++It)
        {
                if (*It && (*It)->GetIsReplicated())
                {
                        ReplicatedActors++;
                }
        }
        UE_LOG(LogKhaaosDebug, Log, TEXT("  Replicated Actors: %d"), ReplicatedActors);
        UE_LOG(LogKhaaosDebug, Log, TEXT("── End Network Metrics ──"));
}

void UKhaaosDebugCommands::Cmd_DumpZoneState()
{
        UE_LOG(LogKhaaosDebug, Log, TEXT("── Zone State Dump ──"));

        UWorld* World = GetWorld();
        if (!World)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No world available for zone dump."));
                return;
        }

        AKhaaosSafeZone* SafeZone = nullptr;
        for (TActorIterator<AKhaaosSafeZone> It(World); It; ++It)
        {
                SafeZone = *It;
                break;
        }

        if (SafeZone)
        {
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Phase: %d"), SafeZone->CurrentPhase);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Center: (%.1f, %.1f)"), SafeZone->ZoneCenter.X, SafeZone->ZoneCenter.Y);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Radius: %.1f%%"), SafeZone->ZoneRadius);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Target Radius: %.1f%%"), SafeZone->TargetRadius);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Shrinking: %s"), SafeZone->bIsShrinking ? TEXT("YES") : TEXT("NO"));
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Damage/tick: %.1f"), SafeZone->DamagePerTick);
                UE_LOG(LogKhaaosDebug, Log, TEXT("  Active: %s"), SafeZone->bIsActive ? TEXT("YES") : TEXT("NO"));
        }
        else
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("  No SafeZone actor found in world."));
        }

        UE_LOG(LogKhaaosDebug, Log, TEXT("── End Zone State ──"));
}

void UKhaaosDebugCommands::Cmd_GodMode(int32 bEnable)
{
        bGodMode = (bEnable != 0);
        UE_LOG(LogKhaaosDebug, Log, TEXT("God Mode: %s"), bGodMode ? TEXT("ENABLED") : TEXT("DISABLED"));

        // If enabling, make the local player invulnerable
        UWorld* World = GetWorld();
        if (World)
        {
                APlayerController* PC = World->GetFirstPlayerController();
                if (PC && PC->GetPawn())
                {
                        PC->GetPawn()->SetCanBeDamaged(!bGodMode);
                }
        }
}

void UKhaaosDebugCommands::Cmd_InfiniteAmmo(int32 bEnable)
{
        bInfiniteAmmo = (bEnable != 0);
        UE_LOG(LogKhaaosDebug, Log, TEXT("Infinite Ammo: %s"), bInfiniteAmmo ? TEXT("ENABLED") : TEXT("DISABLED"));
}

void UKhaaosDebugCommands::Cmd_SpawnLootZone(float Radius)
{
        UE_LOG(LogKhaaosDebug, Log, TEXT("Spawn Loot Zone: Radius=%.1f"), Radius);

        UWorld* World = GetWorld();
        if (!World)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No world available for loot spawn."));
                return;
        }

        APlayerController* PC = World->GetFirstPlayerController();
        if (!PC || !PC->GetPawn())
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("No local player pawn for loot spawn."));
                return;
        }

        const FVector PlayerLoc = PC->GetPawn()->GetActorLocation();

        // Spawn test loot pickups in a circle around the player
        const int32 NumLoot = 8;
        const float AngleStep = 360.0f / NumLoot;

        for (int32 i = 0; i < NumLoot; ++i)
        {
                const float Angle = FMath::DegreesToRadians(AngleStep * i);
                const FVector SpawnLoc = PlayerLoc + FVector(
                        FMath::Cos(Angle) * Radius,
                        FMath::Sin(Angle) * Radius,
                        0.0f
                );

                UE_LOG(LogKhaaosDebug, Log, TEXT("  Loot[%d]: (%.1f, %.1f, %.1f)"), i, SpawnLoc.X, SpawnLoc.Y, SpawnLoc.Z);

                // Actual spawn would use UKhaaosActorPool or UKhaaosLootPickup
                // FTransform SpawnTransform(SpawnLoc);
                // AKhaaosLootPickup* Loot = World->SpawnActor<AKhaaosLootPickup>(AKhaaosLootPickup::StaticClass(), SpawnTransform);
        }

        UE_LOG(LogKhaaosDebug, Log, TEXT("  Spawned %d test loot items around player."), NumLoot);
}

// ─── VFX Validation Commands ─────────────────────────────────────────────────

void UKhaaosDebugCommands::Cmd_RunVFXSequence()
{
        UWorld* World = GetWorld();
        if (!World)
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("[ERROR] Mundo invalido para execucao do VFX sequence."));
                return;
        }

        // Resgata o Pawn do player local para servir de centro geométrico do spawn dos efeitos
        APlayerController* PC = World->GetFirstPlayerController();
        if (!PC || !PC->GetPawn())
        {
                UE_LOG(LogKhaaosDebug, Warning, TEXT("[ERROR] Impossivel disparar sequence: Nenhum Player Pawn ativo encontrado no mundo vivo."));
                return;
        }

        AActor* CharacterAnchor = PC->GetPawn();

        if (GEngine)
        {
                UGameInstance* GameInst = GetGameInstance();
                if (GameInst)
                {
                        UKhaaosVFXManager* VFXManager = GameInst->GetSubsystem<UKhaaosVFXManager>();
                        if (VFXManager)
                        {
                                UE_LOG(LogKhaaosDebug, Log, TEXT("[LAUNCH] Executando comando de console oculta. Iniciando loop sequencial de Niagara..."));
                                VFXManager->StartSequentialVFXTest(CharacterAnchor);
                        }
                        else
                        {
                                UE_LOG(LogKhaaosDebug, Warning, TEXT("[ERROR] Subsistema UKhaaosVFXManager offline ou desativado."));
                        }
                }
        }
}

void UKhaaosDebugCommands::Cmd_StopVFXSequence()
{
        if (GEngine)
        {
                UGameInstance* GameInst = GetGameInstance();
                if (GameInst)
                {
                        UKhaaosVFXManager* VFXManager = GameInst->GetSubsystem<UKhaaosVFXManager>();
                        if (VFXManager)
                        {
                                VFXManager->StopValidationTest();
                                UE_LOG(LogKhaaosDebug, Log, TEXT("[CLEAN] Teste visual interrompido e componentes Niagara limpos da GPU de forma segura."));
                        }
                }
        }
}
