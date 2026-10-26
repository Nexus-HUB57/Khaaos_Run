// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Ability Registry — GameInstanceSubsystem singleton for all 48 species active abilities
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "KhaaosAbilityRegistry.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosGameplayAbility;
class UKhaaosSpeciesAbilitySet;
class UAbilitySystemComponent;

/**
 * EKhaaosSpecies (forward declared — defined in KhaaosSpeciesAbilitySet.h)
 * We include it here for the registry map.
 */
enum class EKhaaosSpecies : uint8;

/**
 * FKhaaosAbilityRegistryEntry
 *
 * Tracks a registered ability: its class, tag, and owning species.
 */
USTRUCT(BlueprintType)
struct FKhaaosAbilityRegistryEntry
{
    GENERATED_BODY()

    /** Ability class. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilityRegistry")
    TSubclassOf<UKhaaosGameplayAbility> AbilityClass;

    /** Gameplay tag for this ability. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilityRegistry")
    FGameplayTag AbilityTag;

    /** Owning species (as FName for map key). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilityRegistry")
    FName SpeciesName;
};

/**
 * UKhaaosAbilityRegistry
 *
 * GameInstanceSubsystem singleton that holds references to all 48
 * species-specific active abilities and their associated SpeciesAbilitySets.
 *
 * Purpose:
 *   - Single source of truth for all species ability lookups
 *   - Fast O(1) lookup by GameplayTag or Species+Index
 *   - Data-driven: populated from UKhaaosSpeciesAbilitySet data assets
 *   - Used by KhaaosGameMode to grant abilities on species assignment
 *
 * Lifecycle:
 *   - Initialize() loads all species ability set data assets
 *   - GetAbilitiesForSpecies() returns the ability set for a species
 *   - FindAbilityByTag() looks up a specific ability across all species
 *   - Deinitialize() cleans up all references
 */
UCLASS()
class UKhaaosAbilityRegistry : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosAbilityRegistry();

    // ─── UGameInstanceSubsystem Interface ─────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Registration ────────────────────────────────────────────────────

    /**
     * Register a species ability set.
     * Adds all abilities from the set to the registry.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilityRegistry")
    void RegisterSpeciesAbilitySet(UKhaaosSpeciesAbilitySet* AbilitySet);

    /**
     * Register a single ability.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilityRegistry")
    void RegisterAbility(TSubclassOf<UKhaaosGameplayAbility> AbilityClass,
        const FGameplayTag& AbilityTag, const FName& SpeciesName);

    // ─── Queries ─────────────────────────────────────────────────────────

    /**
     * Get all ability entries for a specific species.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    TArray<FKhaaosAbilityRegistryEntry> GetAbilitiesForSpecies(const FName& SpeciesName) const;

    /**
     * Find a specific ability by its GameplayTag.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    FKhaaosAbilityRegistryEntry FindAbilityByTag(const FGameplayTag& Tag) const;

    /**
     * Get the total number of registered abilities.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    int32 GetTotalAbilityCount() const;

    /**
     * Check if the registry has been initialized.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    bool IsRegistryInitialized() const { return bInitialized; }

    /**
     * Get all registered species names.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    TArray<FName> GetRegisteredSpecies() const;

private:

    /** Map from species name → array of ability entries. */
    UPROPERTY()
    TMap<FName, TArray<FKhaaosAbilityRegistryEntry>> SpeciesAbilityMap;

    /** Map from ability tag → registry entry (for fast tag-based lookup). */
    UPROPERTY()
    TMap<FGameplayTag, FKhaaosAbilityRegistryEntry> TagLookupMap;

    /** Whether the registry has been initialized. */
    bool bInitialized = false;
};
