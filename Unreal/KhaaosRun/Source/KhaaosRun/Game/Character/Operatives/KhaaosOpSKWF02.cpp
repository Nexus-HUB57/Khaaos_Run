// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpSKWF02.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Skeetw ethnicity: Tweek elite fog-queen - mist-empress geneline

AKhaaosOpSKWF02::AKhaaosOpSKWF02()
{
    // --- Identity ---
    RefCode      = TEXT("SKW-F02");
    OperativeRef = TEXT("OP_SKW_F_02");
    AvatarRef    = TEXT("AVT_SKW_F_02");
    SpeciesID    = FName(TEXT("Skeetw"));
    SpeciesType  = FName(TEXT("Skeetw"));
    SpeciesEnum  = EKhaaosSpecies::SKEETW;
    DisplayName  = FText::FromString(TEXT("Skeetw Female Elite"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    bHasFogStealth = true;
}

void AKhaaosOpSKWF02::ApplySpeciesTraits()
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
