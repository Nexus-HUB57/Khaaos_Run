#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Game/KhaaosGameState.h"
#include "Ring/KhaaosRingManager.generated.h"

UENUM(BlueprintType)
enum class ERingZoneType : uint8
{
    SAFE       UMETA(DisplayName = "Safe Zone"),
    SHRINKING  UMETA(DisplayName = "Shrinking"),
    DANGER     UMETA(DisplayName = "Danger Zone"),
    DEADLY     UMETA(DisplayName = "Deadly Zone"),
    WATER      UMETA(DisplayName = "Water Zone"),
    VOID       UMETA(DisplayName = "Void / World Closed")
};

UENUM(BlueprintType)
enum class ERingEventType : uint8
{
    RING_START       UMETA(DisplayName = "Ring Start"),
    RING_SHRINKING   UMETA(DisplayName = "Ring Shrinking"),
    RING_CLOSED      UMETA(DisplayName = "Ring Closed"),
    WORLD_TRANSITION UMETA(DisplayName = "World Transition"),
    FINAL_RING       UMETA(DisplayName = "Final Ring")
};

USTRUCT(BlueprintType)
struct FRingPhase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 PhaseIndex = 0;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float RadiusStart = 800.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float RadiusEnd = 600.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float DurationSeconds = 180.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float DamagePerTick = 1.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float ShrinkSpeed = 1.f;
};

USTRUCT(BlueprintType)
struct FWaterZone
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FString Type;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector Center = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float Radius = 100.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float Depth = 3.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float DamageModifier = 0.5f;
};

UCLASS()
class AKhaaosRingManager : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosRingManager();

    // ─── Ring Lifecycle ────────────────────────────────────────────────────

    /** Initialize ring for a specific world using RingSubsystem config. */
    void InitializeRingForWorld(EKhaaosWorld WorldId);

    /** Advance to next ring phase. Triggers world transition if final phase. */
    void StartNextPhase();

    /** Per-frame ring shrink interpolation. */
    void TickRingShrink(float DeltaSeconds);

    /** Calculate ring damage for a world position. Returns 0 if inside safe zone. */
    float CalculateDamageForPosition(const FVector& Position) const;

    /** Check if position is inside the current safe zone. */
    bool IsPositionInSafeZone(const FVector& Position) const;

    /** Called when a ring phase completes (radius reached target). */
    void OnRingPhaseComplete(int32 PhaseIndex);

    /** Called when all ring phases are complete for a world. */
    void OnWorldRingClosed();

    /** Spawn Khaaos portal to next world in pipeline. */
    void TriggerWorldTransition();

    // ─── Damage Application ────────────────────────────────────────────────

    /** Timer callback: apply ring damage to all players outside safe zone. */
    UFUNCTION()
    void ApplyDamageTick_Implementation();

protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

public:
    // ─── Replicated State ──────────────────────────────────────────────────

    /** Current ring radius (visible to clients for HUD rendering). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    float CurrentRadius = 800.f;

    /** Target radius for current phase. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    float TargetRadius = 600.f;

    /** Current damage per tick outside the ring. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    float DamagePerTick = 1.f;

    /** Ring center position in world space. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    FVector RingCenter = FVector::ZeroVector;

private:
    UPROPERTY()
    EKhaaosWorld CurrentWorld;

    UPROPERTY()
    int32 CurrentPhase = 0;

    UPROPERTY()
    float ShrinkSpeed = 1.f;

    UPROPERTY()
    TArray<FRingPhase> RingPhases;

    FTimerHandle RingShrinkTimer;
    FTimerHandle DamageTickTimer;
};
