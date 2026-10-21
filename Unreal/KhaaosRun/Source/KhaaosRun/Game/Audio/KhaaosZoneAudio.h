// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/AudioComponent.h"
#include "Game/Audio/KhaaosZoneAudio.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosSafeZone;

/**
 * AKhaaosZoneAudio
 *
 * Zone-specific audio actor for the Battle Royale safe zone.
 * Manages warning loops, damage tick sounds, and phase advance sounds.
 *
 * Design:
 *   - WarningLoop: Continuous audio while zone is shrinking,
 *     intensity scales with distance to zone edge
 *   - DamageTick: Per-player audio when taking zone damage
 *   - PhaseAdvance: One-shot sound when zone phase changes
 *   - WarningIntensity: 0-1 based on proximity to zone boundary
 *
 * Lifecycle:
 *   - BeginZoneShrink(): Start warning loop, escalate intensity
 *   - EndZoneShrink(): Fade out warning
 *   - OnPlayerInZoneDamage(): Play damage tick for affected player
 *   - OnZonePhaseChanged(): Play phase advance sound
 *
 * Audio Components:
 *   - UAudioComponent for zone warning (looping, 3D spatial)
 *   - UAudioComponent for zone damage tick (non-looping, per player)
 */
UCLASS(Abstract, Blueprintable, meta = (Category = "Khaaos|Audio"))
class AKhaaosZoneAudio : public AActor
{
	GENERATED_BODY()

public:
	AKhaaosZoneAudio();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

	// ─── Zone Audio Events ────────────────────────────────────────────────────

	/** Start the zone warning loop when zone begins shrinking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Zone")
	void BeginZoneShrink();

	/** Stop the zone warning loop when zone stops shrinking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Zone")
	void EndZoneShrink();

	/**
	 * Play damage tick sound for a player taking zone damage.
	 * @param PlayerLocation  World position of the damaged player
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Zone")
	void OnPlayerInZoneDamage(FVector PlayerLocation);

	/**
	 * Play phase advance sound when zone phase changes.
	 * @param Phase  New zone phase number
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Zone")
	void OnZonePhaseChanged(int32 Phase);

	// ─── Warning Intensity ────────────────────────────────────────────────────

	/**
	 * Update warning intensity based on distance to zone edge.
	 * Closer = higher intensity (louder warning).
	 * @param DistanceToEdge  Distance from player to zone boundary (negative = inside)
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Zone")
	void UpdateWarningIntensity(float DistanceToEdge);

	// ─── State ────────────────────────────────────────────────────────────────

	/** Whether the zone warning is currently playing. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	uint8 bIsWarning : 1;

	/** Current warning intensity (0-1). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float WarningIntensity = 0.0f;

	/** Current zone phase. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	int32 CurrentZonePhase = 0;

	// ─── Audio Components ─────────────────────────────────────────────────────

	/** Audio component for the zone warning loop. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	TObjectPtr<UAudioComponent> WarningAudioComponent;

	/** Audio component for the zone damage tick. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	TObjectPtr<UAudioComponent> DamageTickAudioComponent;

	// ─── Sound Configuration (TSoftObjectPtr for async loading) ───────────────

	/** Warning loop MetaSound source. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	TSoftObjectPtr<USoundBase> WarningLoopSound;

	/** Damage tick MetaSound source. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	TSoftObjectPtr<USoundBase> DamageTickSound;

	/** Phase advance MetaSound source. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	TSoftObjectPtr<USoundBase> PhaseAdvanceSound;

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Warning fade-in time in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float WarningFadeInTime = 1.0f;

	/** Warning fade-out time in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float WarningFadeOutTime = 2.0f;

	/** Distance at which warning intensity is maximum (close to edge). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	float MaxWarningDistance = 500.0f;

	/** Volume multiplier for the warning loop. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone", meta = (ClampMin = "0", ClampMax = "1"))
	float WarningVolume = 0.8f;

	/** Volume multiplier for damage ticks. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone", meta = (ClampMin = "0", ClampMax = "1"))
	float DamageTickVolume = 0.6f;

	/** Volume multiplier for phase advance. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone", meta = (ClampMin = "0", ClampMax = "1"))
	float PhaseAdvanceVolume = 1.0f;

protected:

	/** Timer handle for damage tick cooldown. */
	FTimerHandle DamageTickCooldownHandle;

	/** Whether a damage tick was recently played (for cooldown). */
	uint8 bDamageTickOnCooldown : 1;

	/** Internal: Fade in the warning audio. */
	void FadeInWarning();

	/** Internal: Fade out the warning audio. */
	void FadeOutWarning();

	/** Internal: Damage tick cooldown complete. */
	void OnDamageTickCooldownComplete();
};
