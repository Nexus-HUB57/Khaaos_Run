// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/WorldGen/KhaaosWorldGenerator.h"
#include "Game/WorldGen/KhaaosEnvironmentalHazard.generated.h"

// ─── Hazard Type Enum ─────────────────────────────────────────────────────────

/**
 * EKhaaosHazardType
 * Types of environmental hazards within worlds.
 */
UENUM(BlueprintType)
enum class EKhaaosHazardType : uint8
{
	LavaFlow	UMETA(DisplayName = "LAVA_FLOW"),
	IceStorm	UMETA(DisplayName = "ICE_STORM"),
	Sandstorm	UMETA(DisplayName = "SANDSTORM"),
	AcidRain	UMETA(DisplayName = "ACID_RAIN"),
	ToxicGas	UMETA(DisplayName = "TOXIC_GAS"),
	LightningStorm	UMETA(DisplayName = "LIGHTNING_STORM"),
	Flood		UMETA(DisplayName = "FLOOD"),
	VoidTear	UMETA(DisplayName = "VOID_TEAR")
};

// ─── Hazard Config ────────────────────────────────────────────────────────────

/**
 * FKhaaosHazardConfig
 * Configuration for an environmental hazard.
 */
USTRUCT(BlueprintType)
struct FKhaaosHazardConfig
{
	GENERATED_BODY()

	/** Type of hazard. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	EKhaaosHazardType HazardType = EKhaaosHazardType::LavaFlow;

	/** Damage per second while inside hazard. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float DamagePerSecond = 10.0f;

	/** Radius of the hazard area (cm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float Radius = 500.0f;

	/** Duration of the hazard in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float DurationSeconds = 30.0f;

	/** Whether the hazard activates periodically. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	uint8 bIsPeriodic : 1;

	/** Interval between periodic activations (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float PeriodIntervalSeconds = 10.0f;

	/** Warning time before hazard activates (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float WarningTimeSeconds = 5.0f;

	/** Associated biome type for this hazard. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	EKhaaosBiomeType AssociatedBiome = EKhaaosBiomeType::VolcanicWastes;

	FKhaaosHazardConfig()
		: HazardType(EKhaaosHazardType::LavaFlow)
		, DamagePerSecond(10.0f)
		, Radius(500.0f)
		, DurationSeconds(30.0f)
		, bIsPeriodic(false)
		, PeriodIntervalSeconds(10.0f)
		, WarningTimeSeconds(5.0f)
		, AssociatedBiome(EKhaaosBiomeType::VolcanicWastes)
	{}
};

// ─── Active Hazard ────────────────────────────────────────────────────────────

/**
 * FKhaaosActiveHazard
 * Runtime state of an active environmental hazard.
 */
USTRUCT(BlueprintType)
struct FKhaaosActiveHazard
{
	GENERATED_BODY()

	/** Hazard configuration. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	FKhaaosHazardConfig Config;

	/** Origin location of the hazard. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	FVector OriginLocation = FVector::ZeroVector;

	/** Remaining time for the hazard. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float RemainingTime = 0.0f;

	/** Whether the hazard is currently active (damaging). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	uint8 bIsActive : 1;

	/** Player IDs currently affected by this hazard. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	TArray<int32> AffectedPlayerIds;

	FKhaaosActiveHazard()
		: OriginLocation(FVector::ZeroVector)
		, RemainingTime(0.0f)
		, bIsActive(false)
	{}
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnHazardWarning, int32, HazardId, EKhaaosHazardType, HazardType, FVector, Location);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnHazardStarted, int32, HazardId, EKhaaosHazardType, HazardType, FVector, Location);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnHazardEnded, int32, HazardId, EKhaaosHazardType, HazardType, FVector, Location);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnPlayerDamagedByHazard, int32, PlayerId, float, Damage, EKhaaosHazardType, HazardType);

/**
 * UKhaaosEnvironmentalHazardComponent
 *
 * Environmental hazards within worlds — lava flows, ice storms, sandstorms,
 * acid rain, and more. Integrated with the biome system for biome-appropriate
 * hazard spawning.
 *
 * Architecture:
 *   - Hazard lifecycle: Warning → Active → Expired
 *   - Periodic hazards: cycle between active/inactive on interval
 *   - Distance-based damage: players within Radius take DamagePerSecond
 *   - Warning system: broadcasts OnHazardWarning before activation
 *   - Biome association: hazards tied to specific biome types
 *
 * Biome-Hazard Mapping:
 *   VolcanicWastes → LavaFlow, ToxicGas
 *   FrozenTundra   → IceStorm, Flood (melt)
 *   DesertCanyon   → Sandstorm, LightningStorm
 *   UrbanRuins     → AcidRain, ToxicGas
 *   TropicalForest → Flood, LightningStorm
 *   SkyIslands     → VoidTear, LightningStorm
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosEnvironmentalHazardComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	UKhaaosEnvironmentalHazardComponent();

	// ─── Hazard Spawning ────────────────────────────────────────────────────

	/** Spawn a hazard at a location. Returns the hazard ID. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Hazard")
	int32 SpawnHazard(const FKhaaosHazardConfig& Config, const FVector& Location);

	/** Remove a hazard by ID. Returns true if removed. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Hazard")
	bool RemoveHazard(int32 HazardId);

	/** Get all currently active hazards. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen|Hazard")
	TArray<FKhaaosActiveHazard> GetActiveHazards() const;

	/** Check if a location is within any active hazard. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen|Hazard")
	bool IsLocationInHazard(const FVector& Location) const;

	/** Get total damage per second at a location from all overlapping hazards. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|WorldGen|Hazard")
	float GetHazardDamageAtLocation(const FVector& Location) const;

	/** Tick all hazards (advance timers, apply damage, handle periodic). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|WorldGen|Hazard")
	void TickHazards(float DeltaTime);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Maximum simultaneous active hazards. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	int32 MaxActiveHazards = 100;

	/** Global damage multiplier (for difficulty scaling). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WorldGen|Hazard")
	float GlobalDamageMultiplier = 1.0f;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when a hazard warning is issued (before activation). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Hazard")
	FOnHazardWarning OnHazardWarning;

	/** Broadcast when a hazard starts dealing damage. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Hazard")
	FOnHazardStarted OnHazardStarted;

	/** Broadcast when a hazard ends. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Hazard")
	FOnHazardEnded OnHazardEnded;

	/** Broadcast when a player takes damage from a hazard. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|WorldGen|Hazard")
	FOnPlayerDamagedByHazard OnPlayerDamagedByHazard;

	// ─── Tick ────────────────────────────────────────────────────────────────

	virtual void TickComponent(float DeltaTime, ELevelTick TickType,
		FActorComponentTickFunction* ThisTickFunction) override;

private:

	/** Active hazards keyed by hazard ID. */
	TMap<int32, FKhaaosActiveHazard> ActiveHazardMap;

	/** Next hazard ID counter. */
	int32 NextHazardId = 1;

	/** Hazards in warning phase (hazard ID → remaining warning time). */
	TMap<int32, float> WarningTimers;

	/** Periodic hazard cooldown timers (hazard ID → remaining cooldown). */
	TMap<int32, float> PeriodicCooldowns;

	/** Check if a location is within radius of a hazard origin. */
	static bool IsInRadius(const FVector& Location, const FVector& Origin, float Radius);
};
