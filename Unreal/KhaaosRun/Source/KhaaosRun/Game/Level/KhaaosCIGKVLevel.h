// ============================================================================
// Khaaos Run — CIGKV Level Script Actor (Fase 1)
// ============================================================================
// Khaaos Ville — Campo de Instrução de Guerra Khaaos Ville
// Level script for the first playable map (CIGKV Ring)
//
// Handles:
//   - Zone shrinking phases (3h Ring)
//   - Loot spawning (15+ points per phase)
//   - ZEX (Zonas de Extração de XP) activation/deactivation
//   - Pulso Khaaos (every 10 min: climate change or legendary drop)
//   - Zu entry protocol (3 cinematic variants)
//   - Player flow control (continuous entry, 50-player cap)
//   - Inactivity punishment ("dedo-duro" system)
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/LevelScriptActor.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/CIGKV/KhaaosCIGKVMapData.h"
#include "KhaaosCIGKVLevel.generated.h"

class AKhaaosGameMode;
class UKhaaosAbilitySystemComponent;

// ─── Zone Phase Configuration ────────────────────────────────────────────────

/** Single phase of the CIGKV Ring */
USTRUCT(BlueprintType)
struct FCIGKVZonePhase
{
    GENERATED_BODY()

    /** Phase index (0 = initial, final = endgame) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PhaseIndex = 0;

    /** Time in seconds when this phase starts */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PhaseStartTime = 0.0f;

    /** Zone center at this phase */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector ZoneCenter = FVector::ZeroVector;

    /** Zone radius at this phase (shrinks each phase) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ZoneRadius = 3000.0f;

    /** Damage per second outside zone */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ZoneDamagePerSecond = 5.0f;

    /** Loot drops during this phase */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 LootDropCount = 5;

    /** Climate/environment effect for this phase */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClimateEffect;
};

// ─── ZEX (Zona de Extração de XP) ────────────────────────────────────────────

/** Zona de Extração de XP — terminal where players save progress */
USTRUCT(BlueprintType)
struct FCIGKVZEX
{
    GENERATED_BODY()

    /** Unique identifier */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FGuid ZEXId;

    /** World position */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    /** Interaction radius */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float InteractionRadius = 200.0f;

    /** Is this ZEX currently active? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsActive = true;

    /** XP bonus for extracting at this ZEX */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float XPBonus = 1.0f;

    /** Sector of the map (Armory/ProvingGrounds/Park) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;
};

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

/** Zu variant — cinematic entry sequence */
UENUM(BlueprintType)
enum class ECIGKVZuVariant : uint8
{
    Zu1_Cinto      UMETA(DisplayName = "Zu1: Caminhão → Cinto"),
    Zu2_Saltar     UMETA(DisplayName = "Zu2: Capota → Saltar"),
    Zu3_Mascara    UMETA(DisplayName = "Zu3: Ponte → Máscara O2"),
};

USTRUCT(BlueprintType)
struct FCIGKVZuEntry
{
    GENERATED_BODY()

    /** Which variant this is */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ECIGKVZuVariant Variant = ECIGKVZuVariant::Zu1_Cinto;

    /** Spawn point for this Zu variant */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector SpawnPoint = FVector::ZeroVector;

    /** Spawn rotation */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator SpawnRotation = FRotator::ZeroRotator;

    /** Damage dealt if wrong decision (up to -30%) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float WrongDecisionDamage = 0.3f;

    /** Duration of cinematic sequence (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CinematicDuration = 8.0f;
};

// ─── Level Script Actor ──────────────────────────────────────────────────────

/**
 * AKhaaosCIGKVLevel
 * Level Script Actor for CIGKV (Khaaos Ville — Campo de Instrução de Guerra)
 *
 * This is the authoritative controller for the CIGKV Ring:
 *   - 50 players, 3 hours, continuous entry
 *   - 3 sectors: Armory Hub (1/8), Proving Grounds (3/8), Park (4/8)
 *   - 15 Zonas de Extração de XP
 *   - 3 Zu entry variants
 *   - Pulso Khaaos every 10 min
 *   - Inactivity punishment system
 */
UCLASS()
class KHAAOSRUN_API AKhaaosCIGKVLevel : public ALevelScriptActor
{
    GENERATED_BODY()

public:
    AKhaaosCIGKVLevel();

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    // ─── Zone Management ─────────────────────────────────────────────────────

    /** Start the zone shrinking sequence */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Zone")
    void StartZoneSequence();

    /** Advance to the next zone phase */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Zone")
    void AdvanceZonePhase();

    /** Get current zone phase */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CIGKV|Zone")
    int32 GetCurrentZonePhase() const { return CurrentZonePhase; }

    /** Get all zone phases (for debugging) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CIGKV|Zone")
    const TArray<FCIGKVZonePhase>& GetZonePhases() const { return ZonePhases; }

    // ─── Loot Spawning ───────────────────────────────────────────────────────

    /** Spawn loot for the current phase */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Loot")
    void SpawnPhaseLoot();

    /** Spawn a Pulso Khaaos legendary drop */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Loot")
    void SpawnPulsoKhaaosDrop();

    // ─── ZEX Management ──────────────────────────────────────────────────────

    /** Activate/deactivate ZEX based on zone position */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|ZEX")
    void UpdateZEXActivation();

    /** Player extracts XP at a ZEX */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|ZEX")
    bool PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId);

    // ─── Zu Entry Protocol ───────────────────────────────────────────────────

    /** Start Zu entry sequence for a new player */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Zu")
    void StartZuEntry(APlayerController* PlayerController);

    /** Player makes Zu decision (correct = 0 damage, wrong = up to -30%) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Zu")
    void ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision);

    // ─── Player Flow ─────────────────────────────────────────────────────────

    /** Check if a new player can enter (continuous entry, block in last 5 min) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CIGKV|Flow")
    bool CanPlayerEnter() const;

    /** Get current alive player count */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CIGKV|Flow")
    int32 GetAlivePlayerCount() const;

    // ─── Inactivity System ("dedo-duro") ─────────────────────────────────────

    /** Check and punish inactive players */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Inactivity")
    void ProcessInactivityPunishment(float DeltaSeconds);

    // ─── Configuration (Editable in Editor) ──────────────────────────────────

    /** Max players in CIGKV */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    int32 MaxPlayers = 50;

    /** Total Ring duration in seconds (3 hours = 10800) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    float RingDuration = 10800.0f;

    /** Entry blocked in last N seconds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    float EntryBlockTime = 300.0f;

    /** Pulso Khaaos interval in seconds (10 min = 600) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    float PulsoKhaaosInterval = 600.0f;

    /** Inactivity threshold before punishment (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    float InactivityThreshold = 120.0f;

    /** Damage per second for inactive players */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    float InactivityDamagePerSecond = 2.0f;

    /** Arsenal: no patente limits in CIGKV */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Config")
    bool bArsenalNoPatenteLimits = true;

    /** Concrete Blueprint/native pickup class used for world loot spawns. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Loot")
    TSubclassOf<AKhaaosLootPickup> LootPickupClass;

    // ─── Zone Phases (configured per-map) ────────────────────────────────────

    /** Zone shrinking phases */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zone")
    TArray<FCIGKVZonePhase> ZonePhases;

    // ─── ZEX Points (configured per-map) ─────────────────────────────────────

    /** Zonas de extração de XP */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|ZEX")
    TArray<FCIGKVZEX> ZEXPoints;

    // ─── Zu Entry Variants ───────────────────────────────────────────────────

    /** Zu entry configurations (3 variants) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu")
    TArray<FCIGKVZuEntry> ZuVariants;

protected:

    /** Current zone phase index */
    UPROPERTY(Replicated)
    int32 CurrentZonePhase = 0;

    /** Time elapsed since Ring start */
    UPROPERTY(Replicated)
    float ElapsedTime = 0.0f;

    /** Time since last Pulso Khaaos */
    UPROPERTY()
    float TimeSinceLastPulso = 0.0f;

    /** Safe zone actor reference */
    UPROPERTY()
    AKhaaosSafeZone* SafeZone = nullptr;

    /** Active loot pickups in the level */
    UPROPERTY()
    TArray<AKhaaosLootPickup*> ActiveLootPickups;

    /** Map data table reference */
    UPROPERTY()
    UKhaaosCIGKVMapData* MapData = nullptr;

private:

    /** Timer handle for zone phase advancement */
    FTimerHandle ZonePhaseTimer;

    /** Initialize map data from DataTable */
    void InitializeMapData();

    /** Spawn loot at a specific location */
    AKhaaosLootPickup* SpawnLootAt(
        const FVector& Location,
        const FRotator& Rotation,
        ELootRarity Rarity = ELootRarity::Comum);

    bool bMissingLootPickupClassWarningLogged = false;

    /** Get lifetime for replicated properties */
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
