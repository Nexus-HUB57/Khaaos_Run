// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/KhaaosOperativeActor.h"
#include "AbilitySystemComponent.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "Game/Animation/KhaaosNaturalLocomotionComponent.h"

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosOperative, Log, All);

AKhaaosOperativeActor::AKhaaosOperativeActor()
{
    PrimaryActorTick.bCanEverTick = true;
    bReplicates = true;
    SetReplicateMovement(true);
    NetUpdateFrequency = 30.0f;
    MinNetUpdateFrequency = 10.0f;
    NetPriority = 3.0f;

    AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(TEXT("AbilitySystemComponent"));
    AbilitySystemComponent->SetIsReplicated(true);
    AbilitySystemComponent->SetReplicationMode(EGameplayEffectReplicationMode::Minimal);
    CombatAttributes = CreateDefaultSubobject<UKhaaosAttributeSet>(TEXT("CombatAttributes"));
    AbilitySystemComponent->AddAttributeSetSubobject(CombatAttributes);

    // Create the species manager and bind it to actor-owned GAS subobjects.
    SpeciesGAS = CreateDefaultSubobject<UKhaaosSpeciesGAS>(TEXT("SpeciesGAS"));
    SpeciesGAS->SetAbilitySystemReferences(AbilitySystemComponent, CombatAttributes);
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

UAbilitySystemComponent* AKhaaosOperativeActor::GetAbilitySystemComponent() const
{
    return AbilitySystemComponent;
}

void AKhaaosOperativeActor::PostInitializeComponents()
{
    Super::PostInitializeComponents();
    if (AbilitySystemComponent)
    {
        AbilitySystemComponent->InitAbilityActorInfo(this, this);
    }

    // Establish the baseline before replicated perk components apply their loadout.
    if (SpeciesGAS)
    {
        SpeciesGAS->InitializeAttributesForOperative(SpeciesEnum, BaseHealth, BaseEnergy, BaseSpeed);
        if (SpeciesEnum != EKhaaosSpecies::NONE)
        {
            const int32 EffectCount = SpeciesGAS->ApplySpeciesTraits(SpeciesEnum);
            UE_LOG(LogKhaaosOperative, Log,
                TEXT("PostInitializeComponents: Applied %d trait effects for species %d on %s"),
                EffectCount, static_cast<int32>(SpeciesEnum), *GetName());
        }
    }
}

void AKhaaosOperativeActor::BeginPlay()
{
    Super::BeginPlay();

    // Spawn species VFX via the SpeciesVFXRegistry
    ApplySpeciesTraits();

    // Bind the natural locomotion profile to this operative's species.
    if (NaturalLocomotion && SpeciesEnum != EKhaaosSpecies::NONE)
    {
        NaturalLocomotion->ApplySpeciesProfile(SpeciesEnum);
    }
}
