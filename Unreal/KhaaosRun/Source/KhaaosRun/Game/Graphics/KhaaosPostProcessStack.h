// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosPostProcessStack
// PROPÓSITO: Stack completo de pós-processamento com LUT-based color grading,
//            auto-exposure/eye adaptation, SSAO/GTAO runtime, screen-space
//            reflections, lens effects (flare + dirt), e custom post-process
//            material stack. Substitui a abordagem de console commands por
//            configuração direta de PostProcessVolume com blending suave.
//            Free Fire reference: color grading vibrante, bloom forte, CA sutil,
//            vignette dramático, exposure adaptativa por zona do mapa.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosPostProcessStack.generated.h"

// ─── Color Grading LUT Preset ─────────────────────────────────────────────────

/** LUT (Look-Up Table) de color grading por ambiente/espécie. */
UENUM(BlueprintType)
enum class EKhaaosColorGradingLUT : uint8
{
    NONE,               // Sem LUT — cor linear
    NEUTRAL,            // LUT neutro (só contrast/saturation)
    WARM_GOLDEN_HOUR,   // Horário dourado — tons quentes (Free Fire sunset)
    COOL_OVERCAST,      // Nublado frio — tons azulados
    DESERT_ARID,        // Deserto árido — saturação reduzida, tons terrosos
    JUNGLE_LUSH,        // Selva exuberante — saturação alta, verdes profundos
    ARCTIC_FROST,       // Ártico — azul frio, contraste alto
    VOLCANIC_INFERNO,   // Vulcânico — vermelho/laranja intenso, sombras quentes
    CYBER_NEON,         // Cyberpunk — saturação extrema, neon glow (Venex)
    ARCANE_CRYSTAL,     // Arcano — roxo profundo, brilho místico (Khael)
    THERMAL_PREDATOR,   // Térmico — visão predatória (Onith)
    SPIRIT_SHADOW,      // Espiritual — sombras profundas, glow etéreo (Zheers)
    AQUATIC_DEEP        // Aquático — azul profundo, caustics (Huran)
};

// ─── Auto-Exposure Mode ───────────────────────────────────────────────────────

/** Modo de auto-exposição para eye adaptation. */
UENUM(BlueprintType)
enum class EKhaaosExposureMode : uint8
{
    MANUAL,             // Exposure fixo — sem adaptação
    HISTOGRAM,          // UE5 histogram-based (padrão)
    AVERAGE_LUMINANCE,  // Baseado em luminância média
    SPECIES_ADAPTIVE    // Adapta exposure por espécie ativa (custom)
};

// ─── Post-Process Stack Config ────────────────────────────────────────────────

/** Configuração completa do stack de pós-processamento. */
USTRUCT(BlueprintType)
struct FKhaaosPostProcessStackConfig
{
    GENERATED_BODY()

    // ── Bloom ──────────────────────────────────────────────────────────────
    /** Intensidade do bloom (0.0 - 5.0). Free Fire usa bloom forte (~1.5-2.0). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "5.0"))
    float BloomIntensity = 1.0f;

    /** Threshold de bloom — pixels acima deste valor geram bloom. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float BloomThreshold = 0.8f;

    /** Raio do bloom em pixels. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.1", ClampMax = "64.0"))
    float BloomRadius = 4.0f;

    // ── Chromatic Aberration ───────────────────────────────────────────────
    /** Intensidade de aberração cromática. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "0.05"))
    float ChromaticAberrationIntensity = 0.002f;

    /** Aberração cromática por espécie (override). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "0.05"))
    float SpeciesCAOverride = -1.0f; // -1 = usar valor global

    // ── Depth of Field ─────────────────────────────────────────────────────
    /** Qualidade de DoF (0=Off, 1=Low, 2=Medium, 3=High, 4=Cinematic). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0", ClampMax = "4"))
    int32 DepthOfFieldQuality = 0;

    /** Distância focal do DoF em cm (0 = desativado). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0"))
    float DepthOfFieldFocalDistance = 0.0f;

    // ── Vignette ───────────────────────────────────────────────────────────
    /** Intensidade de vignette. Free Fire usa vignette forte (~0.4). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float VignetteIntensity = 0.3f;

    // ── Color Grading ──────────────────────────────────────────────────────
    /** LUT de color grading ativo. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosColorGradingLUT ActiveLUT = EKhaaosColorGradingLUT::NEUTRAL;

    /** Saturação global (0.0 = grayscale, 1.0 = normal, 2.0 = oversaturado). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float GlobalSaturation = 1.0f;

    /** Contraste global (0.5 = flat, 1.0 = normal, 2.0 = high contrast). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.5", ClampMax = "2.0"))
    float GlobalContrast = 1.05f;

    /** Gamma/CR (mid-tone adjustment). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.5", ClampMax = "2.0"))
    float GlobalGamma = 1.0f;

    /** Tint de destaque (highlight color shift). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor HighlightTint = FLinearColor(1.0f, 0.95f, 0.9f, 1.0f);

    /** Tint de sombra (shadow color shift). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor ShadowTint = FLinearColor(0.9f, 0.92f, 1.0f, 1.0f);

    // ── Auto-Exposure ──────────────────────────────────────────────────────
    /** Modo de auto-exposição. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosExposureMode ExposureMode = EKhaaosExposureMode::HISTOGRAM;

    /** Exposure mínimo (limitar escuro). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.01", ClampMax = "5.0"))
    float MinExposure = 0.5f;

    /** Exposure máximo (limitar claro). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.5", ClampMax = "20.0"))
    float MaxExposure = 5.0f;

    /** Exposure compensation (-5 a +5). Free Fire: ~0.5 a 1.5. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "-5.0", ClampMax = "5.0"))
    float ExposureCompensation = 0.5f;

    /** Velocidade de adaptação ao sair de área escura (segundos). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.01", ClampMax = "10.0"))
    float EyeAdaptationSpeedUp = 2.0f;

    /** Velocidade de adaptação ao entrar em área escura (segundos). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.01", ClampMax = "10.0"))
    float EyeAdaptationSpeedDown = 1.0f;

    // ── Ambient Occlusion ──────────────────────────────────────────────────
    /** Intensidade de SSAO/GTAO (0.0 = Off). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float AOIntensity = 0.5f;

    /** Raio de AO em world units. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "500.0"))
    float AORadius = 50.0f;

    // ── Screen-Space Reflections ───────────────────────────────────────────
    /** Qualidade de SSR (0=Off, 1=Low, 2=Medium, 3=High). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0", ClampMax = "3"))
    int32 SSRQuality = 1;

    /** Intensidade de SSR (0.0 - 1.0). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float SSRIntensity = 0.5f;

    // ── Lens Effects ──────────────────────────────────────────────────────
    /** Intensidade de lens flare (0.0 - 1.0). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float LensFlareIntensity = 0.3f;

    /** Intensidade de lens dirt (0.0 - 1.0). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float LensDirtIntensity = 0.2f;

    // ── Motion Blur ────────────────────────────────────────────────────────
    /** Quantidade de motion blur per-pixel (0.0 - 1.0). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float MotionBlurAmount = 0.0f;

    /** Target FPS para motion blur (ângulo por frame). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "15", ClampMax = "120"))
    int32 MotionBlurTargetFPS = 60;

    // ── GPU Budget ─────────────────────────────────────────────────────────
    /** Custo total estimado do stack em ms de GPU time. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float EstimatedGPUTimeMs = 4.0f;
};

// ─── Delegate Declarations ────────────────────────────────────────────────────

/** Broadcast quando o stack de PP muda (por espécie ou ambiente). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPostProcessStackChanged, EKhaaosColorGradingLUT, NewLUT, float, BloomIntensity);

// ─── Post-Process Stack Subsystem ─────────────────────────────────────────────

/**
 * UKhaaosPostProcessStack — Stack completo de pós-processamento.
 *
 * Configura PostProcessVolume com blending suave para todos os efeitos
 * visuais, incluindo:
 * - LUT-based color grading (13 LUTs: 7 ambiente + 6 espécie)
 * - Multi-pass bloom com threshold e raio configuráveis
 * - Auto-exposure / eye adaptation com limits por ambiente
 * - SSAO/GTAO com raio e intensidade runtime
 * - Screen-space reflections (para Venex chrome, puddles)
 * - Lens effects (flare + dirt)
 * - Chromatic aberration por espécie
 * - Vignette dramático (Free Fire signature)
 * - Motion blur com per-object quality
 * - Custom post-process material stack
 *
 * Substitui a abordagem de console commands do PostProcessManager por
 * configuração direta de PostProcessVolume para maior controle e blending.
 */
UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosPostProcessStack : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize(FSubsystemCollectionBase& Collection) override;

    // ─── Stack Configuration ────────────────────────────────────────────────

    /** Aplica o stack de PP completo ao PostProcessVolume ativo. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void ApplyStack(const FKhaaosPostProcessStackConfig& Config, float BlendTime = 0.5f);

    /** Obtém a config ativa atual. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PostProcessStack")
    const FKhaaosPostProcessStackConfig& GetActiveConfig() const { return ActiveConfig; }

    // ─── Species-Specific Stacks ────────────────────────────────────────────

    /** Constrói stack de PP para uma espécie específica.
     *  Cada espécie tem bloom, CA, LUT, vignette e exposure customizados.
     */
    FKhaaosPostProcessStackConfig BuildSpeciesStack(EKhaaosSpecies Species) const;

    /** Constrói stack de PP para um ambiente específico. */
    FKhaaosPostProcessStackConfig BuildEnvironmentStack(EKhaaosColorGradingLUT EnvironmentLUT) const;

    /** Mes.cla stack de espécie com stack de ambiente (blending ponderado). */
    FKhaaosPostProcessStackConfig MergeStacks(
        const FKhaaosPostProcessStackConfig& EnvironmentStack,
        const FKhaaosPostProcessStackConfig& SpeciesStack,
        float SpeciesWeight = 0.3f) const;

    // ─── Quality-Based Stack ─────────────────────────────────────────────────

    /** Ajusta intensidade do stack baseado no preset de qualidade (0=Low, 4=PhD). */
    FKhaaosPostProcessStackConfig ScaleStackForQuality(
        const FKhaaosPostProcessStackConfig& BaseConfig,
        int32 QualityLevel) const;

    // ─── Runtime Updates ────────────────────────────────────────────────────

    /** Atualiza bloom em runtime (para kill cam, streaks). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void SetBloomIntensity(float Intensity, float BlendTime = 0.3f);

    /** Atualiza vignette em runtime (para zone warning, damage). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void SetVignetteIntensity(float Intensity, float BlendTime = 0.2f);

    /** Atualiza exposure compensation em runtime. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void SetExposureCompensation(float Compensation, float BlendTime = 0.5f);

    /** Atualiza LUT em runtime com blending suave. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void SetColorGradingLUT(EKhaaosColorGradingLUT NewLUT, float BlendTime = 1.0f);

    // ─── Custom Material Stack ──────────────────────────────────────────────

    /** Adiciona um material customizado ao stack de PP (render after built-in). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void AddCustomPostProcessMaterial(class UMaterialInterface* Material, float Intensity = 1.0f, int32 InsertPosition = -1);

    /** Remove um material customizado do stack. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void RemoveCustomPostProcessMaterial(class UMaterialInterface* Material);

    // ─── GPU Budget ─────────────────────────────────────────────────────────

    /** Estima o custo de GPU do stack ativo em ms. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PostProcessStack")
    float EstimateGPUTimeMs() const;

    /** Otimiza o stack para ficar dentro do budget (corta efeitos de baixa prioridade). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void OptimizeForBudget(float TargetGPUTimeMs);

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast quando o stack muda significativamente. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|PostProcessStack")
    FOnPostProcessStackChanged OnStackChanged;

    // ─── Debug ──────────────────────────────────────────────────────────────

    /** Dump do stack ativo para console. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessStack")
    void DumpStack() const;

protected:

    /** Aplica config ao PostProcessVolume do viewport. */
    void ApplyToPostProcessVolume(const FKhaaosPostProcessStackConfig& Config);

    /** Constrói stacks pré-calculados para todas as espécies e ambientes. */
    void BuildCachedStacks();

private:

    /** Config ativa do stack. */
    UPROPERTY(Transient)
    FKhaaosPostProcessStackConfig ActiveConfig;

    /** Stacks pré-calculados por espécie. */
    TMap<EKhaaosSpecies, FKhaaosPostProcessStackConfig> SpeciesStacks;

    /** Stacks pré-calculados por ambiente. */
    TMap<EKhaaosColorGradingLUT, FKhaaosPostProcessStackConfig> EnvironmentStacks;

    /** Materiais customizados de PP com intensidade. */
    TMap<class UMaterialInterface*, float> CustomPPMaterials;
};
