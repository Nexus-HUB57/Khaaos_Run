// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpONI01.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Onith ethnicity: Nithrox spore-tolerant - mycelial-symbiont geneline

AKhaaosOpONI01::AKhaaosOpONI01()
{
    // --- Identity ---
    RefCode      = TEXT("ONI-01");
    OperativeRef = TEXT("OP_ONI_M_01");
    AvatarRef    = TEXT("AVT_ONI_M_01");
    SpeciesID    = FName(TEXT("Onith"));
    SpeciesType  = FName(TEXT("Onith"));
    SpeciesEnum  = EKhaaosSpecies::ONITH;
    DisplayName  = FText::FromString(TEXT("Onith Male"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    ToxicResistance = 0.15f;
}

void AKhaaosOpONI01::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("ToxicAura")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("ScaleShimmer")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("HissVFX")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
