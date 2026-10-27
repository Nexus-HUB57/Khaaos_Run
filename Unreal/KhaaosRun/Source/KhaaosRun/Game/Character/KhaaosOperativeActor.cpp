// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/KhaaosOperativeActor.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
DEFINE_LOG_CATEGORY_STATIC(LogKhaaosOperative, Log, All);

AKhaaosOperativeActor::AKhaaosOperativeActor()
{
    PrimaryActorTick.bCanEverTick = true;

    // Create the Species GAS component (subobject owned by this actor)
    SpeciesGAS = CreateDefaultSubobject<UKhaaosSpeciesGAS>(TEXT("SpeciesGAS"));
}

void AKhaaosOperativeActor::BeginPlay()
{
    Super::BeginPlay();

    // Initialize GAS attributes, then apply species traits via GameplayEffects
    if (SpeciesGAS)
    {
        SpeciesGAS->InitializeAttributes();

        if (SpeciesEnum != EKhaaosSpecies::NONE)
        {
            int32 EffectCount = SpeciesGAS->ApplySpeciesTraits(SpeciesEnum);
            UE_LOG(LogKhaaosOperative, Log,
                TEXT("BeginPlay: Applied %d trait effects for species %d on %s"),
                EffectCount, static_cast<int32>(SpeciesEnum), *GetName());
        }
    }

    // Spawn species VFX via the SpeciesVFXRegistry
    ApplySpeciesTraits();
}
