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
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"

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

        // Locomotion life: gait wobble so bots never hold constant speed.
        TickGaitWobble(DeltaSeconds);
}

void AKhaaosAIController::OnPossess(APawn* InPawn)
{
        Super::OnPossess(InPawn);

        if (!InPawn)
        {
                return;
        }

        // ── Anti-robotization: individualize bot locomotion ──
        // Bots moving at identical speeds with identical turn rates read as
        // a marching squad even when their AI decisions are good. Each bot
        // gets a deterministic locomotion signature derived from its name:
        //   - ±12% speed multiplier
        //   - ±25% yaw turn rate
        //   - subtle sinusoidal "gait wobble" on top speed (±3%) so nobody
        //     ever holds a perfectly constant velocity.
        if (ACharacter* Char = Cast<ACharacter>(InPawn))
        {
                if (UCharacterMovementComponent* MoveComp = Char->GetCharacterMovement())
                {
                        uint32 Hash = 2166136261u;
                        const FString PawnName = InPawn->GetName();
                        for (const TCHAR C : PawnName)
                        {
                                Hash ^= static_cast<uint32>(C);
                                Hash *= 16777619u;
                        }

                        const float R1 = static_cast<float>((Hash >> 8) & 0xFFFF) / 65535.0f;   // [0,1]
                        const float R2 = static_cast<float>((Hash >> 20) & 0xFFFF) / 65535.0f;  // [0,1]

                        GaitSpeedMultiplier = FMath::Lerp(0.88f, 1.12f, R1);
                        TurnRateMultiplier  = FMath::Lerp(0.75f, 1.25f, R2);
                        GaitWobbleHz        = FMath::Lerp(0.35f, 0.65f, R1);
                        GaitWobblePhase     = R2 * 2.0f * PI;

                        MoveComp->bOrientRotationToMovement = true;
                        MoveComp->RotationRate = FRotator(0.0f, 540.0f * TurnRateMultiplier, 0.0f);
                        MoveComp->MaxAcceleration = 1500.0f;
                        MoveComp->BrakingDecelerationWalking = 950.0f;
                        MoveComp->GroundFriction = 6.5f;
                        MoveComp->NetworkSmoothingMode = ENetworkSmoothingMode::Exponential;

                        ApplyGaitSpeed();
                }
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

void AKhaaosAIController::TickGaitWobble(float DeltaSeconds)
{
        // Subtle speed modulation so bot velocity is never a constant line.
        if (!GetPawn())
        {
                return;
        }

        GaitWobblePhase += GaitWobbleHz * 2.0f * PI * DeltaSeconds;
        ApplyGaitSpeed();
}

void AKhaaosAIController::ApplyGaitSpeed()
{
        ACharacter* Char = Cast<ACharacter>(GetPawn());
        if (!Char)
        {
                return;
        }

        UCharacterMovementComponent* MoveComp = Char->GetCharacterMovement();
        if (!MoveComp)
        {
                return;
        }

        const float Wobble = 1.0f + FMath::Sin(GaitWobblePhase) * 0.03f;
        const float BaseSpeed = Char->IsCrouching() ? 300.0f : 600.0f;
        MoveComp->MaxWalkSpeed = BaseSpeed * GaitSpeedMultiplier * Wobble;
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
                float HealthFraction = CachedAttributeSet->Health / CachedAttributeSet->MaxHealth;
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
