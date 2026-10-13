// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Data/KhaaosSpeciesDataAsset.h"
#include "Game/Data/KhaaosWeaponDataAsset.h"
#include "Game/Data/KhaaosLootItemDataAsset.h"
#include "Game/Data/KhaaosWorldConfigDataAsset.h"
#include "KhaaosAssetRegistrySubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnAllAssetsLoaded);

/**
 * UKhaaosAssetRegistrySubsystem — GameInstanceSubsystem that auto-loads
 * all UPrimaryDataAsset instances at startup and caches them for fast access.
 *
 * Asset Types:
 *   - KhaaosSpecies  → UKhaaosSpeciesDataAsset (6 species)
 *   - KhaaosWeapon   → UKhaaosWeaponDataAsset  (11 weapons)
 *   - KhaaosLootItem → UKhaaosLootItemDataAsset (26 loot items)
 *   - KhaaosWorldConfig → UKhaaosWorldConfigDataAsset (5 worlds)
 *
 * Usage:
 *   UKhaaosAssetRegistrySubsystem* Registry = GetGameInstance()->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
 *   UKhaaosWeaponDataAsset* Rifle = Registry->GetWeapon(FName("WPN_AssaultRifle_MK1"));
 */
UCLASS(Abstract, BlueprintType, Config = Game, defaultconfig)
class UKhaaosAssetRegistrySubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    // ─── Subsystem Lifecycle ──────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Bulk Loading ─────────────────────────────────────────────────────

    /** Load all data assets asynchronously. Fires OnAllAssetsLoaded when done. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Registry")
    void LoadAllAssetsAsync();

    /** Load all data assets synchronously (blocks until complete). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Registry")
    void LoadAllAssetsSync();

    /** Check if all assets are loaded. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry")
    bool AreAllAssetsLoaded() const;

    // ─── Species Accessors ────────────────────────────────────────────────

    /** Get species data by ID. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|Species")
    UKhaaosSpeciesDataAsset* GetSpecies(FName SpeciesID) const;

    /** Get all species. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|Species")
    const TArray<UKhaaosSpeciesDataAsset*>& GetAllSpecies() const;

    // ─── Weapon Accessors ─────────────────────────────────────────────────

    /** Get weapon data by ID. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|Weapon")
    UKhaaosWeaponDataAsset* GetWeapon(FName WeaponID) const;

    /** Get all weapons. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|Weapon")
    const TArray<UKhaaosWeaponDataAsset*>& GetAllWeapons() const;

    // ─── Loot Item Accessors ──────────────────────────────────────────────

    /** Get loot item data by ID. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|Loot")
    UKhaaosLootItemDataAsset* GetLootItem(FName ItemID) const;

    /** Get all loot items. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|Loot")
    const TArray<UKhaaosLootItemDataAsset*>& GetAllLootItems() const;

    // ─── World Config Accessors ───────────────────────────────────────────

    /** Get world config by ID. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|World")
    UKhaaosWorldConfigDataAsset* GetWorldConfig(FName WorldID) const;

    /** Get all world configs. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Registry|World")
    const TArray<UKhaaosWorldConfigDataAsset*>& GetAllWorldConfigs() const;

    // ─── Delegates ────────────────────────────────────────────────────────

    /** Broadcast when all data assets are loaded. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Registry")
    FOnAllAssetsLoaded OnAllAssetsLoaded;

private:
    // ─── Cached Data ──────────────────────────────────────────────────────

    /** All loaded species. */
    UPROPERTY(Transient)
    TArray<UKhaaosSpeciesDataAsset*> SpeciesAssets;

    /** All loaded weapons. */
    UPROPERTY(Transient)
    TArray<UKhaaosWeaponDataAsset*> WeaponAssets;

    /** All loaded loot items. */
    UPROPERTY(Transient)
    TArray<UKhaaosLootItemDataAsset*> LootItemAssets;

    /** All loaded world configs. */
    UPROPERTY(Transient)
    TArray<UKhaaosWorldConfigDataAsset*> WorldConfigAssets;

    /** Lookup maps for fast access. */
    TMap<FName, UKhaaosSpeciesDataAsset*> SpeciesMap;
    TMap<FName, UKhaaosWeaponDataAsset*> WeaponMap;
    TMap<FName, UKhaaosLootItemDataAsset*> LootItemMap;
    TMap<FName, UKhaaosWorldConfigDataAsset*> WorldConfigMap;

    /** Whether all assets are loaded. */
    bool bAssetsLoaded = false;

    // ─── Internal Loading ─────────────────────────────────────────────────

    /** Load assets of a specific type from the asset registry. */
    template<typename TAssetType>
    TArray<TAssetType*> LoadAssetsOfType(const FPrimaryAssetType& Type);

    /** Build lookup maps from loaded arrays. */
    void BuildLookupMaps();
};
