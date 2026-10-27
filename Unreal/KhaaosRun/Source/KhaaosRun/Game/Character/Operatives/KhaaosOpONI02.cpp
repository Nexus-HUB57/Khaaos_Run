// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpONI02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"#include "NiagaraComponent.h"

// Onith ethnicity: Nithrox elite spore-warlord - toxin-overlord geneline

AKhaaosOpONI02::AKhaaosOpONI02()
{
    // --- Identity ---
    RefCode      = TEXT("ONI-02");
    OperativeRef = TEXT("OP_ONI_M_02");
    AvatarRef    = TEXT("AVT_ONI_M_02");
    SpeciesID    = FName(TEXT("Onith"));
    SpeciesType  = FName(TEXT("Onith"));
    SpeciesEnum  = EKhaaosSpecies::ONITH;
    DisplayName  = FText::FromString(TEXT("Onith Male Elite"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    ToxicResistance = 0.15f;
}

void AKhaaosOpONI02::ApplySpeciesTraits()
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
