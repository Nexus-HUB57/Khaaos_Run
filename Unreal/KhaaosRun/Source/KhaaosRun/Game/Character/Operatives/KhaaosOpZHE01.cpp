// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpZHE01.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Zheers ethnicity: Zherkan irradiated-steppe - rad-hardened geneline

AKhaaosOpZHE01::AKhaaosOpZHE01()
{
    // --- Identity ---
    RefCode      = TEXT("ZHE-01");
    OperativeRef = TEXT("OP_ZHE_M_01");
    AvatarRef    = TEXT("AVT_ZHE_M_01");
    SpeciesID    = FName(TEXT("Zheers"));
    SpeciesType  = FName(TEXT("Zheers"));
    SpeciesEnum  = EKhaaosSpecies::ZHEERS;
    DisplayName  = FText::FromString(TEXT("Zheers Male"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    RadResistance = 0.10f;
}

void AKhaaosOpZHE01::ApplySpeciesTraits()
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
