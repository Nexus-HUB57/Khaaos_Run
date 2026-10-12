// ============================================================================
// Khaaos Run — W2/C2 Priadus Level Script Actor (Fase 4)
// ============================================================================
// Priadus — Mundo arquipélago aquático
// Level script for the water-world competitive map (W2/C2 Priadus Ring)
//
// Handles:
//   - Zone shrinking phases (2h Ring, 3 phases: Beach→Shallows→Deep)
//   - 75 players
//   - 20 ZEX (island-based)
//   - 3 Zu variants (cinto/saltar/nadando — swimming entry)
//   - Aquatic combat zones (swimming, boats, underwater)
//   - Water hazards (currents, sharks, depth pressure)
//   - Entry requires minimum 5 W1 Barburhen matches completed
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/LevelScriptActor.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Priadus/KhaaosPriadusMapData.h"
#include "KhaaosPriadusLevel.generated.h"

class AKhaaosGameMode;

// ─── Zone Phase ──────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FPriadusZonePhase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PhaseIndex = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PhaseStartTime = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector ZoneCenter = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ZoneRadius = 4000.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ZoneDamagePerSecond = 5.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 LootDropCount = 8;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClimateEffect;

    /** Water depth for this phase (0=surface, 1=deep) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float WaterDepth = 0.0f;
};

// ─── Aquatic Combat Zone ────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EPriadusWaterZone : uint8
{
    Beach     UMETA(DisplayName = "Beach — Shallow water, on-foot combat"),
    Shallows  UMETA(DisplayName = "Shallows — Swimming, boat combat"),
    Deep      UMETA(DisplayName = "Deep — Underwater, pressure damage, submarines"),
};

USTRUCT(BlueprintType)
struct FPriadusAquaticZone
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EPriadusWaterZone ZoneType = EPriadusWaterZone::Beach;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Center = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Radius = 1000.0f;

    /** Current strength (pushes players) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CurrentStrength = 0.0f;

    /** Current direction */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector CurrentDirection = FVector(1.0f, 0.0f, 0.0f);

    /** Depth pressure damage per second (Deep zone only) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DepthPressureDamage = 0.0f;
};

// ─── ZEX ─────────────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FPriadusZEX
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FGuid ZEXId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float InteractionRadius = 200.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsActive = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float XPBonus = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString IslandName;
};

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EPriadusZuVariant : uint8
{
    Zu1_Cinto      UMETA(DisplayName = "Zu1: Caminhão → Cinto"),
    Zu2_Saltar     UMETA(DisplayName = "Zu2: Capota → Saltar"),
    Zu3_Nadando    UMETA(DisplayName = "Zu3: Maré → Nadando"),  // Único de Priadus
};

USTRUCT(BlueprintType)
struct FPriadusZuEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EPriadusZuVariant Variant = EPriadusZuVariant::Zu1_Cinto;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector SpawnPoint = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FRotator SpawnRotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float WrongDecisionDamage = 0.3f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CinematicDuration = 8.0f;
};

// ─── Level Script Actor ──────────────────────────────────────────────────────

/**
 * AKhaaosPriadusLevel
 * Level Script Actor for W2/C2 Priadus — Water-world archipelago
 */
UCLASS()
class KHAAOSRUN_API AKhaaosPriadusLevel : public ALevelScriptActor
{
    GENERATED_BODY()

public:
    AKhaaosPriadusLevel();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    // ─── Zone Management ─────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Zone")
    void StartZoneSequence();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Zone")
    void AdvanceZonePhase();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Priadus|Zone")
    int32 GetCurrentZonePhase() const { return CurrentZonePhase; }

    // ─── Aquatic Combat ──────────────────────────────────────────────────────

    /** Get water zone type at a given location */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Priadus|Aquatic")
    EPriadusWaterZone GetWaterZoneAt(FVector Location) const;

    /** Apply water current force to a player */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Aquatic")
    void ApplyWaterCurrent(APlayerController* PlayerController, float DeltaSeconds);

    /** Check and apply depth pressure damage */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Aquatic")
    void ProcessDepthPressure(float DeltaSeconds);

    // ─── Loot Spawning ───────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Loot")
    void SpawnPhaseLoot();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Loot")
    void SpawnPulsoKhaaosDrop();

    // ─── ZEX Management ──────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|ZEX")
    void UpdateZEXActivation();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|ZEX")
    bool PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId);

    // ─── Zu Entry Protocol ───────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Zu")
    void StartZuEntry(APlayerController* PlayerController);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Zu")
    void ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision);

    // ─── Player Flow ─────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Priadus|Flow")
    bool CanPlayerEnter() const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Priadus|Flow")
    bool MeetsEntryRequirements(int32 W1MatchesCompleted) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Priadus|Flow")
    int32 GetAlivePlayerCount() const;

    // ─── Inactivity ──────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Priadus|Inactivity")
    void ProcessInactivityPunishment(float DeltaSeconds);

    // ─── Configuration ──────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    int32 MaxPlayers = 75;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    float RingDuration = 7200.0f;  // 2 hours

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    float EntryBlockTime = 240.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    float PulsoKhaaosInterval = 540.0f;  // 9 minutes

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    float InactivityThreshold = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    float InactivityDamagePerSecond = 2.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    int32 MinW1MatchesForEntry = 5;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Priadus|Config")
    float KRCEarnMultiplier = 2.0f;

    // ─── Data Arrays ─────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Priadus|Zone")
    TArray<FPriadusZonePhase> ZonePhases;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Priadus|Aquatic")
    TArray<FPriadusAquaticZone> AquaticZones;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Priadus|ZEX")
    TArray<FPriadusZEX> ZEXPoints;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Priadus|Zu")
    TArray<FPriadusZuEntry> ZuVariants;

protected:

    UPROPERTY(Replicated)
    int32 CurrentZonePhase = 0;

    UPROPERTY(Replicated)
    float ElapsedTime = 0.0f;

    UPROPERTY()
    float TimeSinceLastPulso = 0.0f;

    UPROPERTY()
    AKhaaosSafeZone* SafeZone = nullptr;

    UPROPERTY()
    TArray<AKhaaosLootPickup*> ActiveLootPickups;

    UPROPERTY()
    UKhaaosPriadusMapData* MapData = nullptr;

private:

    FTimerHandle ZonePhaseTimer;

    void InitializeMapData();
    AKhaaosLootPickup* SpawnLootAt(const FVector& Location, const FRotator& Rotation);
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
