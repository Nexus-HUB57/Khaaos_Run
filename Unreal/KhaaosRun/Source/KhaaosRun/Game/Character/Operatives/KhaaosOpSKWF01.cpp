// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpSKWF01.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Skeetw ethnicity: Tweek-fog weaver - mist-shroud geneline

AKhaaosOpSKWF01::AKhaaosOpSKWF01()
{
    // --- Identity ---
    RefCode      = TEXT("SKW-F01");
    OperativeRef = TEXT("OP_SKW_F_01");
    AvatarRef    = TEXT("AVT_SKW_F_01");
    SpeciesID    = FName(TEXT("Skeetw"));
    SpeciesType  = FName(TEXT("Skeetw"));
    SpeciesEnum  = EKhaaosSpecies::SKEETW;
    DisplayName  = FText::FromString(TEXT("Skeetw Female"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    bHasFogStealth = true;
}

void AKhaaosOpSKWF01::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("Bioluminescence")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("FogStealthVFX")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("AvianTrail")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
