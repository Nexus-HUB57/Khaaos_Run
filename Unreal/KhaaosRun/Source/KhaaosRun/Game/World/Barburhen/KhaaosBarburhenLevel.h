// ============================================================================
// Khaaos Run — W1/C1 Barburhen Level Script Actor (Fase 4)
// ============================================================================
// Barburhen — Primeiro mundo competitivo de Khaaos Run
// Level script for the first competitive map (W1/C1 Barburhen Ring)
//
// Handles:
//   - Zone shrinking phases (1.5h Ring, 4 phases, faster + higher damage)
//   - 100 players (double CIGKV)
//   - 30 ZEX (Zonas de Extração de XP)
//   - 4 Zu variants (cinto/saltar/máscara/gelo — gelo unique to Barburhen)
//   - Season system (Verão/Inverno) affecting loot tables and zone damage
//   - Giants Challenge integration (top 50 qualify for special event)
//   - Entry requires minimum 10 CIGKV matches completed (progression gate)
//   - Pulso Khaaos (every 8 min: climate change or legendary drop)
//   - Inactivity punishment ("dedo-duro" system)
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/LevelScriptActor.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Barburhen/KhaaosBarburhenMapData.h"
#include "KhaaosBarburhenLevel.generated.h"

class AKhaaosGameMode;
class UKhaaosAbilitySystemComponent;

// ─── Zone Phase Configuration ────────────────────────────────────────────────

/** Single phase of the Barburhen Ring */
USTRUCT(BlueprintType)
struct FBarburhenZonePhase
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
    float ZoneRadius = 6000.0f;

    /** Damage per second outside zone (higher than CIGKV) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ZoneDamagePerSecond = 8.0f;

    /** Loot drops during this phase */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 LootDropCount = 8;

    /** Climate/environment effect for this phase */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClimateEffect;

    /** Season damage modifier (Inverno = higher damage outside zone) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SeasonDamageModifier = 1.0f;
};

// ─── Season System ───────────────────────────────────────────────────────────

/** Estação sazonal de Barburhen — afeta loot e dano de zona */
UENUM(BlueprintType)
enum class EBarburhenSeason : uint8
{
    Verao    UMETA(DisplayName = "Verão — Summer (lower damage, better loot)"),
    Inverno  UMETA(DisplayName = "Inverno — Winter (higher damage, rare loot)"),
};

USTRUCT(BlueprintType)
struct FBarburhenSeason
{
    GENERATED_BODY()

    /** Current season */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EBarburhenSeason Season = EBarburhenSeason::Verao;

    /** Duration of a season in seconds (default 30 min) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SeasonDuration = 1800.0f;

    /** Damage multiplier for Inverno (1.5 = 50% more damage) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float InvernoDamageMultiplier = 1.5f;

    /** Loot rarity bonus for Inverno (shift weights toward rare+) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float InvernoLootBonus = 0.15f;

    /** Loot rarity bonus for Verão (shift weights toward common) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float VeraoLootPenalty = -0.05f;

    /** Time elapsed in current season */
    UPROPERTY(BlueprintReadOnly)
    float SeasonElapsed = 0.0f;
};

// ─── ZEX (Zona de Extração de XP) ────────────────────────────────────────────

/** Zona de Extração de XP — terminal where players save progress */
USTRUCT(BlueprintType)
struct FBarburhenZEX
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

    /** Sector of the map */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SectorName;
};

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

/** Zu variant — cinematic entry sequence (4 variants, gelo unique to Barburhen) */
UENUM(BlueprintType)
enum class EBarburhenZuVariant : uint8
{
    Zu1_Cinto      UMETA(DisplayName = "Zu1: Caminhão → Cinto"),
    Zu2_Saltar     UMETA(DisplayName = "Zu2: Capota → Saltar"),
    Zu3_Mascara    UMETA(DisplayName = "Zu3: Ponte → Máscara O2"),
    Zu4_Gelo       UMETA(DisplayName = "Zu4: Gelo → Deslizamento"),  // Único de Barburhen
};

USTRUCT(BlueprintType)
struct FBarburhenZuEntry
{
    GENERATED_BODY()

    /** Which variant this is */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EBarburhenZuVariant Variant = EBarburhenZuVariant::Zu1_Cinto;

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

// ─── Giants Challenge ────────────────────────────────────────────────────────

/** Giants Challenge — special event for top 50 players */
USTRUCT(BlueprintType)
struct FBarburhenGiantsChallenge
{
    GENERATED_BODY()

    /** Is the Giants Challenge currently active? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsActive = false;

    /** Number of players that qualify (top N) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 QualifyingCount = 50;

    /** KRC prize pool for the event */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 PrizePoolKRC = 100000;

    /** Time window for the event (seconds after Ring end) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EventDuration = 600.0f;

    /** Players who qualified (sorted by kills) */
    UPROPERTY(BlueprintReadOnly)
    TArray<FString> QualifiedPlayers;
};

// ─── Level Script Actor ──────────────────────────────────────────────────────

/**
 * AKhaaosBarburhenLevel
 * Level Script Actor for W1/C1 Barburhen — Primeiro mundo competitivo
 *
 * This is the authoritative controller for the Barburhen Ring:
 *   - 100 players, 1.5 hours, 4 zone phases
 *   - 30 Zonas de Extração de XP
 *   - 4 Zu entry variants (incl. gelo — unique to Barburhen)
 *   - Season system (Verão/Inverno)
 *   - Giants Challenge integration
 *   - Entry requires 10 CIGKV matches (progression gate)
 */
UCLASS()
class KHAAOSRUN_API AKhaaosBarburhenLevel : public ALevelScriptActor
{
    GENERATED_BODY()

public:
    AKhaaosBarburhenLevel();

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    // ─── Zone Management ─────────────────────────────────────────────────────

    /** Start the zone shrinking sequence */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Zone")
    void StartZoneSequence();

    /** Advance to the next zone phase */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Zone")
    void AdvanceZonePhase();

    /** Get current zone phase */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Zone")
    int32 GetCurrentZonePhase() const { return CurrentZonePhase; }

    /** Get all zone phases */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Zone")
    const TArray<FBarburhenZonePhase>& GetZonePhases() const { return ZonePhases; }

    // ─── Loot Spawning ───────────────────────────────────────────────────────

    /** Spawn loot for the current phase (season-aware) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Loot")
    void SpawnPhaseLoot();

    /** Spawn a Pulso Khaaos legendary drop */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Loot")
    void SpawnPulsoKhaaosDrop();

    // ─── ZEX Management ──────────────────────────────────────────────────────

    /** Activate/deactivate ZEX based on zone position */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|ZEX")
    void UpdateZEXActivation();

    /** Player extracts XP at a ZEX */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|ZEX")
    bool PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId);

    // ─── Zu Entry Protocol ───────────────────────────────────────────────────

    /** Start Zu entry sequence for a new player */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Zu")
    void StartZuEntry(APlayerController* PlayerController);

    /** Player makes Zu decision */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Zu")
    void ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision);

    // ─── Season System ───────────────────────────────────────────────────────

    /** Get current season */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Season")
    EBarburhenSeason GetCurrentSeason() const { return SeasonConfig.Season; }

    /** Cycle season (called when season timer expires) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Season")
    void CycleSeason();

    /** Get current season damage modifier */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Season")
    float GetSeasonDamageModifier() const;

    /** Get current season loot modifier */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Season")
    float GetSeasonLootModifier() const;

    // ─── Giants Challenge ────────────────────────────────────────────────────

    /** Check if player qualifies for Giants Challenge */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Giants")
    bool DoesPlayerQualifyForGiants(const FString& PlayerId) const;

    /** Trigger Giants Challenge event after Ring ends */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Giants")
    void TriggerGiantsChallenge();

    // ─── Player Flow ─────────────────────────────────────────────────────────

    /** Check if a new player can enter (progression gate + capacity) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Flow")
    bool CanPlayerEnter() const;

    /** Check if player meets entry requirements (10 CIGKV matches) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Flow")
    bool MeetsEntryRequirements(int32 CIGKVMatchesCompleted) const;

    /** Get current alive player count */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Barburhen|Flow")
    int32 GetAlivePlayerCount() const;

    // ─── Inactivity System ("dedo-duro") ─────────────────────────────────────

    /** Check and punish inactive players */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Barburhen|Inactivity")
    void ProcessInactivityPunishment(float DeltaSeconds);

    // ─── Configuration (Editable in Editor, INI-backed) ──────────────────────

    /** Max players in Barburhen (100 = double CIGKV) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    int32 MaxPlayers = 100;

    /** Total Ring duration in seconds (1.5 hours = 5400) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    float RingDuration = 5400.0f;

    /** Entry blocked in last N seconds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    float EntryBlockTime = 180.0f;

    /** Pulso Khaaos interval in seconds (8 min = 480) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    float PulsoKhaaosInterval = 480.0f;

    /** Inactivity threshold before punishment (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    float InactivityThreshold = 90.0f;

    /** Damage per second for inactive players */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    float InactivityDamagePerSecond = 3.0f;

    /** Minimum CIGKV matches required for entry (progression gate) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    int32 MinCIGKVMatchesForEntry = 10;

    /** KRC earn rate multiplier for Barburhen */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    float KRCEarnMultiplier = 1.5f;

    /** Arsenal: patente limits enforced in competitive worlds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Barburhen|Config")
    bool bArsenalEnforcesPatente = true;

    // ─── Zone Phases ─────────────────────────────────────────────────────────

    /** Zone shrinking phases (4 phases, faster + higher damage) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Barburhen|Zone")
    TArray<FBarburhenZonePhase> ZonePhases;

    // ─── ZEX Points ──────────────────────────────────────────────────────────

    /** Zonas de extração de XP (30 total) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Barburhen|ZEX")
    TArray<FBarburhenZEX> ZEXPoints;

    // ─── Zu Entry Variants ───────────────────────────────────────────────────

    /** Zu entry configurations (4 variants, gelo unique to Barburhen) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Barburhen|Zu")
    TArray<FBarburhenZuEntry> ZuVariants;

    // ─── Season Configuration ────────────────────────────────────────────────

    /** Season system configuration */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Barburhen|Season")
    FBarburhenSeason SeasonConfig;

    // ─── Giants Challenge ────────────────────────────────────────────────────

    /** Giants Challenge configuration */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Barburhen|Giants")
    FBarburhenGiantsChallenge GiantsChallenge;

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

    /** Map data reference */
    UPROPERTY()
    UKhaaosBarburhenMapData* MapData = nullptr;

private:

    /** Timer handle for zone phase advancement */
    FTimerHandle ZonePhaseTimer;

    /** Timer handle for season cycling */
    FTimerHandle SeasonTimer;

    /** Initialize map data from DataTable */
    void InitializeMapData();

    /** Spawn loot at a specific location */
    AKhaaosLootPickup* SpawnLootAt(const FVector& Location, const FRotator& Rotation);

    /** Update season timer */
    void UpdateSeasonTimer(float DeltaSeconds);

    /** Get lifetime for replicated properties */
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
