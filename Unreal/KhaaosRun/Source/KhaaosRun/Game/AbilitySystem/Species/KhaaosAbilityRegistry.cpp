// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbilityRegistry.h"
#include "Game/AbilitySystem/Species/KhaaosSpeciesAbilitySet.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosRun.h"

UKhaaosAbilityRegistry::UKhaaosAbilityRegistry()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Constructed"));
}

void UKhaaosAbilityRegistry::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Initialize — loading all 48 species abilities"));

    // Species ability sets are loaded from data assets by the game mode
    // and registered via RegisterSpeciesAbilitySet().
    // The registry itself is ready to receive registrations.

    bInitialized = true;
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Initialized and ready for registrations"));
}

void UKhaaosAbilityRegistry::Deinitialize()
{
    Super::Deinitialize();

    SpeciesAbilityMap.Empty();
    TagLookupMap.Empty();
    bInitialized = false;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Deinitialized — cleared all registrations"));
}

void UKhaaosAbilityRegistry::RegisterSpeciesAbilitySet(UKhaaosSpeciesAbilitySet* AbilitySet)
{
    if (!AbilitySet)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosAbilityRegistry::RegisterSpeciesAbilitySet: Null AbilitySet"));
        return;
    }

    const FName SpeciesName = FName(UEnum::GetValueAsString(AbilitySet->Species));

    for (const FKhaaosSpeciesAbilityEntry& Entry : AbilitySet->AbilityEntries)
    {
        RegisterAbility(Entry.AbilityClass, Entry.AbilityTag, SpeciesName);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Registered %d abilities for species %s"),
        AbilitySet->AbilityEntries.Num(), *SpeciesName.ToString());
}

void UKhaaosAbilityRegistry::RegisterAbility(TSubclassOf<UKhaaosGameplayAbility> AbilityClass,
    const FGameplayTag& AbilityTag, const FName& SpeciesName)
{
    FKhaaosAbilityRegistryEntry Entry;
    Entry.AbilityClass = AbilityClass;
    Entry.AbilityTag = AbilityTag;
    Entry.SpeciesName = SpeciesName;

    // Add to species map
    TArray<FKhaaosAbilityRegistryEntry>& SpeciesEntries = SpeciesAbilityMap.FindOrAdd(SpeciesName);
    SpeciesEntries.Add(Entry);

    // Add to tag lookup
    TagLookupMap.Add(AbilityTag, Entry);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Registered ability %s for species %s"),
        *AbilityTag.ToString(), *SpeciesName.ToString());
}

TArray<FKhaaosAbilityRegistryEntry> UKhaaosAbilityRegistry::GetAbilitiesForSpecies(const FName& SpeciesName) const
{
    const TArray<FKhaaosAbilityRegistryEntry>* Found = SpeciesAbilityMap.Find(SpeciesName);
    return Found ? *Found : TArray<FKhaaosAbilityRegistryEntry>();
}

FKhaaosAbilityRegistryEntry UKhaaosAbilityRegistry::FindAbilityByTag(const FGameplayTag& Tag) const
{
    const FKhaaosAbilityRegistryEntry* Found = TagLookupMap.Find(Tag);
    return Found ? *Found : FKhaaosAbilityRegistryEntry();
}

int32 UKhaaosAbilityRegistry::GetTotalAbilityCount() const
{
    int32 Total = 0;
    for (const auto& Pair : SpeciesAbilityMap)
    {
        Total += Pair.Value.Num();
    }
    return Total;
}

TArray<FName> UKhaaosAbilityRegistry::GetRegisteredSpecies() const
{
    TArray<FName> Result;
    SpeciesAbilityMap.GetKeys(Result);
    return Result;
}
