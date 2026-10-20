// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Audio/KhaaosWeaponAudioComponent.generated.h"

/**
 * UKhaaosWeaponAudioComponent
 *
 * Per-weapon audio component handling fire, reload, equip, empty magazine,
 * suppression, and echo/reverb sounds. Integrates with KhaaosAudioManager
 * for 3D spatial audio and MetaSound parameter control.
 *
 * Weapon Audio Events:
 *   - Fire: Looping for automatic, one-shot for semi/burst
 *   - Reload: Magazine out → Magazine in → Charge
 *   - Equip: Weapon raise sound
 *   - Unequip: Weapon lower sound
 *   - Empty: Click sound on empty magazine
 *   - Suppressor: Altered fire sound with tail
 *   - Echo: Delayed echo in enclosed spaces (reverb zone)
 *   - Overheat: Warning sound when approaching overheat
 *
 * MetaSound Parameters (per weapon):
 *   - Pitch: Varies with fire rate and overheating
 *   - Volume: Suppressor reduces to 40%
 *   - TailLength: Echo duration based on room size
 *   - DistanceModel: Near/Far/Mid crossfade
 *
 * Console Optimization:
 *   - Max 8 simultaneous weapon audio sources per player
 *   - Virtual voices for distant gunfire (low-pass filtered)
 *   - Occlusion: Simple ray check every 250ms for blocked sounds
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosWeaponAudioComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosWeaponAudioComponent();

	virtual void InitializeComponent() override;

	// ─── Weapon Audio Events ────────────────────────────────────────────────

	/** Play fire sound (looping for auto, one-shot for semi). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void PlayFireSound(bool bIsAutomatic, float FireRate);

	/** Stop fire sound. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void StopFireSound();

	/** Play reload sound (full sequence). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void PlayReloadSound();

	/** Play equip sound. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void PlayEquipSound();

	/** Play empty magazine click. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void PlayEmptySound();

	/** Play overheat warning. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void PlayOverheatWarning();

	/** Set suppressor active (alters fire sound). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Weapon")
	void SetSuppressorActive(bool bActive);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Weapon ID for audio lookup. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FString WeaponId;

	/** Fire sound ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName FireSoundId;

	/** Suppressed fire sound ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName SuppressedFireSoundId;

	/** Reload sound ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName ReloadSoundId;

	/** Equip sound ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName EquipSoundId;

	/** Empty sound ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName EmptySoundId;

	/** Overheat warning sound ID. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName OverheatSoundId;

	/** Suppressor volume multiplier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	float SuppressorVolumeMultiplier;

private:

	/** Is suppressor active? */
	bool bSuppressorActive;

	/** Is fire sound currently playing? */
	bool bFireSoundPlaying;
};
