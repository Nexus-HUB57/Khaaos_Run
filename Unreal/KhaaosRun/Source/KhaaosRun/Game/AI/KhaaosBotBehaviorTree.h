// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "Game/AI/KhaaosBotBehaviorTree.generated.h"

// ─── Bot Difficulty & Behavior Types ────────────────────────────────────────────

/**
 * EKhaaosBotDifficulty
 * Scaling difficulty for bot AI (Free Fire inspired).
 * Affects reaction time, accuracy, decision frequency, and aggression.
 */
UENUM(BlueprintType)
enum class EKhaaosBotDifficulty : uint8
{
        Recruit     UMETA(DisplayName = "RECRUIT"),     // Reaction 1.5s, Accuracy 25%, Passive
        Regular     UMETA(DisplayName = "REGULAR"),     // Reaction 1.0s, Accuracy 45%, Balanced
        Elite       UMETA(DisplayName = "ELITE"),       // Reaction 0.6s, Accuracy 65%, Aggressive
        Veteran     UMETA(DisplayName = "VETERAN"),     // Reaction 0.3s, Accuracy 80%, Tactical
        Mythic      UMETA(DisplayName = "MYTHIC"),      // Reaction 0.15s, Accuracy 92%, Expert
        Adaptive    UMETA(DisplayName = "ADAPTIVE")     // Scales with player performance
};

/**
 * EKhaaosBotRole
 * Tactical role assigned to each bot for squad behavior.
 */
UENUM(BlueprintType)
enum class EKhaaosBotRole : uint8
{
        Assault     UMETA(DisplayName = "ASSAULT"),     // Aggressive push, SMG/AR
        Sniper      UMETA(DisplayName = "SNIPER"),      // Long range, position hold
        Support     UMETA(DisplayName = "SUPPORT"),     // Healing, reviving, loot sharing
        Flanker     UMETA(DisplayName = "FLANKER"),     // Side attacks, ambush
        Defender    UMETA(DisplayName = "DEFENDER"),    // Area denial, zone edge hold
        Scout       UMETA(DisplayName = "SCOUT")        // Info gathering, early warning
};

/**
 * FKhaaosBotProfile
 * Complete configuration for a bot's behavior parameters.
 */
USTRUCT(BlueprintType)
struct FKhaaosBotProfile
{
        GENERATED_BODY()

        /** Difficulty tier. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        EKhaaosBotDifficulty Difficulty = EKhaaosBotDifficulty::Regular;

        /** Tactical role. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        EKhaaosBotRole Role = EKhaaosBotRole::Assault;

        /** Reaction time in seconds (lower = faster). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float ReactionTime = 1.0f;

        /** Base accuracy 0-1 (before skill variation). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float BaseAccuracy = 0.45f;

        /** Aggression factor 0-1 (higher = more aggressive). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float Aggression = 0.5f;

        /** Decision update interval in seconds. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float DecisionInterval = 0.5f;

        /** Max engagement range (cm). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float MaxEngagementRange = 3000.0f;

        /** Preferred engagement range (cm). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float PreferredEngagementRange = 1500.0f;

        /** Looting priority 0-1. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float LootPriority = 0.6f;

        /** Zone awareness 0-1 (higher = stays closer to zone center). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float ZoneAwareness = 0.7f;

        /** Revive ally probability 0-1. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        float ReviveAllyProbability = 0.4f;

        /** Species for this bot. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        uint8 SpeciesId = 0;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnBotDecision, class AKhaaosBotAI*, Bot, const FString&, Decision, float, Confidence);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnBotDifficultyAdapted, class AKhaaosBotAI*, Bot, EKhaaosBotDifficulty, NewDifficulty);

/**
 * AKhaaosBotAI
 *
 * Advanced bot AI controller with behavior tree, difficulty scaling, and
 * squad coordination. Inspired by Free Fire's bot system with 5 difficulty
 * tiers plus adaptive mode that scales based on player performance.
 *
 * Architecture:
 *   - Behavior Tree: Root selector with 6 role-specific subtrees
 *   - Blackboard: Shared state with player tracking, zone info, loot awareness
 *   - Decision Loop: Tick-based evaluation at role-specific intervals
 *   - Squad Coordination: Shared squad blackboard, formation logic
 *   - Adaptive AI: Player kill/death ratio drives difficulty adjustment
 *
 * Behavior Tree Structure:
 *   Root (Selector)
 *   ├── Critical (Sequence): Revive Ally, Flee Zone, Emergency Heal
 *   ├── Combat (Selector): Engage Target, Flank, Suppress, Peek
 *   ├── Looting (Sequence): Navigate to Loot, Pick Up, Equip Best
 *   ├── Movement (Selector): Rotate Zone, Reposition, Patrol
 *   ├── Squad (Sequence): Follow Leader, Coordinate, Share Info
 *   └── Idle (Sequence): Wander, Look Around, Wait
 *
 * Free Fire Parity:
 *   - Bots fill matches when player count < target
 *   - Difficulty scales with match phase (easier early, harder endgame)
 *   - Bots exhibit human-like behaviors (looting, zoning, rotating)
 *   - No "obvious bot" movement patterns (smooth pathing, realistic looting)
 *
 * Console Budget:
 *   - AI tick budget: 1ms per bot on PS5/XSX (shared across 50 bots = 50ms total)
 *   - Pathfinding: NavMesh with hierarchical pathfinding for efficiency
 *   - Perception: Shared AISense config, limited sight ranges per difficulty
 */
UCLASS(Abstract, BlueprintType)
class AKhaaosBotAI : public AAIController
{
        GENERATED_BODY()

public:

        AKhaaosBotAI();

        virtual void BeginPlay() override;
        virtual void Tick(float DeltaSeconds) override;
        virtual void OnPossess(APawn* InPawn) override;

        // ─── Bot Profile ──────────────────────────────────────────────────────

        /** Initialize bot with profile and role. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Bot")
        void InitializeBot(const FKhaaosBotProfile& InProfile);

        /** Get current bot profile. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Bot")
        const FKhaaosBotProfile& GetBotProfile() const { return Profile; }

        /** Get current difficulty. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Bot")
        EKhaaosBotDifficulty GetDifficulty() const { return Profile.Difficulty; }

        // ─── Adaptive AI ──────────────────────────────────────────────────────

        /**
         * Adapt difficulty based on player performance metrics.
         * Called at match phase transitions and periodically.
         * @param PlayerKillDeathRatio Player K/D in current match
         * @param AvgPlacement Player's average placement over last 5 matches
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Bot")
        void AdaptDifficulty(float PlayerKillDeathRatio, float AvgPlacement);

        // ─── Squad Coordination ────────────────────────────────────────────────

        /** Assign bot to squad. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Bot")
        void AssignToSquad(int32 SquadId);

        /** Leave current squad. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Bot")
        void LeaveSquad();

        /** Get squad ID (-1 if not in squad). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Bot")
        int32 GetSquadId() const { return CurrentSquadId; }

        // ─── Combat ───────────────────────────────────────────────────────────

        /** Engage a target (begin combat behavior). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Bot")
        void EngageTarget(AActor* Target);

        /** Disengage from current target. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Bot")
        void Disengage();

        /** Get current target. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Bot")
        AActor* GetCurrentTarget() const { return CurrentTarget; }

        // ─── State Queries ────────────────────────────────────────────────────

        /** Is bot currently in combat? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        uint8 bInCombat : 1;

        /** Is bot currently looting? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        uint8 bIsLooting : 1;

        /** Is bot fleeing zone? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        uint8 bFleeingZone : 1;

        /** Is bot reviving ally? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        uint8 bRevivingAlly : 1;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|AI|Bot")
        FOnBotDecision OnBotDecision;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|AI|Bot")
        FOnBotDifficultyAdapted OnBotDifficultyAdapted;

protected:

        /** Bot profile (difficulty, role, parameters). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        FKhaaosBotProfile Profile;

        /** Current combat target. */
        UPROPERTY()
        TWeakObjectPtr<AActor> CurrentTarget;

        /** Squad assignment (-1 = no squad). */
        int32 CurrentSquadId;

        /** Time since last decision evaluation. */
        float TimeSinceLastDecision;

        /** Behavior tree asset reference. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Bot")
        class UBehaviorTree* BotBehaviorTree;

        // ─── Internal ─────────────────────────────────────────────────────────

        /** Evaluate and execute behavior tree. */
        void EvaluateBehavior(float DeltaSeconds);

        /** Update perception (sight, hearing). */
        void UpdatePerception();

        /** Check zone threat and flee if needed. */
        void CheckZoneThreat();

        /** Select best loot target. */
        AActor* SelectLootTarget();

        /** Apply difficulty profile parameters. */
        void ApplyDifficultyProfile(EKhaaosBotDifficulty Difficulty);
};
