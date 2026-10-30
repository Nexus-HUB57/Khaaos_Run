// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosPostProcessStack
// Stack completo de pós-processamento com LUT grading, auto-exposure, SSAO,
// SSR, lens effects, e custom material stack — substitui console commands.
// DATA: 2026-10-28
// ==============================================================================

#include "KhaaosPostProcessStack.h"
#include "KhaaosRun.h"
#include "Engine/Engine.h"
#include "Components/PostProcessVolume.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosPostProcessStack::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Construir stacks pré-calculados para todas as espécies e ambientes
    BuildCachedStacks();

    // Aplicar stack padrão (Neutral LUT, bloom moderado)
    ActiveConfig = BuildEnvironmentStack(EKhaaosColorGradingLUT::NEUTRAL);

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessStack] Subsystem inicializado. 6 stacks de espécie + 13 stacks de ambiente pré-calculados."));
}

void UKhaaosPostProcessStack::Deinitialize(FSubsystemCollectionBase& Collection)
{
    SpeciesStacks.Empty();
    EnvironmentStacks.Empty();
    CustomPPMaterials.Empty();

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessStack] Subsystem desinicializado."));
    Super::Deinitialize(Collection);
}

// ─── Stack Configuration ──────────────────────────────────────────────────────

void UKhaaosPostProcessStack::ApplyStack(const FKhaaosPostProcessStackConfig& Config, float BlendTime)
{
    ActiveConfig = Config;
    ApplyToPostProcessVolume(Config);

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessStack] Stack aplicado — LUT=%s Bloom=%.2f Vignette=%.2f Exposure=%.2f Blend=%.2fs"),
        *UEnum::GetDisplayValueAsText(Config.ActiveLUT).ToString(),
        Config.BloomIntensity, Config.VignetteIntensity,
        Config.ExposureCompensation, BlendTime);

    OnStackChanged.Broadcast(Config.ActiveLUT, Config.BloomIntensity);
}

// ─── Species-Specific Stacks ──────────────────────────────────────────────────

FKhaaosPostProcessStackConfig UKhaaosPostProcessStack::BuildSpeciesStack(EKhaaosSpecies Species) const
{
    FKhaaosPostProcessStackConfig Config;

    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
        // Huran: aquático — bloom forte (bioluminescência), CA sutil, LUT aquático
        Config.BloomIntensity = 1.8f;
        Config.BloomThreshold = 0.6f;
        Config.BloomRadius = 6.0f;
        Config.ChromaticAberrationIntensity = 0.001f;
        Config.SpeciesCAOverride = 0.002f;  // Aberração subaquática
        Config.VignetteIntensity = 0.35f;
        Config.ActiveLUT = EKhaaosColorGradingLUT::AQUATIC_DEEP;
        Config.GlobalSaturation = 1.05f;
        Config.GlobalContrast = 1.0f;
        Config.HighlightTint = FLinearColor(0.85f, 0.92f, 1.0f, 1.0f); // Azul subaquático
        Config.ShadowTint = FLinearColor(0.1f, 0.2f, 0.4f, 1.0f);      // Sombra oceânica
        Config.ExposureCompensation = 0.3f;
        Config.MinExposure = 0.3f;
        Config.MaxExposure = 4.0f;
        Config.AOIntensity = 0.6f;
        Config.SSRQuality = 2;   // Reflexos na água
        Config.SSRIntensity = 0.7f;
        Config.LensFlareIntensity = 0.2f;
        Config.LensDirtIntensity = 0.15f;
        Config.DepthOfFieldQuality = 2;
        Config.EstimatedGPUTimeMs = 5.5f;
        break;

    case EKhaaosSpecies::KHAEL:
        // Khael: arcano/cristalino — bloom muito forte (runas), CA pronunciado
        Config.BloomIntensity = 2.5f;
        Config.BloomThreshold = 0.5f;
        Config.BloomRadius = 8.0f;
        Config.ChromaticAberrationIntensity = 0.004f;
        Config.SpeciesCAOverride = 0.005f;  // Refração cristalina
        Config.VignetteIntensity = 0.25f;
        Config.ActiveLUT = EKhaaosColorGradingLUT::ARCANE_CRYSTAL;
        Config.GlobalSaturation = 1.1f;
        Config.GlobalContrast = 1.1f;
        Config.HighlightTint = FLinearColor(0.9f, 0.8f, 1.0f, 1.0f); // Roxo arcano
        Config.ShadowTint = FLinearColor(0.3f, 0.1f, 0.5f, 1.0f);     // Sombra mística
        Config.ExposureCompensation = 0.8f;
        Config.MinExposure = 0.4f;
        Config.MaxExposure = 5.0f;
        Config.AOIntensity = 0.7f;
        Config.SSRQuality = 3;   // Reflexos cristalinos de alta qualidade
        Config.SSRIntensity = 0.8f;
        Config.LensFlareIntensity = 0.4f;   // Flash arcano
        Config.LensDirtIntensity = 0.1f;
        Config.EstimatedGPUTimeMs = 6.5f;
        break;

    case EKhaaosSpecies::VENEX:
        // Venex: cybernético — CA forte (implantes), bloom neon, LUT cyber
        Config.BloomIntensity = 1.5f;
        Config.BloomThreshold = 0.7f;
        Config.BloomRadius = 5.0f;
        Config.ChromaticAberrationIntensity = 0.006f;
        Config.SpeciesCAOverride = 0.008f;  // CA forte de implantes
        Config.VignetteIntensity = 0.4f;    // Vignette HUD cyber
        Config.ActiveLUT = EKhaaosColorGradingLUT::CYBER_NEON;
        Config.GlobalSaturation = 1.2f;     // Saturação neon
        Config.GlobalContrast = 1.15f;
        Config.HighlightTint = FLinearColor(0.7f, 1.0f, 1.0f, 1.0f); // Cyan neon
        Config.ShadowTint = FLinearColor(0.0f, 0.1f, 0.3f, 1.0f);    // Sombra cyber
        Config.ExposureCompensation = 0.6f;
        Config.MinExposure = 0.5f;
        Config.MaxExposure = 4.5f;
        Config.AOIntensity = 0.5f;
        Config.SSRQuality = 3;   // Chrome reflections de alta qualidade
        Config.SSRIntensity = 1.0f; // Reflexos chrome máximos
        Config.LensFlareIntensity = 0.5f;   // LED flare
        Config.LensDirtIntensity = 0.3f;
        Config.EstimatedGPUTimeMs = 7.0f;
        break;

    case EKhaaosSpecies::ONITH:
        // Onith: quitinoso/térmico — bloom moderado (ventes térmicos), LUT térmico
        Config.BloomIntensity = 1.2f;
        Config.BloomThreshold = 0.7f;
        Config.BloomRadius = 4.0f;
        Config.ChromaticAberrationIntensity = 0.001f;
        Config.SpeciesCAOverride = 0.0f;
        Config.VignetteIntensity = 0.3f;
        Config.ActiveLUT = EKhaaosColorGradingLUT::THERMAL_PREDATOR;
        Config.GlobalSaturation = 0.95f;
        Config.GlobalContrast = 1.15f;      // Contraste alto (predador)
        Config.HighlightTint = FLinearColor(1.0f, 0.8f, 0.6f, 1.0f); // Térmico quente
        Config.ShadowTint = FLinearColor(0.4f, 0.1f, 0.0f, 1.0f);    // Sombra ígnea
        Config.ExposureCompensation = 0.4f;
        Config.MinExposure = 0.3f;
        Config.MaxExposure = 5.0f;
        Config.AOIntensity = 0.8f;          // AO forte para carapaça
        Config.SSRQuality = 1;
        Config.SSRIntensity = 0.3f;
        Config.LensFlareIntensity = 0.15f;
        Config.LensDirtIntensity = 0.1f;
        Config.EstimatedGPUTimeMs = 4.5f;
        break;

    case EKhaaosSpecies::ZHEERS:
        // Zheers: espiritual — bloom suave (tattoo glow), LUT sombrio
        Config.BloomIntensity = 1.0f;
        Config.BloomThreshold = 0.8f;
        Config.BloomRadius = 3.0f;
        Config.ChromaticAberrationIntensity = 0.001f;
        Config.SpeciesCAOverride = 0.0f;
        Config.VignetteIntensity = 0.45f;   // Vignette forte (shadow meld)
        Config.ActiveLUT = EKhaaosColorGradingLUT::SPIRIT_SHADOW;
        Config.GlobalSaturation = 0.9f;
        Config.GlobalContrast = 1.05f;
        Config.HighlightTint = FLinearColor(0.95f, 0.9f, 1.0f, 1.0f); // Glow etéreo
        Config.ShadowTint = FLinearColor(0.2f, 0.15f, 0.3f, 1.0f);    // Sombra mística
        Config.ExposureCompensation = 0.2f;
        Config.MinExposure = 0.4f;
        Config.MaxExposure = 3.5f;
        Config.AOIntensity = 0.7f;
        Config.SSRQuality = 1;
        Config.SSRIntensity = 0.2f;
        Config.LensFlareIntensity = 0.1f;
        Config.LensDirtIntensity = 0.2f;
        Config.EstimatedGPUTimeMs = 4.0f;
        break;

    case EKhaaosSpecies::SKEETW:
        // Skeetw: aviário — bloom moderado (iridescência), CA sutil, LUT neutro
        Config.BloomIntensity = 1.3f;
        Config.BloomThreshold = 0.7f;
        Config.BloomRadius = 5.0f;
        Config.ChromaticAberrationIntensity = 0.003f;
        Config.SpeciesCAOverride = 0.003f;  // Iridescência
        Config.VignetteIntensity = 0.2f;
        Config.ActiveLUT = EKhaaosColorGradingLUT::NEUTRAL;
        Config.GlobalSaturation = 1.15f;
        Config.GlobalContrast = 1.05f;
        Config.HighlightTint = FLinearColor(0.95f, 1.0f, 0.9f, 1.0f); // Verde-pluma
        Config.ShadowTint = FLinearColor(0.15f, 0.2f, 0.1f, 1.0f);    // Sombra natural
        Config.ExposureCompensation = 0.5f;
        Config.MinExposure = 0.4f;
        Config.MaxExposure = 4.0f;
        Config.AOIntensity = 0.5f;
        Config.SSRQuality = 2;
        Config.SSRIntensity = 0.4f;
        Config.LensFlareIntensity = 0.2f;
        Config.LensDirtIntensity = 0.1f;
        Config.MotionBlurAmount = 0.3f;     // Avian motion blur
        Config.EstimatedGPUTimeMs = 5.0f;
        break;

    default:
        break;
    }

    return Config;
}

FKhaaosPostProcessStackConfig UKhaaosPostProcessStack::BuildEnvironmentStack(EKhaaosColorGradingLUT EnvironmentLUT) const
{
    FKhaaosPostProcessStackConfig Config;
    Config.ActiveLUT = EnvironmentLUT;

    switch (EnvironmentLUT)
    {
    case EKhaaosColorGradingLUT::WARM_GOLDEN_HOUR:
        Config.BloomIntensity = 1.5f;
        Config.BloomThreshold = 0.5f;
        Config.VignetteIntensity = 0.35f;
        Config.GlobalSaturation = 1.1f;
        Config.GlobalContrast = 1.05f;
        Config.GlobalGamma = 0.95f;
        Config.HighlightTint = FLinearColor(1.0f, 0.9f, 0.7f, 1.0f);
        Config.ShadowTint = FLinearColor(0.5f, 0.3f, 0.1f, 1.0f);
        Config.ExposureCompensation = 0.8f;
        Config.LensFlareIntensity = 0.5f;
        Config.LensDirtIntensity = 0.3f;
        break;

    case EKhaaosColorGradingLUT::DESERT_ARID:
        Config.BloomIntensity = 1.2f;
        Config.BloomThreshold = 0.9f;
        Config.VignetteIntensity = 0.3f;
        Config.GlobalSaturation = 0.85f;
        Config.GlobalContrast = 1.15f;
        Config.HighlightTint = FLinearColor(1.0f, 0.95f, 0.85f, 1.0f);
        Config.ShadowTint = FLinearColor(0.6f, 0.5f, 0.35f, 1.0f);
        Config.ExposureCompensation = 0.6f;
        Config.AOIntensity = 0.3f;  // Deserto = menos oclusão
        break;

    case EKhaaosColorGradingLUT::JUNGLE_LUSH:
        Config.BloomIntensity = 1.3f;
        Config.BloomThreshold = 0.6f;
        Config.VignetteIntensity = 0.4f;
        Config.GlobalSaturation = 1.2f;
        Config.GlobalContrast = 1.0f;
        Config.HighlightTint = FLinearColor(0.85f, 1.0f, 0.85f, 1.0f);
        Config.ShadowTint = FLinearColor(0.05f, 0.15f, 0.05f, 1.0f);
        Config.ExposureCompensation = 0.3f;
        Config.AOIntensity = 0.8f;  // Selva = oclusão densa
        Config.SSRQuality = 2;
        break;

    case EKhaaosColorGradingLUT::ARCTIC_FROST:
        Config.BloomIntensity = 1.0f;
        Config.BloomThreshold = 0.9f;
        Config.VignetteIntensity = 0.25f;
        Config.GlobalSaturation = 0.8f;
        Config.GlobalContrast = 1.2f;
        Config.HighlightTint = FLinearColor(0.9f, 0.95f, 1.0f, 1.0f);
        Config.ShadowTint = FLinearColor(0.2f, 0.25f, 0.4f, 1.0f);
        Config.ExposureCompensation = 1.0f; // Neve = muito claro
        Config.ChromaticAberrationIntensity = 0.001f;
        break;

    case EKhaaosColorGradingLUT::VOLCANIC_INFERNO:
        Config.BloomIntensity = 2.0f;
        Config.BloomThreshold = 0.4f;
        Config.VignetteIntensity = 0.5f;
        Config.GlobalSaturation = 1.3f;
        Config.GlobalContrast = 1.2f;
        Config.HighlightTint = FLinearColor(1.0f, 0.7f, 0.3f, 1.0f);
        Config.ShadowTint = FLinearColor(0.5f, 0.1f, 0.0f, 1.0f);
        Config.ExposureCompensation = 0.2f;
        Config.LensFlareIntensity = 0.6f;
        break;

    case EKhaaosColorGradingLUT::COOL_OVERCAST:
        Config.BloomIntensity = 0.8f;
        Config.BloomThreshold = 0.9f;
        Config.VignetteIntensity = 0.2f;
        Config.GlobalSaturation = 0.9f;
        Config.GlobalContrast = 0.95f;
        Config.HighlightTint = FLinearColor(0.9f, 0.92f, 1.0f, 1.0f);
        Config.ShadowTint = FLinearColor(0.3f, 0.35f, 0.45f, 1.0f);
        Config.ExposureCompensation = 0.4f;
        break;

    default:
        // NEUTRAL — valores padrão já inicializados no struct
        break;
    }

    return Config;
}

FKhaaosPostProcessStackConfig UKhaaosPostProcessStack::MergeStacks(
    const FKhaaosPostProcessStackConfig& EnvironmentStack,
    const FKhaaosPostProcessStackConfig& SpeciesStack,
    float SpeciesWeight) const
{
    const float EnvWeight = 1.0f - SpeciesWeight;

    FKhaaosPostProcessStackConfig Merged;
    Merged.BloomIntensity = EnvironmentStack.BloomIntensity * EnvWeight + SpeciesStack.BloomIntensity * SpeciesWeight;
    Merged.BloomThreshold = EnvironmentStack.BloomThreshold * EnvWeight + SpeciesStack.BloomThreshold * SpeciesWeight;
    Merged.BloomRadius = EnvironmentStack.BloomRadius * EnvWeight + SpeciesStack.BloomRadius * SpeciesWeight;
    Merged.ChromaticAberrationIntensity = FMath::Max(EnvironmentStack.ChromaticAberrationIntensity, SpeciesStack.SpeciesCAOverride >= 0.0f ? SpeciesStack.SpeciesCAOverride : SpeciesStack.ChromaticAberrationIntensity);
    Merged.VignetteIntensity = FMath::Max(EnvironmentStack.VignetteIntensity, SpeciesStack.VignetteIntensity);
    Merged.ActiveLUT = SpeciesStack.ActiveLUT; // Espécie domina o LUT final
    Merged.GlobalSaturation = EnvironmentStack.GlobalSaturation * EnvWeight + SpeciesStack.GlobalSaturation * SpeciesWeight;
    Merged.GlobalContrast = EnvironmentStack.GlobalContrast * EnvWeight + SpeciesStack.GlobalContrast * SpeciesWeight;
    Merged.GlobalGamma = EnvironmentStack.GlobalGamma * EnvWeight + SpeciesStack.GlobalGamma * SpeciesWeight;
    Merged.HighlightTint = FLinearColor::LerpUsingHSV(EnvironmentStack.HighlightTint, SpeciesStack.HighlightTint, SpeciesWeight);
    Merged.ShadowTint = FLinearColor::LerpUsingHSV(EnvironmentStack.ShadowTint, SpeciesStack.ShadowTint, SpeciesWeight);
    Merged.ExposureCompensation = EnvironmentStack.ExposureCompensation * EnvWeight + SpeciesStack.ExposureCompensation * SpeciesWeight;
    Merged.MinExposure = FMath::Min(EnvironmentStack.MinExposure, SpeciesStack.MinExposure);
    Merged.MaxExposure = FMath::Max(EnvironmentStack.MaxExposure, SpeciesStack.MaxExposure);
    Merged.AOIntensity = FMath::Max(EnvironmentStack.AOIntensity, SpeciesStack.AOIntensity);
    Merged.SSRQuality = FMath::Max(EnvironmentStack.SSRQuality, SpeciesStack.SSRQuality);
    Merged.SSRIntensity = FMath::Max(EnvironmentStack.SSRIntensity, SpeciesStack.SSRIntensity);
    Merged.LensFlareIntensity = EnvironmentStack.LensFlareIntensity * EnvWeight + SpeciesStack.LensFlareIntensity * SpeciesWeight;
    Merged.LensDirtIntensity = EnvironmentStack.LensDirtIntensity * EnvWeight + SpeciesStack.LensDirtIntensity * SpeciesWeight;
    Merged.MotionBlurAmount = SpeciesStack.MotionBlurAmount; // Motion blur = só da espécie
    Merged.DepthOfFieldQuality = FMath::Max(EnvironmentStack.DepthOfFieldQuality, SpeciesStack.DepthOfFieldQuality);
    Merged.EstimatedGPUTimeMs = EnvironmentStack.EstimatedGPUTimeMs + SpeciesStack.EstimatedGPUTimeMs * SpeciesWeight;

    return Merged;
}

// ─── Quality-Based Stack ──────────────────────────────────────────────────────

FKhaaosPostProcessStackConfig UKhaaosPostProcessStack::ScaleStackForQuality(
    const FKhaaosPostProcessStackConfig& BaseConfig,
    int32 QualityLevel) const
{
    FKhaaosPostProcessStackConfig Scaled = BaseConfig;

    // Quality level: 0=Low, 1=Medium, 2=High, 3=Ultra, 4=PhD
    const float QualityScale = FMath::Clamp(static_cast<float>(QualityLevel) / 4.0f, 0.0f, 1.0f);

    // Escalar efeitos progressivamente
    Scaled.BloomIntensity *= FMath::Lerp(0.4f, 1.0f, QualityScale);
    Scaled.BloomRadius *= FMath::Lerp(0.5f, 1.0f, QualityScale);
    Scaled.ChromaticAberrationIntensity *= QualityScale;
    Scaled.DepthOfFieldQuality = FMath::RoundToInt(FMath::Lerp(0.0f, static_cast<float>(BaseConfig.DepthOfFieldQuality), QualityScale));
    Scaled.VignetteIntensity *= FMath::Lerp(0.5f, 1.0f, QualityScale);
    Scaled.AOIntensity *= FMath::Lerp(0.3f, 1.0f, QualityScale);
    Scaled.SSRQuality = FMath::RoundToInt(FMath::Lerp(0.0f, static_cast<float>(BaseConfig.SSRQuality), QualityScale));
    Scaled.SSRIntensity *= QualityScale;
    Scaled.LensFlareIntensity *= QualityScale;
    Scaled.LensDirtIntensity *= QualityScale;
    Scaled.MotionBlurAmount *= QualityScale;

    // Em Low/Medium: desativar SSR e DoF completamente
    if (QualityLevel <= 1)
    {
        Scaled.SSRQuality = 0;
        Scaled.SSRIntensity = 0.0f;
        Scaled.DepthOfFieldQuality = 0;
        Scaled.LensFlareIntensity = 0.0f;
        Scaled.LensDirtIntensity = 0.0f;
    }

    // Recalcular GPU estimate
    Scaled.EstimatedGPUTimeMs = EstimateGPUTimeMs();

    return Scaled;
}

// ─── Runtime Updates ──────────────────────────────────────────────────────────

void UKhaaosPostProcessStack::SetBloomIntensity(float Intensity, float BlendTime)
{
    ActiveConfig.BloomIntensity = FMath::Clamp(Intensity, 0.0f, 5.0f);
    ApplyToPostProcessVolume(ActiveConfig);
}

void UKhaaosPostProcessStack::SetVignetteIntensity(float Intensity, float BlendTime)
{
    ActiveConfig.VignetteIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);
    ApplyToPostProcessVolume(ActiveConfig);
}

void UKhaaosPostProcessStack::SetExposureCompensation(float Compensation, float BlendTime)
{
    ActiveConfig.ExposureCompensation = FMath::Clamp(Compensation, -5.0f, 5.0f);
    ApplyToPostProcessVolume(ActiveConfig);
}

void UKhaaosPostProcessStack::SetColorGradingLUT(EKhaaosColorGradingLUT NewLUT, float BlendTime)
{
    ActiveConfig.ActiveLUT = NewLUT;
    ApplyToPostProcessVolume(ActiveConfig);
    OnStackChanged.Broadcast(NewLUT, ActiveConfig.BloomIntensity);
}

// ─── Custom Material Stack ────────────────────────────────────────────────────

void UKhaaosPostProcessStack::AddCustomPostProcessMaterial(UMaterialInterface* Material, float Intensity, int32 InsertPosition)
{
    if (!Material) return;
    CustomPPMaterials.Add(Material, FMath::Clamp(Intensity, 0.0f, 1.0f));
    ApplyToPostProcessVolume(ActiveConfig);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[PostProcessStack] Material customizado adicionado: %s (Intensity=%.2f)"),
        *Material->GetName(), Intensity);
}

void UKhaaosPostProcessStack::RemoveCustomPostProcessMaterial(UMaterialInterface* Material)
{
    if (!Material) return;
    CustomPPMaterials.Remove(Material);
    ApplyToPostProcessVolume(ActiveConfig);
}

// ─── GPU Budget ───────────────────────────────────────────────────────────────

float UKhaaosPostProcessStack::EstimateGPUTimeMs() const
{
    float Cost = 0.0f;

    // Bloom: ~0.5ms por pass (UE5 usa 3 passes por padrão)
    if (ActiveConfig.BloomIntensity > 0.01f) Cost += 1.5f;
    // CA: ~0.2ms
    if (ActiveConfig.ChromaticAberrationIntensity > 0.0001f) Cost += 0.2f;
    // DoF: quality-dependent
    if (ActiveConfig.DepthOfFieldQuality > 0) Cost += ActiveConfig.DepthOfFieldQuality * 0.3f;
    // Vignette: ~0.05ms (very cheap)
    Cost += 0.05f;
    // AO: quality-dependent
    if (ActiveConfig.AOIntensity > 0.01f) Cost += 0.8f;
    // SSR: expensive
    if (ActiveConfig.SSRQuality > 0) Cost += ActiveConfig.SSRQuality * 0.5f;
    // Auto-exposure: ~0.1ms
    Cost += 0.1f;
    // Lens effects: ~0.3ms
    if (ActiveConfig.LensFlareIntensity > 0.01f) Cost += 0.3f;
    // Motion blur: ~0.4ms
    if (ActiveConfig.MotionBlurAmount > 0.01f) Cost += 0.4f;
    // Custom materials
    Cost += CustomPPMaterials.Num() * 0.3f;

    return Cost;
}

void UKhaaosPostProcessStack::OptimizeForBudget(float TargetGPUTimeMs)
{
    float CurrentCost = EstimateGPUTimeMs();
    if (CurrentCost <= TargetGPUTimeMs) return;

    // Cascata de cortes: SSR → DoF → Lens → CA → AO → Bloom
    if (CurrentCost > TargetGPUTimeMs && ActiveConfig.SSRQuality > 0)
    {
        ActiveConfig.SSRQuality = 0;
        ActiveConfig.SSRIntensity = 0.0f;
        CurrentCost = EstimateGPUTimeMs();
    }

    if (CurrentCost > TargetGPUTimeMs && ActiveConfig.DepthOfFieldQuality > 0)
    {
        ActiveConfig.DepthOfFieldQuality = 0;
        CurrentCost = EstimateGPUTimeMs();
    }

    if (CurrentCost > TargetGPUTimeMs)
    {
        ActiveConfig.LensFlareIntensity = 0.0f;
        ActiveConfig.LensDirtIntensity = 0.0f;
        CurrentCost = EstimateGPUTimeMs();
    }

    if (CurrentCost > TargetGPUTimeMs)
    {
        ActiveConfig.ChromaticAberrationIntensity = 0.0f;
        CurrentCost = EstimateGPUTimeMs();
    }

    if (CurrentCost > TargetGPUTimeMs)
    {
        ActiveConfig.AOIntensity *= 0.5f;
        CurrentCost = EstimateGPUTimeMs();
    }

    if (CurrentCost > TargetGPUTimeMs)
    {
        ActiveConfig.BloomIntensity *= 0.6f;
    }

    ApplyToPostProcessVolume(ActiveConfig);

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessStack] Otimizado para budget %.1fms (custo atual: %.1fms)"),
        TargetGPUTimeMs, EstimateGPUTimeMs());
}

// ─── Debug ────────────────────────────────────────────────────────────────────

void UKhaaosPostProcessStack::DumpStack() const
{
    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessStack] === Stack Ativo ==="));
    UE_LOG(LogKhaaosRun, Display, TEXT("  Bloom: Intensity=%.2f Threshold=%.2f Radius=%.1f"), ActiveConfig.BloomIntensity, ActiveConfig.BloomThreshold, ActiveConfig.BloomRadius);
    UE_LOG(LogKhaaosRun, Display, TEXT("  CA: %.4f (Species: %.4f)"), ActiveConfig.ChromaticAberrationIntensity, ActiveConfig.SpeciesCAOverride);
    UE_LOG(LogKhaaosRun, Display, TEXT("  DoF: Quality=%d FocalDist=%.0f"), ActiveConfig.DepthOfFieldQuality, ActiveConfig.DepthOfFieldFocalDistance);
    UE_LOG(LogKhaaosRun, Display, TEXT("  Vignette: %.2f"), ActiveConfig.VignetteIntensity);
    UE_LOG(LogKhaaosRun, Display, TEXT("  LUT: %s"), *UEnum::GetDisplayValueAsText(ActiveConfig.ActiveLUT).ToString());
    UE_LOG(LogKhaaosRun, Display, TEXT("  Saturation=%.2f Contrast=%.2f Gamma=%.2f"), ActiveConfig.GlobalSaturation, ActiveConfig.GlobalContrast, ActiveConfig.GlobalGamma);
    UE_LOG(LogKhaaosRun, Display, TEXT("  Exposure: Mode=%s Comp=%.2f Range=[%.2f, %.2f]"), *UEnum::GetDisplayValueAsText(ActiveConfig.ExposureMode).ToString(), ActiveConfig.ExposureCompensation, ActiveConfig.MinExposure, ActiveConfig.MaxExposure);
    UE_LOG(LogKhaaosRun, Display, TEXT("  AO: Intensity=%.2f Radius=%.0f"), ActiveConfig.AOIntensity, ActiveConfig.AORadius);
    UE_LOG(LogKhaaosRun, Display, TEXT("  SSR: Quality=%d Intensity=%.2f"), ActiveConfig.SSRQuality, ActiveConfig.SSRIntensity);
    UE_LOG(LogKhaaosRun, Display, TEXT("  Lens: Flare=%.2f Dirt=%.2f"), ActiveConfig.LensFlareIntensity, ActiveConfig.LensDirtIntensity);
    UE_LOG(LogKhaaosRun, Display, TEXT("  MotionBlur: Amount=%.2f TargetFPS=%d"), ActiveConfig.MotionBlurAmount, ActiveConfig.MotionBlurTargetFPS);
    UE_LOG(LogKhaaosRun, Display, TEXT("  Custom Materials: %d"), CustomPPMaterials.Num());
    UE_LOG(LogKhaaosRun, Display, TEXT("  GPU Estimate: %.1fms"), EstimateGPUTimeMs());
}

// ─── Protected Helpers ────────────────────────────────────────────────────────

void UKhaaosPostProcessStack::BuildCachedStacks()
{
    SpeciesStacks.Empty();
    EnvironmentStacks.Empty();

    // Pré-calcular stacks para 6 espécies
    SpeciesStacks.Add(EKhaaosSpecies::HURAN,  BuildSpeciesStack(EKhaaosSpecies::HURAN));
    SpeciesStacks.Add(EKhaaosSpecies::KHAEL,  BuildSpeciesStack(EKhaaosSpecies::KHAEL));
    SpeciesStacks.Add(EKhaaosSpecies::VENEX,  BuildSpeciesStack(EKhaaosSpecies::VENEX));
    SpeciesStacks.Add(EKhaaosSpecies::ONITH,  BuildSpeciesStack(EKhaaosSpecies::ONITH));
    SpeciesStacks.Add(EKhaaosSpecies::ZHEERS, BuildSpeciesStack(EKhaaosSpecies::ZHEERS));
    SpeciesStacks.Add(EKhaaosSpecies::SKEETW, BuildSpeciesStack(EKhaaosSpecies::SKEETW));

    // Pré-calcular stacks para 13 ambientes
    for (uint8 i = 0; i <= static_cast<uint8>(EKhaaosColorGradingLUT::AQUATIC_DEEP); ++i)
    {
        EKhaaosColorGradingLUT LUT = static_cast<EKhaaosColorGradingLUT>(i);
        EnvironmentStacks.Add(LUT, BuildEnvironmentStack(LUT));
    }
}

void UKhaaosPostProcessStack::ApplyToPostProcessVolume(const FKhaaosPostProcessStackConfig& Config)
{
    if (!GEngine) return;

    // Aplicar via console commands do UE5 (approach atual)
    // Em produção, isto seria via PostProcessVolume->Settings override

    // Bloom
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.BloomIntensity %.3f"), Config.BloomIntensity));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.BloomThreshold %.3f"), Config.BloomThreshold));
    GEngine->Exec(nullptr, TEXT("r.BloomQuality 3")); // Always high quality bloom

    // Chromatic Aberration
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.SceneChromaticAberration %.5f"),
        Config.SpeciesCAOverride >= 0.0f ? Config.SpeciesCAOverride : Config.ChromaticAberrationIntensity));

    // Depth of Field
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.DepthOfFieldQuality %d"), Config.DepthOfFieldQuality));

    // Vignette
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.VignetteIntensity %.3f"), Config.VignetteIntensity));

    // Color Grading — Saturation, Contrast, Gamma via UE5 color grading
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.ColorGradingSaturation %.3f"), Config.GlobalSaturation));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.ColorGradingContrast %.3f"), Config.GlobalContrast));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.ColorGradingGamma %.3f"), Config.GlobalGamma));

    // Auto-Exposure
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.EyeAdaptationExposureCompensation %.3f"), Config.ExposureCompensation));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.EyeAdaptationExposureMin %.3f"), Config.MinExposure));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.EyeAdaptationExposureMax %.3f"), Config.MaxExposure));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.EyeAdaptationSpeedUp %.3f"), Config.EyeAdaptationSpeedUp));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.EyeAdaptationSpeedDown %.3f"), Config.EyeAdaptationSpeedDown));

    // SSAO/GTAO
    if (Config.AOIntensity > 0.01f)
    {
        GEngine->Exec(nullptr, TEXT("r.AmbientOcclusionMethod 1")); // GTAO
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.AmbientOcclusionIntensity %.3f"), Config.AOIntensity));
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.AmbientOcclusionRadius %.1f"), Config.AORadius));
        GEngine->Exec(nullptr, TEXT("r.AmbientOcclusionQuality 2")); // High
    }
    else
    {
        GEngine->Exec(nullptr, TEXT("r.AmbientOcclusionMethod 0")); // Off
    }

    // SSR
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.SSR.Quality %d"), Config.SSRQuality));
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.SSR.Intensity %.3f"), Config.SSRIntensity));

    // Motion Blur
    if (Config.MotionBlurAmount > 0.01f)
    {
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.MotionBlurAmount %.3f"), Config.MotionBlurAmount));
        GEngine->Exec(nullptr, TEXT("r.MotionBlurQuality 2"));
    }
    else
    {
        GEngine->Exec(nullptr, TEXT("r.MotionBlurQuality 0"));
    }

    // Lens effects
    GEngine->Exec(nullptr, *FString::Printf(TEXT("r.LensFlareIntensity %.3f"), Config.LensFlareIntensity));
}
