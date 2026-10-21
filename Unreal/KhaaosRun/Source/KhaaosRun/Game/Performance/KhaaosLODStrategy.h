// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosLODStrategy.generated.h"

// ─── LOD Level Enum ──────────────────────────────────────────────────────────

/**
 * 5-level LOD hierarchy for battle royale actor management.
 * Extends standard UE LOD with billboard and cull levels
 * optimized for 60-100 player scenarios with many visible actors.
 */
UENUM(BlueprintType)
enum class EKhaaosLODLevel : uint8
{
	LOD0_Full      UMETA(DisplayName = "LOD0 Full"),       // Full detail, full tick
	LOD1_Medium    UMETA(DisplayName = "LOD1 Medium"),     // Reduced mesh, half tick
	LOD2_Low       UMETA(DisplayName = "LOD2 Low"),        // Low mesh, quarter tick
	LOD3_Billboard UMETA(DisplayName = "LOD3 Billboard"),  // Billboard proxy, minimal tick
	LOD4_Culled    UMETA(DisplayName = "LOD4 Culled")      // No rendering, no tick
};

// ─── World Type Enum ─────────────────────────────────────────────────────────

/**
 * World types for per-world LOD threshold overrides.
 * Dense worlds like Ckesalth use closer thresholds.
 */
UENUM(BlueprintType)
enum class EKhaaosWorldType : uint8
{
	Default    UMETA(DisplayName = "Default"),     // Standard open terrain
	Ckesalth   UMETA(DisplayName = "Ckesalth"),   // Dense urban — tighter thresholds
	Priadus    UMETA(DisplayName = "Priadus"),     // Mixed terrain
	Barburhen  UMETA(DisplayName = "Barburhen"),   // Open terrain — wider thresholds
	Arukheea   UMETA(DisplayName = "Arukheea"),   // Mountainous — vertical LOD bias
	CIGKV      UMETA(DisplayName = "CIGKV")        // Special event world
};

// ─── LOD Config Struct ───────────────────────────────────────────────────────

/**
 * Per-world LOD configuration with distance thresholds,
 * tick rate multipliers, and replication rate multipliers
 * for each LOD level.
 */
USTRUCT(BlueprintType)
struct FKhaaosLODConfig
{
	GENERATED_BODY()

	/** Distance thresholds for each LOD level [5 entries].
	 *  LOD0: 0 to DistanceThresholds[0]
	 *  LOD1: DistanceThresholds[0] to DistanceThresholds[1]
	 *  LOD2: DistanceThresholds[1] to DistanceThresholds[2]
	 *  LOD3: DistanceThresholds[2] to DistanceThresholds[3]
	 *  LOD4: DistanceThresholds[3] and beyond
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|LOD")
	TArray<float> DistanceThresholds;

	/** Tick rate multiplier for each LOD level [5 entries]. 0.0 = no tick. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|LOD")
	TArray<float> TickRateMultiplier;

	/** Replication rate multiplier for each LOD level [5 entries]. 0.0 = no replication. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|LOD")
	TArray<float> ReplicationRateMultiplier;

	/** World type this config is for. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|LOD")
	EKhaaosWorldType WorldType = EKhaaosWorldType::Default;

	/** Density multiplier (e.g. Ckesalth = 0.6, scales all thresholds). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|LOD", meta = (ClampMin = "0.1", ClampMax = "2.0"))
	float DensityMultiplier = 1.0f;

	/** Initialize with default values. */
	void InitDefaults()
	{
		// Distance thresholds: LOD0=500, LOD1=1500, LOD2=3000, LOD3=5000, LOD4=inf
		DistanceThresholds = { 500.0f, 1500.0f, 3000.0f, 5000.0f, FLT_MAX };

		// Tick rates: LOD0=1.0, LOD1=0.5, LOD2=0.25, LOD3=0.1, LOD4=0.0
		TickRateMultiplier = { 1.0f, 0.5f, 0.25f, 0.1f, 0.0f };

		// Replication: LOD0=1.0, LOD1=1.0, LOD2=0.5, LOD3=0.25, LOD4=0.0
		ReplicationRateMultiplier = { 1.0f, 1.0f, 0.5f, 0.25f, 0.0f };
	}

	/** Apply density multiplier to distance thresholds. */
	void ApplyDensityMultiplier()
	{
		if (FMath::Abs(DensityMultiplier - 1.0f) > KINDA_SMALL_NUMBER)
		{
			for (int32 i = 0; i < DistanceThresholds.Num() - 1; ++i) // Skip FLT_MAX
			{
				DistanceThresholds[i] *= DensityMultiplier;
			}
		}
	}
};

// ─── Actor LOD Changed Delegate ──────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnActorLODChanged, AActor*, Actor, EKhaaosLODLevel, OldLOD, EKhaaosLODLevel, NewLOD);

// ─── LOD Strategy Component ──────────────────────────────────────────────────

/**
 * UKhaaosLODStrategyComponent
 *
 * LOD strategy for Battle Royale with many actors (60-100 players + loot + vehicles).
 * Uses squared distance for performance-optimized LOD computation.
 *
 * Features:
 *   - 5-level LOD (Full, Medium, Low, Billboard, Culled)
 *   - Per-world configurable distance thresholds
 *   - Tick rate scaling per LOD level
 *   - Replication rate scaling per LOD level
 *   - Dense world support (Ckesalth: thresholds * 0.6)
 *   - Squared distance comparisons for perf
 *
 * Usage:
 *   UKhaaosLODStrategyComponent* LOD = AddDefaultSubobject<UKhaaosLODStrategyComponent>();
 *   LOD->SetWorldType(EKhaaosWorldType::Ckesalth);
 *   EKhaaosLODLevel Level = LOD->ComputeLODForActor(Actor, Distance);
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosLODStrategyComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	// ─── Constructor ────────────────────────────────────────────────────────────

	UKhaaosLODStrategyComponent();

	// ─── LOD Computation ──────────────────────────────────────────────────────

	/**
	 * Compute LOD level for an actor based on distance to player.
	 * Uses squared distance internally for performance.
	 * @param Actor           The actor to compute LOD for
	 * @param DistanceToPlayer Distance from the actor to the nearest player
	 * @return LOD level for the actor
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	EKhaaosLODLevel ComputeLODForActor(AActor* Actor, float DistanceToPlayer);

	/**
	 * Compute LOD level using squared distance directly (already squared for performance).
	 * @param Actor              The actor
	 * @param DistanceSqToPlayer Pre-computed squared distance
	 * @return LOD level
	 */
	EKhaaosLODLevel ComputeLODSquared(AActor* Actor, float DistanceSqToPlayer);

	// ─── Tick Rate ────────────────────────────────────────────────────────────

	/** Get tick rate multiplier for a given LOD level. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|LOD")
	float GetTickRateForLOD(EKhaaosLODLevel Level) const;

	// ─── Replication ──────────────────────────────────────────────────────────

	/** Whether replication should occur at this LOD level. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|LOD")
	bool ShouldReplicateForLOD(EKhaaosLODLevel Level) const;

	/** Get replication rate multiplier for a given LOD level. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|LOD")
	float GetReplicationRateForLOD(EKhaaosLODLevel Level) const;

	// ─── World Configuration ──────────────────────────────────────────────────

	/** Set the current world type (affects distance thresholds). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	void SetWorldType(EKhaaosWorldType NewWorldType);

	/** Get the current world type. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|LOD")
	EKhaaosWorldType GetWorldType() const { return CurrentWorldType; }

	/** Get the active LOD configuration. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|LOD")
	const FKhaaosLODConfig& GetActiveConfig() const { return ActiveConfig; }

	// ─── Delegate ─────────────────────────────────────────────────────────────

	/** Broadcast when an actor's LOD level changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|LOD")
	FOnActorLODChanged OnActorLODChanged;

private:

	/** Current world type. */
	UPROPERTY(VisibleAnywhere, Category = "Khaaos|LOD")
	EKhaaosWorldType CurrentWorldType = EKhaaosWorldType::Default;

	/** Active LOD configuration (updated when world type changes). */
	UPROPERTY(VisibleAnywhere, Category = "Khaaos|LOD")
	FKhaaosLODConfig ActiveConfig;

	/** Pre-computed squared distance thresholds for fast comparison. */
	TArray<float> DistanceThresholdsSq;

	/** Cached per-actor LOD levels for change detection. */
	TMap<TWeakObjectPtr<AActor>, EKhaaosLODLevel> CachedActorLOD;

	/** Build LOD config for a specific world type. */
	FKhaaosLODConfig BuildConfigForWorld(EKhaaosWorldType WorldType) const;

	/** Recompute squared thresholds from ActiveConfig. */
	void RecomputeSquaredThresholds();
};
