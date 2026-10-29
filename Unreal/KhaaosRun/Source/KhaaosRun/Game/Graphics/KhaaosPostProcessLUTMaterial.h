// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosPostProcessLUTMaterial
// PROPÓSITO: Material de PostProcess para aplicação de LUT de color grading.
//            Configura e gerencia o material M_KhaaosColorGradeLUT no
//            PostProcessVolume, fazendo a ponte entre KhaaosLUTTextureFactory
//            (geração procedural) e o pipeline de renderização da engine.
//
//            Funcionalidades:
//            - Aplica LUT procedural (via factory) no PostProcessVolume
//            - Configura blending/crossfade entre LUTs de mood
//            - Integra com OutlineRenderer (CustomDepth stencil)
//            - Expõe parâmetros de debug (LUT debug view, split-screen compare)
//            - GPU budget: LUT sample é ~0.1ms em mobile, ~0.02ms desktop
//
//            Integração: estágio POST_PROCESS_SETUP do GraphicsPipelineManager.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Containers/Ticker.h"
#include "Engine/Scene.h"
#include "Engine/Texture.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "Game/Graphics/KhaaosLUTTextureFactory.h"
#include "KhaaosPostProcessLUTMaterial.generated.h"

class APostProcessVolume;
class UMaterialInterface;
class UMaterialInstanceDynamic;

// ─── LUT Material Configuration ───────────────────────────────────────────────

/** Configuração do material PostProcess para LUT. */
USTRUCT(BlueprintType)
struct FKhaaosLUTMaterialConfig
{
    GENERATED_BODY()

    /** Mood ativo (define qual LUT textura usar). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosWorldMood ActiveMood = EKhaaosWorldMood::PadraoBattle;

    /** Intensidade do LUT no blend (0-1). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float LUTBlend = 1.0f;

    /** Se o LUT está ativo. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bLUTEnabled = true;

    /** Tint adicional sobre o LUT. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor AdditionalTint = FLinearColor::White;

    /** Boost de saturação (0-2, 1 = sem mudança). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float AdditionalSaturation = 1.0f;

    /** Se modo de debug (split-screen: sem LUT | com LUT). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bDebugSplitScreen = false;
};

// ─── PostProcess LUT Material Subsystem ────────────────────────────────────────

/**
 * UKhaaosPostProcessLUTMaterial — Material PostProcess para LUT de color grading.
 *
 * Gerencia o material M_KhaaosColorGradeLUT e sua aplicação no PostProcessVolume.
 * Faz a ponte entre:
 *   - UKhaaosLUTTextureFactory → gera textura LUT procedural
 *   - UKhaaosPostProcessDirector → gerencia o PostProcessVolume e mood
 *   - Engine render pipeline → aplica o material no frame
 *
 * O material PostProcess executa após o tonemapper da engine e aplica
 * o LUT de color grading via texture3D sample, com suporte a:
 *   - Crossfade animado entre moods (ticker de blend)
 *   - Intensidade controlável (0 = sem LUT, 1 = LUT full)
 *   - Tint e saturação adicionais sobre o LUT
 *   - Debug split-screen compare
 *
 * Guarda: IsVisualRuntime() — sem PP em dedicated server/headless.
 * Integração: estágio POST_PROCESS_SETUP do GraphicsPipelineManager.
 */
UCLASS()
class KHAAOSRUN_API UKhaaosPostProcessLUTMaterial : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void OnWorldBeginPlay(UWorld& InWorld) override;
    virtual void Deinitialize() override;

    // ─── LUT Material Application ───────────────────────────────────────────

    /** Aplica o material PostProcess de LUT para o mood especificado.
     *  Carrega a textura LUT do factory, cria/configura o MID,
     *  e adiciona ao PostProcessVolume.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT")
    void ApplyLUTMaterial(EKhaaosWorldMood Mood, float BlendTime = 0.8f);

    /** Crossfade animado entre dois moods de LUT. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT")
    void CrossfadeLUTMaterial(EKhaaosWorldMood From, EKhaaosWorldMood To, float Duration = 1.5f);

    /** Remove o material de LUT do PostProcessVolume. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT")
    void RemoveLUTMaterial();

    // ─── Runtime Controls ───────────────────────────────────────────────────

    /** Ajusta a intensidade do LUT em runtime (0-1). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT")
    void SetLUTBlend(float Blend);

    /** Ajusta tint adicional sobre o LUT. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT")
    void SetAdditionalTint(FLinearColor Tint);

    /** Ajusta saturação adicional sobre o LUT. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT")
    void SetAdditionalSaturation(float Saturation);

    // ─── Debug ──────────────────────────────────────────────────────────────

    /** Ativa/desativa split-screen debug (esquerda=sem LUT, direita=com LUT). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessLUT|Debug")
    void SetDebugSplitScreen(bool bEnable);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o subsistema ativo no mundo corrente (null-safe). */
    static UKhaaosPostProcessLUTMaterial* GetActiveForGame();

    /** Config corrente. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessLUT")
    FKhaaosLUTMaterialConfig GetConfig() const { return Config; }

    /** MID do material de LUT (para debug). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessLUT|Debug")
    UMaterialInstanceDynamic* GetLUTMaterialMID() const { return LUTMaterialMID; }

private:
    // ─── Internal ───────────────────────────────────────────────────────────

    /** Encontra ou cria o PostProcessVolume. */
    APostProcessVolume* GetOrCreateVolume(UWorld& InWorld);

    /** Cria o material PostProcess de LUT (MID a partir do material master). */
    UMaterialInstanceDynamic* CreateLUTMaterialMID(UTexture2D* LUTTexture);

    /** Aplica o MID no PostProcessVolume. */
    void ApplyMIDToVolume();

    /** Guarda comuns: false em dedicated server / -NullRHI / editor preview. */
    static bool IsVisualRuntime(const UWorld& World);

    /** Ticker para animação de crossfade. */
    bool TickCrossfade(float DeltaTime);

    // ─── State ──────────────────────────────────────────────────────────────

    /** Config corrente. */
    UPROPERTY(Transient)
    FKhaaosLUTMaterialConfig Config;

    /** PostProcessVolume gerenciado. */
    UPROPERTY(Transient)
    TObjectPtr<APostProcessVolume> ActiveVolume;

    /** MID do material de LUT PostProcess. */
    UPROPERTY(Transient)
    TObjectPtr<UMaterialInstanceDynamic> LUTMaterialMID;

    /** Material master (soft ref ao M_KhaaosColorGradeLUT no Content). */
    UPROPERTY(Transient)
    TObjectPtr<UMaterialInterface> MasterMaterial;

    /** Textura LUT corrente. */
    UPROPERTY(Transient)
    TObjectPtr<UTexture2D> CurrentLUTTexture;

    /** Se o volume foi emprestado do PostProcessDirector. */
    bool bUsingDirectorVolume = false;

    // ─── Crossfade State ────────────────────────────────────────────────────

    /** Se crossfade está em andamento. */
    bool bCrossfading = false;

    /** Mood de destino no crossfade. */
    EKhaaosWorldMood CrossfadeTargetMood = EKhaaosWorldMood::PadraoBattle;

    /** Progresso do crossfade (0-1). */
    float CrossfadeProgress = 0.0f;

    /** Velocidade do crossfade (1/Duration). */
    float CrossfadeSpeed = 1.0f;

    /** Handle do ticker de crossfade. */
    FTSTicker::FDelegateHandle TickerHandle;
};
