// ============================================================================
// Khaaos Run — W4/C4 Arukheea Level Script Actor (Fase 4)
// ============================================================================
// Arukheea — Mundo desértico de cânions
// Level script for the desert canyon world (W4/C4 Arukheea Ring)
//
// Handles:
//   - Zone shrinking phases (~1h40m Ring, 4 phases: Dunes→Canyon→Oasis→Arena)
//   - 80 players
//   - 22 ZEX (oasis and canyon-based)
//   - 3 Zu variants (cinto/saltar/areia — sand entry)
//   - Desert combat (sandstorms, heat damage, oasis healing)
//   - 10km x 10km map with heat mechanics
//   - Entry requires minimum 5 W3 Ckesalth matches completed
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/LevelScriptActor.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Arukheea/KhaaosArukheeaMapData.h"
#include "KhaaosArukheeaLevel.generated.h"

class AKhaaosGameMode;

// ─── Zone Phase ──────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FArukheeaZonePhase
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 PhaseIndex = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PhaseStartTime = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector ZoneCenter = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ZoneRadius = 5000.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ZoneDamagePerSecond = 5.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 LootDropCount = 8;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ClimateEffect;
    /** Heat intensity for this phase (0=none, 1=extreme) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float HeatIntensity = 0.5f;
    /** Is this an oasis zone (healing)? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsOasisZone = false;
    /** Healing per second in oasis */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float OasisHealPerSecond = 5.0f;
};

// ─── Sandstorm System ────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FArukheeaSandstorm
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Center = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Radius = 2000.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MoveSpeed = 100.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector MoveDirection = FVector(1,0,0);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float VisibilityReduction = 0.8f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DamagePerSecond = 2.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsActive = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Duration = 120.0f;
    UPROPERTY(BlueprintReadOnly) float Elapsed = 0.0f;
};

// ─── ZEX ─────────────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FArukheeaZEX
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FGuid ZEXId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float InteractionRadius = 200.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsActive = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float XPBonus = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsOasis = false;
};

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EArukheeaZuVariant : uint8
{
    Zu1_Cinto   UMETA(DisplayName = "Zu1: Caminhão → Cinto"),
    Zu2_Saltar  UMETA(DisplayName = "Zu2: Capota → Saltar"),
    Zu3_Areia   UMETA(DisplayName = "Zu3: Tempestade → Areia"),  // Único de Arukheea
};

USTRUCT(BlueprintType)
struct FArukheeaZuEntry
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EArukheeaZuVariant Variant = EArukheeaZuVariant::Zu1_Cinto;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector SpawnPoint = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FRotator SpawnRotation = FRotator::ZeroRotator;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WrongDecisionDamage = 0.3f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float CinematicDuration = 8.0f;
};

// ─── Level Script Actor ──────────────────────────────────────────────────────

UCLASS()
class KHAAOSRUN_API AKhaaosArukheeaLevel : public ALevelScriptActor
{
    GENERATED_BODY()

public:
    AKhaaosArukheeaLevel();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Zone") void StartZoneSequence();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Zone") void AdvanceZonePhase();
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Arukheea|Zone") int32 GetCurrentZonePhase() const { return CurrentZonePhase; }

    // ─── Desert Mechanics ────────────────────────────────────────────────────

    /** Process heat damage to all players not in shade/oasis */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Desert")
    void ProcessHeatDamage(float DeltaSeconds);

    /** Process oasis healing for players near oases */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Desert")
    void ProcessOasisHealing(float DeltaSeconds);

    /** Trigger a sandstorm event */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Desert")
    void TriggerSandstorm();

    /** Update active sandstorms (movement, duration) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Desert")
    void UpdateSandstorms(float DeltaSeconds);

    // ─── Standard ────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Loot") void SpawnPhaseLoot();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Loot") void SpawnPulsoKhaaosDrop();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|ZEX") void UpdateZEXActivation();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|ZEX") bool PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId);
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Zu") void StartZuEntry(APlayerController* PlayerController);
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Zu") void ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision);
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Arukheea|Flow") bool CanPlayerEnter() const;
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Arukheea|Flow") bool MeetsEntryRequirements(int32 W3MatchesCompleted) const;
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Arukheea|Flow") int32 GetAlivePlayerCount() const;
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Arukheea|Inactivity") void ProcessInactivityPunishment(float DeltaSeconds);

    // ─── Configuration ──────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") int32 MaxPlayers = 80;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float RingDuration = 6000.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float EntryBlockTime = 200.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float PulsoKhaaosInterval = 500.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float InactivityThreshold = 100.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float InactivityDamagePerSecond = 2.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") int32 MinW3MatchesForEntry = 5;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float KRCEarnMultiplier = 3.0f;
    /** Base heat damage per second when exposed */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float BaseHeatDamagePerSecond = 1.5f;
    /** Sandstorm trigger interval (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float SandstormInterval = 900.0f;
    /** Oasis heal radius */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Khaaos|Arukheea|Config") float OasisHealRadius = 500.0f;

    // ─── Data ────────────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Arukheea|Zone") TArray<FArukheeaZonePhase> ZonePhases;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Arukheea|Desert") TArray<FArukheeaSandstorm> ActiveSandstorms;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Arukheea|ZEX") TArray<FArukheeaZEX> ZEXPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Arukheea|Zu") TArray<FArukheeaZuEntry> ZuVariants;
    /** Oasis positions (healing zones) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Arukheea|Desert") TArray<FVector> OasisPositions;

protected:
    UPROPERTY(Replicated) int32 CurrentZonePhase = 0;
    UPROPERTY(Replicated) float ElapsedTime = 0.0f;
    UPROPERTY() float TimeSinceLastPulso = 0.0f;
    UPROPERTY() float TimeSinceLastSandstorm = 0.0f;
    UPROPERTY() AKhaaosSafeZone* SafeZone = nullptr;
    UPROPERTY() TArray<AKhaaosLootPickup*> ActiveLootPickups;
    UPROPERTY() UKhaaosArukheeaMapData* MapData = nullptr;

private:
    FTimerHandle ZonePhaseTimer;
    void InitializeMapData();
    AKhaaosLootPickup* SpawnLootAt(const FVector& Location, const FRotator& Rotation);
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
