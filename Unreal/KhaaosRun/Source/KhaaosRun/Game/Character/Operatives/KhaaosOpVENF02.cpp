// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpVENF02.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Venex ethnicity: Vekkar elite swift-sister - hyper-accel geneline

AKhaaosOpVENF02::AKhaaosOpVENF02()
{
    // --- Identity ---
    RefCode      = TEXT("VEN-F02");
    OperativeRef = TEXT("OP_VEN_F_02");
    AvatarRef    = TEXT("AVT_VEN_F_02");
    SpeciesID    = FName(TEXT("Venex"));
    SpeciesType  = FName(TEXT("Venex"));
    SpeciesEnum  = EKhaaosSpecies::VENEX;
    DisplayName  = FText::FromString(TEXT("Venex Female Elite"));
    Gender       = FName(TEXT("Female"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Gwen"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    SpeedBonus = 0.20f;
}

void AKhaaosOpVENF02::ApplySpeciesTraits()
{
    // Species traits are applied via GAS in AKhaaosOperativeActor::BeginPlay().
    // This override spawns species-specific VFX through the SpeciesVFXRegistry.

    if (auto* VFXRegistry = GetGameInstance()->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
    {
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("CyberneticGlow")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("ShieldPulse")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
        if (UNiagaraComponent* VFXComp = VFXRegistry->SpawnSpeciesVFX(SpeciesEnum, FName(TEXT("SpeedTrail")), GetMesh()))
        {
            ActiveSpeciesVFX.Add(VFXComp);
        }
    }
}
