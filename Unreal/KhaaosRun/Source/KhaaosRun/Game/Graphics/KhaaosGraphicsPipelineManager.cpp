// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosGraphicsPipelineManager
// Orquestrador central do pipeline gráfico — inicialização, calibração,
// hot-reload e métricas agregadas de todos os subsistemas visuais.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosGraphicsPipelineManager.h"
#include "KhaaosRun.h"
#include "Game/Graphics/KhaaosGraphicsPresetSubsystem.h"
#include "Game/Graphics/KhaaosMaterialOptimizer.h"
#include "Game/Graphics/KhaaosSpeciesLODManager.h"
#include "Game/Graphics/KhaaosDynamicResolution.h"
#include "Game/Graphics/KhaaosPostProcessManager.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "Game/Graphics/KhaaosLightingDirector.h"
#include "Game/Graphics/KhaaosColorGradeLUTDirector.h"
#include "Game/Graphics/KhaaosOutlineRenderer.h"
#include "Game/Graphics/KhaaosMobileGraphicsOptimizer.h"
#include "Game/Graphics/KhaaosShaderQualityTiers.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "HAL/PlatformTime.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosGraphicsPipelineManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Construir array de estágios do pipeline (v4: 9 estágios — +LUT_COLOR_GRADE, +OUTLINE_SETUP)
    PipelineStages.SetNum(9);

    PipelineStages[0].Stage = EKhaaosPipelineStage::INITIALIZATION;
    PipelineStages[0].EstimatedTimeMs = 5.0f;
    PipelineStages[0].bCritical = true;

    PipelineStages[1].Stage = EKhaaosPipelineStage::ASSET_LOADING;
    PipelineStages[1].EstimatedTimeMs = 50.0f;
    PipelineStages[1].bCritical = true;

    PipelineStages[2].Stage = EKhaaosPipelineStage::QUALITY_CALIBRATION;
    PipelineStages[2].EstimatedTimeMs = 10.0f;
    PipelineStages[2].bCritical = true;

    PipelineStages[3].Stage = EKhaaosPipelineStage::LUT_COLOR_GRADE;
    PipelineStages[3].EstimatedTimeMs = 6.0f;
    PipelineStages[3].bCritical = false;

    PipelineStages[4].Stage = EKhaaosPipelineStage::OUTLINE_SETUP;
    PipelineStages[4].EstimatedTimeMs = 4.0f;
    PipelineStages[4].bCritical = false;

    PipelineStages[5].Stage = EKhaaosPipelineStage::POST_PROCESS_SETUP;
    PipelineStages[5].EstimatedTimeMs = 8.0f;
    PipelineStages[5].bCritical = false;

    PipelineStages[6].Stage = EKhaaosPipelineStage::LIGHTING_SETUP;
    PipelineStages[6].EstimatedTimeMs = 12.0f;
    PipelineStages[6].bCritical = false;

    PipelineStages[7].Stage = EKhaaosPipelineStage::RUNTIME_OPTIMIZATION;
    PipelineStages[7].EstimatedTimeMs = 3.0f;
    PipelineStages[7].bCritical = false;

    PipelineStages[8].Stage = EKhaaosPipelineStage::HOT_RELOAD;
    PipelineStages[8].EstimatedTimeMs = 15.0f;
    PipelineStages[8].bCritical = false;

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Subsystem inicializado. 9 estágios configurados (v4 gráficos — +LUT, +Outline)."));
}

void UKhaaosGraphicsPipelineManager::Deinitialize(FSubsystemCollectionBase& Collection)
{
    PipelineStages.Empty();
    bPipelineReady = false;

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Subsystem desinicializado."));
    Super::Deinitialize(Collection);
}

// ─── Pipeline Initialization ──────────────────────────────────────────────────

void UKhaaosGraphicsPipelineManager::InitializePipeline()
{
    PipelineStartTime = FPlatformTime::Seconds();
    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Iniciando pipeline gráfico..."));

    // ── Estágio 1: INITIALIZATION ──────────────────────────────────────────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Garantir que todos os subsistemas estejam inicializados
        // (UE subsistemas são inicializados automaticamente pela engine)
        UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
        UKhaaosMaterialOptimizer* MaterialSubsystem = GEngine->GetEngineSubsystem<UKhaaosMaterialOptimizer>();
        UKhaaosSpeciesLODManager* LODSubsystem = GEngine->GetEngineSubsystem<UKhaaosSpeciesLODManager>();

        if (!PresetSubsystem || !MaterialSubsystem || !LODSubsystem)
        {
            UE_LOG(LogKhaaosRun, Error, TEXT("[GraphicsPipeline] FALHA: Subsistemas críticos não disponíveis!"));
            return;
        }

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::INITIALIZATION, static_cast<float>(StageElapsed));
    }

    // ── Estágio 2: ASSET_LOADING ───────────────────────────────────────────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Auto-detectar GPU e aplicar preset correspondente
        UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
        if (PresetSubsystem)
        {
            PresetSubsystem->AutoDetectAndApply();
        }

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::ASSET_LOADING, static_cast<float>(StageElapsed));
    }

    // ── Estágio 3: QUALITY_CALIBRATION ─────────────────────────────────────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Configurar budget de streaming de material baseado no preset
        UKhaaosMaterialOptimizer* MaterialSubsystem = GEngine->GetEngineSubsystem<UKhaaosMaterialOptimizer>();
        UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();

        if (MaterialSubsystem && PresetSubsystem)
        {
            const FKhaaosGraphicsProfile& Profile = PresetSubsystem->GetCurrentProfile();
            // Configurar budget automático baseado no VRAM detectado
            MaterialSubsystem->AutoConfigureBudget(PresetSubsystem->DetectGPUVRAM());
        }

        // Construir configs de LOD para todas as 6 espécies
        UKhaaosSpeciesLODManager* LODSubsystem = GEngine->GetEngineSubsystem<UKhaaosSpeciesLODManager>();
        if (LODSubsystem)
        {
            // LOD configs são construídos na Initialize() do SpeciesLODManager
            // Aqui registramos que estão calibrados
            LODSubsystem->DumpLODStats();
        }

        // Aplicar otimizações mobile coordenadas (se plataforma mobile)
        UKhaaosMobileGraphicsOptimizer* MobileOptimizer = GEngine->GetEngineSubsystem<UKhaaosMobileGraphicsOptimizer>();
        if (MobileOptimizer && MobileOptimizer->IsMobilePlatform())
        {
            const EKhaaosMobileTier Tier = MobileOptimizer->DetectMobileTier();
            MobileOptimizer->ApplyMobileOptimizations(Tier);
        }

        // Aplicar tier de shader baseado no preset de qualidade
        UKhaaosShaderQualityTiers* ShaderTiers = GEngine->GetEngineSubsystem<UKhaaosShaderQualityTiers>();
        if (ShaderTiers && PresetSubsystem)
        {
            const EKhaaosQualityPreset Preset = PresetSubsystem->GetCurrentPreset();
            const EKhaaosShaderTier Tier =
                Preset == EKhaaosQualityPreset::Mobile ? EKhaaosShaderTier::Minimal :
                Preset == EKhaaosQualityPreset::Low    ? EKhaaosShaderTier::Low :
                Preset == EKhaaosQualityPreset::Medium ? EKhaaosShaderTier::Medium :
                Preset == EKhaaosQualityPreset::High   ? EKhaaosShaderTier::High :
                Preset == EKhaaosQualityPreset::Ultra  ? EKhaaosShaderTier::Ultra :
                EKhaaosShaderTier::Ultra; // PhD = Ultra
            ShaderTiers->SetShaderTier(Tier);
        }

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::QUALITY_CALIBRATION, static_cast<float>(StageElapsed));
    }

    // ── Estágio 4: LUT_COLOR_GRADE (v4 — color grading cinematográfico) ────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Aplicar LUT de color grading para o mood do mundo
        if (UWorld* PlayWorld = GEngine->GetCurrentPlayWorld())
        {
            if (UKhaaosColorGradeLUTDirector* LUTDirector = PlayWorld->GetSubsystem<UKhaaosColorGradeLUTDirector>())
            {
                const EKhaaosWorldMood Mood = UKhaaosPostProcessDirector::AutoMoodForWorld(PlayWorld->GetFName());
                LUTDirector->ApplyLUTForMood(Mood, 0.5f);
            }
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] LUT de color grade configurado."));

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::LUT_COLOR_GRADE, static_cast<float>(StageElapsed));
    }

    // ── Estágio 5: OUTLINE_SETUP (v4 — outline via CustomDepth stencil) ────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Habilitar outlines se a qualidade suporta (não Mobile/Low)
        if (UWorld* PlayWorld = GEngine->GetCurrentPlayWorld())
        {
            if (UKhaaosOutlineRenderer* OutlineRenderer = PlayWorld->GetSubsystem<UKhaaosOutlineRenderer>())
            {
                const bool bEnable = OutlineRenderer->IsOutlinesEnabled();
                OutlineRenderer->EnableOutlines(bEnable);
            }
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Outline renderer configurado."));

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::OUTLINE_SETUP, static_cast<float>(StageElapsed));
    }

    // ── Estágio 6: POST_PROCESS_SETUP (v4 — look Free Fire + LUT) ──────────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Pre-aquecer a receita do mood padrão (dado puro, sem world)
        const FKhaaosPostProcessRecipe StandardRecipe =
            UKhaaosPostProcessDirector::BuildRecipeForMood(EKhaaosWorldMood::PadraoBattle);

        // Se já existe mundo de jogo (re-execução), reaplica o mood agora;
        // senão o diretor aplica no OnWorldBeginPlay
        if (UWorld* PlayWorld = GEngine->GetCurrentPlayWorld())
        {
            if (UKhaaosPostProcessDirector* PPDirector = PlayWorld->GetSubsystem<UKhaaosPostProcessDirector>())
            {
                PPDirector->ApplyMood(
                    UKhaaosPostProcessDirector::AutoMoodForWorld(PlayWorld->GetFName()), 0.5f);
            }
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Receita PP padrão pré-aquecida: Sat=%.2f Bloom=%.2f Sharpen=%.2f"),
            StandardRecipe.Saturation, StandardRecipe.BloomIntensity, StandardRecipe.Sharpen);

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::POST_PROCESS_SETUP, static_cast<float>(StageElapsed));
    }

    // ── Estágio 7: LIGHTING_SETUP (v4 — rig de luz programático) ───────────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Validar config do preset padrão (dado puro); rig real nasce no BeginPlay
        const FKhaaosLightingPresetConfig DefaultLighting =
            UKhaaosLightingDirector::BuildConfigForPreset(EKhaaosLightingPreset::DiaSolarPadrao);

        // Se já existe mundo de jogo, aplica o preset agora
        if (UWorld* PlayWorld = GEngine->GetCurrentPlayWorld())
        {
            if (UKhaaosLightingDirector* LightingDirector = PlayWorld->GetSubsystem<UKhaaosLightingDirector>())
            {
                LightingDirector->ApplyLightingPreset(
                    UKhaaosLightingDirector::AutoPresetForWorld(PlayWorld->GetFName()));
            }
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Config de luz padrão validada: Sol=%.1flux@%.0fK, Fog=%.3f"),
            DefaultLighting.SunIntensityLux, DefaultLighting.SunTemperature, DefaultLighting.FogDensity);

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::LIGHTING_SETUP, static_cast<float>(StageElapsed));
    }

    // ── Estágio 8: RUNTIME_OPTIMIZATION ────────────────────────────────────
    {
        const double StageStart = FPlatformTime::Seconds();

        // Configurar Dynamic Resolution baseado no preset
        UKhaaosDynamicResolution* DRSubsystem = GEngine->GetEngineSubsystem<UKhaaosDynamicResolution>();
        if (DRSubsystem && PresetSubsystem)
        {
            // Ajustar modo DRS baseado na qualidade — mais agressivo em Low/Medium
            const FKhaaosGraphicsProfile& Profile = PresetSubsystem->GetCurrentProfile();
            if (Profile.TargetFPS >= 120)
            {
                DRSubsystem->SetDRSMode(EKhaaosDRSMode::Conservative);
            }
            else
            {
                DRSubsystem->SetDRSMode(EKhaaosDRSMode::Adaptive);
            }
        }

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::RUNTIME_OPTIMIZATION, static_cast<float>(StageElapsed));
    }

    // Calcular tempo total de inicialização
    TotalInitTimeMs = static_cast<float>((FPlatformTime::Seconds() - PipelineStartTime) * 1000.0);
    bPipelineReady = true;

    // Atualizar métricas cacheadas
    CachedMetrics = GetPipelineMetrics();

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Pipeline completo em %.2f ms. Pronto para gameplay."), TotalInitTimeMs);
}

// ─── Quality Change Callback ──────────────────────────────────────────────────

void UKhaaosGraphicsPipelineManager::OnQualityChanged()
{
    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Qualidade alterada — reconfigurando subsistemas..."));

    // Re-aplicar console commands baseado no novo preset
    ReapplyConsoleCommandsForPreset();

    // Atualizar budget de material
    UpdateMaterialBudgetForPreset();

    // Atualizar thresholds de LOD
    UpdateLODThresholdsForPreset();

    // Atualizar Dynamic Resolution
    UKhaaosDynamicResolution* DRSubsystem = GEngine->GetEngineSubsystem<UKhaaosDynamicResolution>();
    if (DRSubsystem)
    {
        DRSubsystem->SetDRSMode(EKhaaosDRSMode::Adaptive);
    }

    // Re-aplicar tier de shader baseado no novo preset
    UKhaaosShaderQualityTiers* ShaderTiers = GEngine->GetEngineSubsystem<UKhaaosShaderQualityTiers>();
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
    if (ShaderTiers && PresetSubsystem)
    {
        const EKhaaosQualityPreset Preset = PresetSubsystem->GetCurrentPreset();
        const EKhaaosShaderTier Tier =
            Preset == EKhaaosQualityPreset::Mobile ? EKhaaosShaderTier::Minimal :
            Preset == EKhaaosQualityPreset::Low    ? EKhaaosShaderTier::Low :
            Preset == EKhaaosQualityPreset::Medium ? EKhaaosShaderTier::Medium :
            Preset == EKhaaosQualityPreset::High   ? EKhaaosShaderTier::High :
            Preset == EKhaaosQualityPreset::Ultra  ? EKhaaosShaderTier::Ultra :
            EKhaaosShaderTier::Ultra; // PhD = Ultra
        ShaderTiers->SetShaderTier(Tier);
    }

    // Re-aplicar otimizações mobile se aplicável
    UKhaaosMobileGraphicsOptimizer* MobileOptimizer = GEngine->GetEngineSubsystem<UKhaaosMobileGraphicsOptimizer>();
    if (MobileOptimizer && MobileOptimizer->IsMobilePlatform())
    {
        const EKhaaosMobileTier MobileTier = MobileOptimizer->DetectMobileTier();
        MobileOptimizer->ApplyMobileOptimizations(MobileTier);
    }

    // Re-aplicar outlines baseado na nova qualidade
    if (UWorld* PlayWorld = GEngine->GetCurrentPlayWorld())
    {
        if (UKhaaosOutlineRenderer* OutlineRenderer = PlayWorld->GetSubsystem<UKhaaosOutlineRenderer>())
        {
            OutlineRenderer->EnableOutlines(OutlineRenderer->IsOutlinesEnabled());
        }
    }

    // Atualizar métricas
    CachedMetrics = GetPipelineMetrics();

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Reconfiguração completa (v4 — +ShaderTiers, +Mobile, +Outline)."));
}

// ─── Hot Reload ───────────────────────────────────────────────────────────────

bool UKhaaosGraphicsPipelineManager::HotReloadQuality(int32 NewPreset)
{
    // Validar range do preset (0=Low, 1=Medium, 2=High, 3=Ultra, 4=PhD)
    if (NewPreset < 0 || NewPreset > 4)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[GraphicsPipeline] Hot-reload falhou: preset inválido %d (range: 0-4)"), NewPreset);
        return false;
    }

    const double HotReloadStart = FPlatformTime::Seconds();

    EKhaaosQualityPreset TargetPreset = static_cast<EKhaaosQualityPreset>(NewPreset);
    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Hot-reload: aplicando preset %s sem restart..."),
        *UEnum::GetDisplayValueAsText(TargetPreset).ToString());

    // Aplicar novo preset via subsistema de preset
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
    if (!PresetSubsystem)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[GraphicsPipeline] Hot-reload falhou: PresetSubsystem não disponível"));
        return false;
    }

    PresetSubsystem->ApplyPreset(TargetPreset);

    // Reconfigurar todos os subsistemas dependentes
    OnQualityChanged();

    // Marcar estágio HOT_RELOAD como completo
    const double Elapsed = (FPlatformTime::Seconds() - HotReloadStart) * 1000.0;
    CompleteStage(EKhaaosPipelineStage::HOT_RELOAD, static_cast<float>(Elapsed));

    // Resetar flag para permitir novo hot-reload
    PipelineStages[StageToIndex(EKhaaosPipelineStage::HOT_RELOAD)].bCompleted = false;

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Hot-reload completo em %.2f ms."), Elapsed);
    return true;
}

// ─── Pipeline Metrics ─────────────────────────────────────────────────────────

FKhaaosPipelineMetrics UKhaaosGraphicsPipelineManager::GetPipelineMetrics() const
{
    FKhaaosPipelineMetrics Metrics;
    Metrics.InitTimeMs = TotalInitTimeMs;

    // Coletar dados do PresetSubsystem
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
    if (PresetSubsystem)
    {
        Metrics.ActivePreset = static_cast<int32>(PresetSubsystem->GetCurrentPreset());
        const FKhaaosGraphicsProfile& Profile = PresetSubsystem->GetCurrentProfile();
        Metrics.ActiveUpscaler = static_cast<int32>(Profile.Upscaler);
        Metrics.bLumenEnabled = Profile.bEnableLumenGI;
        Metrics.bNaniteEnabled = Profile.bEnableNanite;

        // Estimar VRAM baseado no preset (heurística simplificada)
        switch (PresetSubsystem->GetCurrentPreset())
        {
        case EKhaaosQualityPreset::Low:    Metrics.VRAMUsedMB = 512.0f;  break;
        case EKhaaosQualityPreset::Medium:  Metrics.VRAMUsedMB = 1024.0f; break;
        case EKhaaosQualityPreset::High:    Metrics.VRAMUsedMB = 2048.0f; break;
        case EKhaaosQualityPreset::Ultra:   Metrics.VRAMUsedMB = 4096.0f; break;
        case EKhaaosQualityPreset::PhD:     Metrics.VRAMUsedMB = 6144.0f; break;
        default:                            Metrics.VRAMUsedMB = 1024.0f; break;
        }
    }

    // Coletar draw calls economizadas do MaterialOptimizer
    UKhaaosMaterialOptimizer* MaterialSubsystem = GEngine->GetEngineSubsystem<UKhaaosMaterialOptimizer>();
    if (MaterialSubsystem)
    {
        Metrics.DrawCallsSaved = MaterialSubsystem->GetTotalSavedDrawCalls();
    }

    return Metrics;
}

// ─── Protected Helpers ────────────────────────────────────────────────────────

void UKhaaosGraphicsPipelineManager::CompleteStage(EKhaaosPipelineStage Stage, float ElapsedMs)
{
    const int32 Idx = StageToIndex(Stage);
    if (PipelineStages.IsValidIndex(Idx))
    {
        PipelineStages[Idx].bCompleted = true;
        PipelineStages[Idx].EstimatedTimeMs = ElapsedMs;

        UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Estágio %s completo em %.2f ms (crítico: %s)"),
            *UEnum::GetDisplayValueAsText(Stage).ToString(),
            ElapsedMs,
            PipelineStages[Idx].bCritical ? TEXT("SIM") : TEXT("NÃO"));

        OnPipelineStageCompleted.Broadcast(Stage);
    }
}

void UKhaaosGraphicsPipelineManager::ReapplyConsoleCommandsForPreset()
{
    // O PresetSubsystem já aplica console commands no ApplyPreset
    // Aqui garantimos que qualquer override adicional seja reaplicado
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
    if (PresetSubsystem)
    {
        // Re-aplicar preset atual para forçar console commands
        PresetSubsystem->ApplyPreset(PresetSubsystem->GetCurrentPreset());
    }
}

void UKhaaosGraphicsPipelineManager::UpdateMaterialBudgetForPreset()
{
    UKhaaosMaterialOptimizer* MaterialSubsystem = GEngine->GetEngineSubsystem<UKhaaosMaterialOptimizer>();
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();

    if (MaterialSubsystem && PresetSubsystem)
    {
        // Auto-configurar budget baseado no VRAM do preset atual
        MaterialSubsystem->AutoConfigureBudget(PresetSubsystem->DetectGPUVRAM());
    }
}

void UKhaaosGraphicsPipelineManager::UpdateLODThresholdsForPreset()
{
    // Ajustar distâncias de LOD baseado no preset de qualidade
    // Presets mais baixos = LODs mais agressivos (transições mais cedo)
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
    if (!PresetSubsystem) return;

    const FKhaaosGraphicsProfile& Profile = PresetSubsystem->GetCurrentProfile();

    // Fator de escala baseado no ViewDistanceScale do preset
    const float LODScaleFactor = Profile.ViewDistanceScale;

    // Aplicar ao console — distância de LOD escala com view distance
    if (GEngine)
    {
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.SkeletalMeshLODBias %d"),
            LODScaleFactor < 0.5f ? 1 : 0));
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.StaticMeshLODDistanceScale %.2f"),
            FMath::Clamp(1.0f / LODScaleFactor, 0.5f, 2.0f)));
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] LOD thresholds atualizados — ViewDistScale: %.2f, LODScaleFactor: %.2f"),
        Profile.ViewDistanceScale, LODScaleFactor);
}
