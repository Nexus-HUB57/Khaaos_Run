// ============================================================================
// Khaaos Run — W3/C3 Ckesalth Level Script Actor (Fase 4)
// ============================================================================
// Ckesalth — Mundo vertical montanhoso
// Level script for the mountain world (W3/C3 Ckesalth Ring)
//
// Handles:
//   - Zone shrinking phases (1.5h Ring, 4 phases: Base→Mid→Peak→Summit)
//   - 60 players
//   - 25 ZEX (altitude-based)
//   - 3 Zu variants (cinto/saltar/escalando — climbing entry)
//   - Vertical combat (climbing, ziplines, elevation advantage)
//   - 6km x 6km map with 2000m vertical extent
//   - Entry requires minimum 5 W2 Priadus matches completed
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/LevelScriptActor.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Ckesalth/KhaaosCkesalthMapData.h"
#include "KhaaosCkesalthLevel.generated.h"

class AKhaaosGameMode;

// ─── Zone Phase ──────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FCkesalthZonePhase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 PhaseIndex = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PhaseStartTime = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector ZoneCenter = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ZoneRadius = 3000.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ZoneDamagePerSecond = 5.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 LootDropCount = 8;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ClimateEffect;
    /** Altitude range for this phase (0=base, 2000=summit) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MinAltitude = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxAltitude = 2000.0f;
    /** Altitude damage modifier (higher = more fall damage, thin air) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float AltitudeDamageModifier = 1.0f;
};

// ─── Vertical Feature ────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ECkesalthVerticalFeature : uint8
{
    ClimbWall   UMETA(DisplayName = "Climb Wall — Scaleable surface"),
    Zipline     UMETA(DisplayName = "Zipline — Fast descent/ascent"),
    Ladder      UMETA(DisplayName = "Ladder — Vertical traversal"),
    Cave        UMETA(DisplayName = "Cave — Hidden tunnel through mountain"),
    CliffEdge   UMETA(DisplayName = "Cliff Edge — Danger zone, fall damage"),
};

USTRUCT(BlueprintType)
struct FCkesalthVerticalFeature
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) ECkesalthVerticalFeature Type = ECkesalthVerticalFeature::ClimbWall;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector StartPoint = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector EndPoint = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float InteractionRadius = 200.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float TravelTime = 5.0f;
};

// ─── ZEX ─────────────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FCkesalthZEX
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FGuid ZEXId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float InteractionRadius = 200.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsActive = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float XPBonus = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Altitude = 0.0f;
};

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ECkesalthZuVariant : uint8
{
    Zu1_Cinto      UMETA(DisplayName = "Zu1: Caminhão → Cinto"),
    Zu2_Saltar     UMETA(DisplayName = "Zu2: Capota → Saltar"),
    Zu3_Escalando  UMETA(DisplayName = "Zu3: Desfiladeiro → Escalando"),  // Único de Ckesalth
};

USTRUCT(BlueprintType)
struct FCkesalthZuEntry
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) ECkesalthZuVariant Variant = ECkesalthZuVariant::Zu1_Cinto;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector SpawnPoint = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FRotator SpawnRotation = FRotator::ZeroRotator;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WrongDecisionDamage = 0.3f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float CinematicDuration = 8.0f;
};

// ─── Level Script Actor ──────────────────────────────────────────────────────

UCLASS()
class KHAAOSRUN_API AKhaaosCkesalthLevel : public ALevelScriptActor
{
    GENERATED_BODY()

public:
    AKhaaosCkesalthLevel();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Zone") void StartZoneSequence();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Zone") void AdvanceZonePhase();
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ckesalth|Zone") int32 GetCurrentZonePhase() const { return CurrentZonePhase; }

    /** Get altitude at a world position */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ckesalth|Vertical")
    float GetAltitudeAt(FVector Location) const { return Location.Z; }

    /** Check if player has elevation advantage over target */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ckesalth|Vertical")
    bool HasElevationAdvantage(FVector PlayerPos, FVector TargetPos, float MinAdvantage = 100.0f) const
    {
        return (PlayerPos.Z - TargetPos.Z) >= MinAdvantage;
    }

    /** Process altitude-based effects (thin air damage, fall damage) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Vertical")
    void ProcessAltitudeEffects(float DeltaSeconds);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Loot") void SpawnPhaseLoot();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Loot") void SpawnPulsoKhaaosDrop();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|ZEX") void UpdateZEXActivation();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|ZEX") bool PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId);
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Zu") void StartZuEntry(APlayerController* PlayerController);
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Zu") void ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision);
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ckesalth|Flow") bool CanPlayerEnter() const;
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ckesalth|Flow") bool MeetsEntryRequirements(int32 W2MatchesCompleted) const;
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ckesalth|Flow") int32 GetAlivePlayerCount() const;
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ckesalth|Inactivity") void ProcessInactivityPunishment(float DeltaSeconds);

    // ─── Configuration ──────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") int32 MaxPlayers = 60;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float RingDuration = 5400.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float EntryBlockTime = 180.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float PulsoKhaaosInterval = 480.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float InactivityThreshold = 100.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float InactivityDamagePerSecond = 2.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") int32 MinW2MatchesForEntry = 5;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float KRCEarnMultiplier = 2.5f;
    /** Altitude where thin air damage starts (meters) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float ThinAirThreshold = 1500.0f;
    /** Thin air damage per second above threshold */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Ckesalth|Config") float ThinAirDamagePerSecond = 1.0f;

    // ─── Data ────────────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Ckesalth|Zone") TArray<FCkesalthZonePhase> ZonePhases;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Ckesalth|Vertical") TArray<FCkesalthVerticalFeature> VerticalFeatures;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Ckesalth|ZEX") TArray<FCkesalthZEX> ZEXPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Ckesalth|Zu") TArray<FCkesalthZuEntry> ZuVariants;

protected:
    UPROPERTY(Replicated) int32 CurrentZonePhase = 0;
    UPROPERTY(Replicated) float ElapsedTime = 0.0f;
    UPROPERTY() float TimeSinceLastPulso = 0.0f;
    UPROPERTY() AKhaaosSafeZone* SafeZone = nullptr;
    UPROPERTY() TArray<AKhaaosLootPickup*> ActiveLootPickups;
    UPROPERTY() UKhaaosCkesalthMapData* MapData = nullptr;

private:
    FTimerHandle ZonePhaseTimer;
    void InitializeMapData();
    AKhaaosLootPickup* SpawnLootAt(const FVector& Location, const FRotator& Rotation);
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
