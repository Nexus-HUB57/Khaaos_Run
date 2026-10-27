// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpKHA01.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"#include "NiagaraComponent.h"

// Khael ethnicity: Cryok-thal frost-borne - permafrost-adapted geneline

AKhaaosOpKHA01::AKhaaosOpKHA01()
{
    // --- Identity ---
    RefCode      = TEXT("KHA-01");
    OperativeRef = TEXT("OP_KHA_M_01");
    AvatarRef    = TEXT("AVT_KHA_M_01");
    SpeciesID    = FName(TEXT("Khael"));
    SpeciesType  = FName(TEXT("Khael"));
    SpeciesEnum  = EKhaaosSpecies::KHAEL;
    DisplayName  = FText::FromString(TEXT("Khael Male"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    CryoResistance = 0.70f;
}

void AKhaaosOpKHA01::ApplySpeciesTraits()
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
