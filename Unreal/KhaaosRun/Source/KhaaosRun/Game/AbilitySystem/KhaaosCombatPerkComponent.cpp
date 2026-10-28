// Khaaos Run - Authoritative operative combat perks
#include "Game/AbilitySystem/KhaaosCombatPerkComponent.h"

#include "AbilitySystemComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "Net/UnrealNetwork.h"

UKhaaosCombatPerkComponent::UKhaaosCombatPerkComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
    SetIsReplicatedByDefault(true);
}

void UKhaaosCombatPerkComponent::BeginPlay()
{
    Super::BeginPlay();
    if (GetOwner() && GetOwner()->HasAuthority())
    {
        for (const FName PerkId : InitialPerkIds)
        {
            EquipPerkAuthoritative(PerkId);
        }
    }
}

void UKhaaosCombatPerkComponent::RequestEquipPerk(FName PerkId)
{
    if (!PerkId.IsNone() && GetOwner() && GetOwner()->HasAuthority()) EquipPerkAuthoritative(PerkId);
}

void UKhaaosCombatPerkComponent::RequestRemovePerk(FName PerkId)
{
    if (!PerkId.IsNone() && GetOwner() && GetOwner()->HasAuthority()) RemovePerkAuthoritative(PerkId);
}

const FKhaaosCombatPerkDefinition* UKhaaosCombatPerkComponent::FindDefinition(FName PerkId) const
{
    return PerkCatalog.FindByPredicate([PerkId](const FKhaaosCombatPerkDefinition& Definition)
    {
        return Definition.PerkId == PerkId;
    });
}

bool UKhaaosCombatPerkComponent::EquipPerkAuthoritative(FName PerkId)
{
    if (!GetOwner() || !GetOwner()->HasAuthority() || PerkId.IsNone() || EquippedPerkIds.Contains(PerkId))
    {
        return false;
    }
    if (EquippedPerkIds.Num() >= FMath::Clamp(MaxEquippedPerks, 1, 8))
    {
        return false;
    }

    const FKhaaosCombatPerkDefinition* Definition = FindDefinition(PerkId);
    UKhaaosSpeciesGAS* SpeciesGAS = GetOwner()->FindComponentByClass<UKhaaosSpeciesGAS>();
    UAbilitySystemComponent* ASC = SpeciesGAS ? SpeciesGAS->GetAbilitySystemComponent() : nullptr;
    if (!Definition || !Definition->GameplayEffect || !ASC)
    {
        return false;
    }

    FGameplayEffectContextHandle Context = ASC->MakeEffectContext();
    Context.AddSourceObject(GetOwner());
    const FGameplayEffectSpecHandle Spec = ASC->MakeOutgoingSpec(Definition->GameplayEffect, 1.0f, Context);
    if (!Spec.IsValid()) return false;

    const FActiveGameplayEffectHandle Handle = ASC->ApplyGameplayEffectSpecToSelf(*Spec.Data.Get());
    if (!Handle.IsValid()) return false;

    ActivePerkEffects.Add(PerkId, Handle);
    EquippedPerkIds.Add(PerkId);
    OnPerkLoadoutChanged.Broadcast(EquippedPerkIds);
    GetOwner()->ForceNetUpdate();
    return true;
}

bool UKhaaosCombatPerkComponent::RemovePerkAuthoritative(FName PerkId)
{
    if (!GetOwner() || !GetOwner()->HasAuthority() || !EquippedPerkIds.Contains(PerkId))
    {
        return false;
    }

    if (FActiveGameplayEffectHandle* Handle = ActivePerkEffects.Find(PerkId))
    {
        if (UKhaaosSpeciesGAS* SpeciesGAS = GetOwner()->FindComponentByClass<UKhaaosSpeciesGAS>())
        {
            if (UAbilitySystemComponent* ASC = SpeciesGAS->GetAbilitySystemComponent())
            {
                ASC->RemoveActiveGameplayEffect(*Handle);
            }
        }
        ActivePerkEffects.Remove(PerkId);
    }

    EquippedPerkIds.Remove(PerkId);
    OnPerkLoadoutChanged.Broadcast(EquippedPerkIds);
    GetOwner()->ForceNetUpdate();
    return true;
}

void UKhaaosCombatPerkComponent::OnRep_EquippedPerkIds()
{
    OnPerkLoadoutChanged.Broadcast(EquippedPerkIds);
}

void UKhaaosCombatPerkComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(UKhaaosCombatPerkComponent, EquippedPerkIds);
}
