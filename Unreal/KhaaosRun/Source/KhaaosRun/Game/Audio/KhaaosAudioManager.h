// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Sound/SoundClass.h"
#include "Sound/SoundMix.h"
#include "Game/Audio/KhaaosAudioManager.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSoundFinished, FName, SoundID, bool, bStoppedManually);

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FKhaaosAudioDistanceConfig
 *
 * Configuration for 3D spatial audio attenuation.
 */
USTRUCT(BlueprintType)
struct FKhaaosAudioDistanceConfig
{
	GENERATED_BODY()

	/** Inner radius (full volume). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	float InnerRadius = 100.0f;

	/** Attenuation radius (falloff to zero). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	float AttenuationRadius = 2000.0f;

	/** Spatialization algorithm. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	int32 SpatializationAlgorithm = 0; // 0=HRTF, 1=Panning, 2=Binaural
};

/**
 * UKhaaosAudioManager
 *
 * Audio subsystem managing sound classes, sound mixes, and 3D spatial audio.
 * Provides a centralized API for all game audio playback.
 *
 * Features:
 *   - SoundClasses: SFX, Music, Voice, Ambient, UI
 *   - SoundMixes: LowHealth, ZoneWarning, Combat, Menu
 *   - Play3DSound: Play a sound at a world position
 *   - PlayAttachedSound: Play a sound attached to a component
 *   - SetSoundClassVolume: Adjust volume per sound class
 *   - TransitionToMix: Crossfade to a sound mix
 *   - 3D spatial audio with configurable attenuation
 *
 * MetaSound Integration:
 *   - SoundIDs map to TSoftObjectPtr<UMetaSoundSource>
 *   - MetaSound parameters set via UKhaaosMetaSoundConfig
 *   - Adaptive music handled by UKhaaosAdaptiveMusic subsystem
 */
UCLASS(Config = Game, defaultconfig)
class UKhaaosAudioManager : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosAudioManager();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Sound Playback ───────────────────────────────────────────────────────

	/**
	 * Play a 3D spatial sound at a world location.
	 * @param SoundID   Named identifier for the sound preset
	 * @param Location  World position to play at
	 * @param Volume    Volume multiplier (0-1)
	 * @param Pitch     Pitch multiplier (1 = normal)
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void Play3DSound(FName SoundID, FVector Location, float Volume = 1.0f, float Pitch = 1.0f);

	/**
	 * Play a sound attached to a scene component.
	 * @param SoundID   Named identifier for the sound preset
	 * @param Attach    Component to attach to
	 * @param Volume    Volume multiplier
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void PlayAttachedSound(FName SoundID, USceneComponent* Attach, float Volume = 1.0f);

	/**
	 * Play a 2D (non-spatial) sound.
	 * @param SoundID   Named identifier for the sound preset
	 * @param Volume    Volume multiplier
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void Play2DSound(FName SoundID, float Volume = 1.0f);

	/**
	 * Stop a currently playing sound by ID.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void StopSound(FName SoundID);

	// ─── Sound Class Management ───────────────────────────────────────────────

	/**
	 * Set the volume for a sound class.
	 * @param ClassName  Name of the sound class (SFX, Music, Voice, Ambient, UI)
	 * @param Volume     Volume level (0-1)
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void SetSoundClassVolume(FName ClassName, float Volume);

	/**
	 * Get the current volume for a sound class.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Audio")
	float GetSoundClassVolume(FName ClassName) const;

	// ─── Sound Mix Management ─────────────────────────────────────────────────

	/**
	 * Transition to a sound mix (e.g., LowHealth, Combat, Menu).
	 * @param MixName  Name of the sound mix
	 * @param FadeTime  Crossfade duration in seconds
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void TransitionToMix(FName MixName, float FadeTime = 1.0f);

	/**
	 * Clear the current sound mix, reverting to default.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio")
	void ClearCurrentMix();

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Whether 3D spatial audio is enabled. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Audio")
	uint8 bEnable3DSpatialAudio : 1;

	/** Distance configuration for 3D audio. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Audio")
	FKhaaosAudioDistanceConfig AudioDistanceConfig;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when a sound finishes playing. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Audio")
	FOnSoundFinished OnSoundFinished;

	// ─── Sound Class References ───────────────────────────────────────────────

	/** Sound class for SFX. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundClass> SFXSoundClass;

	/** Sound class for Music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundClass> MusicSoundClass;

	/** Sound class for Voice. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundClass> VoiceSoundClass;

	/** Sound class for Ambient. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundClass> AmbientSoundClass;

	/** Sound class for UI. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundClass> UISoundClass;

	// ─── Sound Mix References ─────────────────────────────────────────────────

	/** Sound mix for low health effect. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundMix> LowHealthMix;

	/** Sound mix for zone warning. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundMix> ZoneWarningMix;

	/** Sound mix for combat emphasis. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundMix> CombatMix;

	/** Sound mix for menu/lobby. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio")
	TSoftObjectPtr<USoundMix> MenuMix;

private:

	/** Cache of loaded sound classes by name. */
	TMap<FName, TObjectPtr<USoundClass>> LoadedSoundClasses;

	/** Cache of loaded sound mixes by name. */
	TMap<FName, TObjectPtr<USoundMix>> LoadedSoundMixes;

	/** Currently active sound mix. */
	FName ActiveMixName;

	/** Volume levels per sound class. */
	TMap<FName, float> SoundClassVolumes;

	/** Initialize sound class and mix caches. */
	void InitializeSoundClasses();

	/** Initialize sound mix caches. */
	void InitializeSoundMixes();
};
