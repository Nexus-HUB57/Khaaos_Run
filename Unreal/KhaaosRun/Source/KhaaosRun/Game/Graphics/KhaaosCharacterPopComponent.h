// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// COMPONENTE: UKhaaosCharacterPopComponent
// PROPÓSITO: "Character Pop" estilo Free Fire — garante que cada operative
//            se destaque do cenário em qualquer distância:
//            1. Rim light por espécie (Fresnel via MID params RimLight*)
//            2. Custom depth stencil (silhueta disponível para outline PP)
//            3. Point light sutil no pawn local (ancoragem visual, 1 luz max)
//            4. Boost de rim via gameplay (SetRimBoost — hook para as 48 skills)
//
//            Cores de identidade por espécie:
//            Huran=ciano aquático | Khael=violeta arcano | Venex=magenta cyber
//            Onith=laranja térmico | Zheers=violeta espiritual | Skeetw=verde-pena
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosCharacterPopComponent.generated.h"

class USkeletalMeshComponent;
class UPointLightComponent;

UCLASS(ClassGroup = (Khaaos, Graphics), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosCharacterPopComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosCharacterPopComponent();

    // ─── Initialization ─────────────────────────────────────────────────────

    /** Inicializa o pop: aplica rim light no material, custom depth e
     *  (se pawn local) point light de ancoragem. Chamar quando a espécie
     *  for conhecida (possess/replication).
     *  @param Species - Espécie do operative dono
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CharacterPop")
    void InitializePop(EKhaaosSpecies Species);

    /** Multiplicador de rim para gameplay (ultimate/healthbaixo/etc).
     *  @param Multiplier - 0 (desliga) a 3.0 (turbo). Default 1.0.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CharacterPop")
    void SetRimBoost(float Multiplier);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Cor + intensidade de rim por espécie (identidade visual do elenco). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|CharacterPop")
    static void GetSpeciesRimProfile(EKhaaosSpecies Species, FLinearColor& OutColor, float& OutIntensity);

    UFUNCTION(BlueprintPure, Category = "Khaaos|CharacterPop")
    bool IsPopActive() const { return bPopActive; }

    UFUNCTION(BlueprintPure, Category = "Khaaos|CharacterPop")
    EKhaaosSpecies GetPopSpecies() const { return Species; }

private:
    /** Aplica RimLight* nos MIDs do mesh (todos os slots). */
    void ApplyRimToMaterials();

    /** Cria a point light de ancoragem (apenas pawn local, preset > Low). */
    void SpawnRimLight();

    /** true se o preset de qualidade atual suporta os efeitos pesados. */
    bool QualityAllowsHeavyEffects() const;

    /** Espécie inicializada. */
    UPROPERTY(Transient)
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    /** Mesh cacheado na InitializePop. */
    UPROPERTY(Transient)
    TObjectPtr<USkeletalMeshComponent> CachedMesh;

    /** Point light de ancoragem (só pawn local — 1 por jogador). */
    UPROPERTY(Transient)
    TObjectPtr<UPointLightComponent> RimLight;

    /** Multiplicador de gameplay sobre o rim (0-3). */
    UPROPERTY(Transient)
    float RimBoostMultiplier = 1.0f;

    /** Intensidade base da espécie (cache da GetSpeciesRimProfile). */
    UPROPERTY(Transient)
    float BaseRimIntensity = 0.0f;

    /** Cor base da espécie (cache). */
    UPROPERTY(Transient)
    FLinearColor BaseRimColor = FLinearColor::White;

    /** Se o pop foi inicializado com sucesso. */
    UPROPERTY(Transient)
    bool bPopActive = false;
};
