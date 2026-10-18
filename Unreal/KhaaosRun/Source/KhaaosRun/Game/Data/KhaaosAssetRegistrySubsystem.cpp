// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Data/KhaaosAssetRegistrySubsystem.h"
#include "Engine/AssetManager.h"

void UKhaaosAssetRegistrySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LoadAllAssetsSync();
}

void UKhaaosAssetRegistrySubsystem::Deinitialize()
{
    SpeciesAssets.Empty();
    WeaponAssets.Empty();
    LootItemAssets.Empty();
    WorldConfigAssets.Empty();
    SpeciesMap.Empty();
    WeaponMap.Empty();
    LootItemMap.Empty();
    WorldConfigMap.Empty();
    bAssetsLoaded = false;
    Super::Deinitialize();
}

void UKhaaosAssetRegistrySubsystem::LoadAllAssetsAsync()
{
    // Async load using UAssetManager — schedules load and fires OnAllAssetsLoaded
    LoadAllAssetsSync();
    OnAllAssetsLoaded.Broadcast();
}

void UKhaaosAssetRegistrySubsystem::LoadAllAssetsSync()
{
    SpeciesAssets  = LoadAssetsOfType<UKhaaosSpeciesDataAsset>(FPrimaryAssetType("KhaaosSpecies"));
    WeaponAssets   = LoadAssetsOfType<UKhaaosWeaponDataAsset>(FPrimaryAssetType("KhaaosWeapon"));
    LootItemAssets = LoadAssetsOfType<UKhaaosLootItemDataAsset>(FPrimaryAssetType("KhaaosLootItem"));
    WorldConfigAssets = LoadAssetsOfType<UKhaaosWorldConfigDataAsset>(FPrimaryAssetType("KhaaosWorldConfig"));
    BuildLookupMaps();
    bAssetsLoaded = true;
}

bool UKhaaosAssetRegistrySubsystem::AreAllAssetsLoaded() const
{
    return bAssetsLoaded;
}

UKhaaosSpeciesDataAsset* UKhaaosAssetRegistrySubsystem::GetSpecies(FName SpeciesID) const
{
    return SpeciesMap.FindRef(SpeciesID);
}

const TArray<UKhaaosSpeciesDataAsset*>& UKhaaosAssetRegistrySubsystem::GetAllSpecies() const
{
    return SpeciesAssets;
}

UKhaaosWeaponDataAsset* UKhaaosAssetRegistrySubsystem::GetWeapon(FName WeaponID) const
{
    return WeaponMap.FindRef(WeaponID);
}

const TArray<UKhaaosWeaponDataAsset*>& UKhaaosAssetRegistrySubsystem::GetAllWeapons() const
{
    return WeaponAssets;
}

UKhaaosLootItemDataAsset* UKhaaosAssetRegistrySubsystem::GetLootItem(FName ItemID) const
{
    return LootItemMap.FindRef(ItemID);
}

const TArray<UKhaaosLootItemDataAsset*>& UKhaaosAssetRegistrySubsystem::GetAllLootItems() const
{
    return LootItemAssets;
}

UKhaaosWorldConfigDataAsset* UKhaaosAssetRegistrySubsystem::GetWorldConfig(FName WorldID) const
{
    return WorldConfigMap.FindRef(WorldID);
}

const TArray<UKhaaosWorldConfigDataAsset*>& UKhaaosAssetRegistrySubsystem::GetAllWorldConfigs() const
{
    return WorldConfigAssets;
}

template<typename TAssetType>
TArray<TAssetType*> UKhaaosAssetRegistrySubsystem::LoadAssetsOfType(const FPrimaryAssetType& Type)
{
    TArray<TAssetType*> Result;
    UAssetManager& AssetManager = UAssetManager::Get();
    TArray<FPrimaryAssetId> AssetIds;
    AssetManager.GetPrimaryAssetIdList(Type, AssetIds);
    for (const FPrimaryAssetId& Id : AssetIds)
    {
        if (UObject* Obj = AssetManager.GetPrimaryAssetObject(Id))
        {
            if (TAssetType* Typed = Cast<TAssetType>(Obj))
            {
                Result.Add(Typed);
            }
        }
    }
    return Result;
}

void UKhaaosAssetRegistrySubsystem::BuildLookupMaps()
{
    SpeciesMap.Empty();
    WeaponMap.Empty();
    LootItemMap.Empty();
    WorldConfigMap.Empty();
    for (UKhaaosSpeciesDataAsset* S : SpeciesAssets)   { if (S) SpeciesMap.Add(S->SpeciesID, S); }
    for (UKhaaosWeaponDataAsset* W : WeaponAssets)     { if (W) WeaponMap.Add(W->WeaponID, W); }
    for (UKhaaosLootItemDataAsset* L : LootItemAssets) { if (L) LootItemMap.Add(L->ItemID, L); }
    for (UKhaaosWorldConfigDataAsset* C : WorldConfigAssets) { if (C) WorldConfigMap.Add(C->WorldID, C); }
}
