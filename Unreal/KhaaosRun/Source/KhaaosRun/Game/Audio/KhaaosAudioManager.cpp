// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosAudioManager.h"
#include "Game/Audio/KhaaosMetaSoundConfig.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Sound/SoundBase.h"
#include "Sound/SoundClass.h"
#include "Sound/SoundMix.h"
#include "Sound/SoundConcurrency.h"
#include "Components/AudioComponent.h"
#include "Kismet/GameplayStatics.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosAudio, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAudioManager
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAudioManager::UKhaaosAudioManager()
	: bEnable3DSpatialAudio(true)
{
}

void UKhaaosAudioManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Initialize sound class volume defaults
	SoundClassVolumes.Add(TEXT("SFX"), 1.0f);
	SoundClassVolumes.Add(TEXT("Music"), 0.7f);
	SoundClassVolumes.Add(TEXT("Voice"), 1.0f);
	SoundClassVolumes.Add(TEXT("Ambient"), 0.8f);
	SoundClassVolumes.Add(TEXT("UI"), 1.0f);

	InitializeSoundClasses();
	InitializeSoundMixes();

	UE_LOG(LogKhaaosAudio, Log, TEXT("KhaaosAudioManager: Initialized. 3D=%s"),
		bEnable3DSpatialAudio ? TEXT("ON") : TEXT("OFF"));
}

void UKhaaosAudioManager::Deinitialize()
{
	LoadedSoundClasses.Reset();
	LoadedSoundMixes.Reset();

	UE_LOG(LogKhaaosAudio, Log, TEXT("KhaaosAudioManager: Deinitialized."));
	Super::Deinitialize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sound Playback
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAudioManager::Play3DSound(FName SoundID, FVector Location, float Volume, float Pitch)
{
	if (!bEnable3DSpatialAudio)
	{
		Play2DSound(SoundID, Volume);
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Look up MetaSound source from config
	// UKhaaosMetaSoundConfig* Config = GetGameInstance()->GetSubsystem...();
	// For now, log the play request
	UE_LOG(LogKhaaosAudio, Verbose, TEXT("Play3DSound: %s at (%.1f, %.1f, %.1f) Vol=%.2f Pitch=%.2f"),
		*SoundID.ToString(), Location.X, Location.Y, Location.Z, Volume, Pitch);

	// In production: Load MetaSoundSource from config, create AudioComponent
	// with attenuation settings, play at location.
	//
	// UAudioComponent* AudioComp = UGameplayStatics::SpawnSoundAtLocation(
	//     World, MetaSoundSource, Location, FRotator::ZeroRotator,
	//     Volume, Pitch, 0.0f, SoundConcurrency, bAutoDestroy);
}

void UKhaaosAudioManager::PlayAttachedSound(FName SoundID, USceneComponent* Attach, float Volume)
{
	if (!Attach)
	{
		UE_LOG(LogKhaaosAudio, Warning, TEXT("PlayAttachedSound: Null attach component for %s."), *SoundID.ToString());
		return;
	}

	UE_LOG(LogKhaaosAudio, Verbose, TEXT("PlayAttachedSound: %s attached to %s Vol=%.2f"),
		*SoundID.ToString(), *Attach->GetName(), Volume);

	// In production: Load MetaSoundSource, create attached AudioComponent
	// UAudioComponent* AudioComp = UGameplayStatics::SpawnSoundAttached(
	//     MetaSoundSource, Attach, NAME_None, FVector::ZeroVector,
	//     EAttachLocation::KeepRelativeOffset, true, Volume, 1.0f, 0.0f,
	//     SoundConcurrency, bAutoDestroy, bKeepInternal);
}

void UKhaaosAudioManager::Play2DSound(FName SoundID, float Volume)
{
	UWorld* World = GetWorld();
	if (!World) return;

	UE_LOG(LogKhaaosAudio, Verbose, TEXT("Play2DSound: %s Vol=%.2f"), *SoundID.ToString(), Volume);

	// In production: Load MetaSoundSource, play as 2D
	// UGameplayStatics::PlaySound2D(World, MetaSoundSource, Volume, 1.0f, 0.0f);
}

void UKhaaosAudioManager::StopSound(FName SoundID)
{
	UE_LOG(LogKhaaosAudio, Verbose, TEXT("StopSound: %s"), *SoundID.ToString());
	OnSoundFinished.Broadcast(SoundID, true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sound Class Management
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAudioManager::SetSoundClassVolume(FName ClassName, float Volume)
{
	const float ClampedVolume = FMath::Clamp(Volume, 0.0f, 1.0f);
	SoundClassVolumes.Add(ClassName, ClampedVolume);

	// Apply to loaded sound class
	if (USoundClass* SoundClass = LoadedSoundClasses.FindRef(ClassName))
	{
		SoundClass->Properties.Volume = ClampedVolume;
		UE_LOG(LogKhaaosAudio, Log, TEXT("SetSoundClassVolume: %s = %.2f"), *ClassName.ToString(), ClampedVolume);
	}
	else
	{
		UE_LOG(LogKhaaosAudio, Verbose, TEXT("SetSoundClassVolume: %s not loaded yet, cached value = %.2f"),
			*ClassName.ToString(), ClampedVolume);
	}
}

float UKhaaosAudioManager::GetSoundClassVolume(FName ClassName) const
{
	if (const float* Volume = SoundClassVolumes.Find(ClassName))
	{
		return *Volume;
	}
	return 1.0f;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sound Mix Management
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAudioManager::TransitionToMix(FName MixName, float FadeTime)
{
	UWorld* World = GetWorld();
	if (!World) return;

	// Deactivate current mix
	if (ActiveMixName != NAME_None)
	{
		if (USoundMix* CurrentMix = LoadedSoundMixes.FindRef(ActiveMixName))
		{
			UAudioMixerBlueprintLibrary::DeactivateSoundMix(World, CurrentMix);
		}
	}

	// Activate new mix
	if (USoundMix* NewMix = LoadedSoundMixes.FindRef(MixName))
	{
		UAudioMixerBlueprintLibrary::ActivateSoundMix(World, NewMix);
		ActiveMixName = MixName;
		UE_LOG(LogKhaaosAudio, Log, TEXT("TransitionToMix: %s (FadeTime=%.1fs)"), *MixName.ToString(), FadeTime);
	}
	else
	{
		UE_LOG(LogKhaaosAudio, Warning, TEXT("TransitionToMix: Mix '%s' not found."), *MixName.ToString());
	}
}

void UKhaaosAudioManager::ClearCurrentMix()
{
	UWorld* World = GetWorld();
	if (!World) return;

	if (ActiveMixName != NAME_None)
	{
		if (USoundMix* CurrentMix = LoadedSoundMixes.FindRef(ActiveMixName))
		{
			UAudioMixerBlueprintLibrary::DeactivateSoundMix(World, CurrentMix);
		}
		ActiveMixName = NAME_None;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Initialization
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAudioManager::InitializeSoundClasses()
{
	// Load sound classes from soft references
	if (SFXSoundClass.IsValid())
	{
		LoadedSoundClasses.Add(TEXT("SFX"), SFXSoundClass.Get());
	}
	if (MusicSoundClass.IsValid())
	{
		LoadedSoundClasses.Add(TEXT("Music"), MusicSoundClass.Get());
	}
	if (VoiceSoundClass.IsValid())
	{
		LoadedSoundClasses.Add(TEXT("Voice"), VoiceSoundClass.Get());
	}
	if (AmbientSoundClass.IsValid())
	{
		LoadedSoundClasses.Add(TEXT("Ambient"), AmbientSoundClass.Get());
	}
	if (UISoundClass.IsValid())
	{
		LoadedSoundClasses.Add(TEXT("UI"), UISoundClass.Get());
	}

	// Apply cached volumes
	for (const auto& Pair : SoundClassVolumes)
	{
		if (USoundClass* SC = LoadedSoundClasses.FindRef(Pair.Key))
		{
			SC->Properties.Volume = Pair.Value;
		}
	}
}

void UKhaaosAudioManager::InitializeSoundMixes()
{
	if (LowHealthMix.IsValid())
	{
		LoadedSoundMixes.Add(TEXT("LowHealth"), LowHealthMix.Get());
	}
	if (ZoneWarningMix.IsValid())
	{
		LoadedSoundMixes.Add(TEXT("ZoneWarning"), ZoneWarningMix.Get());
	}
	if (CombatMix.IsValid())
	{
		LoadedSoundMixes.Add(TEXT("Combat"), CombatMix.Get());
	}
	if (MenuMix.IsValid())
	{
		LoadedSoundMixes.Add(TEXT("Menu"), MenuMix.Get());
	}
}
