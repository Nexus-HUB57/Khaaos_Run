// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosDynamicResolution
// Escalação dinâmica adaptativa com média móvel e histerese.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosDynamicResolution.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "UnrealClient.h"

void UKhaaosDynamicResolution::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    GPUTimeHistory.SetNumZeroed(HISTORY_SIZE);
    HistoryIndex = 0;

    // Obter resolução base do viewport
    if (GEngine && GEngine->GameViewport)
    {
        FViewport* Viewport = GEngine->GameViewport->Viewport;
        if (Viewport)
        {
            BaseResX = Viewport->GetSizeXY().X;
            BaseResY = Viewport->GetSizeXY().Y;
        }
    }

    CurrentResolutionFraction = 1.0f;
    TargetResolutionFraction = 1.0f;
    CurrentResX = BaseResX;
    CurrentResY = BaseResY;

    UE_LOG(LogTemp, Display, TEXT("[DynamicResolution] Inicializado. Base: %dx%d, Mode: %s"),
        BaseResX, BaseResY, *UEnum::GetDisplayValueAsText(DRSConfig.Mode).ToString());
}

void UKhaaosDynamicResolution::UpdateDynamicResolution(float CurrentGPUTimeMs, float DeltaTime)
{
    if (DRSConfig.Mode == EKhaaosDRSMode::Off || bForcedResolution)
    {
        return;
    }

    // Atualizar média móvel (evita reação a spikes isolados)
    GPUTimeHistory[HistoryIndex % HISTORY_SIZE] = CurrentGPUTimeMs;
    HistoryIndex++;

    float Sum = 0.0f;
    for (int32 i = 0; i < HISTORY_SIZE; ++i)
    {
        Sum += GPUTimeHistory[i];
    }
    AverageGPUTimeMs = Sum / static_cast<float>(HISTORY_SIZE);

    // Calcular razão de utilização vs. target
    const float UtilizationRatio = AverageGPUTimeMs / DRSConfig.TargetGPUTimeMs;

    if (UtilizationRatio > 1.0f)
    {
        // GPU sobrecarregada — escalar para baixo (reduzir resolução)
        const float OverBudgetRatio = FMath::Clamp(UtilizationRatio - 1.0f, 0.0f, 0.5f);
        const float ScaleDelta = OverBudgetRatio * DRSConfig.ScaleDownSpeed * DeltaTime;
        TargetResolutionFraction = FMath::Clamp(
            TargetResolutionFraction - ScaleDelta,
            DRSConfig.MinResolutionFraction,
            DRSConfig.MaxResolutionFraction
        );
    }
    else if (UtilizationRatio < DRSConfig.HeadroomThreshold)
    {
        // GPU com headroom — escalar para cima (aumentar resolução)
        const float HeadroomRatio = FMath::Clamp(DRSConfig.HeadroomThreshold - UtilizationRatio, 0.0f, 0.3f);
        const float ScaleDelta = HeadroomRatio * DRSConfig.ScaleUpSpeed * DeltaTime;
        TargetResolutionFraction = FMath::Clamp(
            TargetResolutionFraction + ScaleDelta,
            DRSConfig.MinResolutionFraction,
            DRSConfig.MaxResolutionFraction
        );
    }

    // Interpolar suavemente para a resolução alvo (evita popping visual)
    const float LerpSpeed = 2.0f * DeltaTime;
    CurrentResolutionFraction = FMath::Lerp(CurrentResolutionFraction, TargetResolutionFraction, LerpSpeed);

    // Calcular resolução efetiva
    CurrentResX = FMath::RoundToInt(static_cast<float>(BaseResX) * CurrentResolutionFraction);
    CurrentResY = FMath::RoundToInt(static_cast<float>(BaseResY) * CurrentResolutionFraction);

    // Garantir resoluções pares (exigência de muitos GPUs/encoders)
    CurrentResX = CurrentResX & ~1;
    CurrentResY = CurrentResY & ~1;

    ApplyResolutionToViewport();
}

void UKhaaosDynamicResolution::ApplyResolutionToViewport()
{
    // Aplicar via console command de Dynamic Resolution do UE5
    if (GEngine)
    {
        // Atualizar a primary screen percentage para o valor calculado
        const float ScreenPercentage = CurrentResolutionFraction * 100.0f;
        GEngine->Exec(nullptr, TEXT("r.DynamicRes.OperationMode 2")); // Auto
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.DynamicRes.TargetScreenPercentage %.1f"), ScreenPercentage));
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.DynamicRes.MinScreenPercentage %.1f"), DRSConfig.MinResolutionFraction * 100.0f));
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.DynamicRes.MaxScreenPercentage %.1f"), DRSConfig.MaxResolutionFraction * 100.0f));
    }
}

void UKhaaosDynamicResolution::SetDRSMode(EKhaaosDRSMode NewMode)
{
    DRSConfig.Mode = NewMode;

    if (NewMode == EKhaaosDRSMode::Adaptive)
    {
        ApplyAdaptiveThresholds();
    }
    else if (NewMode == EKhaaosDRSMode::Conservative)
    {
        DRSConfig.MinResolutionFraction = 0.8f;
        DRSConfig.MaxResolutionFraction = 1.0f;
        DRSConfig.ScaleDownSpeed = 0.2f;
    }
    else if (NewMode == EKhaaosDRSMode::Aggressive)
    {
        DRSConfig.MinResolutionFraction = 0.5f;
        DRSConfig.MaxResolutionFraction = 1.0f;
        DRSConfig.ScaleDownSpeed = 1.0f;
    }
    else if (NewMode == EKhaaosDRSMode::Off)
    {
        CurrentResolutionFraction = 1.0f;
        TargetResolutionFraction = 1.0f;
    }

    UE_LOG(LogTemp, Display, TEXT("[DynamicResolution] Modo alterado para %s. Range: %.0f%%-%.0f%%"),
        *UEnum::GetDisplayValueAsText(NewMode).ToString(),
        DRSConfig.MinResolutionFraction * 100.0f,
        DRSConfig.MaxResolutionFraction * 100.0f);
}

void UKhaaosDynamicResolution::ApplyAdaptiveThresholds()
{
    // Adaptive: ajustar range com base no preset ativo
    // Se já em 4K, permitir escalação mais agressiva (50-100%)
    // Se em 1080p, ser conservador (80-100%) pois já é baixa resolução
    if (BaseResX >= 3840)
    {
        DRSConfig.MinResolutionFraction = 0.5f;
        DRSConfig.MaxResolutionFraction = 1.0f;
    }
    else if (BaseResX >= 2560)
    {
        DRSConfig.MinResolutionFraction = 0.65f;
        DRSConfig.MaxResolutionFraction = 1.0f;
    }
    else
    {
        DRSConfig.MinResolutionFraction = 0.8f;
        DRSConfig.MaxResolutionFraction = 1.0f;
    }
}

void UKhaaosDynamicResolution::ForceResolutionFraction(float Fraction)
{
    bForcedResolution = true;
    CurrentResolutionFraction = FMath::Clamp(Fraction, 0.3f, 1.0f);
    TargetResolutionFraction = CurrentResolutionFraction;
    ApplyResolutionToViewport();
}

void UKhaaosDynamicResolution::ReleaseForcedResolution()
{
    bForcedResolution = false;
}
