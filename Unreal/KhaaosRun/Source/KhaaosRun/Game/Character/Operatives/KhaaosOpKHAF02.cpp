// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpKHAF02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"#include "NiagaraComponent.h"

// Khael ethnicity: Cryok-thal elite frost-dancer - cryo-amped geneline

AKhaaosOpKHAF02::AKhaaosOpKHAF02()
{
    // --- Identity ---
    RefCode      = TEXT("KHA-F02");
    OperativeRef = TEXT("OP_KHA_F_02");
    AvatarRef    = TEXT("AVT_KHA_F_02");
    SpeciesID    = FName(TEXT("Khael"));
    SpeciesType  = FName(TEXT("Khael"));
    SpeciesEnum  = EKhaaosSpecies::KHAEL;
    DisplayName  = FText::FromString(TEXT("Khael Female Elite"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    CryoResistance = 0.70f;
}

void AKhaaosOpKHAF02::ApplySpeciesTraits()
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
