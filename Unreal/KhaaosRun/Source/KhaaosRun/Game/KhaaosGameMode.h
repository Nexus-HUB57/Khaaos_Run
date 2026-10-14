// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Game/Data/KhaaosSpeciesDataAsset.h"
#include "Game/Data/KhaaosWeaponDataAsset.h"
#include "Game/Data/KhaaosLootItemDataAsset.h"
#include "Game/Data/KhaaosWorldConfigDataAsset.h"
#include "KhaaosGameMode.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosSafeZone;
class AKhaaosLootPickup;
class USpatialGridSubsystem;
class UKhaaosAttributeSet;
class AKhaaosGameState;
class UEconomyBridgeSubsystem;

// ─── Match Phase Enum ─────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EMatchPhase : uint8
{
    Lobby       UMETA(DisplayName = "LOBBY"),
    Countdown   UMETA(DisplayName = "COUNTDOWN"),
    InProgress  UMETA(DisplayName = "IN_PROGRESS"),
    PulsoKhaaos UMETA(DisplayName = "PULSO_KHAAOS"),
    WorldTransition UMETA(DisplayName = "WORLD_TRANSITION"),
    Finished    UMETA(DisplayName = "FINISHED")
};

// ─── World Sequence Enum ──────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EWorldSequence : uint8
{
    CIGKV       UMETA(DisplayName = "CIGKV"),
    Barburhen   UMETA(DisplayName = "Barburhen"),
    Priadus     UMETA(DisplayName = "Priadus"),
    Ckesalth    UMETA(DisplayName = "Ckesalth"),
    Arukheea    UMETA(DisplayName = "Arukheea")
};

// ─── Pulso Khaaos Event Struct ────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FPulsoKhaaosEvent
{
    GENERATED_BODY()

    /** World where Pulso is active. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    FName ActiveWorld;

    /** Center of the Pulso event. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    FVector CenterLocation = FVector::ZeroVector;

    /** Current radius (shrinks over time). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    float CurrentRadius = 500.0f;

    /** Seconds remaining. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    float RemainingTime = 60.0f;

    /** Rarity boost multiplier (e.g. 2x for Lendário). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    float RarityBoost = 2.0f;

    /** Whether the event is active. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    uint8 bIsActive : 1;
};

/**
 * AKhaaosGameMode — Enhanced with DataAsset-driven architecture.
 *
 * Data-Driven Flow:
 *   JSON → CSV → UE5 DataTable → UPrimaryDataAsset → Gameplay
 *
 * Species Selection:   SpeciesDataAsset → PlayerState (stats, passive, skins)
 * Weapon Loadout:      WeaponDataAsset → WeaponPickup (damage, falloff, fire mode)
 * Loot Distribution:   LootItemDataAsset → LootPickup (type, rarity, spawn weight)
 * World Transition:    WorldConfigDataAsset → Level streaming (CIGKV→W1→W2→W3→W4)
 * Pulso Khaaos:        WorldConfig.PulsoConfig → Timed event (loot boost + zone damage)
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
    virtual void Tick(float DeltaSeconds) override;

    // ─── Match Lifecycle ─────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
    void StartCountdown();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
    void CancelCountdown();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
    void StartMatch();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
    void FinishMatch(const FString& WinnerId);

    // ─── Player Management ──────────────────────────────────────────────────

    virtual void OnPostLogin(AController* NewPlayer) override;
    virtual void Logout(AController* Exiting) override;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
    void EliminatePlayer(APlayerState* Victim, APlayerState* Eliminator, const FString& Cause);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Match")
    bool CheckWinCondition() const;

    // ─── Species Selection (DataAsset-Driven) ────────────────────────────────

    /** Assign a species to a player from SpeciesDataAsset. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species")
    void AssignSpecies(APlayerState* Player, const UKhaaosSpeciesDataAsset* SpeciesAsset);

    /** Get all available species for the current world. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species")
    TArray<UKhaaosSpeciesDataAsset*> GetAvailableSpecies() const;

    // ─── Weapon Loadout (DataAsset-Driven) ───────────────────────────────────

    /** Assign weapon loadout from WeaponDataAsset pool. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon")
    void AssignWeaponLoadout(APlayerState* Player);

    // ─── Loot Distribution (DataAsset-Driven) ────────────────────────────────

    /** Spawn loot across the map using WorldConfigDataAsset loot points. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Loot")
    void SpawnLootFromDataAssets();

    /** Get loot items by type and rarity for current world. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Loot")
    TArray<UKhaaosLootItemDataAsset*> GetLootPool(FName TypeTag, FName RarityTag) const;

    // ─── World Transition ────────────────────────────────────────────────────

    /** Transition to the next world in the sequence. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|World")
    void TransitionToNextWorld();

    /** Check if players meet the rank requirement for the next world. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|World")
    bool CanTransitionToNextWorld() const;

    /** Get the current world config asset. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|World")
    UKhaaosWorldConfigDataAsset* GetCurrentWorldConfig() const;

    // ─── Pulso Khaaos Event ──────────────────────────────────────────────────

    /** Trigger a Pulso Khaaos event in the current world. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Pulso")
    void TriggerPulsoKhaaos();

    /** Get the current Pulso event state. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Pulso")
    FPulsoKhaaosEvent GetPulsoState() const { return ActivePulso; }

    // ─── Configuration ──────────────────────────────────────────────────────

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
    int32 MaxPlayers;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
    int32 MinPlayersToStart;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
    float CountdownDuration;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
    float MatchTimeLimit;

    UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Match")
    float ZoneTickInterval;

    // ─── DataAsset References (Data-Driven) ─────────────────────────────────

    /** Species assets loaded from DataTable. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Data")
    TArray<TSoftObjectPtr<UKhaaosSpeciesDataAsset>> SpeciesAssets;

    /** Weapon assets loaded from DataTable. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Data")
    TArray<TSoftObjectPtr<UKhaaosWeaponDataAsset>> WeaponAssets;

    /** Loot item assets loaded from DataTable. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Data")
    TArray<TSoftObjectPtr<UKhaaosLootItemDataAsset>> LootItemAssets;

    /** World config assets (CIGKV, W1-W4). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Data")
    TArray<TSoftObjectPtr<UKhaaosWorldConfigDataAsset>> WorldConfigAssets;

    // ─── Subsystem References ───────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Systems")
    USpatialGridSubsystem* SpatialGrid;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Systems")
    TObjectPtr<AKhaaosSafeZone> SafeZone;

protected:

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Match")
    float CountdownRemaining;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Match")
    EMatchPhase MatchPhase;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|World")
    EWorldSequence CurrentWorld;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|World")
    int32 CurrentWorldIndex = 0;

    UPROPERTY()
    TObjectPtr<AKhaaosGameState> KhaaosGameState;

    /** Active Pulso Khaaos event. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Pulso")
    FPulsoKhaaosEvent ActivePulso;

    /** Loaded (resolved) species assets. */
    UPROPERTY()
    TArray<UKhaaosSpeciesDataAsset*> LoadedSpeciesAssets;

    /** Loaded weapon assets. */
    UPROPERTY()
    TArray<UKhaaosWeaponDataAsset*> LoadedWeaponAssets;

    /** Loaded loot item assets. */
    UPROPERTY()
    TArray<UKhaaosLootItemDataAsset*> LoadedLootItemAssets;

    /** Loaded world config assets. */
    UPROPERTY()
    TArray<UKhaaosWorldConfigDataAsset*> LoadedWorldConfigAssets;

    FTimerHandle ZoneTickTimerHandle;
    FTimerHandle CountdownTimerHandle;
    FTimerHandle PulsoTimerHandle;

    // ─── Internal Methods ───────────────────────────────────────────────────

    void ApplyZoneDamage();
    void CountdownTick();
    void SpawnLoot();
    void ComputeRankings();

    /** Load all soft references to DataAssets. */
    void LoadDataAssets();

    /** Tick the Pulso Khaaos event (shrink, damage, loot). */
    void TickPulsoEvent(float DeltaSeconds);

    /** Apply Pulso damage to players inside the event radius. */
    void ApplyPulsoDamage();

    /** Spawn boosted loot at Pulso center. */
    void SpawnPulsoLoot();
};
