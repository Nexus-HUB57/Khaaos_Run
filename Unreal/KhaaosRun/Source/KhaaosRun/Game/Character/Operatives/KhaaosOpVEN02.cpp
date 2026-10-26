// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/Operatives/KhaaosOpVEN02.h"
#include "VFX/KhaaosSpeciesVFXRegistry.h"
#include "NiagaraComponent.h"

// Venex ethnicity: Vekkar elite sprint-caste - hyper-accel geneline

AKhaaosOpVEN02::AKhaaosOpVEN02()
{
    // --- Identity ---
    RefCode      = TEXT("VEN-02");
    OperativeRef = TEXT("OP_VEN_M_02");
    AvatarRef    = TEXT("AVT_VEN_M_02");
    SpeciesID    = FName(TEXT("Venex"));
    SpeciesType  = FName(TEXT("Venex"));
    SpeciesEnum  = EKhaaosSpecies::VENEX;
    DisplayName  = FText::FromString(TEXT("Venex Male Elite"));
    Gender       = FName(TEXT("Male"));
    bIsElite     = true;
    Skeleton     = FName(TEXT("SK_Manny"));

    // --- Base Stats ---
    BaseHealth = 150;
    BaseEnergy = 150;
    BaseSpeed  = 660.0f;

    // --- Species Traits ---
    SpeedBonus = 0.20f;
}

void AKhaaosOpVEN02::ApplySpeciesTraits()
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
