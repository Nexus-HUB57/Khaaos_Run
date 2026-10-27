// ============================================================================
// Khaaos Run — Netcode Patterns (Mirror-Inspired)
// ============================================================================
// Patterns extracted from MirrorNetworking/Mirror and reimplemented for UE5 C++.
// Mirror license: MIT — pattern reuse permitted.
// ============================================================================
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "KhaaosNetcodePatterns.generated.h"

// ─── Pattern 1: SyncVar → UPROPERTY(Replicated) ─────────────────────────────
UCLASS()
class AKhaaosNetworkActor : public AActor
{
    GENERATED_BODY()

public:
    // [SyncVar] equivalent — auto-replicated with OnRep callback
    UPROPERTY(ReplicatedUsing = OnRep_Health)
    float Health;

    UPROPERTY(ReplicatedUsing = OnRep_ShieldStrength)
    float ShieldStrength;

    UPROPERTY(ReplicatedUsing = OnRep_bIsAlive)
    bool bIsAlive;

    UPROPERTY(Replicated)
    int32 KillCount;

    // OnRep callbacks (SyncVar hooks)
    UFUNCTION()
    void OnRep_Health();

    UFUNCTION()
    void OnRep_ShieldStrength();

    UFUNCTION()
    void OnRep_bIsAlive();

    // ─── Pattern 2: [Command] → Server RPC ──────────────────────────────
    // Client→Server: Request ability activation
    UFUNCTION(Server, WithValidation, Reliable)
    void Server_RequestAbility(int32 AbilityIndex, FVector TargetLocation);

    // Client→Server: Request weapon fire with hit validation
    UFUNCTION(Server, WithValidation, Reliable)
    void Server_WeaponFire(int32 WeaponID, FVector_NetQuantize Origin, FVector_NetQuantize Direction);

    // ─── Pattern 3: [ClientRpc] → Client RPC ───────────────────────────
    // Server→All: Trigger VFX at location
    UFUNCTION(Client, Reliable)
    void Client_TriggerVFX(FName VFXName, FVector Location, FRotator Rotation);

    // Server→All: Announce match event
    UFUNCTION(Client, Reliable)
    void Client_MatchAnnouncement(const FString& Message, int32 PlayerID);

    // ─── Pattern 4: [TargetRpc] → Targeted Client RPC ──────────────────
    // Server→Specific: Personal notification
    UFUNCTION(Client, Unreliable)
    void Client_PersonalNotification(const FString& Notification);

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};

// ─── Pattern 5: SpatialHashInterestManagement ───────────────────────────────
UCLASS()
class AKhaaosSpatialInterestManager : public AActor
{
    GENERATED_BODY()

public:
    // Spatial hash grid for interest management
    // Only replicate actors within player's interest radius
    UPROPERTY(EditDefaultsOnly)
    float InterestRadius = 5000.f; // 50m radius

    UPROPERTY(EditDefaultsOnly)
    float CellSize = 1000.f; // 10m grid cells

    // Override IsNetRelevantFor for spatial culling
    virtual bool IsNetRelevantFor(const AActor* RealViewer, const AActor* ViewTarget,
                                   const FVector& SrcLocation, const FVector& ViewLocation) const;

private:
    // Spatial hash: cell → set of actors
    TMap<FIntVector, TSet<AActor*>> SpatialGrid;
    void UpdateSpatialGrid();
    TSet<AActor*> GetRelevantActorsForPlayer(const FVector& PlayerLocation);
};

// ─── Pattern 6: LagCompensation ─────────────────────────────────────────────
USTRUCT()
struct FTransformSnapshot
{
    GENERATED_BODY()

    UPROPERTY()
    FTransform Transform;

    UPROPERTY()
    float Timestamp;
};

UCLASS()
class UKhaaosLagCompensationComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    // Store transform history for rollback
    UPROPERTY(EditDefaultsOnly)
    float HistoryDuration = 0.5f; // 500ms of history

    UPROPERTY(EditDefaultsOnly)
    float SnapshotInterval = 0.02f; // 50 snapshots/sec

    // Validate hit at client's perceived time
    bool ValidateHitAtTime(const FVector& HitLocation, float ClientTimestamp, float Tolerance = 10.f);

    // Rollback → validate → restore
    void RecordSnapshot();
    void RollbackTo(float Timestamp);
    void RestoreLatest();

private:
    TArray<FTransformSnapshot> TransformHistory;
    FTransformSnapshot PreRollbackSnapshot;
};

// ─── Pattern 7: SnapshotInterpolation ───────────────────────────────────────
UCLASS()
class UKhaaosSnapshotInterpolationComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    // Interpolate between server snapshots
    UPROPERTY(EditDefaultsOnly)
    float InterpolationDelay = 0.1f; // 100ms behind server

    UPROPERTY(EditDefaultsOnly)
    float MaxExtrapolation = 0.05f; // 50ms max extrapolation

    void ProcessServerSnapshot(const FTransform& Snapshot, float ServerTime);
    void TickInterpolation(float DeltaTime);

private:
    struct FSnapshot { FTransform Transform; float ServerTime; };
    TArray<FSnapshot> SnapshotBuffer;
    FTransform CurrentInterpolatedTransform;
};
