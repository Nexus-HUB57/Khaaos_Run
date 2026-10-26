// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpVENF01.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Venex ethnicity: Vekkar swift-sister caste - velocity geneline

AKhaaosOpVENF01::AKhaaosOpVENF01()
{
    // --- Identity ---
    RefCode      = TEXT("VEN-F01");
    OperativeRef = TEXT("OP_VEN_F_01");
    AvatarRef    = TEXT("AVT_VEN_F_01");
    SpeciesID    = FName(TEXT("Venex"));
    SpeciesType  = FName(TEXT("Venex"));
    SpeciesEnum  = EKhaaosSpecies::VENEX;
    DisplayName  = FText::FromString(TEXT("Venex Female"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    SpeedBonus = 0.20f;
}

void AKhaaosOpVENF01::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("CyberneticGlow")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("ShieldPulse")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("SpeedTrail")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
