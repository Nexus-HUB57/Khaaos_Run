// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosSpeciesAbilitySet.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"

UKhaaosSpeciesAbilitySet::UKhaaosSpeciesAbilitySet()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSpeciesAbilitySet: Constructed"));
}

void UKhaaosSpeciesAbilitySet::GrantAbilities(UAbilitySystemComponent* ASC,
    TArray<FGameplayAbilitySpecHandle>& OutGrantedHandles,
    UObject* SourceObject) const
{
    if (!ASC)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosSpeciesAbilitySet::GrantAbilities: Null ASC"));
        return;
    }

    for (const FKhaaosSpeciesAbilityEntry& Entry : AbilityEntries)
    {
        if (!Entry.AbilityClass)
        {
            UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSpeciesAbilitySet::GrantAbilities: Null ability class, skipping"));
            continue;
        }

        FGameplayAbilitySpec AbilitySpec(Entry.AbilityClass, Entry.Level, SourceObject);
        AbilitySpec.InputID = 0; // Enhanced Input uses tags instead

        const FGameplayAbilitySpecHandle GrantedHandle = ASC->GiveAbility(AbilitySpec);
        OutGrantedHandles.Add(GrantedHandle);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSpeciesAbilitySet::GrantAbilities: Granted %s for species %s"),
            *Entry.AbilityClass->GetName(),
            *UEnum::GetValueAsString(Species));
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSpeciesAbilitySet: Granted %d abilities for species %s"),
        OutGrantedHandles.Num(), *UEnum::GetValueAsString(Species));
}

void UKhaaosSpeciesAbilitySet::RemoveAbilities(UAbilitySystemComponent* ASC,
    TArray<FGameplayAbilitySpecHandle>& GrantedHandles)
{
    if (!ASC) return;

    for (const FGameplayAbilitySpecHandle& Handle : GrantedHandles)
    {
        if (Handle.IsValid())
        {
            ASC->ClearAbility(Handle);
        }
    }

    GrantedHandles.Empty();
}
