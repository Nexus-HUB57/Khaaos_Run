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
#include "Engine/Engine.h"
#include "HAL/PlatformTime.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosGraphicsPipelineManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Construir array de estágios do pipeline
    PipelineStages.SetNum(5);

    PipelineStages[0].Stage = EKhaaosPipelineStage::INITIALIZATION;
    PipelineStages[0].EstimatedTimeMs = 5.0f;
    PipelineStages[0].bCritical = true;

    PipelineStages[1].Stage = EKhaaosPipelineStage::ASSET_LOADING;
    PipelineStages[1].EstimatedTimeMs = 50.0f;
    PipelineStages[1].bCritical = true;

    PipelineStages[2].Stage = EKhaaosPipelineStage::QUALITY_CALIBRATION;
    PipelineStages[2].EstimatedTimeMs = 10.0f;
    PipelineStages[2].bCritical = true;

    PipelineStages[3].Stage = EKhaaosPipelineStage::RUNTIME_OPTIMIZATION;
    PipelineStages[3].EstimatedTimeMs = 3.0f;
    PipelineStages[3].bCritical = false;

    PipelineStages[4].Stage = EKhaaosPipelineStage::HOT_RELOAD;
    PipelineStages[4].EstimatedTimeMs = 15.0f;
    PipelineStages[4].bCritical = false;

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Subsystem inicializado. 5 estágios configurados."));
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

        const double StageElapsed = (FPlatformTime::Seconds() - StageStart) * 1000.0;
        CompleteStage(EKhaaosPipelineStage::QUALITY_CALIBRATION, static_cast<float>(StageElapsed));
    }

    // ── Estágio 4: RUNTIME_OPTIMIZATION ────────────────────────────────────
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

    // Atualizar métricas
    CachedMetrics = GetPipelineMetrics();

    UE_LOG(LogKhaaosRun, Display, TEXT("[GraphicsPipeline] Reconfiguração completa."));
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
