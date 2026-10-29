// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "KhaaosAIController.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UBehaviorTree;
class UBlackboardComponent;
class UAIPerceptionComponent;
class UEnvQuery;
class UKhaaosAttributeSet;

// ─── AI Difficulty Enum ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EAICombatDifficulty : uint8
{
        Easy      UMETA(DisplayName = "Easy"),
        Normal    UMETA(DisplayName = "Normal"),
        Hard      UMETA(DisplayName = "Hard"),
        Brutal    UMETA(DisplayName = "Brutal")
};

/**
 * AKhaaosAIController
 *
 * AI controller for Khaaos Run NPCs and AI director.
 * Following ActionRoguelike pattern with StateTree-based AI director.
 *
 * Features:
 *   - Behavior tree for combat AI (attack, flee, cover, loot)
 *   - EQS queries for finding attack positions and cover
 *   - Difficulty scaling based on player ELO rating
 *   - AI perception for player detection
 *   - StateTree for high-level AI director decisions
 *     (zone positioning, target selection, tactical retreats)
 *
 * Difficulty scaling (from player ELO):
 *   Easy:    ELO < 800  — slow reaction, poor aim, avoid fights
 *   Normal:  ELO < 1200 — moderate reaction, decent aim
 *   Hard:    ELO < 1600 — fast reaction, good aim, aggressive
 *   Brutal:  ELO >= 1600 — instant reaction, perfect aim, very aggressive
 */
UCLASS(Abstract)
class AKhaaosAIController : public AAIController
{
        GENERATED_BODY()

public:
        AKhaaosAIController();

        // ─── Lifecycle ──────────────────────────────────────────────────────────

        virtual void BeginPlay() override;
        virtual void Tick(float DeltaSeconds) override;
        virtual void OnPossess(APawn* InPawn) override;

        // ─── Combat AI ──────────────────────────────────────────────────────────

        /** Run the behavior tree. Returns true if started successfully. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        bool RunCombatBehaviorTree();

        /** Stop the behavior tree. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        void StopCombatBehaviorTree();

        /** Set combat difficulty based on player ELO rating. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        void SetDifficultyFromElo(int32 PlayerElo);

        /** Get current difficulty. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI")
        EAICombatDifficulty GetDifficulty() const;

        // ─── EQS Queries ────────────────────────────────────────────────────────

        /** Find best attack position near a target. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        bool FindAttackPosition(const AActor* Target, FVector& OutPosition);

        /** Find nearest cover position. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        bool FindCoverPosition(FVector& OutPosition);

        /** Find nearest loot pickup. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        bool FindNearestLoot(FVector& OutPosition);

        // ─── AI Director ────────────────────────────────────────────────────────

        /**
         * AI Director tick: high-level strategic decisions.
         * StateTree-driven: zone positioning, target selection,
         * tactical retreats, loot priorities.
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        void TickAIDirector(float DeltaSeconds);

        /** Select the best target from visible players. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI")
        AActor* SelectTarget();

        /** Decide whether to retreat (low health, outnumbered). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI")
        bool ShouldRetreat() const;

        /** Decide whether to push toward the zone center. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI")
        bool ShouldPushZone() const;

        // ─── Configuration ──────────────────────────────────────────────────────

        /** Combat behavior tree asset. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UBehaviorTree> CombatBehaviorTree;

        /** EQS query for attack positions. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UEnvQuery> AttackPositionQuery;

        /** EQS query for cover positions. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UEnvQuery> CoverPositionQuery;

        /** EQS query for loot positions. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UEnvQuery> LootPositionQuery;

        /** AI perception component. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UAIPerceptionComponent> AIPerception;

        /** Current combat difficulty. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI")
        EAICombatDifficulty Difficulty;

        // ─── Difficulty Parameters ──────────────────────────────────────────────

        /** Reaction time in seconds (lower = harder). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Difficulty")
        float ReactionTime;

        /** Aim accuracy 0-1 (higher = harder). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Difficulty")
        float AimAccuracy;

        /** Aggression factor 0-1 (higher = more aggressive). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Difficulty")
        float AggressionFactor;

        /** Health threshold for retreat (0-1 fraction). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Difficulty")
        float RetreatHealthThreshold;

        /** Maximum distance to engage in combat. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Difficulty")
        float MaxEngageDistance;

        // ─── Locomotion Life (anti-robotization) ──────────────────────────────

        /** Per-bot deterministic speed multiplier (0.88..1.12, set on possess). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Locomotion")
        float GaitSpeedMultiplier = 1.0f;

        /** Per-bot deterministic turn rate multiplier (0.75..1.25). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Locomotion")
        float TurnRateMultiplier = 1.0f;

        /** Gait wobble frequency (Hz) — subtle sinusoidal speed life. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Locomotion")
        float GaitWobbleHz = 0.5f;

        /** Gait wobble phase (rad). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Locomotion")
        float GaitWobblePhase = 0.0f;

protected:

        /** Blackboard component (auto-created with behavior tree). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UBlackboardComponent> BlackboardComp;

        /** Cached attribute set of the controlled pawn. */
        UPROPERTY()
        TObjectPtr<UKhaaosAttributeSet> CachedAttributeSet;

        /** Apply difficulty parameters to AI behavior. */
        void ApplyDifficultyParams(EAICombatDifficulty NewDifficulty);

        /** Tick the subtle gait wobble (velocity is never a constant line). */
        void TickGaitWobble(float DeltaSeconds);

        /** Re-apply MaxWalkSpeed from gait signature + wobble. */
        void ApplyGaitSpeed();

        /** ELO thresholds for difficulty selection. */
        static constexpr int32 EloEasyThreshold = 800;
        static constexpr int32 EloNormalThreshold = 1200;
        static constexpr int32 EloHardThreshold = 1600;
};
