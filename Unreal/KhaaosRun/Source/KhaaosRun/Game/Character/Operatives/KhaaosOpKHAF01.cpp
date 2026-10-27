// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpKHAF01.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Khael ethnicity: Cryok-thal frost-dancer - cryo-adapted geneline

AKhaaosOpKHAF01::AKhaaosOpKHAF01()
{
    // --- Identity ---
    RefCode      = TEXT("KHA-F01");
    OperativeRef = TEXT("OP_KHA_F_01");
    AvatarRef    = TEXT("AVT_KHA_F_01");
    SpeciesID    = FName(TEXT("Khael"));
    SpeciesType  = FName(TEXT("Khael"));
    SpeciesEnum  = EKhaaosSpecies::KHAEL;
    DisplayName  = FText::FromString(TEXT("Khael Female"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    CryoResistance = 0.70f;
}

void AKhaaosOpKHAF01::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("CryoShield")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("FrostBreath")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("EnergyResonance")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
