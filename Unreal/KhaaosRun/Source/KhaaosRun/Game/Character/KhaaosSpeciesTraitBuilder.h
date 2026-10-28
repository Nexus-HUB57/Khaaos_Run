// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Componente: UKhaaosSpeciesTraitBuilder
// Propósito: Constrói e aplica traits GAS a partir da definição de espécie.
//            Pré-constrói definições para todas as 6 espécies com stats,
//            passivos, resistências e bônus. Integra com UKhaaosSpeciesGAS.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayTagContainer.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosSpeciesTraitBuilder.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosSpeciesGAS;
class UGameplayEffect;
class UAbilitySystemComponent;

// ─── Structs ──────────────────────────────────────────────────────────────────

/**
 * FKhaaosSpeciesTraitDef
 * Definição completa de traits para uma espécie, incluindo:
 *   - Stats base (HP, Energy, Speed, Shield)
 *   - Passive tags (habilidades passivas)
 *   - Resistance tags (resistências elementais)
 *   - Bonus tags (modificadores positivos)
 *
 * Valores pré-definidos:
 *   Huran:  HP=120, Energy=100, Speed=580, Shield=0
 *   Khael:  HP=100, Energy=120, Speed=550, Shield=20
 *   Venex:  HP=90,  Energy=110, Speed=680, Shield=15
 *   Onith:  HP=150, Energy=80,  Speed=500, Shield=30
 *   Zheers: HP=100, Energy=100, Speed=600, Shield=10
 *   Skeetw: HP=85,  Energy=100, Speed=720, Shield=5
 */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesTraitDef
{
    GENERATED_BODY()

    /** Espécie que esta definição representa */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Species")
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    // ─── Base Stats ──────────────────────────────────────────────────────

    /** Saúde base */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Stats", meta = (ClampMin = "1.0"))
    float BaseHealth = 100.0f;

    /** Energia base (mana/stamina) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Stats", meta = (ClampMin = "0.0"))
    float BaseEnergy = 100.0f;

    /** Velocidade base de movimento (cm/s) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Stats", meta = (ClampMin = "100.0"))
    float BaseSpeed = 600.0f;

    /** Escudo base */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Stats", meta = (ClampMin = "0.0"))
    float BaseShield = 0.0f;

    // ─── Gameplay Tags ───────────────────────────────────────────────────

    /** Tags de habilidades passivas (WaterBreathing, CrystalArmor, etc.) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Tags")
    FGameplayTagContainer PassiveTags;

    /** Tags de resistências elementais (CryoResist, ToxicResist, etc.) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Tags")
    FGameplayTagContainer ResistanceTags;

    /** Tags de bônus/modificadores (SpeedBoost, ManaRegen, etc.) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Trait|Tags")
    FGameplayTagContainer BonusTags;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast quando traits são aplicados ao GAS */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSpeciesTraitsBuilt, EKhaaosSpecies, Species, int32, AppliedCount);

/** Broadcast quando traits são removidos */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSpeciesTraitsCleared, EKhaaosSpecies, Species);

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * UKhaaosSpeciesTraitBuilder
 *
 * Componente que constrói e aplica traits GAS a partir de definição de espécie.
 * Fluxo:
 *   1. BuildTraitDefinition() — cria FKhaaosSpeciesTraitDef com todos os valores
 *   2. ApplyTraitsToGAS() — aplica definição ao UKhaaosSpeciesGAS do owner
 *   3. ApplyPassiveAbilities() — concede habilidades passivas baseadas em tags
 *   4. RemoveAllTraits() — remoção limpa de todos os traits aplicados
 *
 * Integração GAS:
 *   - Usa ApplyGameplayEffectToSelf para efeitos de stat
 *   - Usa GiveAbility para passivos
 *   - Usa RemoveAbility para cleanup
 */
UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosSpeciesTraitBuilder : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosSpeciesTraitBuilder();

    // ─── Trait Building ──────────────────────────────────────────────────

    /**
     * Constrói a definição de traits para uma espécie.
     * Inclui stats base, passive tags, resistance tags e bonus tags.
     * @param Species  Espécie alvo
     * @return Definição completa de traits
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Trait|Builder")
    FKhaaosSpeciesTraitDef BuildTraitDefinition(EKhaaosSpecies Species) const;

    /**
     * Aplica uma definição de traits ao UKhaaosSpeciesGAS do owner.
     * Aplica GameplayEffects para stats e concede passive abilities.
     * @param TraitDef  Definição de traits a aplicar
     * @return Número de efeitos aplicados
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Trait|Builder")
    int32 ApplyTraitsToGAS(const FKhaaosSpeciesTraitDef& TraitDef);

    /**
     * Concede habilidades passivas baseadas nas tags da definição.
     * Mapeia PassiveTags -> TSubclassOf<UGameplayAbility> e concede ao ASC.
     * @param TraitDef  Definição com passive tags
     * @return Número de abilities concedidas
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Trait|Builder")
    int32 ApplyPassiveAbilities(const FKhaaosSpeciesTraitDef& TraitDef);

    /**
     * Remove todos os traits aplicados: GameplayEffects e passive abilities.
     * Chamado em morte, troca de espécie ou cleanup.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Trait|Builder")
    void RemoveAllTraits();

    /**
     * Query: retorna a definição de traits para uma espécie sem aplicar.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Trait|Builder")
    FKhaaosSpeciesTraitDef GetTraitDefForSpecies(EKhaaosSpecies Species) const;

    // ─── Delegates ───────────────────────────────────────────────────────

    /** Disparado quando traits são construídos e aplicados */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Trait|Builder")
    FOnSpeciesTraitsBuilt OnSpeciesTraitsBuilt;

    /** Disparado quando traits são removidos */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Trait|Builder")
    FOnSpeciesTraitsCleared OnSpeciesTraitsCleared;

    // ─── Configuration ───────────────────────────────────────────────────

    /** GameplayEffect para modificar Health base */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Trait|Builder|Effects")
    TSubclassOf<UGameplayEffect> GE_BaseHealth;

    /** GameplayEffect para modificar Energy base */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Trait|Builder|Effects")
    TSubclassOf<UGameplayEffect> GE_BaseEnergy;

    /** GameplayEffect para modificar Speed base */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Trait|Builder|Effects")
    TSubclassOf<UGameplayEffect> GE_BaseSpeed;

    /** GameplayEffect para modificar Shield base */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Trait|Builder|Effects")
    TSubclassOf<UGameplayEffect> GE_BaseShield;

protected:

    virtual void BeginPlay() override;

private:

    // ─── Internal State ───────────────────────────────────────────────────

    /** Definição atualmente aplicada */
    UPROPERTY()
    FKhaaosSpeciesTraitDef CurrentTraitDef;

    /** Traits estão ativos? */
    UPROPERTY()
    bool bTraitsApplied = false;

    /** Handles de GameplayEffects ativos (para remoção) */
    TArray<FActiveGameplayEffectHandle> ActiveTraitEffectHandles;

    /** Spec handles de passive abilities concedidas (para remoção) */
    TArray<FGameplayAbilitySpecHandle> PassiveAbilityHandles;

    // ─── Species-Specific Builders ────────────────────────────────────────

    /** Constrói trait def para Huran (HP=120, Energy=100, Speed=580, Shield=0) */
    FKhaaosSpeciesTraitDef BuildHuranTraits() const;

    /** Constrói trait def para Khael (HP=100, Energy=120, Speed=550, Shield=20) */
    FKhaaosSpeciesTraitDef BuildKhaelTraits() const;

    /** Constrói trait def para Venex (HP=90, Energy=110, Speed=680, Shield=15) */
    FKhaaosSpeciesTraitDef BuildVenexTraits() const;

    /** Constrói trait def para Onith (HP=150, Energy=80, Speed=500, Shield=30) */
    FKhaaosSpeciesTraitDef BuildOnithTraits() const;

    /** Constrói trait def para Zheers (HP=100, Energy=100, Speed=600, Shield=10) */
    FKhaaosSpeciesTraitDef BuildZheersTraits() const;

    /** Constrói trait def para Skeetw (HP=85, Energy=100, Speed=720, Shield=5) */
    FKhaaosSpeciesTraitDef BuildSkeetwTraits() const;

    // ─── GAS Helpers ─────────────────────────────────────────────────────

    /** Obtém o UKhaaosSpeciesGAS do owner */
    UKhaaosSpeciesGAS* GetOwnerSpeciesGAS() const;

    /** Obtém o ASC do owner */
    UAbilitySystemComponent* GetOwnerASC() const;

    /** Aplica um GameplayEffect de stat ao ASC. Retorna handle inválido se falhou. */
    FActiveGameplayEffectHandle ApplyStatEffect(TSubclassOf<UGameplayEffect> EffectClass, float Magnitude);
};
