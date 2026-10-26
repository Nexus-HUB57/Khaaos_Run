// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Species Ability Set — Maps species enum → array of ability class references
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosSpeciesAbilitySet.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosGameplayAbility;
class UAbilitySystemComponent;

/**
 * EKhaaosSpecies
 *
 * Enum representing all 6 playable species in Khaaos Run.
 */
UENUM(BlueprintType)
enum class EKhaaosSpecies : uint8
{
    Huran   UMETA(DisplayName = "HURAN"),
    Khael   UMETA(DisplayName = "KHAEL"),
    Venex   UMETA(DisplayName = "VENEX"),
    Onith   UMETA(DisplayName = "ONITH"),
    Zheers  UMETA(DisplayName = "ZHEERS"),
    Skeetw  UMETA(DisplayName = "SKEETW"),
    None    UMETA(DisplayName = "NONE")
};

/**
 * FKhaaosSpeciesAbilityEntry
 *
 * A single ability entry in a species ability set.
 */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesAbilityEntry
{
    GENERATED_BODY()

    /** Ability class reference. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    TSubclassOf<UKhaaosGameplayAbility> AbilityClass;

    /** Gameplay tag identifying this ability. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    FGameplayTag AbilityTag;

    /** Input tag for Enhanced Input binding. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    FGameplayTag InputTag;

    /** Ability level to grant at. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    int32 Level = 1;
};

/**
 * UKhaaosSpeciesAbilitySet
 *
 * UPrimaryDataAsset that maps a species (EKhaaosSpecies) to its full
 * set of active abilities (8 per species = 48 total).
 *
 * Usage:
 *   - Create one UKhaaosSpeciesAbilitySet per species in the Content Browser
 *   - Assign all 8 ability classes for that species
 *   - At runtime, KhaaosGameMode queries the registry by species enum
 *   - GrantAbilities() gives all abilities to the player's ASC
 *
 * Design: Data-driven, no hardcoded ability lists in game mode.
 */
UCLASS(BlueprintType, meta = (DisplayName = "Khaaos Species Ability Set"))
class UKhaaosSpeciesAbilitySet : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UKhaaosSpeciesAbilitySet();

    /** Which species this ability set belongs to. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    EKhaaosSpecies Species = EKhaaosSpecies::None;

    /** Species gameplay tag (redundant with enum, but needed for GAS queries). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    FGameplayTag SpeciesTag;

    /** All active abilities for this species (8 abilities). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    TArray<FKhaaosSpeciesAbilityEntry> AbilityEntries;

    // ─── Grant / Remove ───────────────────────────────────────────────────

    /**
     * Grant all abilities in this set to the given ASC.
     * Returns array of granted spec handles.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|SpeciesAbilitySet")
    void GrantAbilities(UAbilitySystemComponent* ASC,
        TArray<FGameplayAbilitySpecHandle>& OutGrantedHandles,
        UObject* SourceObject = nullptr) const;

    /**
     * Remove all previously granted abilities.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|SpeciesAbilitySet")
    static void RemoveAbilities(UAbilitySystemComponent* ASC,
        TArray<FGameplayAbilitySpecHandle>& GrantedHandles);

    // ─── Queries ──────────────────────────────────────────────────────────

    /** Get the number of abilities in this set. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SpeciesAbilitySet")
    int32 GetAbilityCount() const { return AbilityEntries.Num(); }

    /** Check if this set is for a specific species. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SpeciesAbilitySet")
    bool IsForSpecies(EKhaaosSpecies InSpecies) const { return Species == InSpecies; }

    // ─── Primary Asset ────────────────────────────────────────────────────

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosSpeciesAbilitySet"),
            FName(UEnum::GetValueAsString(Species)));
    }
};
