// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosZoneAudio.h"
#include "Game/Audio/KhaaosAudioManager.h"
#include "Game/Zone/KhaaosSafeZone.h"

#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "TimerManager.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosZoneAudio, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// AKhaaosZoneAudio
// ═══════════════════════════════════════════════════════════════════════════════

AKhaaosZoneAudio::AKhaaosZoneAudio()
	: bIsWarning(false)
	, WarningIntensity(0.0f)
	, CurrentZonePhase(0)
	, bDamageTickOnCooldown(false)
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	// Create audio components
	WarningAudioComponent = CreateDefaultSubobject<UAudioComponent>(TEXT("WarningAudioComponent"));
	WarningAudioComponent->bAutoActivate = false;
	WarningAudioComponent->bStopWhenOwnerDestroyed = true;

	DamageTickAudioComponent = CreateDefaultSubobject<UAudioComponent>(TEXT("DamageTickAudioComponent"));
	DamageTickAudioComponent->bAutoActivate = false;
	DamageTickAudioComponent->bStopWhenOwnerDestroyed = true;
}

void AKhaaosZoneAudio::BeginPlay()
{
	Super::BeginPlay();

	UE_LOG(LogKhaaosZoneAudio, Log, TEXT("KhaaosZoneAudio: BeginPlay."));
}

void AKhaaosZoneAudio::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(DamageTickCooldownHandle);
	}

	if (WarningAudioComponent)
	{
		WarningAudioComponent->Stop();
	}
	if (DamageTickAudioComponent)
	{
		DamageTickAudioComponent->Stop();
	}

	Super::EndPlay(EndPlayReason);
}

void AKhaaosZoneAudio::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Update warning volume based on intensity
	if (bIsWarning && WarningAudioComponent && WarningAudioComponent->IsPlaying())
	{
		const float TargetVolume = WarningVolume * WarningIntensity;
		const float CurrentVolume = WarningAudioComponent->VolumeMultiplier;
		const float NewVolume = FMath::FInterpTo(CurrentVolume, TargetVolume, DeltaSeconds, 5.0f);
		WarningAudioComponent->SetVolumeMultiplier(NewVolume);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Zone Audio Events
// ═══════════════════════════════════════════════════════════════════════════════

void AKhaaosZoneAudio::BeginZoneShrink()
{
	if (bIsWarning) return;

	bIsWarning = true;
	WarningIntensity = 0.5f; // Start at medium intensity

	FadeInWarning();

	UE_LOG(LogKhaaosZoneAudio, Log, TEXT("BeginZoneShrink: Warning loop started."));
}

void AKhaaosZoneAudio::EndZoneShrink()
{
	if (!bIsWarning) return;

	bIsWarning = false;
	FadeOutWarning();

	UE_LOG(LogKhaaosZoneAudio, Log, TEXT("EndZoneShrink: Warning fading out."));
}

void AKhaaosZoneAudio::OnPlayerInZoneDamage(FVector PlayerLocation)
{
	if (bDamageTickOnCooldown) return;

	// Play damage tick sound at the player's location
	if (DamageTickSound.IsValid())
	{
		USoundBase* Sound = DamageTickSound.Get();
		if (Sound)
		{
			UKhaaosAudioManager* AudioMgr = GetGameInstance()->GetSubsystem<UKhaaosAudioManager>();
			if (AudioMgr)
			{
				AudioMgr->Play3DSound(TEXT("ZoneDamageTick"), PlayerLocation, DamageTickVolume);
			}
		}
	}

	// Set cooldown to prevent audio spam
	bDamageTickOnCooldown = true;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(
			DamageTickCooldownHandle,
			this,
			&AKhaaosZoneAudio::OnDamageTickCooldownComplete,
			0.5f, // 500ms cooldown between damage ticks
			false
		);
	}
}

void AKhaaosZoneAudio::OnZonePhaseChanged(int32 Phase)
{
	CurrentZonePhase = Phase;

	// Play phase advance sound (2D, broadcast to all players)
	if (PhaseAdvanceSound.IsValid())
	{
		USoundBase* Sound = PhaseAdvanceSound.Get();
		if (Sound)
		{
			UKhaaosAudioManager* AudioMgr = GetGameInstance()->GetSubsystem<UKhaaosAudioManager>();
			if (AudioMgr)
			{
				AudioMgr->Play2DSound(TEXT("ZonePhaseAdvance"), PhaseAdvanceVolume);
			}
		}
	}

	UE_LOG(LogKhaaosZoneAudio, Log, TEXT("OnZonePhaseChanged: Phase %d."), Phase);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Warning Intensity
// ═══════════════════════════════════════════════════════════════════════════════

void AKhaaosZoneAudio::UpdateWarningIntensity(float DistanceToEdge)
{
	// Closer to edge = higher intensity
	// Inside zone (negative distance): low intensity
	// Outside zone (positive distance): high intensity
	if (DistanceToEdge < 0.0f)
	{
		// Inside zone — intensity based on how close to edge
		const float AbsDist = FMath::Abs(DistanceToEdge);
		if (AbsDist < MaxWarningDistance)
		{
			WarningIntensity = 1.0f - (AbsDist / MaxWarningDistance);
		}
		else
		{
			WarningIntensity = 0.0f;
		}
	}
	else
	{
		// Outside zone — maximum intensity
		WarningIntensity = 1.0f;
	}

	WarningIntensity = FMath::Clamp(WarningIntensity, 0.0f, 1.0f);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal
// ═══════════════════════════════════════════════════════════════════════════════

void AKhaaosZoneAudio::FadeInWarning()
{
	if (!WarningAudioComponent) return;

	if (WarningLoopSound.IsValid())
	{
		USoundBase* Sound = WarningLoopSound.Get();
		if (Sound)
		{
			WarningAudioComponent->SetSound(Sound);
			WarningAudioComponent->SetVolumeMultiplier(0.0f); // Start silent
			WarningAudioComponent->FadeIn(WarningFadeInTime, WarningVolume * WarningIntensity);
		}
	}
}

void AKhaaosZoneAudio::FadeOutWarning()
{
	if (!WarningAudioComponent || !WarningAudioComponent->IsPlaying()) return;

	WarningAudioComponent->FadeOut(WarningFadeOutTime, 0.0f);
}

void AKhaaosZoneAudio::OnDamageTickCooldownComplete()
{
	bDamageTickOnCooldown = false;
}
