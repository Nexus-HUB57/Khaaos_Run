// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosMaterialVariantSystem
// PROPÓSITO: Sistema de variantes de material para acessórios cosméticos.
//            Gerencia trocas de material, criação de MIDs com parâmetros
//            overrides, blending entre variantes, e integração com economia KRC
//            via UKhaaosBankhaoosComponent.
//
//            Variantes pré-construídas por espécie:
//              Huran:  AquaticCamo, DeepSea, Bioluminescent
//              Khael:  CrystalAmber, RuneGlow, FrostForged
//              Venex:  ChromeFinish, NeonCircuit, StealthMatte
//              Onith:  ChitinPolish, ThermalCoating, CarapaceGold
//              Zheers: TribalInk, ShadowWeave, EarDecor
//              Skeetw: FeatherDye, Iridescent, WindMarking
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "Game/Economy/KhaaosBankhaoosComponent.h"
#include "KhaaosMaterialVariantSystem.generated.h"

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Tipo de variante de material */
UENUM(BlueprintType)
enum class EKhaaosMaterialVariantType : uint8
{
    Color     UMETA(DisplayName = "Color"),
    Pattern   UMETA(DisplayName = "Pattern"),
    Wear      UMETA(DisplayName = "Wear"),
    Faction   UMETA(DisplayName = "Faction"),
    Season    UMETA(DisplayName = "Season"),
    Custom    UMETA(DisplayName = "Custom")
};

// ─── Structs ────────────────────────────────────────────────────────────────

/** Definição de uma variante de material */
USTRUCT(BlueprintType)
struct FKhaaosMaterialVariant
{
    GENERATED_BODY()

    /** ID único da variante (ex: "MV_HUR_AquaticCamo") */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FName VariantID;

    /** Tipo da variante */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    EKhaaosMaterialVariantType VariantType = EKhaaosMaterialVariantType::Color;

    /** Nome de exibição */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FText DisplayName;

    /** Material base para esta variante */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TSoftObjectPtr<UMaterialInterface> BaseMaterial;

    /** Parâmetros escalares para override no MID */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TMap<FName, float> ScalarOverrides;

    /** Parâmetros de cor para override no MID */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TMap<FName, FLinearColor> ColorOverrides;

    /** Se true, requer reload completo do material (não apenas parâmetros) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    bool bRequiresReload = false;

    /** Preço em KRC para desbloquear esta variante */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    int32 PriceKRC = 0;

    /** Espécie que pode usar esta variante (NONE = todas) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    EKhaaosSpecies SpeciesRestriction = EKhaaosSpecies::NONE;
};

/** Variante ativa aplicada a um componente */
USTRUCT(BlueprintType)
struct FKhaaosActiveVariant
{
    GENERATED_BODY()

    /** Componente alvo (weak ref) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TWeakObjectPtr<UMeshComponent> TargetComponent;

    /** Definição da variante aplicada */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FKhaaosMaterialVariant Variant;

    /** Instância dinâmica do material criada */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TWeakObjectPtr<UMaterialInstanceDynamic> DynamicMaterialInstance;

    /** Material original (para restauração) */
    UPROPERTY()
    TSoftObjectPtr<UMaterialInterface> OriginalMaterial;
};

// ─── Delegates ──────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnVariantApplied, FName, VariantID, bool, bSuccess, int32, MaterialIndex);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnVariantPurchased, FName, VariantID, bool, bSuccess);

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * UKhaaosMaterialVariantSystem
 *
 * Gerencia variantes de material para acessórios cosméticos.
 * - Registro e aplicação de variantes com parâmetros overrides
 * - Criação de MaterialInstanceDynamic (MID) com scalar e color overrides
 * - Blending entre variantes via lerp de parâmetros
 * - Integração com economia KRC via UKhaaosBankhaoosComponent
 * - Variantes pré-construídas por espécie
 */
UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosMaterialVariantSystem : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosMaterialVariantSystem();

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void BeginPlay() override;

    // ─── Variant Registration ───────────────────────────────────────────────

    /** Registra uma variante de material. Retorna false se já existe. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialVariants")
    bool RegisterVariant(const FKhaaosMaterialVariant& Variant);

    /** Remove uma variante do registro */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialVariants")
    void UnregisterVariant(FName VariantID);

    // ─── Variant Application ────────────────────────────────────────────────

    /** Aplica variante a um mesh component, criando MID com parâmetros overrides */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialVariants")
    bool ApplyVariant(FName VariantID, UMeshComponent* TargetMesh, int32 MaterialIndex = 0);

    /** Remove variante ativa de um componente, restaurando material original */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialVariants")
    void RemoveVariant(UMeshComponent* TargetMesh);

    /** Blend entre duas variantes (transição suave via lerp de parâmetros) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialVariants")
    bool BlendVariants(FName VariantA_ID, FName VariantB_ID, UMeshComponent* TargetMesh, float BlendAlpha, int32 MaterialIndex = 0);

    // ─── Query ─────────────────────────────────────────────────────────────

    /** Retorna todas as variantes disponíveis */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialVariants")
    TArray<FKhaaosMaterialVariant> GetAvailableVariants() const;

    /** Retorna variantes para uma espécie específica */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialVariants")
    TArray<FKhaaosMaterialVariant> GetVariantsForSpecies(EKhaaosSpecies Species) const;

    /** Retorna variantes de um tipo específico */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialVariants")
    TArray<FKhaaosMaterialVariant> GetVariantsByType(EKhaaosMaterialVariantType Type) const;

    // ─── Economy Integration ────────────────────────────────────────────────

    /** Compra variante via KRC — debita do Bankhaoos e registra ownership */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialVariants")
    bool PurchaseVariant(FName VariantID);

    /** Verifica se variante já foi comprada */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialVariants")
    bool IsVariantOwned(FName VariantID) const;

    // ─── Delegates ─────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|MaterialVariants")
    FOnVariantApplied OnVariantApplied;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|MaterialVariants")
    FOnVariantPurchased OnVariantPurchased;

private:
    /** Registro de variantes (VariantID → definição) */
    UPROPERTY()
    TMap<FName, FKhaaosMaterialVariant> VariantRegistry;

    /** Variantes ativas (componente → variante aplicada) */
    UPROPERTY()
    TArray<FKhaaosActiveVariant> ActiveVariants;

    /** Variantes compradas pelo jogador */
    UPROPERTY()
    TSet<FName> OwnedVariants;

    /** Referência ao Bankhaoos (cache) */
    UPROPERTY()
    TObjectPtr<UKhaaosBankhaoosComponent> CachedBankhaoos;

    // ─── Internal ──────────────────────────────────────────────────────────

    /** Registra variantes pré-construídas para cada espécie */
    void RegisterSpeciesVariants();

    /** Resolve o BankhaoosComponent do owner */
    UKhaaosBankhaoosComponent* ResolveBankhaoos();
};
