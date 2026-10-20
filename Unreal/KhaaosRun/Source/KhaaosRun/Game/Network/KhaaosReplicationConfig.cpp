// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Network/KhaaosReplicationConfig.h"
#include "KhaaosRun.h"

#include "GameFramework/PlayerState.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/Character.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── UKhaaosReplicationConfigSubsystem ─────────────────────────────────────────

UKhaaosReplicationConfigSubsystem::UKhaaosReplicationConfigSubsystem()
{
        bEnableIris = true;
        bUseSpatialRelevancy = true;
}

void UKhaaosReplicationConfigSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::Initialize - Configuring replication"));

        // Initialize Iris replication settings
        InitIrisReplication();

        // Configure net driver tick rates
        ConfigureNetDriver();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::Initialize - "
                "Iris: %s, Spatial: %s, Radius: %.0f, Hysteresis: %.0f, "
                "MaxClientUpdate: %d, ServerTick: %d, NetServerTick: %d"),
                bEnableIris ? TEXT("ON") : TEXT("OFF"),
                bUseSpatialRelevancy ? TEXT("ON") : TEXT("OFF"),
                IrisPrioritySettings.SpatialRelevancyRadius,
                IrisPrioritySettings.SpatialRelevancyHysteresis,
                MaxClientUpdateRate, ServerMaxTickRate, NetServerMaxTickRate);
}

void UKhaaosReplicationConfigSubsystem::Deinitialize()
{
        Super::Deinitialize();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::Deinitialize"));
}

void UKhaaosReplicationConfigSubsystem::ApplyReplicationSettings(AActor* Actor) const
{
        if (!Actor)
        {
                return;
        }

        // ─── Apply NetUpdateFrequency based on actor type ─────────────────────

        if (Actor->IsA<APlayerState>())
        {
                Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.PlayerStateNetUpdate;
                Actor->NetPriority = IrisPrioritySettings.PlayerStatePriority;
        }
        else if (Actor->IsA<AGameStateBase>())
        {
                Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.GameStateNetUpdate;
                Actor->NetPriority = IrisPrioritySettings.GameStatePriority;
        }
        else if (Actor->IsA<AGameModeBase>())
        {
                Actor->NetUpdateFrequency = 1.0f; // GameMode rarely needs updates
                Actor->NetPriority = IrisPrioritySettings.GameModePriority;
        }
        else if (Actor->IsA<ACharacter>())
        {
                // Check if AI-controlled
                APawn* Pawn = Cast<APawn>(Actor);
                if (Pawn && !Pawn->IsPlayerControlled())
                {
                        Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.AINetUpdate;
                        Actor->NetPriority = IrisPrioritySettings.AIPriority;
                }
                else
                {
                        // Player character uses PlayerState frequency
                        Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.PlayerStateNetUpdate;
                        Actor->NetPriority = IrisPrioritySettings.PlayerStatePriority;
                }
        }
        else
        {
                // Check for projectile by name convention or interface
                FString ActorName = Actor->GetName();
                if (ActorName.Contains(TEXT("Projectile")))
                {
                        Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.ProjectileNetUpdate;
                        Actor->NetPriority = IrisPrioritySettings.ProjectilePriority;
                }
                else if (ActorName.Contains(TEXT("Loot")) || ActorName.Contains(TEXT("Pickup")))
                {
                        Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.LootNetUpdate;
                        Actor->NetPriority = IrisPrioritySettings.LootPriority;
                }
                else if (ActorName.Contains(TEXT("Zone")) || ActorName.Contains(TEXT("SafeZone")))
                {
                        Actor->NetUpdateFrequency = NetUpdateFrequencyConfig.ZoneNetUpdate;
                        Actor->NetPriority = IrisPrioritySettings.GameStatePriority;
                }
        }

        // ─── Enable push model replication for all replicated actors ───────────
        // Push model reduces bandwidth by only sending changed properties
        Actor->bReplicateMovement = true;

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosReplicationConfigSubsystem::ApplyReplicationSettings - "
                "%s: Freq=%.1f, Priority=%d"),
                *Actor->GetName(), Actor->NetUpdateFrequency, Actor->NetPriority);
}

void UKhaaosReplicationConfigSubsystem::InitIrisReplication()
{
        if (!bEnableIris)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosReplicationConfigSubsystem::InitIrisReplication - Iris is DISABLED"));
                return;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::InitIrisReplication - "
                "Configuring Iris: Spatial=%s, Radius=%.0f, Hysteresis=%.0f"),
                bUseSpatialRelevancy ? TEXT("ON") : TEXT("OFF"),
                IrisPrioritySettings.SpatialRelevancyRadius,
                IrisPrioritySettings.SpatialRelevancyHysteresis);

        // ─── Set Iris console variables ───────────────────────────────────────
        // These configure the IrisNetDriver at runtime

        if (bUseSpatialRelevancy)
        {
                // Set spatial relevancy radius
                IConsoleVariable* RadiusCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("Iris.SpatialRelevancyRadius"));
                if (RadiusCVar)
                {
                        RadiusCVar->Set(IrisPrioritySettings.SpatialRelevancyRadius);
                }

                // Set spatial relevancy hysteresis
                IConsoleVariable* HysteresisCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("Iris.SpatialRelevancyHysteresis"));
                if (HysteresisCVar)
                {
                        HysteresisCVar->Set(IrisPrioritySettings.SpatialRelevancyHysteresis);
                }
        }

        // Log priority settings
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::InitIrisReplication - "
                "Priorities: PS=%d, GS=%d, GM=%d, Proj=%d, Loot=%d, AI=%d, VFX=%d"),
                IrisPrioritySettings.PlayerStatePriority,
                IrisPrioritySettings.GameStatePriority,
                IrisPrioritySettings.GameModePriority,
                IrisPrioritySettings.ProjectilePriority,
                IrisPrioritySettings.LootPriority,
                IrisPrioritySettings.AIPriority,
                IrisPrioritySettings.VFXPriority);
}

void UKhaaosReplicationConfigSubsystem::ConfigureNetDriver()
{
        // ─── Set net driver tick rate console variables ───────────────────────

        // NetServerMaxTickRate: server tick rate for networking
        IConsoleVariable* NetServerMaxTickCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("NetServerMaxTickRate"));
        if (NetServerMaxTickCVar)
        {
                NetServerMaxTickCVar->Set(NetServerMaxTickRate);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::ConfigureNetDriver - NetServerMaxTickRate = %d"), NetServerMaxTickRate);
        }

        // MaxClientUpdateRate: client update rate limit
        IConsoleVariable* MaxClientUpdateCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("Net.MaxClientUpdateRate"));
        if (MaxClientUpdateCVar)
        {
                MaxClientUpdateCVar->Set(MaxClientUpdateRate);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::ConfigureNetDriver - MaxClientUpdateRate = %d"), MaxClientUpdateRate);
        }

        // ─── Optimization cvars ───────────────────────────────────────────────

        // Enable network actor usage range (distance-based relevancy)
        IConsoleVariable* UsageRangeCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("bUseNetworkActorUsageRange"));
        if (UsageRangeCVar)
        {
                UsageRangeCVar->Set(1);
        }

        // Optimize actor replication
        IConsoleVariable* OptimizeCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("bOptimizeActorReplication"));
        if (OptimizeCVar)
        {
                OptimizeCVar->Set(1);
        }

        // Net relevant actor distance scale
        IConsoleVariable* DistScaleCVar = IConsoleManager::Get().FindConsoleVariable(TEXT("NetRelevantActorDistanceScale"));
        if (DistScaleCVar)
        {
                DistScaleCVar->Set(1.0f);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplicationConfigSubsystem::ConfigureNetDriver - "
                "MaxClientUpdate: %d, ServerTick: %d, NetServerTick: %d"),
                MaxClientUpdateRate, ServerMaxTickRate, NetServerMaxTickRate);
}
