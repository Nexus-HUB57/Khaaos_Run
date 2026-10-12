// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosMetaSoundConfig.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosMetaSoundConfig
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosMetaSoundConfig::UKhaaosMetaSoundConfig()
{
}

const FMetaSoundPreset* UKhaaosMetaSoundConfig::GetPreset(FName SoundID) const
{
	return SoundPresets.Find(SoundID);
}

bool UKhaaosMetaSoundConfig::HasPreset(FName SoundID) const
{
	return SoundPresets.Contains(SoundID);
}
