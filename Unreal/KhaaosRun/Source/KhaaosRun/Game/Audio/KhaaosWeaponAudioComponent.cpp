// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosWeaponAudioComponent.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosWeaponAudioComponent::UKhaaosWeaponAudioComponent()
{
	PrimaryComponentTick.bCanEverTick = false;

	WeaponId = TEXT("Unknown");
	FireSoundId          = FName("Weapon_Fire");
	SuppressedFireSoundId = FName("Weapon_Fire_Suppressed");
	ReloadSoundId        = FName("Weapon_Reload");
	EquipSoundId         = FName("Weapon_Equip");
	EmptySoundId         = FName("Weapon_Empty");
	OverheatSoundId      = FName("Weapon_Overheat");
	SuppressorVolumeMultiplier = 0.4f;

	bSuppressorActive  = false;
	bFireSoundPlaying  = false;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosWeaponAudioComponent::InitializeComponent()
{
	Super::InitializeComponent();
}

// ─── Weapon Audio Events ────────────────────────────────────────────────────────

void UKhaaosWeaponAudioComponent::PlayFireSound(bool bIsAutomatic, float FireRate)
{
	FName SoundId = bSuppressorActive ? SuppressedFireSoundId : FireSoundId;
	float Volume = bSuppressorActive ? SuppressorVolumeMultiplier : 1.0f;

	// In production: call KhaaosAudioManager->Play3DSound with MetaSound params
	bFireSoundPlaying = true;

	UE_LOG(LogKhaaosRun, VeryVerbose, TEXT("KhaaosWeaponAudio: Fire %s (auto=%d, rate=%.0f, supp=%d)"),
		*SoundId.ToString(), bIsAutomatic, FireRate, bSuppressorActive);
}

void UKhaaosWeaponAudioComponent::StopFireSound()
{
	bFireSoundPlaying = false;
}

void UKhaaosWeaponAudioComponent::PlayReloadSound()
{
	UE_LOG(LogKhaaosRun, VeryVerbose, TEXT("KhaaosWeaponAudio: Reload %s"), *ReloadSoundId.ToString());
}

void UKhaaosWeaponAudioComponent::PlayEquipSound()
{
	UE_LOG(LogKhaaosRun, VeryVerbose, TEXT("KhaaosWeaponAudio: Equip %s"), *EquipSoundId.toString());
}

void UKhaaosWeaponAudioComponent::PlayEmptySound()
{
	UE_LOG(LogKhaaosRun, VeryVerbose, TEXT("KhaaosWeaponAudio: Empty click"));
}

void UKhaaosWeaponAudioComponent::PlayOverheatWarning()
{
	UE_LOG(LogKhaaosRun, VeryVerbose, TEXT("KhaaosWeaponAudio: Overheat warning"));
}

void UKhaaosWeaponAudioComponent::SetSuppressorActive(bool bActive)
{
	bSuppressorActive = bActive;
}
