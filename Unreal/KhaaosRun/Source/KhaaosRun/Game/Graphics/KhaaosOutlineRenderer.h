// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosOutlineRenderer
// PROPÓSITO: Renderiza outlines coloridos ao redor de personagens usando
//            CustomDepth stencil values. O KhaaosCharacterPopComponent já
//            escreve stencil values (espécie 1-6), mas não há PostProcess
//            material que os lê. Este subsistema cria e gerencia o setup
//            de outline via PostProcess, com cores por espécie.
//
//            Cores de outline por espécie:
//            Huran=ciano aquático | Khael=violeta arcano | Venex=magenta cyber
//            Onith=laranja térmico | Zheers=violeta espiritual | Skeetw=verde-pena
//
//            Guarda: IsVisualRuntime() — sem outline em dedicated server/headless.
//            Guarda: desabilitado em preset Mobile/Low (outline é caro).
//            Integração: estágio OUTLINE_SETUP do GraphicsPipelineManager.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosOutlineRenderer.generated.h"

class APostProcessVolume;
class UMaterialInterface;

// ─── Outline Style Enumeration ────────────────────────────────────────────────

/** Estilo de renderização de outline. */
UENUM(BlueprintType)
enum class EKhaaosOutlineStyle : uint8
{
    Solid   UMETA(DisplayName = "Solid"),
    Glow    UMETA(DisplayName = "Glow"),
    Dashed  UMETA(DisplayName = "Dashed (Futuro)")
};

// ─── Outline Configuration ────────────────────────────────────────────────────

/** Configuração completa do outline renderer. */
USTRUCT(BlueprintType)
struct FKhaaosOutlineConfig
{
    GENERATED_BODY()

    /** Espessura do outline em pixels (1-5). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "1.0", ClampMax = "5.0"))
    float OutlineThickness = 2.0f;

    /** Intensidade do outline (0-1). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float OutlineIntensity = 0.8f;

    /** Mapa de cor de outline por espécie. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TMap<EKhaaosSpecies, FLinearColor> SpeciesOutlineColors;

    /** Espalhamento de blur para estilo Glow (0-2). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float BlurSpread = 1.0f;

    /** Se o outline está habilitado. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnabled = true;

    /** Estilo de outline. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosOutlineStyle Style = EKhaaosOutlineStyle::Glow;
};

// ─── Outline Renderer Subsystem ────────────────────────────────────────────────

/**
 * UKhaaosOutlineRenderer — Renderer de outline por mundo via CustomDepth stencil.
 *
 * Configura o CustomDepth/Sencil pass (r.CustomDepth 3) e aplica um material
 * de pós-processamento que lê os stencil values escritos pelo
 * KhaaosCharacterPopComponent para renderizar outlines coloridos por espécie.
 *
 * Guarda: IsVisualRuntime() + desabilitado em Mobile/Low preset.
 * Integração: estágio OUTLINE_SETUP do GraphicsPipelineManager.
 */
UCLASS()
class KHAAOSRUN_API UKhaaosOutlineRenderer : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void OnWorldBeginPlay(UWorld& InWorld) override;
    virtual void Deinitialize() override;

    // ─── Outline Control ───────────────────────────────────────────────────

    /** Habilita ou desabilita a renderização de outlines. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|OutlineRenderer")
    void EnableOutlines(bool bEnable);

    /** Ajusta a espessura do outline em pixels (1-5). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|OutlineRenderer")
    void SetOutlineThickness(float Pixels);

    /** Define a cor de outline para uma espécie específica. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|OutlineRenderer")
    void SetSpeciesOutlineColor(EKhaaosSpecies Species, FLinearColor Color);

    /** Define o estilo de outline (Solid/Glow/Dashed). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|OutlineRenderer")
    void SetOutlineStyle(EKhaaosOutlineStyle Style);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o renderer ativo no mundo de jogo corrente (null-safe). */
    static UKhaaosOutlineRenderer* GetActiveForGame();

    /** Se outlines estão habilitados. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|OutlineRenderer")
    bool IsOutlinesEnabled() const { return OutlineConfig.bEnabled; }

    /** Config corrente. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|OutlineRenderer")
    FKhaaosOutlineConfig GetOutlineConfig() const { return OutlineConfig; }

private:
    /** Constrói as cores padrão de outline por espécie. */
    static TMap<EKhaaosSpecies, FLinearColor> BuildDefaultSpeciesColors();

    /** Configura as CVars de CustomDepth para stencil pass. */
    void ConfigureCustomDepthCVars();

    /** Aplica o material de outline no PostProcessVolume. */
    void ApplyOutlineMaterial();

    /** Guarda comuns: false em dedicated server / -NullRHI / editor preview. */
    static bool IsVisualRuntime(const UWorld& World);

    /** Verifica se o preset de qualidade suporta outlines (não Mobile/Low). */
    bool QualitySupportsOutlines() const;

    /** Configuração corrente do outline. */
    UPROPERTY(Transient)
    FKhaaosOutlineConfig OutlineConfig;

    /** PostProcessVolume do PostProcessDirector (não owns). */
    UPROPERTY(Transient)
    TObjectPtr<APostProcessVolume> ActiveVolume;

    /** Material de outline via CustomStencil (soft ref, carregado em runtime). */
    UPROPERTY(Transient)
    TObjectPtr<UMaterialInterface> OutlineMaterial;
};
