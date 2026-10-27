// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpHUR02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Huran ethnicity: Ruvok-dal elite war-caste - reinforced geneline

AKhaaosOpHUR02::AKhaaosOpHUR02()
{
    // --- Identity ---
    RefCode      = TEXT("HUR-02");
    OperativeRef = TEXT("OP_HUR_M_02");
    AvatarRef    = TEXT("AVT_HUR_M_02");
    SpeciesID    = FName(TEXT("Huran"));
    SpeciesType  = FName(TEXT("Huran"));
    SpeciesEnum  = EKhaaosSpecies::HURAN;
    DisplayName  = FText::FromString(TEXT("Huran Male Elite"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    HPRegenPerSecond = 5.0f;
}

void AKhaaosOpHUR02::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("RegenGlow")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("WaterDash")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("AmphibianEyes")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
