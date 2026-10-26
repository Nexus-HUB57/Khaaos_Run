// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AI/KhaaosBotBehaviorTree.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "KhaaosRun.h"

#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "Perception/AIPerceptionComponent.h"
#include "Perception/AISense_Sight.h"
#include "Perception/AISense_Hearing.h"
#include "Navigation/NavFilter_AIController.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosBotAI::AKhaaosBotAI()
{
        PrimaryActorTick.bCanEverTick = true;
        PrimaryActorTick.bStartWithTickEnabled = true;

        bInCombat = false;
        bIsLooting = false;
        bFleeingZone = false;
        bRevivingAlly = false;

        CurrentSquadId = -1;
        TimeSinceLastDecision = 0.0f;
        CurrentTarget = nullptr;

        // Perception component (shared sense config for efficiency)
        UAIPerceptionComponent* PerceptionComp = CreateDefaultSubobject<UAIPerceptionComponent>(TEXT("BotPerception"));
        if (PerceptionComp)
        {
                UAISenseConfig_Sight* SightConfig = CreateDefaultSubobject<UAISenseConfig_Sight>(TEXT("SightConfig"));
                SightConfig->SightRadius = 3000.0f;
                SightConfig->LoseSightRadius = 3500.0f;
                SightConfig->PeripheralVisionAngleDegrees = 90.0f;
                SightConfig->DetectionByAffiliation.bDetectEnemies = true;
                SightConfig->DetectionByAffiliation.bDetectNeutrals = true;
                PerceptionComp->ConfigureSense(*SightConfig);

                UAISenseConfig_Hearing* HearingConfig = CreateDefaultSubobject<UAISenseConfig_Hearing>(TEXT("HearingConfig"));
                HearingConfig->HearingRange = 2000.0f;
                PerceptionComp->ConfigureSense(*HearingConfig);

                PerceptionComp->SetDominantSense(UAISense_Sight::StaticClass());
        }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosBotAI::BeginPlay()
{
        Super::BeginPlay();

        // Run behavior tree if assigned
        if (BotBehaviorTree && UseBlackboard(BotBehaviorTree->BlackboardAsset, Blackboard))
        {
                RunBehaviorTree(BotBehaviorTree);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotAI: Behavior tree started for role %d"), (int32)Profile.Role);
        }
}

void AKhaaosBotAI::Tick(float DeltaSeconds)
{
        Super::Tick(DeltaSeconds);

        // Throttle AI evaluation based on profile decision interval
        TimeSinceLastDecision += DeltaSeconds;
        if (TimeSinceLastDecision >= Profile.DecisionInterval)
        {
                EvaluateBehavior(TimeSinceLastDecision);
                TimeSinceLastDecision = 0.0f;
        }

        // Always update perception and zone threat (lightweight)
        UpdatePerception();
        CheckZoneThreat();
}

void AKhaaosBotAI::OnPossess(APawn* InPawn)
{
        Super::OnPossess(InPawn);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotAI: Possessed pawn with difficulty %d, role %d"),
                (int32)Profile.Difficulty, (int32)Profile.Role);
}

// ─── Bot Initialization ────────────────────────────────────────────────────────

void AKhaaosBotAI::InitializeBot(const FKhaaosBotProfile& InProfile)
{
        Profile = InProfile;
        ApplyDifficultyProfile(Profile.Difficulty);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotAI::InitializeBot - Difficulty: %d, Role: %d, ReactionTime: %.2fs, Accuracy: %.0f%%"),
                (int32)Profile.Difficulty, (int32)Profile.Role, Profile.ReactionTime, Profile.BaseAccuracy * 100.0f);
}

// ─── Adaptive AI ───────────────────────────────────────────────────────────────

void AKhaaosBotAI::AdaptDifficulty(float PlayerKillDeathRatio, float AvgPlacement)
{
        if (Profile.Difficulty != EKhaaosBotDifficulty::Adaptive)
        {
                return; // Only adapt in adaptive mode
        }

        EKhaaosBotDifficulty NewDifficulty = EKhaaosBotDifficulty::Regular;

        // High K/D and high placement → harder bots
        if (PlayerKillDeathRatio > 3.0f && AvgPlacement < 5.0f)
        {
                NewDifficulty = EKhaaosBotDifficulty::Mythic;
        }
        else if (PlayerKillDeathRatio > 2.0f && AvgPlacement < 10.0f)
        {
                NewDifficulty = EKhaaosBotDifficulty::Veteran;
        }
        else if (PlayerKillDeathRatio > 1.0f && AvgPlacement < 20.0f)
        {
                NewDifficulty = EKhaaosBotDifficulty::Elite;
        }
        else if (PlayerKillDeathRatio < 0.5f && AvgPlacement > 40.0f)
        {
                NewDifficulty = EKhaaosBotDifficulty::Recruit;
        }

        ApplyDifficultyProfile(NewDifficulty);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotAI::AdaptDifficulty - PlayerKD: %.1f, AvgPlace: %.0f → Difficulty: %d"),
                PlayerKillDeathRatio, AvgPlacement, (int32)NewDifficulty);

        OnBotDifficultyAdapted.Broadcast(this, NewDifficulty);
}

// ─── Squad Coordination ────────────────────────────────────────────────────────

void AKhaaosBotAI::AssignToSquad(int32 SquadId)
{
        CurrentSquadId = SquadId;

        // Update blackboard for squad behavior
        if (Blackboard)
        {
                Blackboard->SetValueAsInt(TEXT("SquadId"), SquadId);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotAI::AssignToSquad - Bot assigned to squad %d"), SquadId);
}

void AKhaaosBotAI::LeaveSquad()
{
        CurrentSquadId = -1;

        if (Blackboard)
        {
                Blackboard->ClearValue(TEXT("SquadId"));
        }
}

// ─── Combat ─────────────────────────────────────────────────────────────────────

void AKhaaosBotAI::EngageTarget(AActor* Target)
{
        if (!Target)
        {
                return;
        }

        CurrentTarget = Target;
        bInCombat = true;

        if (Blackboard)
        {
                Blackboard->SetValueAsObject(TEXT("TargetActor"), Target);
                Blackboard->SetValueAsBool(TEXT("InCombat"), true);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotAI::EngageTarget - Engaging %s"), *Target->GetName());
}

void AKhaaosBotAI::Disengage()
{
        CurrentTarget = nullptr;
        bInCombat = false;

        if (Blackboard)
        {
                Blackboard->ClearValue(TEXT("TargetActor"));
                Blackboard->SetValueAsBool(TEXT("InCombat"), false);
        }
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void AKhaaosBotAI::EvaluateBehavior(float DeltaSeconds)
{
        // Priority-based behavior evaluation:
        // 1. Zone flee (critical survival)
        // 2. Revive ally (if close and safe)
        // 3. Combat (if target visible)
        // 4. Looting (if items nearby)
        // 5. Movement/rotation

        if (bFleeingZone)
        {
                // Zone flee is already being handled
                return;
        }

        // Check for revive opportunity
        if (!bInCombat && Profile.ReviveAllyProbability > FMath::FRand())
        {
                // Would check for downed allies in squad proximity
                bRevivingAlly = true;
        }

        // Loot if not in combat
        if (!bInCombat && !bIsLooting)
        {
                AActor* LootTarget = SelectLootTarget();
                if (LootTarget)
                {
                        bIsLooting = true;
                        if (Blackboard)
                        {
                                Blackboard->SetValueAsObject(TEXT("LootTarget"), LootTarget);
                        }
                }
        }
}

void AKhaaosBotAI::UpdatePerception()
{
        // Perception is handled by UAIPerceptionComponent automatically.
        // This method can add custom logic like filtering perceived actors
        // based on difficulty (lower difficulty = slower perception updates).
}

void AKhaaosBotAI::CheckZoneThreat()
{
        if (!GetWorld() || !GetPawn())
        {
                return;
        }

        // Find safe zone and check if bot is outside
        TArray<AActor*> SafeZones;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);

        if (SafeZones.Num() > 0)
        {
                AKhaaosSafeZone* Zone = Cast<AKhaaosSafeZone>(SafeZones[0]);
                if (Zone)
                {
                        const FVector BotLocation = GetPawn()->GetActorLocation();
                        const bool bInsideZone = Zone->UsesWorldSpaceZone()
                                ? Zone->IsInsideWorldZone(BotLocation)
                                : true; // Default to inside if not using world zone

                        if (!bInsideZone && ZoneAwareness > 0.3f)
                        {
                                bFleeingZone = true;
                                if (Blackboard)
                                {
                                        Blackboard->SetValueAsBool(TEXT("FleeingZone"), true);
                                        Blackboard->SetValueAsVector(TEXT("ZoneCenter"), Zone->GetActorLocation());
                                }
                        }
                        else
                        {
                                bFleeingZone = false;
                                if (Blackboard)
                                {
                                        Blackboard->ClearValue(TEXT("FleeingZone"));
                                }
                        }
                }
        }
}

AActor* AKhaaosBotAI::SelectLootTarget()
{
        // Find nearby loot pickups and select the best one based on
        // rarity, distance, and bot's current equipment
        TArray<AActor*> LootPickups;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosLootPickup::StaticClass(), LootPickups);

        AActor* BestLoot = nullptr;
        float BestScore = -1.0f;
        const FVector BotLocation = GetPawn() ? GetPawn()->GetActorLocation() : FVector::ZeroVector;

        for (AActor* Loot : LootPickups)
        {
                if (!Loot) continue;

                const float Distance = FVector::Dist(BotLocation, Loot->GetActorLocation());
                if (Distance > 5000.0f) continue; // Max loot search range

                // Score: rarity / distance (prefer close + high rarity)
                float Score = 100.0f / (Distance + 100.0f);
                if (Score > BestScore)
                {
                        BestScore = Score;
                        BestLoot = Loot;
                }
        }

        return BestLoot;
}

void AKhaaosBotAI::ApplyDifficultyProfile(EKhaaosBotDifficulty Difficulty)
{
        // Apply difficulty-specific parameters
        switch (Difficulty)
        {
        case EKhaaosBotDifficulty::Recruit:
                Profile.ReactionTime = 1.5f;
                Profile.BaseAccuracy = 0.25f;
                Profile.Aggression = 0.2f;
                Profile.DecisionInterval = 1.0f;
                Profile.ZoneAwareness = 0.4f;
                break;

        case EKhaaosBotDifficulty::Regular:
                Profile.ReactionTime = 1.0f;
                Profile.BaseAccuracy = 0.45f;
                Profile.Aggression = 0.5f;
                Profile.DecisionInterval = 0.5f;
                Profile.ZoneAwareness = 0.6f;
                break;

        case EKhaaosBotDifficulty::Elite:
                Profile.ReactionTime = 0.6f;
                Profile.BaseAccuracy = 0.65f;
                Profile.Aggression = 0.7f;
                Profile.DecisionInterval = 0.3f;
                Profile.ZoneAwareness = 0.8f;
                break;

        case EKhaaosBotDifficulty::Veteran:
                Profile.ReactionTime = 0.3f;
                Profile.BaseAccuracy = 0.80f;
                Profile.Aggression = 0.8f;
                Profile.DecisionInterval = 0.2f;
                Profile.ZoneAwareness = 0.9f;
                break;

        case EKhaaosBotDifficulty::Mythic:
                Profile.ReactionTime = 0.15f;
                Profile.BaseAccuracy = 0.92f;
                Profile.Aggression = 0.9f;
                Profile.DecisionInterval = 0.1f;
                Profile.ZoneAwareness = 0.95f;
                break;

        case EKhaaosBotDifficulty::Adaptive:
                // Adaptive starts at Regular, will be adjusted by AdaptDifficulty()
                Profile.ReactionTime = 1.0f;
                Profile.BaseAccuracy = 0.45f;
                Profile.Aggression = 0.5f;
                Profile.DecisionInterval = 0.5f;
                Profile.ZoneAwareness = 0.6f;
                break;
        }
}
