// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "GameFramework/Actor.h"
#include "KhaaosSignificanceManager.generated.h"

// ─── Significance Level Enum ──────────────────────────────────────────────────

/**
 * Significance levels for the Khaaos SignificanceManager.
 * Lower values = higher significance = closer to viewer.
 * Maps to USignificanceManager significance values (float).
 */
UENUM(BlueprintType)
enum class EKhaaosSignificanceLevel : uint8
{
	Critical       UMETA(DisplayName = "Critical"),       // Distance 0-500:  full tick, full replication
	High           UMETA(DisplayName = "High"),           // Distance 500-1500: full tick, reduced replication
	Medium         UMETA(DisplayName = "Medium"),         // Distance 1500-3000: reduced tick, reduced replication
	Low            UMETA(DisplayName = "Low"),            // Distance 3000-5000: minimal tick, low replication
	Insignificant  UMETA(DisplayName = "Insignificant")   // Distance 5000+: no tick, minimal replication
};

// ─── Significance Info Struct ─────────────────────────────────────────────────

/** Per-actor significance tracking data. */
USTRUCT(BlueprintType)
struct FSignificanceInfo
{
	GENERATED_BODY()

	/** The tracked actor. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
	TObjectPtr<AActor> Actor = nullptr;

	/** Current significance level. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
	EKhaaosSignificanceLevel Level = EKhaaosSignificanceLevel::Medium;

	/** Current distance to closest viewer. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
	float CurrentDistance = 0.0f;

	/** Closest viewer (player controller pawn). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
	TObjectPtr<AActor> ViewerClosest = nullptr;

	/** Whether the actor is currently visible to any viewer. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
	uint8 bIsVisible : 1;

	/** Previous significance level (for change detection). */
	EKhaaosSignificanceLevel PreviousLevel = EKhaaosSignificanceLevel::Medium;
};

// ─── Significance Changed Delegate ────────────────────────────────────────────

/** Broadcast when an actor's significance level changes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnSignificanceChanged, AActor*, Actor, EKhaaosSignificanceLevel, OldLevel, EKhaaosSignificanceLevel, NewLevel);

/**
 * UKhaaosSignificanceSubsystem
 *
 * TickableWorldSubsystem that evaluates actor significance based on
 * distance to local viewers (player pawns). Integrates with UE's
 * USignificanceManager plugin for LOD management.
 *
 * When an actor drops to Insignificant:
 *   - Disable tick
 *   - Reduce NetUpdateFrequency
 *   - Optionally return to actor pool
 *
 * When an actor rises in significance:
 *   - Restore tick
 *   - Restore NetUpdateFrequency
 *
 * Thresholds are configurable per-level:
 *   - Critical:      < 500 units
 *   - High:          < 1500 units
 *   - Medium:        < 3000 units
 *   - Low:           < 5000 units
 *   - Insignificant: >= 5000 units
 *
 * Usage:
 *   UKhaaosSignificanceSubsystem* SigSys = GetWorld()->GetSubsystem<UKhaaosSignificanceSubsystem>();
 *   SigSys->RegisterSignificantActor(Projectile, EKhaaosSignificanceLevel::Medium);
 */
UCLASS(BlueprintType)
class UKhaaosSignificanceSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	// ─── Registration ──────────────────────────────────────────────────────────

	/**
	 * Register an actor for significance tracking.
	 * @param Actor  Actor to track
	 * @param Level  Initial significance level
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
	void RegisterSignificantActor(AActor* Actor, EKhaaosSignificanceLevel Level);

	/** Unregister an actor from significance tracking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
	void UnregisterSignificantActor(AActor* Actor);

	// ─── Queries ───────────────────────────────────────────────────────────────

	/** Get all actors within a given radius of a center point. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
	TArray<AActor*> GetActorsInRange(float Radius, FVector Center) const;

	/** Get the significance level of a specific actor. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Significance")
	EKhaaosSignificanceLevel GetActorSignificanceLevel(AActor* Actor) const;

	/** Get the number of registered actors. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Significance")
	int32 GetRegisteredActorCount() const { return RegisteredActors.Num(); }

	/** Get the distance thresholds for each level. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Significance")
	TMap<EKhaaosSignificanceLevel, float> GetLevelThresholds() const { return LevelThresholds; }

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Whether to auto-disable tick for Insignificant actors. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Significance")
	uint8 bAutoDisableTick : 1;

	/** Whether to auto-return Insignificant poolable actors. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Significance")
	uint8 bAutoReturnToPool : 1;

	/** NetUpdateFrequency for Insignificant actors. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Significance")
	float LowNetUpdateFrequency;

	/** Default NetUpdateFrequency to restore. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Significance")
	float DefaultNetUpdateFrequency;

	// ─── Delegate ─────────────────────────────────────────────────────────────

	/** Broadcast when an actor's significance level changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Significance")
	FOnSignificanceChanged OnSignificanceChanged;

private:

	/** Map of registered actors to their significance info. */
	TMap<TObjectPtr<AActor>, FSignificanceInfo> RegisteredActors;

	/** Distance thresholds for each significance level. */
	TMap<EKhaaosSignificanceLevel, float> LevelThresholds;

	/** Cached viewer positions (local player pawns). */
	TArray<FVector> ViewerPositions;

	/** Cached viewer actors. */
	TArray<TObjectPtr<AActor>> ViewerActors;

	/** Update viewer positions from local player controllers. */
	void UpdateViewerPositions();

	/** Calculate significance level from distance. */
	EKhaaosSignificanceLevel CalculateSignificanceLevel(float Distance) const;

	/** Apply significance-based optimizations to an actor. */
	void ApplySignificanceOptimizations(AActor* Actor, EKhaaosSignificanceLevel NewLevel, EKhaaosSignificanceLevel OldLevel);
};
