// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Audio/KhaaosZoneWarningSystem.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnZoneWarning, float, DistanceToZone, float, DamagePerTick);

/**
 * UKhaaosZoneWarningSystem
 *
 * Proximity-based zone warning audio with directional cues.
 * Plays escalating warning sounds as player approaches or is outside
 * the safe zone, with 3D spatial audio pointing toward the safe zone center.
 *
 * Warning Levels:
 *   - Safe:     No warning (inside zone with margin)
 *   - Caution:  Subtle pulse (within 20% of zone edge)
 *   - Warning:  Faster pulse, directional cue (outside zone, <50m)
 *   - Danger:   Urgent alarm, strong directional cue (outside, >50m, high damage)
 *   - Critical: Maximum intensity alarm (zone damage >20/tick)
 *
 * Directional Audio:
 *   - 3D sound positioned at the nearest safe zone edge point
 *   - HRTF spatialization on PS5/XSX/PC
 *   - Stereo panning on Switch2
 *   - Volume increases with distance from zone
 *   - Pulse rate increases: 1Hz (caution) → 2Hz (warning) → 4Hz (danger)
 *
 * Console Parity (Free Fire):
 *   - Zone warning starts when 15 seconds to next shrink
 *   - "GET TO SAFE ZONE" voice line when outside
 *   - Minimap border flash
 *   - Screen edge vignette (red)
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosZoneWarningSystem : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosZoneWarningSystem();

	virtual void InitializeComponent() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// ─── Warning API ────────────────────────────────────────────────────────

	/** Update zone proximity state. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Zone")
	void UpdateZoneProximity(float DistanceToZoneEdge, float ZoneRadius, float DamagePerTick, const FVector& NearestSafePoint);

	/** Get current warning level (0=Safe, 1=Caution, 2=Warning, 3=Danger, 4=Critical). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Audio|Zone")
	int32 GetWarningLevel() const { return WarningLevel; }

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Caution distance (fraction of zone radius). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float CautionDistanceFraction;

	/** Warning distance (meters outside zone). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float WarningDistance;

	/** Danger distance (meters outside zone). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float DangerDistance;

	/** Critical damage threshold (damage/tick). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float CriticalDamageThreshold;

	/** Base pulse rate (Hz). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float BasePulseRate;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Audio|Zone")
	FOnZoneWarning OnZoneWarning;

private:

	/** Current warning level (0-4). */
	int32 WarningLevel;

	/** Pulse timer. */
	float PulseTimer;

	/** Distance to zone edge (negative = outside). */
	float DistanceToEdge;

	/** Nearest safe zone point for 3D audio. */
	FVector NearestSafePoint;

	/** Compute warning level from distance and damage. */
	int32 ComputeWarningLevel(float Distance, float Damage) const;

	/** Compute pulse rate for current warning level. */
	float ComputePulseRate() const;
};
