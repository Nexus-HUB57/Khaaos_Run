// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Zone Hazard Component — World-specific environmental hazards

#include "Ring/KhaaosZoneHazardComponent.h"
#include "Ring/KhaaosRingManager.h"

UKhaaosZoneHazardComponent::UKhaaosZoneHazardComponent()
{
    PrimaryComponentTick.bCanEverTick = true;

    // Initialize hazard configs for each world
    HazardConfigs.Empty();

    // W2 Priadus: Toxic Fog
    {
        FHazardConfig ToxicFog;
        ToxicFog.HazardType = EZoneHazardType::TOXIC_FOG;
        ToxicFog.VFXAsset = TEXT("VFX_Ring_ToxicFog");
        ToxicFog.DamageModifier = 0.3f;
        ToxicFog.bSlowsMovement = false;
        ToxicFog.SlowPercentage = 0.f;
        ToxicFog.HuranResistance = 0.5f;
        HazardConfigs.Add(EZoneHazardType::TOXIC_FOG, ToxicFog);
    }

    // W3 Ckesalth: Radiation Zone
    {
        FHazardConfig Radiation;
        Radiation.HazardType = EZoneHazardType::RADIATION_ZONE;
        Radiation.VFXAsset = TEXT("VFX_Ring_Radiation");
        Radiation.DamageModifier = 0.2f;
        Radiation.bSlowsMovement = false;
        Radiation.SlowPercentage = 0.f;
        Radiation.HuranResistance = 0.3f;
        HazardConfigs.Add(EZoneHazardType::RADIATION_ZONE, Radiation);
    }

    // W4 Arukheea: Cryo Storm
    {
        FHazardConfig Cryo;
        Cryo.HazardType = EZoneHazardType::CRYO_STORM;
        Cryo.VFXAsset = TEXT("VFX_Ring_CryoStorm");
        Cryo.DamageModifier = 0.4f;
        Cryo.bSlowsMovement = true;
        Cryo.SlowPercentage = 30.f;
        Cryo.HuranResistance = 0.0f;
        HazardConfigs.Add(EZoneHazardType::CRYO_STORM, Cryo);
    }
}

EZoneHazardType UKhaaosZoneHazardComponent::GetActiveHazard(EKhaaosWorld World) const
{
    // Map world to its environmental hazard
    switch (World)
    {
        case EKhaaosWorld::W2_PRIADUS:   return EZoneHazardType::TOXIC_FOG;
        case EKhaaosWorld::W3_CKESALTH:  return EZoneHazardType::RADIATION_ZONE;
        case EKhaaosWorld::W4_ARUKHEEA:  return EZoneHazardType::CRYO_STORM;
        default:                          return EZoneHazardType::NONE;
    }
}

float UKhaaosZoneHazardComponent::GetHazardDamage(EZoneHazardType Hazard, float BaseDamage) const
{
    if (Hazard == EZoneHazardType::NONE) return 0.f;

    if (const FHazardConfig* Config = HazardConfigs.Find(Hazard))
    {
        return BaseDamage * Config->DamageModifier;
    }

    return 0.f;
}

float UKhaaosZoneHazardComponent::GetHuranResistance(EZoneHazardType Hazard) const
{
    if (const FHazardConfig* Config = HazardConfigs.Find(Hazard))
    {
        return Config->HuranResistance;
    }
    return 0.f;
}

void UKhaaosZoneHazardComponent::ApplySecondaryEffects()
{
    if (!bHazardActive || ActiveHazard == EZoneHazardType::NONE) return;

    if (const FHazardConfig* Config = HazardConfigs.Find(ActiveHazard))
    {
        if (Config->bSlowsMovement)
        {
            // Apply movement speed reduction
            // Character->GetCharacterMovement()->MaxWalkSpeed *= (1.f - Config->SlowPercentage / 100.f);
            UE_LOG(LogTemp, Verbose,
                TEXT("HazardComponent: Applying %.0f%% slow from %s"),
                Config->SlowPercentage, *Config->VFXAsset);
        }
    }
}

void UKhaaosZoneHazardComponent::ActivateHazardVFX(EZoneHazardType Hazard)
{
    if (Hazard == EZoneHazardType::NONE)
    {
        bHazardActive = false;
        ActiveHazard = EZoneHazardType::NONE;
        return;
    }

    ActiveHazard = Hazard;
    bHazardActive = true;

    if (const FHazardConfig* Config = HazardConfigs.Find(Hazard))
    {
        UE_LOG(LogTemp, Log,
            TEXT("HazardComponent: Activated %s hazard with VFX %s"),
            *UEnum::GetValueAsString(Hazard), *Config->VFXAsset);
    }
}
