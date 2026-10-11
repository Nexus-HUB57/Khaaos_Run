// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "Sound/SoundClass.h"
#include "Game/Audio/KhaaosMetaSoundConfig.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UMetaSoundSource;

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FMetaSoundPreset
 *
 * Configuration for a single MetaSound source.
 * Maps a named SoundID to a MetaSound asset with playback defaults.
 */
USTRUCT(BlueprintType)
struct FMetaSoundPreset
{
	GENERATED_BODY()

	/** MetaSound source asset (loaded on demand). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound")
	TSoftObjectPtr<UMetaSoundSource> MetaSoundSource;

	/** Default volume multiplier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound", meta = (ClampMin = "0", ClampMax = "1"))
	float DefaultVolume = 1.0f;

	/** Default pitch multiplier. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound", meta = (ClampMin = "0.1", ClampMax = "4"))
	float DefaultPitch = 1.0f;

	/** Sound class this preset belongs to. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound")
	TSoftObjectPtr<USoundClass> SoundClass;

	/** Whether this sound loops. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound")
	uint8 bLooping : 1;

	/** Whether this is a 3D spatial sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound")
	uint8 b3DSpatial : 1;

	/** Priority (higher = more important, 0 = normal). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound")
	int32 Priority = 0;
};

/**
 * FWeaponAudioConfig
 *
 * Audio configuration for weapon sounds.
 * Each weapon type maps to these sound presets.
 */
USTRUCT(BlueprintType)
struct FWeaponAudioConfig
{
	GENERATED_BODY()

	/** Weapon fire sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName FireSound;

	/** Weapon reload sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName ReloadSound;

	/** Empty magazine click. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName EmptySound;

	/** Weapon equip sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName EquipSound;

	/** Bullet impact sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName ImpactSound;

	/** Headshot impact sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FName HeadshotSound;
};

/**
 * FZoneAudioConfig
 *
 * Audio configuration for safe zone sounds.
 */
USTRUCT(BlueprintType)
struct FZoneAudioConfig
{
	GENERATED_BODY()

	/** Zone warning loop (plays while zone is shrinking). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	FName WarningLoop;

	/** Zone shrink start sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	FName ShrinkStart;

	/** Zone damage tick sound (per player). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	FName DamageTick;

	/** Phase advance sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	FName PhaseAdvance;
};

/**
 * FUIAudioConfig
 *
 * Audio configuration for UI interaction sounds.
 */
USTRUCT(BlueprintType)
struct FUIAudioConfig
{
	GENERATED_BODY()

	/** UI click/confirm sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FName UIClick;

	/** UI back/cancel sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FName UIBack;

	/** UI notification sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FName UINotification;

	/** UI error sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FName UIError;

	/** UI open/activate sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FName UIOpen;

	/** UI close/deactivate sound. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FName UIClose;
};

/**
 * FMusicConfig
 *
 * Music track configuration for different game states.
 */
USTRUCT(BlueprintType)
struct FMusicConfig
{
	GENERATED_BODY()

	/** Main menu music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Music")
	FName MenuMusic;

	/** Lobby/waiting music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Music")
	FName LobbyMusic;

	/** Combat music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Music")
	FName CombatMusic;

	/** Victory music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Music")
	FName VictoryMusic;

	/** Defeat music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Music")
	FName DefeatMusic;
};

/**
 * FAdaptiveMusicConfig
 *
 * Configuration for adaptive music system.
 * Controls intensity parameter mapping and transition thresholds.
 */
USTRUCT(BlueprintType)
struct FAdaptiveMusicConfig
{
	GENERATED_BODY()

	/** MetaSound parameter name for intensity (0-1). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Adaptive")
	FName IntensityParameter = FName(TEXT("Intensity"));

	/** Crossfade transition time in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Adaptive")
	float TransitionTime = 2.0f;

	/** Combat threshold — intensity above this triggers combat music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Adaptive", meta = (ClampMin = "0", ClampMax = "1"))
	float CombatThreshold = 0.7f;

	/** Exploration threshold — intensity below this triggers ambient music. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Adaptive", meta = (ClampMin = "0", ClampMax = "1"))
	float ExplorationThreshold = 0.3f;
};

/**
 * UKhaaosMetaSoundConfig
 *
 * Primary data asset containing all MetaSound configurations for Khaaos Run.
 *
 * Organized as:
 *   - SoundPresets: Named MetaSound source configurations
 *   - WeaponAudio: Weapon sound mapping
 *   - ZoneAudio: Zone sound mapping
 *   - UIAudio: UI sound mapping
 *   - MusicConfig: Music track mapping
 *   - AdaptiveMusicConfig: Adaptive intensity parameters
 *
 * Usage:
 *   UKhaaosMetaSoundConfig* Config = LoadObject<UKhaaosMetaSoundConfig>(...);
 *   const FMetaSoundPreset& Preset = Config->SoundPresets[SoundID];
 */
UCLASS(Abstract, PrimaryCategory = "Khaaos|Audio")
class UKhaaosMetaSoundConfig : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UKhaaosMetaSoundConfig();

	// ─── Sound Presets ────────────────────────────────────────────────────────

	/** Map of SoundID → MetaSound preset configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|MetaSound")
	TMap<FName, FMetaSoundPreset> SoundPresets;

	// ─── Category Audio Configs ───────────────────────────────────────────────

	/** Weapon audio configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Weapon")
	FWeaponAudioConfig WeaponAudio;

	/** Zone audio configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Zone")
	FZoneAudioConfig ZoneAudio;

	/** UI audio configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|UI")
	FUIAudioConfig UIAudio;

	/** Music track configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Music")
	FMusicConfig MusicConfig;

	/** Adaptive music configuration. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Adaptive")
	FAdaptiveMusicConfig AdaptiveMusicConfig;

	// ─── Query ────────────────────────────────────────────────────────────────

	/** Get a sound preset by ID. Returns nullptr if not found. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MetaSound")
	const FMetaSoundPreset* GetPreset(FName SoundID) const;

	/** Check if a sound preset exists. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MetaSound")
	bool HasPreset(FName SoundID) const;
};
