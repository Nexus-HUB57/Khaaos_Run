// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosGraphicsPipelineManager
// PROPÓSITO: Orquestrador central do pipeline gráfico — integra todos os subsistemas
//            de LOD, Preset, Material, Dynamic Resolution, Post Process, Screen Effects
//            e Cinematic Camera. Gerencia estágios de inicialização, calibração de
//            qualidade, otimização em runtime, e hot-reload de presets sem restart.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosGraphicsPipelineManager.generated.h"

// ─── Pipeline Stage Enumeration ───────────────────────────────────────────────

/** Estágios do pipeline gráfico — executados sequencialmente na inicialização. */
UENUM(BlueprintType)
enum class EKhaaosPipelineStage : uint8
{
    INITIALIZATION          UMETA(DisplayName = "Initialization"),
    ASSET_LOADING           UMETA(DisplayName = "Asset Loading"),
    QUALITY_CALIBRATION     UMETA(DisplayName = "Quality Calibration"),
    RUNTIME_OPTIMIZATION    UMETA(DisplayName = "Runtime Optimization"),
    HOT_RELOAD              UMETA(DisplayName = "Hot Reload")
};

// ─── Pipeline Stage Descriptor ────────────────────────────────────────────────

/** Descriptor de um estágio do pipeline com tempo estimado e estado. */
USTRUCT(BlueprintType)
struct FKhaaosPipelineStage
{
    GENERATED_BODY()

    /** Estágio do pipeline */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosPipelineStage Stage = EKhaaosPipelineStage::INITIALIZATION;

    /** Tempo estimado de execução em milissegundos */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float EstimatedTimeMs = 0.0f;

    /** Se este estágio foi concluído */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bCompleted = false;

    /** Se este estágio é crítico (falha impede pipeline) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bCritical = true;
};

// ─── Pipeline Metrics ─────────────────────────────────────────────────────────

/** Métricas agregadas do pipeline gráfico para profiling e debug. */
USTRUCT(BlueprintType)
struct FKhaaosPipelineMetrics
{
    GENERATED_BODY()

    /** Tempo total de inicialização do pipeline em ms */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float InitTimeMs = 0.0f;

    /** Preset de qualidade ativo */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 ActivePreset = 0;

    /** VRAM utilizada em MB */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float VRAMUsedMB = 0.0f;

    /** Draw calls economizadas por batching/LOD */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 DrawCallsSaved = 0;

    /** Upscaler ativo (0=None, 1=DLSS, 2=FSR, 3=XeSS, 4=TSR) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 ActiveUpscaler = 0;

    /** Se Lumen GI está habilitado */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bLumenEnabled = false;

    /** Se Nanite está habilitado */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bNaniteEnabled = false;
};

// ─── Delegate Declarations ────────────────────────────────────────────────────

/** Broadcast quando um estágio do pipeline é concluído. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPipelineStageCompleted, EKhaaosPipelineStage, CompletedStage);

// ─── Graphics Pipeline Manager ────────────────────────────────────────────────

/**
 * UKhaaosGraphicsPipelineManager — Orquestrador central do pipeline gráfico.
 *
 * Integra todos os subsistemas de gráficos existentes:
 * - UKhaaosGraphicsPresetSubsystem (auto-detecção de GPU, presets, DLSS/FSR/XeSS)
 * - UKhaaosMaterialOptimizer (streaming budget, batch updates, LOD de textura)
 * - UKhaaosSpeciesLODManager (LOD por espécie com distância adaptativa)
 * - UKhaaosDynamicResolution (escalação dinâmica baseada em GPU utilization)
 * - UKhaaosPostProcessManager (efeitos de pós-processamento por espécie)
 * - UKhaaosCinematicCamera (kill cam, spectator, cinematic sequences)
 *
 * Gerencia o ciclo de vida do pipeline: inicialização, calibração de qualidade,
 * otimização em runtime, e hot-reload de presets sem restart do jogo.
 */
UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosGraphicsPipelineManager : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize(FSubsystemCollectionBase& Collection) override;

    // ─── Pipeline Initialization ────────────────────────────────────────────

    /** Inicializa o pipeline gráfico completo:
     *  1. Auto-detecta GPU e aplica preset correspondente
     *  2. Configura budgets de streaming de material
     *  3. Constrói configs de LOD para todas as 6 espécies
     *  4. Marca estágios como completos com timing
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|GraphicsPipeline")
    void InitializePipeline();

    // ─── Quality Change Callback ────────────────────────────────────────────

    /** Callback quando o preset de qualidade muda.
     *  Re-aplica console commands, atualiza material budget,
     *  e ajusta thresholds de LOD baseado no novo preset.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|GraphicsPipeline")
    void OnQualityChanged();

    // ─── Pipeline Metrics ───────────────────────────────────────────────────

    /** Obtém métricas agregadas do pipeline gráfico. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|GraphicsPipeline")
    FKhaaosPipelineMetrics GetPipelineMetrics() const;

    // ─── Hot Reload ─────────────────────────────────────────────────────────

    /** Permite trocar o preset de qualidade em runtime sem restart.
     *  Valida o novo preset, aplica, e broadcast do estágio HOT_RELOAD.
     *  @param NewPreset - Preset de qualidade desejado (0=Low, 4=PhD)
     *  @return true se o hot-reload foi aplicado com sucesso
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|GraphicsPipeline")
    bool HotReloadQuality(int32 NewPreset);

    // ─── Stage Query ────────────────────────────────────────────────────────

    /** Obtém o estado de todos os estágios do pipeline. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|GraphicsPipeline")
    const TArray<FKhaaosPipelineStage>& GetPipelineStages() const { return PipelineStages; }

    /** Verifica se o pipeline está completamente inicializado. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|GraphicsPipeline")
    bool IsPipelineReady() const { return bPipelineReady; }

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast quando um estágio do pipeline é concluído. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|GraphicsPipeline")
    FOnPipelineStageCompleted OnPipelineStageCompleted;

protected:

    /** Marca um estágio como completo com tempo medido e broadcast delegate. */
    void CompleteStage(EKhaaosPipelineStage Stage, float ElapsedMs);

    /** Re-aplica console commands baseado no preset atual. */
    void ReapplyConsoleCommandsForPreset();

    /** Atualiza budget de material baseado no preset. */
    void UpdateMaterialBudgetForPreset();

    /** Atualiza thresholds de LOD baseado no preset. */
    void UpdateLODThresholdsForPreset();

private:

    /** Estágios do pipeline com estado */
    UPROPERTY(Transient)
    TArray<FKhaaosPipelineStage> PipelineStages;

    /** Métricas do pipeline (cache) */
    UPROPERTY(Transient)
    FKhaaosPipelineMetrics CachedMetrics;

    /** Se o pipeline está completamente inicializado */
    UPROPERTY(Transient)
    bool bPipelineReady = false;

    /** Timestamp de início da inicialização (FPlatformTime::Seconds()) */
    double PipelineStartTime = 0.0;

    /** Tempo total de inicialização em ms */
    float TotalInitTimeMs = 0.0f;

    /** Helper: converte EKhaaosPipelineStage para índice no array */
    static int32 StageToIndex(EKhaaosPipelineStage Stage) { return static_cast<int32>(Stage); }
};
