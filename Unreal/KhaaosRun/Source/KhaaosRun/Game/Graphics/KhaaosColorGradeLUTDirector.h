// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosColorGradeLUTDirector
// PROPÓSITO: Aplica 3D Color Lookup Tables (LUTs) por mood, substituindo o
//            SceneTint linear simples por color grading cinematográfico real.
//            Free Fire usa LUTs extensivamente para sua assinatura visual.
//
//            5 moods com LUT dedicado:
//            - PadraoBattle: LUT quente e saturado (assinatura FF)
//            - NoiteNeon: LUT frio azul-neon com contraste alto
//            - NebulosaAlien: LUT violeta alienígena com desaturação parcial
//            - AmanhecerVenenoso: LUT ácido amarelo-esverdeado tóxico
//            - LowEndLeve: LUT neutro (grading mínimo para hardware fraco)
//
//            Crossfade entre LUTs via animação de intensidade no PostProcessVolume.
//            Integração: estágio LUT_COLOR_GRADE do GraphicsPipelineManager.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Containers/Ticker.h"
#include "Engine/Scene.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "KhaaosColorGradeLUTDirector.generated.h"

class APostProcessVolume;
class UTexture;

// ─── Color Grade LUT Configuration ────────────────────────────────────────────

/** Configuração de LUT de color grading por mood. */
USTRUCT(BlueprintType)
struct FKhaaosColorGradeLUTConfig
{
    GENERATED_BODY()

    /** Referência soft à textura 3D LUT (32³ ou 65³). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FSoftObjectPath LUTTexturePath;

    /** Intensidade do LUT (0-1) — para crossfade entre moods. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float LUTIntensity = 1.0f;

    /** Tamanho do LUT (32 = padrão mobile, 65 = alta qualidade desktop). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "16", ClampMax = "65"))
    int32 LUTSize = 32;

    /** Tint de cor adicional aplicada sobre o LUT (multiplicativa). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor TintColor = FLinearColor::White;

    /** Boost de saturação aplicado sobre o LUT (0-2, 1 = sem mudança). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float SaturationBoost = 1.0f;

    /** Boost de contraste aplicado sobre o LUT (0-2, 1 = sem mudança). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float ContrastBoost = 1.0f;
};

// ─── Color Grade LUT Director Subsystem ────────────────────────────────────────

/**
 * UKhaaosColorGradeLUTDirector — Diretor de color grading via LUT por mundo.
 *
 * Aplica 3D Color Lookup Tables no PostProcessVolume para color grading
 * cinematográfico por mood, com suporte a crossfade animado entre LUTs.
 * Reutiliza o volume do PostProcessDirector ou cria o próprio se necessário.
 *
 * Guarda: IsVisualRuntime() — sem LUT em dedicated server/headless.
 * Integração: estágio LUT_COLOR_GRADE do GraphicsPipelineManager.
 */
UCLASS()
class KHAAOSRUN_API UKhaaosColorGradeLUTDirector : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void OnWorldBeginPlay(UWorld& InWorld) override;
    virtual void Deinitialize() override;

    // ─── LUT Application ───────────────────────────────────────────────────

    /** Aplica o LUT de color grading para um mood com blend.
     *  @param Mood - Mood desejado (usa EKhaaosWorldMood do PostProcessDirector)
     *  @param BlendTime - Segundos para a intensidade chegar a 1.0
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ColorGradeLUT")
    void ApplyLUTForMood(EKhaaosWorldMood Mood, float BlendTime = 0.8f);

    /** Constrói a config de LUT para um mood (hardcoded defaults). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ColorGradeLUT")
    static FKhaaosColorGradeLUTConfig BuildLUTConfigForMood(EKhaaosWorldMood Mood);

    /** Crossfade animado entre dois LUTs de mood.
     *  @param From - Mood de origem (intensidade sai de 1→0)
     *  @param To - Mood de destino (intensidade entra de 0→1)
     *  @param Duration - Duração do crossfade em segundos
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ColorGradeLUT")
    void CrossfadeLUT(EKhaaosWorldMood From, EKhaaosWorldMood To, float Duration = 1.5f);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o diretor ativo no mundo de jogo corrente (null-safe). */
    static UKhaaosColorGradeLUTDirector* GetActiveForGame();

    /** Mood corrente do LUT. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ColorGradeLUT")
    EKhaaosWorldMood GetCurrentMood() const { return CurrentMood; }

    /** Config corrente do LUT. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ColorGradeLUT")
    FKhaaosColorGradeLUTConfig GetCurrentConfig() const { return CurrentConfig; }

private:
    /** Encontra ou referencia o PostProcessVolume (do PostProcessDirector ou próprio). */
    APostProcessVolume* GetOrCreateVolume(UWorld& InWorld);

    /** Guarda comuns: false em dedicated server / -NullRHI / editor preview. */
    static bool IsVisualRuntime(const UWorld& World);

    /** Aplica as configurações de LUT no volume de pós-processamento. */
    void ApplyLUTToVolume();

    /** Ticker para animação de crossfade/crossblend de LUT. */
    bool TickLUTBlend(float DeltaTime);

    /** Volume de pós-processamento gerenciado (próprio ou do PostProcessDirector). */
    UPROPERTY(Transient)
    TObjectPtr<APostProcessVolume> ActiveVolume;

    /** Textura LUT carregada em runtime. */
    UPROPERTY(Transient)
    TObjectPtr<UTexture> LoadedLUTTexture;

    /** Config corrente do LUT. */
    UPROPERTY(Transient)
    FKhaaosColorGradeLUTConfig CurrentConfig;

    /** Mood corrente. */
    UPROPERTY(Transient)
    EKhaaosWorldMood CurrentMood = EKhaaosWorldMood::PadraoBattle;

    /** Estado do crossfade. */
    UPROPERTY(Transient)
    bool bCrossfading = false;

    /** Mood de destino no crossfade. */
    UPROPERTY(Transient)
    EKhaaosWorldMood CrossfadeTargetMood = EKhaaosWorldMood::PadraoBattle;

    /** Intensidade atual do LUT (0-1, animada). */
    float LUTIntensityCurrent = 1.0f;

    /** Intensidade alvo do LUT. */
    float LUTIntensityTarget = 1.0f;

    /** Velocidade de blend por segundo. */
    float LUTBlendSpeedPerSec = 2.0f;

    /** Se o volume foi emprestado do PostProcessDirector. */
    bool bUsingDirectorVolume = false;

    /** Handle do ticker de blend. */
    FTSTicker::FDelegateHandle TickerHandle;
};
