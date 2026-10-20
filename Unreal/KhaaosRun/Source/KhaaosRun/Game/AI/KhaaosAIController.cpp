// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AI/KhaaosAIController.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "KhaaosRun.h"

#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "Perception/AIPerceptionComponent.h"
#include "EnvironmentQuery/EnvQuery.h"
#include "EnvironmentQuery/EnvQueryManager.h"
#include "GameFramework/Pawn.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosAIController::AKhaaosAIController()
{
        // ── AI Controller setup ──
        bWantsPlayerState = true;
        bStopAILogicOnPlayerDeactivate = true;

        // ── Perception ──
        AIPerception = CreateDefaultSubobject<UAIPerceptionComponent>(TEXT("AIPerception"));

        // ── Default difficulty parameters ──
        Difficulty          = EAICombatDifficulty::Normal;
        ReactionTime        = 0.5f;
        AimAccuracy         = 0.6f;
        AggressionFactor    = 0.5f;
        RetreatHealthThreshold = 0.25f;
        MaxEngageDistance   = 3000.0f;

        // ── Cached references ──
        BlackboardComp      = nullptr;
        CachedAttributeSet  = nullptr;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosAIController::BeginPlay()
{
        Super::BeginPlay();

        // Auto-run behavior tree if set
        if (CombatBehaviorTree)
        {
                RunCombatBehaviorTree();
        }
}

void AKhaaosAIController::Tick(float DeltaSeconds)
{
        Super::Tick(DeltaSeconds);

        // AI Director tick for high-level decisions
        TickAIDirector(DeltaSeconds);
}

void AKhaaosAIController::OnPossess(APawn* InPawn)
{
        Super::OnPossess(InPawn);

        if (!InPawn)
        {
                return;
        }

        // Cache attribute set from the pawn
        // (Would use a component interface or direct cast in production)
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAIController::OnPossess - Possessed %s"), *InPawn->GetName());

        // Re-run behavior tree with new pawn
        if (CombatBehaviorTree)
        {
                RunCombatBehaviorTree();
        }
}

// ─── Combat AI ──────────────────────────────────────────────────────────────────

bool AKhaaosAIController::RunCombatBehaviorTree()
{
        if (!CombatBehaviorTree)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAIController: No combat behavior tree assigned"));
                return false;
        }

        // Run the behavior tree
        bool bSuccess = RunBehaviorTree(CombatBehaviorTree);

        if (bSuccess)
        {
                // Cache blackboard component
                BlackboardComp = GetBlackboardComponent();

                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAIController: Combat behavior tree started"));
        }
        else
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAIController: Failed to start combat behavior tree"));
        }

        return bSuccess;
}

void AKhaaosAIController::StopCombatBehaviorTree()
{
        UBehaviorTreeComponent* BTComp = Cast<UBehaviorTreeComponent>(BrainComponent);
        if (BTComp)
        {
                BTComp->StopTree(EBTStopMode::Safe);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAIController: Combat behavior tree stopped"));
        }
}

void AKhaaosAIController::SetDifficultyFromElo(int32 PlayerElo)
{
        EAICombatDifficulty NewDifficulty;

        if (PlayerElo < EloEasyThreshold)
        {
                NewDifficulty = EAICombatDifficulty::Easy;
        }
        else if (PlayerElo < EloNormalThreshold)
        {
                NewDifficulty = EAICombatDifficulty::Normal;
        }
        else if (PlayerElo < EloHardThreshold)
        {
                NewDifficulty = EAICombatDifficulty::Hard;
        }
        else
        {
                NewDifficulty = EAICombatDifficulty::Brutal;
        }

        if (NewDifficulty != Difficulty)
        {
                Difficulty = NewDifficulty;
                ApplyDifficultyParams(NewDifficulty);

                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAIController: Difficulty set to %d (ELO=%d)"),
                        static_cast<int32>(NewDifficulty), PlayerElo);
        }
}

EAICombatDifficulty AKhaaosAIController::GetDifficulty() const
{
        return Difficulty;
}

// ─── EQS Queries ────────────────────────────────────────────────────────────────

bool AKhaaosAIController::FindAttackPosition(const AActor* Target, FVector& OutPosition)
{
        if (!AttackPositionQuery)
        {
                return false;
        }

        // Set target in blackboard for EQS context
        if (BlackboardComp && Target)
        {
                BlackboardComp->SetValueAsObject(TEXT("TargetActor"), Target);
        }

        // Run EQS query synchronously (simple approach)
        TArray<FVector> Results;
        EQSRunMode RunMode = EQSRunMode::SingleResult;

        // Note: In production, use async EQS with delegates for better performance
        // This is a simplified synchronous approach
        FEnvQueryRequest QueryRequest(AttackPositionQuery, GetPawn());
        QueryRequest.Execute(RunMode, [this, &OutPosition](TArray<FNavLocation> Results)
        {
                if (Results.Num() > 0)
                {
                        OutPosition = Results[0].Location;
                        return true;
                }
                return false;
        });

        return false;
}

bool AKhaaosAIController::FindCoverPosition(FVector& OutPosition)
{
        if (!CoverPositionQuery)
        {
                return false;
        }

        FEnvQueryRequest QueryRequest(CoverPositionQuery, GetPawn());
        QueryRequest.Execute(EQSRunMode::SingleResult, [&OutPosition](TArray<FNavLocation> Results)
        {
                if (Results.Num() > 0)
                {
                        OutPosition = Results[0].Location;
                        return true;
                }
                return false;
        });

        return false;
}

bool AKhaaosAIController::FindNearestLoot(FVector& OutPosition)
{
        if (!LootPositionQuery)
        {
                return false;
        }

        FEnvQueryRequest QueryRequest(LootPositionQuery, GetPawn());
        QueryRequest.Execute(EQSRunMode::SingleResult, [&OutPosition](TArray<FNavLocation> Results)
        {
                if (Results.Num() > 0)
                {
                        OutPosition = Results[0].Location;
                        return true;
                }
                return false;
        });

        return false;
}

// ─── AI Director ────────────────────────────────────────────────────────────────

void AKhaaosAIController::TickAIDirector(float DeltaSeconds)
{
        // High-level AI director decisions driven by StateTree
        // This is a simplified implementation — full StateTree integration
        // would be in a UStateTreeAsset

        if (!GetPawn())
        {
                return;
        }

        // Strategic decisions:
        // 1. Should we retreat? (low health, outnumbered)
        // 2. Should we push zone? (zone shrinking, outside safe zone)
        // 3. Should we loot? (under-equipped)

        if (ShouldRetreat())
        {
                // Set blackboard flag for retreat
                if (BlackboardComp)
                {
                        BlackboardComp->SetValueAsBool(TEXT("ShouldRetreat"), true);
                }
        }
}

AActor* AKhaaosAIController::SelectTarget()
{
        // Use AI perception to find visible players
        if (!AIPerception)
        {
                return nullptr;
        }

        TArray<AActor*> PerceivedActors;
        AIPerception->GetCurrentlyPerceivedActors(PerceivedActors);

        if (PerceivedActors.Num() == 0)
        {
                return nullptr;
        }

        // Simple target selection: closest perceived actor
        AActor* BestTarget = nullptr;
        float BestDistSq = MAX_FLT;

        FVector MyLocation = GetPawn()->GetActorLocation();

        for (AActor* Actor : PerceivedActors)
        {
                if (!Actor || Actor == GetPawn())
                {
                        continue;
                }

                float DistSq = FVector::DistSquared(Actor->GetActorLocation(), MyLocation);
                if (DistSq < BestDistSq)
                {
                        BestDistSq = DistSq;
                        BestTarget = Actor;
                }
        }

        return BestTarget;
}

bool AKhaaosAIController::ShouldRetreat() const
{
        // Retreat if health below threshold
        if (CachedAttributeSet)
        {
			const float MaxHealth = CachedAttributeSet->GetMaxHealth();
			const float HealthFraction = MaxHealth > 0.0f
				? CachedAttributeSet->GetHealth() / MaxHealth
				: 0.0f;
                if (HealthFraction < RetreatHealthThreshold)
                {
                        return true;
                }
        }

        return false;
}

bool AKhaaosAIController::ShouldPushZone() const
{
        // Push zone if we're outside the safe zone
        // This would check against the SafeZone actor
        if (BlackboardComp)
        {
                bool bOutsideZone = BlackboardComp->GetValueAsBool(TEXT("OutsideSafeZone"));
                return bOutsideZone;
        }

        return false;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void AKhaaosAIController::ApplyDifficultyParams(EAICombatDifficulty NewDifficulty)
{
        switch (NewDifficulty)
        {
        case EAICombatDifficulty::Easy:
                ReactionTime        = 1.0f;
                AimAccuracy         = 0.3f;
                AggressionFactor    = 0.2f;
                RetreatHealthThreshold = 0.4f;
                break;

        case EAICombatDifficulty::Normal:
                ReactionTime        = 0.5f;
                AimAccuracy         = 0.6f;
                AggressionFactor    = 0.5f;
                RetreatHealthThreshold = 0.25f;
                break;

        case EAICombatDifficulty::Hard:
                ReactionTime        = 0.25f;
                AimAccuracy         = 0.85f;
                AggressionFactor    = 0.75f;
                RetreatHealthThreshold = 0.15f;
                break;

        case EAICombatDifficulty::Brutal:
                ReactionTime        = 0.1f;
                AimAccuracy         = 0.98f;
                AggressionFactor    = 0.95f;
                RetreatHealthThreshold = 0.08f;
                break;

        default:
                break;
        }
}
