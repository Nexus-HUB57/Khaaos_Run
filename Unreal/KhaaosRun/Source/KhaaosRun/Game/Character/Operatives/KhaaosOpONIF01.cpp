// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpONIF01.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Onith ethnicity: Nithrox spore-healer - toxin-neutral geneline

AKhaaosOpONIF01::AKhaaosOpONIF01()
{
    // --- Identity ---
    RefCode      = TEXT("ONI-F01");
    OperativeRef = TEXT("OP_ONI_F_01");
    AvatarRef    = TEXT("AVT_ONI_F_01");
    SpeciesID    = FName(TEXT("Onith"));
    SpeciesType  = FName(TEXT("Onith"));
    SpeciesEnum  = EKhaaosSpecies::ONITH;
    DisplayName  = FText::FromString(TEXT("Onith Female"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = false;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 100;
    BaseEnergy = 100;
    BaseSpeed  = 600.0f;

    // --- Species Traits ---
    ToxicResistance = 0.15f;
}

void AKhaaosOpONIF01::ApplySpeciesTraits()
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
