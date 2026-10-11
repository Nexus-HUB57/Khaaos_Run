// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosAbilitySet.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosGameplayAbility;
class UAbilitySystemComponent;

/**
 * FKhaaosAbilityGrantEntry
 *
 * Entry describing a single ability to grant.
 * Contains the ability class, associated input tag, and ability level.
 */
USTRUCT(BlueprintType)
struct FKhaaosAbilityGrantEntry
{
        GENERATED_BODY()

        /** Ability class to grant. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilitySet")
        TSubclassOf<UKhaaosGameplayAbility> AbilityClass;

        /** Input tag bound to this ability (for Enhanced Input mapping). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilitySet")
        FGameplayTag InputTag;

        /** Ability level to grant at. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilitySet")
        int32 Level = 1;
};

/**
 * FKhaaosAbilitySet_GrantedHandles
 *
 * Tracks the ability spec handles and gameplay effect handles
 * granted by a UKhaaosAbilitySet, so they can be removed later.
 */
USTRUCT(BlueprintType)
struct FKhaaosAbilitySet_GrantedHandles
{
        GENERATED_BODY()

public:

        /** Remove all granted abilities from the given ASC. */
        void RemoveFromAbilitySystem(UAbilitySystemComponent* ASC);

        /** Check if any handles have been granted. */
        bool IsEmpty() const;

        /** Granted ability spec handles. */
        UPROPERTY()
        TArray<FGameplayAbilitySpecHandle> AbilitySpecHandles;
};

/**
 * UKhaaosAbilitySet
 *
 * Primary data asset containing a set of abilities to grant to an AbilitySystemComponent.
 * Used as a data-driven way to configure ability loadouts per character class,
 * game phase, or game feature.
 *
 * Design:
 *   - Define ability sets in data assets (not hardcoded)
 *   - GiveAbilities() grants all abilities to an ASC
 *   - RemoveAbilities() removes all previously granted abilities
 *   - Tracks granted handles for clean removal
 *   - Integrates with Enhanced Input via InputTag per entry
 */
UCLASS(BlueprintType, meta = (DisplayName = "Khaaos Ability Set"))
class UKhaaosAbilitySet : public UPrimaryDataAsset
{
        GENERATED_BODY()

public:
        UKhaaosAbilitySet();

        // ─── Ability Grant Entries ────────────────────────────────────────────

        /** List of abilities to grant. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilitySet")
        TArray<FKhaaosAbilityGrantEntry> AbilityGrantEntries;

        // ─── Grant / Remove ───────────────────────────────────────────────────

        /**
         * Grant all abilities in this set to the given AbilitySystemComponent.
         * Returns granted handles for later removal.
         *
         * @param ASC              Target ability system component
         * @param OutGrantedHandles  Receives the handles for later removal
         * @param SourceObject       Object that granted these abilities (for debugging)
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySet")
        void GiveAbilities(UAbilitySystemComponent* ASC,
                FKhaaosAbilitySet_GrantedHandles& OutGrantedHandles,
                UObject* SourceObject = nullptr) const;

        /**
         * Remove all abilities previously granted by GiveAbilities().
         *
         * @param ASC              Target ability system component
         * @param GrantedHandles    Handles returned by GiveAbilities()
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySet")
        static void RemoveAbilities(UAbilitySystemComponent* ASC,
                FKhaaosAbilitySet_GrantedHandles& GrantedHandles);

        // ─── Queries ──────────────────────────────────────────────────────────

        /** Get the total number of abilities in this set. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilitySet")
        int32 GetAbilityCount() const { return AbilityGrantEntries.Num(); }
};
