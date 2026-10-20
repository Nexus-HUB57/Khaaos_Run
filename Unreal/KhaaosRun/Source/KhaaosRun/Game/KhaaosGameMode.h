// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "KhaaosGameMode.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosSafeZone;
class AKhaaosLootPickup;
class USpatialGridSubsystem;
class UKhaaosAttributeSet;
class AKhaaosGameState;

// ─── E2E Phases 5-8 Forward Declarations ────────────────────────────────────────

class UKhaaosEconomySync;
class UKhaaosShopSystem;
class UKhaaosTransactionValidator;
class UKhaaosEOSCrossplay;
class UKhaaosEOSMatchmakingV2;
class UKhaaosEOSSessionRecovery;
class UKhaaosFootstepSystem;
class UKhaaosWeaponAudioComponent;
class UKhaaosZoneWarningSystem;

// ─── E2E Phases 9-12 Forward Declarations ───────────────────────────────────────

class UKhaaosBotSpawner;
class UKhaaosTelemetryPipeline;
class UKhaaosHotFixSystem;
class UKhaaosSocialSystem;
class UKhaaosProgressionSystem;
class UKhaaosServerHealthMonitor;
class UKhaaosCrashHandler;

// ─── Match Phase Enum (mirrors TS RoomStatus) ─────────────────────────────────

UENUM(BlueprintType)
enum class EMatchPhase : uint8
{
        Lobby       UMETA(DisplayName = "LOBBY"),
        Countdown   UMETA(DisplayName = "COUNTDOWN"),
        InProgress  UMETA(DisplayName = "IN_PROGRESS"),
        Finished    UMETA(DisplayName = "FINISHED")
};

/**
 * AKhaaosGameMode
 *
 * Authoritative match lifecycle manager ported from TS RoomManager.
 *
 * Lifecycle: LOBBY → COUNTDOWN → IN_PROGRESS → FINISHED
 *
 * Server is the single source of truth (no client-side authority on
 * damage, loot, or zone). In-memory active match for low-latency tick.
 * Hybrid persistence: critical events (eliminations, loot pickups) are
 * written to DB via EconomyBridge.
 */
UCLASS(Abstract, config=Game, defaultconfig)
class AKhaaosGameMode : public AGameModeBase
{
        GENERATED_BODY()

public:
        AKhaaosGameMode();

        // ─── Lifecycle ──────────────────────────────────────────────────────────

        virtual void InitGameState() override;
        virtual void StartPlay() override;
        virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

        /** Begin countdown when min players are ready (or host force-starts). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
        void StartCountdown();

        /** Cancel countdown (host only). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
        void CancelCountdown();

        /** Transition from countdown to active match. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
        void StartMatch();

        /** End match, compute rankings, broadcast results. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
        void FinishMatch(const FString& WinnerId);

        /** Per-tick zone damage, loot validation, win-condition check. */
        virtual void Tick(float DeltaSeconds) override;

        // ─── Player Management ──────────────────────────────────────────────────

        virtual void OnPostLogin(AController* NewPlayer) override;
        virtual void Logout(AController* Exiting) override;

        /** Handle player elimination (death). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
        void EliminatePlayer(APlayerState* Victim, APlayerState* Eliminator, const FString& Cause);

        /** Check if only one player remains alive. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
        bool CheckWinCondition() const;

        // ─── Configuration ──────────────────────────────────────────────────────

        /** Maximum players per match (from TS maxPlayers). */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
        int32 MaxPlayers;

        /** Minimum players required to start countdown. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
        int32 MinPlayersToStart;

        /** Countdown duration in seconds before match begins. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
        float CountdownDuration;

        /** Match time limit in seconds (0 = no limit). */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
        float MatchTimeLimit;

        /** Tick interval for zone damage application (seconds). */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
        float ZoneTickInterval;

        // ─── Subsystem References ───────────────────────────────────────────────

        /** Spatial grid for O(1) neighbor queries & interest management. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Systems")
        USpatialGridSubsystem* SpatialGrid;

        /** Safe zone actor (shrinking ring). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Systems")
        TObjectPtr<AKhaaosSafeZone> SafeZone;

        // ─── E2E Phase 5: Economy Bridge Subsystems ───────────────────────────────

        /** Real-time economy sync (WebSocket to Node.js API). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
        TObjectPtr<UKhaaosEconomySync> EconomySync;

        /** In-game shop with KRC pricing. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
        TObjectPtr<UKhaaosShopSystem> ShopSystem;

        /** Transaction validation (anti-fraud). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy")
        TObjectPtr<UKhaaosTransactionValidator> TransactionValidator;

        // ─── E2E Phase 6: EOS Enhancement Subsystems ──────────────────────────────

        /** Cross-play platform management. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS")
        TObjectPtr<UKhaaosEOSCrossplay> CrossplayManager;

        /** SBMM matchmaking V2. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS")
        TObjectPtr<UKhaaosEOSMatchmakingV2> MatchmakingV2;

        /** Session recovery (grace period). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS")
        TObjectPtr<UKhaaosEOSSessionRecovery> SessionRecovery;

        // ─── E2E Phase 8: Audio Subsystems ─────────────────────────────────────────

        /** Zone warning audio system. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Audio")
        TObjectPtr<UKhaaosZoneWarningSystem> ZoneWarning;

        // ─── E2E Phase 9: AI/Bot Subsystem ──────────────────────────────────────────

        /** Bot spawner for match population. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AI")
        TObjectPtr<UKhaaosBotSpawner> BotSpawner;

protected:

        /** Internal countdown timer (seconds remaining). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Match")
        float CountdownRemaining;

        /** Current match phase. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Match")
        EMatchPhase MatchPhase;

        /** Cached game state pointer. */
        UPROPERTY()
        TObjectPtr<AKhaaosGameState> KhaaosGameState;

        /** Handle zone damage tick timer. */
        FTimerHandle ZoneTickTimerHandle;

        /** Handle countdown timer. */
        FTimerHandle CountdownTimerHandle;

        /** Apply zone damage to all players outside the safe zone. */
        void ApplyZoneDamage();

        /** Countdown tick callback. */
        void CountdownTick();

        /** Spawn loot items from LOOT_PRESETS at match start. */
        void SpawnLoot();

        /** Compute and apply ELO rankings at match end. */
        void ComputeRankings();

        /** Initialize E2E Phases 5-8 subsystems (non-breaking). */
        void InitializeE2ESubsystems();

        /** Initialize E2E Phases 9-12 subsystems (non-breaking). */
        void InitializePhases9to12Subsystems();
};
