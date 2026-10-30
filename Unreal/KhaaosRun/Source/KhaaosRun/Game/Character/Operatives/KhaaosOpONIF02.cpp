// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpONIF02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Onith ethnicity: Nithrox elite spore-healer - toxin-immune geneline

AKhaaosOpONIF02::AKhaaosOpONIF02()
{
    // --- Identity ---
    RefCode      = TEXT("ONI-F02");
    OperativeRef = TEXT("OP_ONI_F_02");
    AvatarRef    = TEXT("AVT_ONI_F_02");
    SpeciesID    = FName(TEXT("Onith"));
    SpeciesType  = FName(TEXT("Onith"));
    SpeciesEnum  = EKhaaosSpecies::ONITH;
    DisplayName  = FText::FromString(TEXT("Onith Female Elite"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    ToxicResistance = 0.15f;
}

void AKhaaosOpONIF02::ApplySpeciesTraits()
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
