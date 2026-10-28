// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "Game/Character/KhaaosSkinSystem.h"
#include "Game/AbilitySystem/KhaaosCombatPerkComponent.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "KhaaosOperativeActor.generated.h"

/**
 * AKhaaosOperativeActor — Base class for all Khaaos Run operative characters.
 * Each operative subclass sets species identity, reference codes, skeleton,
 * and species-specific traits in its constructor.
 *
 * Species traits:
 *   Huran  — HP regeneration (+5 HP/s)
 *   Khael  — Cryo resistance (70%)
 *   Venex  — Speed bonus (+20%)
 *   Onith  — Toxic resistance (+15%)
 *   Zheers — Radiation resistance (+10%)
 *   Skeetw — Fog stealth (visibility penalty in fog)
 */
UCLASS(Abstract, BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOperativeActor"))
class AKhaaosOperativeActor : public ACharacter
{
    GENERATED_BODY()

public:
    AKhaaosOperativeActor();

    // ─── Identity ─────────────────────────────────────────────────────────

    /** Short reference code (e.g. HUR-01, VEN-F02). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FString RefCode;

    /** Operational reference (e.g. OP_HUR_M_01, OP_VEN_F_02). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FString OperativeRef;

    /** Avatar reference (e.g. AVT_HUR_M_01, AVT_VEN_F_02). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FString AvatarRef;

    /** Species identifier (Huran, Khael, Venex, Onith, Zheers, Skeetw). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FName SpeciesID;

    /** Species enum for GAS trait application. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    EKhaaosSpecies SpeciesEnum = EKhaaosSpecies::NONE;

    /** Species type classification. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FName SpeciesType;

    /** Display name for this operative. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FText DisplayName;

    /** Gender: Male or Female. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FName Gender;

    /** Whether this is an Elite variant. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    bool bIsElite = false;

    /** Target skeleton asset name (SK_Manny or SK_Gwen). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Identity")
    FName Skeleton;

    // ─── Species Traits ──────────────────────────────────────────────────

    /** HP regeneration per second (Huran species trait). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Traits")
    float HPRegenPerSecond = 0.0f;

    /** Cryo damage resistance fraction 0-1 (Khael species trait). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Traits")
    float CryoResistance = 0.0f;

    /** Speed multiplier bonus (Venex species trait). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Traits")
    float SpeedBonus = 0.0f;

    /** Toxic damage resistance fraction 0-1 (Onith species trait). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Traits")
    float ToxicResistance = 0.0f;

    /** Radiation damage resistance fraction 0-1 (Zheers species trait). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Traits")
    float RadResistance = 0.0f;

    /** Whether this operative has fog stealth (Skeetw species trait). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Traits")
    bool bHasFogStealth = false;

    // ─── Base Stats ──────────────────────────────────────────────────────

    /** Base health for this operative variant. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Stats")
    int32 BaseHealth = 100;

    /** Base energy for this operative variant. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Stats")
    int32 BaseEnergy = 100;

    /** Base movement speed. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Operative|Stats")
    float BaseSpeed = 600.0f;

    // ─── GAS Component ────────────────────────────────────────────────────

    /** Species Gameplay Ability System component. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Operative|GAS")
    TObjectPtr<UKhaaosSpeciesGAS> SpeciesGAS;

    /** Modular cosmetic slots for authored headgear, armor and back equipment. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Operative|Cosmetics")
    TObjectPtr<UKhaaosSkinSystem> SkinSystem;

    /** Server-authoritative combat perk loadout; perks are authored as GameplayEffects. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Operative|Combat")
    TObjectPtr<UKhaaosCombatPerkComponent> CombatPerks;

    /** Server-authoritative item inventory and loot request endpoint. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Operative|Inventory")
    TObjectPtr<UKhaaosInventoryComponent> Inventory;

protected:
    virtual void BeginPlay() override;

    /** Apply species-specific traits via GAS. Called from BeginPlay after ASC init. */
    virtual void ApplySpeciesTraits() {}
};
