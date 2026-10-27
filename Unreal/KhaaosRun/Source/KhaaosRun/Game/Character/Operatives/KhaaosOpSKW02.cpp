// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpSKW02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Skeetw ethnicity: Tweek elite fog-dominator - mist-sovereign geneline

AKhaaosOpSKW02::AKhaaosOpSKW02()
{
    // --- Identity ---
    RefCode      = TEXT("SKW-02");
    OperativeRef = TEXT("OP_SKW_M_02");
    AvatarRef    = TEXT("AVT_SKW_M_02");
    SpeciesID    = FName(TEXT("Skeetw"));
    SpeciesType  = FName(TEXT("Skeetw"));
    SpeciesEnum  = EKhaaosSpecies::SKEETW;
    DisplayName  = FText::FromString(TEXT("Skeetw Male Elite"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    bHasFogStealth = true;
}

void AKhaaosOpSKW02::ApplySpeciesTraits()
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
