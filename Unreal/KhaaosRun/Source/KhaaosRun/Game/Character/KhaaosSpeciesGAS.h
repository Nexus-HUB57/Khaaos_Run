// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "AbilitySystemComponent.h"
#include "GameplayEffect.h"
#include "GameplayAbilitySpec.h"
#include "GameplayTagContainer.h"
#include "KhaaosSpeciesGAS.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UAttributeSet;
class UDataTable;

// ─── Enums ────────────────────────────────────────────────────────────────────

/** All known Khaaos species identifiers. */
UENUM(BlueprintType)
enum class EKhaaosSpecies : uint8
{
	HURAN   UMETA(DisplayName = "Huran"),
	KHAEL   UMETA(DisplayName = "Khael"),
	VENEX   UMETA(DisplayName = "Venex"),
	ONITH   UMETA(DisplayName = "Onith"),
	ZHEERS  UMETA(DisplayName = "Zheers"),
	SKEETW  UMETA(DisplayName = "Skeetw"),
	NONE    UMETA(DisplayName = "None")
};

// ─── Structs ──────────────────────────────────────────────────────────────────

/** Attribute initialization row from data table. */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesAttributeRow
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|Attributes")
	float Health = 100.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|Attributes")
	float MaxHealth = 100.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|Attributes")
	float Energy = 100.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|Attributes")
	float MaxEnergy = 100.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|Attributes")
	float Speed = 600.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|Attributes")
	float Shield = 0.0f;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when species traits are applied. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSpeciesTraitsApplied, EKhaaosSpecies, Species, int32, EffectCount);

/** Broadcast when species traits are removed. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSpeciesTraitsRemoved, EKhaaosSpecies, Species);

/**
 * UKhaaosSpeciesGAS
 *
 * Gameplay Ability System integration for species-specific trait effects.
 * Each operative receives this component which manages:
 *   - UAbilitySystemComponent for ability activation
 *   - UAttributeSet for Health/MaxHealth/Energy/MaxEnergy/Speed/Shield
 *   - GameplayEffects per species trait:
 *       HURAN:  GE_HuranRegen (+5 HP/s), GE_HuranWaterResist (50% ring dmg in water), GE_HuranSwimBonus (+20% swim speed)
 *       KHAEL:  GE_KhaelCryoResist (70% cryo damage reduction)
 *       VENEX:  GE_VenexSpeedBonus (+20% movement speed)
 *       ONITH:  GE_OnithToxicResist (+15% toxic damage reduction)
 *       ZHEERS: GE_ZheersRadResist (+10% radiation damage reduction)
 *       SKEETW: GE_SkeetwFogStealth (stealth activation in fog zones)
 *   - ApplySpeciesTraits / RemoveSpeciesTraits for lifecycle
 *   - InitializeAttributes from data tables
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosSpeciesGAS : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosSpeciesGAS();

	// ─── GAS Core ──────────────────────────────────────────────────────────

	/** Get the ability system component. */
	UAbilitySystemComponent* GetAbilitySystemComponent() const { return AbilitySystemComponent; }

	// ─── Species Trait Application ─────────────────────────────────────────

	/**
	 * Apply species-specific GameplayEffects based on SpeciesID.
	 * Clears any previously applied traits first.
	 * Returns the number of effects applied.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|GAS")
	int32 ApplySpeciesTraits(EKhaaosSpecies SpeciesID);

	/**
	 * Remove all currently active species trait GameplayEffects.
	 * Called on death, species change, or cleanup.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|GAS")
	void RemoveSpeciesTraits();

	/** Get the currently applied species. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|GAS")
	EKhaaosSpecies GetAppliedSpecies() const { return AppliedSpecies; }

	/** Check if species traits are currently active. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|GAS")
	bool AreTraitsActive() const { return bTraitsActive; }

	// ─── Attribute Initialization ──────────────────────────────────────────

	/**
	 * Initialize base attributes from the species data table.
	 * Falls back to schema defaults if no row is found.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|GAS")
	void InitializeAttributes();

	/** Override: initialize attributes from a specific data table. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|GAS")
	void InitializeAttributesFromTable(UDataTable* InAttributeTable);

	// ─── GameplayEffect Accessors ──────────────────────────────────────────

	/** Get the GameplayEffect class for a given species trait name. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|GAS")
	TSubclassOf<UGameplayEffect> GetSpeciesEffectClass(const FName& EffectName) const;

	// ─── Proteção Ambiental (ex.: chuva ácida de Barburhen — Fase 1) ──────

	/**
	 * Concede/remove a proteção contra a chuva ácida de Barburhen via GAS:
	 * aplica um GameplayEffect que concede a tag World.Barburhen.AcidProtection
	 * (UKhaaosGameplayEffects::CreateTagGrantEffect). O equipamento (colete/
	 * máscara anti-ácido) chama com bEnabled=true ao equipar e false ao remover.
	 * DurationSeconds <= 0 → proteção INFINITA até remoção explícita.
	 * Retorna true se o estado da proteção mudou.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|GAS")
	bool SetAcidProtection(bool bEnabled, float DurationSeconds = 0.0f);

	/** A proteção anti-ácido está ativa na ASC? (consulta da tag concedida) */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|GAS")
	bool HasAcidProtection() const;

	// ─── Delegates ─────────────────────────────────────────────────────────

	/** Broadcast when species traits are applied. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Species|GAS")
	FOnSpeciesTraitsApplied OnSpeciesTraitsApplied;

	/** Broadcast when species traits are removed. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Species|GAS")
	FOnSpeciesTraitsRemoved OnSpeciesTraitsRemoved;

	// ─── Configuration ─────────────────────────────────────────────────────

	/** Data table for species attribute initialization. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS")
	TSoftObjectPtr<UDataTable> SpeciesAttributeTable;

protected:

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	// ─── GAS Components ────────────────────────────────────────────────────

	/** Core ability system component. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|GAS")
	TObjectPtr<UAbilitySystemComponent> AbilitySystemComponent;

	/** Attribute set for Health/MaxHealth/Energy/MaxEnergy/Speed/Shield. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|GAS")
	TObjectPtr<UAttributeSet> AttributeSet;

	// ─── Species GameplayEffect References ─────────────────────────────────

	// HURAN effects
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Huran")
	TSubclassOf<UGameplayEffect> GE_HuranRegen;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Huran")
	TSubclassOf<UGameplayEffect> GE_HuranWaterResist;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Huran")
	TSubclassOf<UGameplayEffect> GE_HuranSwimBonus;

	// KHAEL effects
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Khael")
	TSubclassOf<UGameplayEffect> GE_KhaelCryoResist;

	// VENEX effects
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Venex")
	TSubclassOf<UGameplayEffect> GE_VenexSpeedBonus;

	// ONITH effects
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Onith")
	TSubclassOf<UGameplayEffect> GE_OnithToxicResist;

	// ZHEERS effects
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Zheers")
	TSubclassOf<UGameplayEffect> GE_ZheersRadResist;

	// SKEETW effects
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Species|GAS|Skeetw")
	TSubclassOf<UGameplayEffect> GE_SkeetwFogStealth;

	// ─── Internal State ────────────────────────────────────────────────────

	/** Currently applied species. */
	UPROPERTY()
	EKhaaosSpecies AppliedSpecies = EKhaaosSpecies::NONE;

	/** Whether traits are currently active. */
	UPROPERTY()
	bool bTraitsActive = false;

	/** Active GameplayEffect handles from current species (for removal). */
	UPROPERTY()
	TArray<FActiveGameplayEffectHandle> ActiveEffectHandles;

	/** Handle da proteção anti-ácido (colete/máscara — ciclo próprio de vida). */
	UPROPERTY()
	FActiveGameplayEffectHandle AcidProtectionHandle;

private:

	/** Apply a single GameplayEffect and track its handle. Returns true on success. */
	bool ApplyEffect(TSubclassOf<UGameplayEffect> EffectClass, float Level = 1.0f);

	/** Apply all HURAN-specific effects. Returns count. */
	int32 ApplyHuranTraits();

	/** Apply all KHAEL-specific effects. Returns count. */
	int32 ApplyKhaelTraits();

	/** Apply all VENEX-specific effects. Returns count. */
	int32 ApplyVenexTraits();

	/** Apply all ONITH-specific effects. Returns count. */
	int32 ApplyOnithTraits();

	/** Apply all ZHEERS-specific effects. Returns count. */
	int32 ApplyZheersTraits();

	/** Apply all SKEETW-specific effects. Returns count. */
	int32 ApplySkeetwTraits();

	/** Set default attribute values from code (fallback when no data table). */
	void SetDefaultAttributes();
};
