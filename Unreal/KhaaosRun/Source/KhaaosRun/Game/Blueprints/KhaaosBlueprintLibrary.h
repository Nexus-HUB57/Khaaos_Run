// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Game/Data/KhaaosSpeciesDataAsset.h"
#include "Game/Data/KhaaosWeaponDataAsset.h"
#include "Game/Data/KhaaosLootItemDataAsset.h"
#include "Game/Data/KhaaosWorldConfigDataAsset.h"
#include "KhaaosBlueprintLibrary.generated.h"

/**
 * UKhaaosBlueprintLibrary
 *
 * Blueprint-accessible helper functions for the data-driven architecture.
 * Provides a clean API for Blueprint graphs to query DataAssets
 * without exposing C++ complexity.
 *
 * Data Flow: JSON → CSV → DataTable → UPrimaryDataAsset → Blueprint
 *
 * Usage in Blueprint:
 *   - KhaaosBlueprintLibrary::GetSpeciesByID("Zheers")
 *   - KhaaosBlueprintLibrary::GetWeaponsByCategory("Rifle")
 *   - KhaaosBlueprintLibrary::GetLootByRarity("Lendario")
 *   - KhaaosBlueprintLibrary::GetWorldConfig("Barburhen")
 *   - KhaaosBlueprintLibrary::CalculateDamageAtDistance(Weapon, 150.0)
 */
UCLASS()
class UKhaaosBlueprintLibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:

    // ─── Species Helpers ──────────────────────────────────────────────────────

    /** Find a species Data>. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Species", meta = (WorldContext = "WorldContextObject"))
    static UKhaaosSpeciesDataAsset* GetSpeciesByID(UObject* WorldContextObject, FName SpeciesID);

    /** Get all species assets. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Species", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosSpeciesDataAsset*> GetAllSpecies(UObject* WorldContextObject);

    /** Get species available in a specific world. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Species", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosSpeciesDataAsset*> GetSpeciesForWorld(UObject* WorldContextObject, FName WorldID);

    // ─── Weapon Helpers ───────────────────────────────────────────────────────

    /** Find a weapon by ID. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon", meta = (WorldContext = "WorldContextObject"))
    static UKhaaosWeaponDataAsset* GetWeaponByID(UObject* WorldContextObject, FName WeaponID);

    /** Get weapons by category tag (e.g. "Rifle", "Melee"). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosWeaponDataAsset*> GetWeaponsByCategory(UObject* WorldContextObject, FName CategoryTag);

    /** Get weapons by rarity. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosWeaponDataAsset*> GetWeaponsByRarity(UObject* WorldContextObject, FName RarityTag);

    /** Calculate damage at distance (with falloff). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon")
    static float CalculateDamageAtDistance(const UKhaaosWeaponDataAsset* Weapon, float DistanceMeters);

    /** Calculate DPS for a weapon. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon")
    static float CalculateDPS(const UKhaaosWeaponDataAsset* Weapon);

    /** Calculate time to empty a magazine. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon")
    static float TimeToEmptyMagazine(const UKhaaosWeaponDataAsset* Weapon);

    /** Get weapons by slot (PRIMARY, SECONDARY, MELEE). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosWeaponDataAsset*> GetWeaponsBySlot(UObject* WorldContextObject, FName SlotTag);

    /** Get the fire mode display name for a weapon. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Weapon")
    static FText GetFireModeDisplayName(EWeaponFireMode FireMode);

    // ─── Loot Item Helpers ────────────────────────────────────────────────────

    /** Find a loot item by ID. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Loot", meta = (WorldContext = "WorldContextObject"))
    static UKhaaosLootItemDataAsset* GetLootItemByID(UObject* WorldContextObject, FName ItemID);

    /** Get loot items by type (CURATIVO, DEFESA, UTILIDADE, RECURSO). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Loot", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosLootItemDataAsset*> GetLootByType(UObject* WorldContextObject, FName TypeTag);

    /** Get loot items by rarity. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Loot", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosLootItemDataAsset*> GetLootByRarity(UObject* WorldContextObject, FName RarityTag);

    // ─── World Config Helpers ─────────────────────────────────────────────────

    /** Find a world config by ID. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|World", meta = (WorldContext = "WorldContextObject"))
    static UKhaaosWorldConfigDataAsset* GetWorldConfig(UObject* WorldContextObject, FName WorldID);

    /** Get the world sequence (CIGKV → W1 → W2 → W3 → W4). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|World", meta = (WorldContext = "WorldContextObject"))
    static TArray<UKhaaosWorldConfigDataAsset*> GetWorldSequence(UObject* WorldContextObject);

    /** Check if a world is the final world (Arukheea). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|World")
    static bool IsFinalWorld(const UKhaaosWorldConfigDataAsset* WorldConfig);

    // ─── Rarity Color Helpers ─────────────────────────────────────────────────

    /** Get the color for a rarity level. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Rarity")
    static FLinearColor GetRarityColor(FName Rarity);

    /** Get the display name for a rarity level. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Rarity")
    static FText GetRarityDisplayName(FName Rarity);

    // ─── Economy Helpers ──────────────────────────────────────────────────────

    /** Format KRC amount with comma separators. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Economy")
    static FString FormatKRC(int64 Amount);

    /** Calculate KRC price with supply pressure. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Economy")
    static int32 CalculateSupplyAdjustedPrice(int32 BasePrice, float SupplyPressureFactor, int32 CirculatingCount);
};
