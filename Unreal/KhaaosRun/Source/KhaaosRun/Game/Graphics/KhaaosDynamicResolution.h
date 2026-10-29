// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosDynamicResolution
// PROPÓSITO: Escalação dinâmica de resolução baseada em utilização de GPU para
//            manter o frame budget < 16ms (60fps) ou < 8.33ms (120fps).
//            Integrado com o GraphicsPresetSubsystem para thresholds adaptativos.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosDynamicResolution.generated.h"

UENUM(BlueprintType)
enum class EKhaaosDRSMode : uint8
{
    Off,            // Resolução fixa (sem escalação)
    Conservative,   // Range 80-100% (mínima interferência visual)
    Aggressive,     // Range 50-100% (prioriza framerate)
    Adaptive        // Range automático baseado no preset de qualidade
};

USTRUCT(BlueprintType)
struct FKhaaosDRSConfig
{
    GENERATED_BODY()

    /** Modo de escalação dinâmica */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosDRSMode Mode = EKhaaosDRSMode::Adaptive;

    /** Resolução mínima como fração (0.5 = 50%) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.3", ClampMax = "1.0"))
    float MinResolutionFraction = 0.5f;

    /** Resolução máxima como fração (1.0 = 100%) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.5", ClampMax = "1.0"))
    float MaxResolutionFraction = 1.0f;

    /** Target GPU time em ms (16.67ms = 60fps, 8.33ms = 120fps) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "4.0", ClampMax = "33.0"))
    float TargetGPUTimeMs = 16.67f;

    /** Headroom percentual antes de escalar para cima (ex: 0.85 = escalar acima se GPU < 85% do target) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.5", ClampMax = "0.95"))
    float HeadroomThreshold = 0.85f;

    /** Velocidade de escalação para cima (res/s) — mais lento para evitar flickering */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.01", ClampMax = "1.0"))
    float ScaleUpSpeed = 0.1f;

    /** Velocidade de escalação para baixo (res/s) — mais rápido para manter framerate */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.01", ClampMax = "2.0"))
    float ScaleDownSpeed = 0.5f;
};

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosDynamicResolution : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Tick principal — chamado a cada frame para ajustar resolução */
    void UpdateDynamicResolution(float CurrentGPUTimeMs, float DeltaTime);

    /** Obtém a fração de resolução atual (0.5-1.0) */
    float GetCurrentResolutionFraction() const { return CurrentResolutionFraction; }

    /** Obtém a configuração ativa */
    const FKhaaosDRSConfig& GetConfig() const { return DRSConfig; }

    /** Modifica o modo em runtime (ex: quando muda preset de qualidade) */
    void SetDRSMode(EKhaaosDRSMode NewMode);

    /** Força uma fração de resolução específica (para debug/cinematics) */
    void ForceResolutionFraction(float Fraction);

    /** Retorna ao controle dinâmico após ForceResolutionFraction */
    void ReleaseForcedResolution();

    /** Estatísticas para HUD de debug */
    float GetAverageGPUTimeMs() const { return AverageGPUTimeMs; }
    int32 GetResolutionX() const { return CurrentResX; }
    int32 GetResolutionY() const { return CurrentResY; }

protected:
    /** Aplica configurações de modo adaptativo */
    void ApplyAdaptiveThresholds();

    /** Aplica a resolução ao viewport */
    void ApplyResolutionToViewport();

private:
    FKhaaosDRSConfig DRSConfig;
    float CurrentResolutionFraction = 1.0f;
    float TargetResolutionFraction = 1.0f;
    float AverageGPUTimeMs = 16.67f;
    int32 CurrentResX = 1920;
    int32 CurrentResY = 1080;
    int32 BaseResX = 1920;
    int32 BaseResY = 1080;
    bool bForcedResolution = false;

    /** Histórico de GPU time para média móvel (8 frames) */
    TArray<float> GPUTimeHistory;
    int32 HistoryIndex = 0;
    static constexpr int32 HISTORY_SIZE = 8;
};
