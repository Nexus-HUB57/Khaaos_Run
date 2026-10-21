// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Game/AI/KhaaosBotBehaviorTree.h"
#include "Game/AI/KhaaosBotSpawner.generated.h"

// ─── Bot Spawn Configuration ───────────────────────────────────────────────────

/**
 * FKhaaosBotSpawnRule
 * Rule for when and how many bots to spawn during a match.
 */
USTRUCT(BlueprintType)
struct FKhaaosBotSpawnRule
{
        GENERATED_BODY()

        /** Players alive threshold (spawn bots when players < this). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Spawn")
        int32 PlayersAliveThreshold = 30;

        /** Min bots to maintain. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Spawn")
        int32 MinBots = 5;

        /** Max bots alive simultaneously. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Spawn")
        int32 MaxBots = 20;

        /** Default difficulty for spawned bots. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Spawn")
        EKhaaosBotDifficulty DefaultDifficulty = EKhaaosBotDifficulty::Regular;

        /** Difficulty scaling by match phase (0=early easy, 1=late hard). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Spawn")
        bool bScaleWithMatchPhase = true;

        /** Spawn check interval (seconds). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AI|Spawn")
        float SpawnCheckInterval = 10.0f;
};

/**
 * UKhaaosBotSpawner
 *
 * Manages bot population during matches. Fills empty slots with AI bots
 * to maintain target player density, scales difficulty with match phase,
 * and handles horde mode spawning for special events.
 *
 * Features:
 *   - Dynamic bot count: adjusts based on live player count
 *   - Difficulty ramping: Recruit→Regular→Elite→Veteran as match progresses
 *   - Species distribution: Balanced across 6 species
 *   - Squad formation: Bots form squads of 2-4 for coordinated play
 *   - Horde mode: Wave-based spawning for special events
 *   - Performance budget: Max 50 bots, AI tick shared budget
 *
 * Free Fire Parity:
 *   - Bots always present in early game (populate match)
 *   - Bot ratio decreases as real players fill
 *   - Endgame bots are harder (scale with match phase)
 *   - Bot names appear in kill feed like regular players
 */
UCLASS(ClassGroup=(Khaaos))
class UKhaaosBotSpawner : public UWorldSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Set spawn rules. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Spawn")
        void SetSpawnRules(const FKhaaosBotSpawnRule& InRules);

        /** Get current spawn rules. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Spawn")
        const FKhaaosBotSpawnRule& GetSpawnRules() const { return SpawnRules; }

        // ─── Bot Management ───────────────────────────────────────────────────

        /** Check and adjust bot population (called periodically). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Spawn")
        void UpdateBotPopulation(int32 PlayersAlive, float MatchElapsed);

        /** Get current bot count. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Spawn")
        int32 GetActiveBotCount() const { return ActiveBotCount; }

        /** Get total desired bot count for current state. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Spawn")
        int32 GetDesiredBotCount(int32 PlayersAlive) const;

        /** Remove a bot (on elimination). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Spawn")
        void OnBotEliminated();

        // ─── Horde Mode ───────────────────────────────────────────────────────

        /** Start horde mode (wave-based spawning). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Horde")
        void StartHordeMode(int32 BaseWaveSize, float WaveInterval);

        /** Stop horde mode. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AI|Horde")
        void StopHordeMode();

        /** Get current horde wave (0 if not in horde mode). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Horde")
        int32 GetCurrentWave() const { return HordeWave; }

        /** Is horde mode active? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI|Horde")
        uint8 bHordeModeActive : 1;

        // ─── Difficulty Scaling ────────────────────────────────────────────────

        /** Get difficulty for current match phase (0-1 normalized time). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AI|Spawn")
        EKhaaosBotDifficulty GetDifficultyForMatchPhase(float MatchPhaseNormalized) const;

private:

        /** Spawn rules. */
        FKhaaosBotSpawnRule SpawnRules;

        /** Active bot count. */
        int32 ActiveBotCount;

        /** Total bots spawned this match. */
        int32 TotalBotsSpawned;

        /** Time since last spawn check. */
        float TimeSinceLastSpawnCheck;

        // ─── Horde Mode State ─────────────────────────────────────────────────

        /** Current horde wave. */
        int32 HordeWave;

        /** Base wave size. */
        int32 HordeBaseWaveSize;

        /** Wave interval (seconds). */
        float HordeWaveInterval;

        /** Time since last wave. */
        float HordeWaveTimer;

        /** Spawn a single bot with given profile. */
        void SpawnBot(const FKhaaosBotProfile& Profile, const FVector& Location);

        /** Spawn a horde wave. */
        void SpawnHordeWave();

        /** Select spawn location (away from players, inside zone). */
        FVector SelectSpawnLocation() const;

        /** Generate bot profile with species distribution. */
        FKhaaosBotProfile GenerateBotProfile(EKhaaosBotDifficulty Difficulty) const;
};
