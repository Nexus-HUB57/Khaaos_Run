// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosHUDWidget.h"
#include "Player/KhaaosPlayerController.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "TimerManager.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosHUDWidget
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosHUDWidget::UKhaaosHUDWidget()
	: CurrentHealth(100.0f)
	, MaxHealth(100.0f)
	, CurrentShield(0.0f)
	, MaxShield(50.0f)
	, CurrentEnergy(100.0f)
	, MaxEnergy(100.0f)
	, CurrentAmmo(30)
	, ReserveAmmo(90)
	, CurrentPing(0)
	, CurrentCredits(0)
	, ZoneWarningText(FText::GetEmpty())
{
	ZoneWarningBeepSound = TSoftObjectPtr<USoundBase>(FSoftObjectPath(
		TEXT("/Game/Audio/SFX/SFX_ZoneWarningBeep.SFX_ZoneWarningBeep")));

	// CommonUI widget setup
	// BP implements the visual layout and UpdateHealth/UpdateShield/etc.
	// events are dispatched to BP for UMG property updates.
}

void UKhaaosHUDWidget::SubmitZuEntryChoice(uint8 ChoiceIndex)
{
	if (AKhaaosPlayerController* PlayerController = Cast<AKhaaosPlayerController>(GetOwningPlayer()))
	{
		PlayerController->ServerSubmitZuChoice(ChoiceIndex);
	}
}

float UKhaaosHUDWidget::GetZoneWarningBeepInterval(float Current, float Max)
{
	const float HealthFraction = Max > KINDA_SMALL_NUMBER
		? FMath::Clamp(Current / Max, 0.0f, 1.0f)
		: 1.0f;
	return FMath::Lerp(ZoneWarningMinimumInterval, ZoneWarningMaximumInterval, HealthFraction);
}

void UKhaaosHUDWidget::NotifySafeZoneDamageCue(float Current, float Max)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	ZoneWarningHealthFraction = Max > KINDA_SMALL_NUMBER
		? FMath::Clamp(Current / Max, 0.0f, 1.0f)
		: 1.0f;
	const float NewInterval = GetZoneWarningBeepInterval(Current, Max);
	const bool bPulseTimerActive = World->GetTimerManager().IsTimerActive(ZoneWarningPulseTimerHandle);
	if (!bPulseTimerActive || !FMath::IsNearlyEqual(NewInterval, ZoneWarningPulseInterval, 0.025f))
	{
		World->GetTimerManager().ClearTimer(ZoneWarningPulseTimerHandle);
		ZoneWarningPulseInterval = NewInterval;
		PlayZoneWarningBeep();
		World->GetTimerManager().SetTimer(
			ZoneWarningPulseTimerHandle,
			this,
			&UKhaaosHUDWidget::PlayZoneWarningBeep,
			ZoneWarningPulseInterval,
			true,
			ZoneWarningPulseInterval);
	}

	World->GetTimerManager().SetTimer(
		ZoneWarningTimeoutTimerHandle,
		this,
		&UKhaaosHUDWidget::StopSafeZoneWarningAudio,
		ZoneWarningCueTimeout,
		false);

	const float VignetteIntensity = FMath::Clamp(0.2f + (1.0f - ZoneWarningHealthFraction) * 0.8f, 0.2f, 1.0f);
	PlayZoneDamageVignette(VignetteIntensity);
}

void UKhaaosHUDWidget::PlayZoneWarningBeep()
{
	USoundBase* BeepSound = ZoneWarningBeepSound.Get();
	if (!BeepSound)
	{
		BeepSound = ZoneWarningBeepSound.LoadSynchronous();
	}
	if (!BeepSound)
	{
		return;
	}

	const float PitchMultiplier = FMath::Lerp(1.0f, 1.35f, 1.0f - ZoneWarningHealthFraction);
	UGameplayStatics::PlaySound2D(this, BeepSound, 1.0f, PitchMultiplier);
}

void UKhaaosHUDWidget::StopSafeZoneWarningAudio()
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(ZoneWarningPulseTimerHandle);
		World->GetTimerManager().ClearTimer(ZoneWarningTimeoutTimerHandle);
	}
	ZoneWarningPulseInterval = 0.0f;
}

void UKhaaosHUDWidget::NativeDestruct()
{
	StopSafeZoneWarningAudio();
	Super::NativeDestruct();
}
