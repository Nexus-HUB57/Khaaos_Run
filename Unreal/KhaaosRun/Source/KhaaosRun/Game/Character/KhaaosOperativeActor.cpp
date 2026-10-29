// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/KhaaosOperativeActor.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "Game/Animation/KhaaosNaturalLocomotionComponent.h"

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosOperative, Log, All);

AKhaaosOperativeActor::AKhaaosOperativeActor()
{
    PrimaryActorTick.bCanEverTick = true;
    bReplicates = true;
    SetReplicateMovement(true);

    // Create the Species GAS component (subobject owned by this actor)
    SpeciesGAS = CreateDefaultSubobject<UKhaaosSpeciesGAS>(TEXT("SpeciesGAS"));
    CombatPerks = CreateDefaultSubobject<UKhaaosCombatPerkComponent>(TEXT("CombatPerks"));
    Inventory = CreateDefaultSubobject<UKhaaosInventoryComponent>(TEXT("Inventory"));

    // One cosmetic component per operative; visual attachments do not change
    // gameplay collision, stats or the species GAS authority path.
    SkinSystem = CreateDefaultSubobject<UKhaaosSkinSystem>(TEXT("SkinSystem"));

    // Natural locomotion: operatives and bots get the same anti-robotization
    // treatment as players (lean, stride-synced footsteps, foot IK, breathing).
    NaturalLocomotion = CreateDefaultSubobject<UKhaaosNaturalLocomotionComponent>(TEXT("NaturalLocomotion"));

    // Human-feel movement envelope for AI-driven operatives as well.
    if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
    {
        MoveComp->MaxAcceleration = 1600.0f;
        MoveComp->BrakingDecelerationWalking = 1000.0f;
        MoveComp->GroundFriction = 6.5f;
        MoveComp->NetworkSmoothingMode = ENetworkSmoothingMode::Exponential;
    }
}

void AKhaaosOperativeActor::BeginPlay()
{
    Super::BeginPlay();

    // Initialize GAS attributes, then apply species traits via GameplayEffects
    if (SpeciesGAS)
    {
        SpeciesGAS->InitializeAttributesForOperative(SpeciesEnum, BaseHealth, BaseEnergy, BaseSpeed);

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

    // Bind the natural locomotion profile to this operative's species.
    if (NaturalLocomotion && SpeciesEnum != EKhaaosSpecies::NONE)
    {
        NaturalLocomotion->ApplySpeciesProfile(SpeciesEnum);
    }
}
