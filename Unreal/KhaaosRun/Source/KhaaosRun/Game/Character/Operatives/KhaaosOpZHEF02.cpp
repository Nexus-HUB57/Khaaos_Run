// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpZHEF02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Zheers ethnicity: Zherkan elite rad-queen - rad-fortress geneline

AKhaaosOpZHEF02::AKhaaosOpZHEF02()
{
    // --- Identity ---
    RefCode      = TEXT("ZHE-F02");
    OperativeRef = TEXT("OP_ZHE_F_02");
    AvatarRef    = TEXT("AVT_ZHE_F_02");
    SpeciesID    = FName(TEXT("Zheers"));
    SpeciesType  = FName(TEXT("Zheers"));
    SpeciesEnum  = EKhaaosSpecies::ZHEERS;
    DisplayName  = FText::FromString(TEXT("Zheers Female Elite"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    RadResistance = 0.10f;
}

void AKhaaosOpZHEF02::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("RadGlow")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("MutationPulse")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("RadResistAura")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
