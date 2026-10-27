// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpSKW01.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"#include "NiagaraComponent.h"

// Skeetw ethnicity: Tweek-fog native - mist-walker geneline

AKhaaosOpSKW01::AKhaaosOpSKW01()
{
    // --- Identity ---
    RefCode      = TEXT("SKW-01");
    OperativeRef = TEXT("OP_SKW_M_01");
    AvatarRef    = TEXT("AVT_SKW_M_01");
    SpeciesID    = FName(TEXT("Skeetw"));
    SpeciesType  = FName(TEXT("Skeetw"));
    SpeciesEnum  = EKhaaosSpecies::SKEETW;
    DisplayName  = FText::FromString(TEXT("Skeetw Male"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    bHasFogStealth = true;
}

void AKhaaosOpSKW01::ApplySpeciesTraits()
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
