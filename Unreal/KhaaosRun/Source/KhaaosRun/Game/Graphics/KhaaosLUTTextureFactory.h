// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosLUTTextureFactory
// PROPÓSITO: Geração procedural de texturas 3D LUT (Color Lookup Tables) em runtime.
//            Substitui a necessidade de .uasset LUT manual no Content Browser por
//            LUTs geradas programaticamente com base em receitas de color grading.
//
//            5 LUTs por mood (alinhado com KhaaosColorGradeLUTDirector):
//            - PadraoBattle: LUT quente/saturado (assinatura Free Fire)
//            - NoiteNeon: LUT frio azul-neon, contraste alto
//            - NebulosaAlien: LUT violeta alienígena, desaturação parcial
//            - AmanhecerVenenoso: LUT ácido amarelo-esverdeado tóxico
//            - LowEndLeve: LUT neutro (grading mínimo para hardware fraco)
//
//            Geração via UTexture2D (strip layout 32²×32 slices) que o
//            ColorGradingLUT da engine consome nativamente.
//
//            Integração: estágio LUT_COLOR_GRADE do GraphicsPipelineManager.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Engine/Texture.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "KhaaosLUTTextureFactory.generated.h"

// ─── LUT Recipe ───────────────────────────────────────────────────────────────

/** Receita para geração procedural de LUT de color grading. */
USTRUCT(BlueprintType)
struct FKhaaosLUTRecipe
{
    GENERATED_BODY()

    /** Tamanho do LUT (32 = padrão mobile, 65 = alta qualidade desktop). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "16", ClampMax = "65"))
    int32 LUTSize = 32;

    // ── Lift/Gamma/Gain (shadows / midtones / highlights) ──────────────────
    /** Lift (shadows) — deslocamento de cor nas sombras. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Lift = FLinearColor(0.0f, 0.0f, 0.0f, 0.0f);

    /** Gamma (midtones) — curva de tons médios. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Gamma = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

    /** Gain (highlights) — multiplicador de realces. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Gain = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

    // ── Offset/Power/Slope (offset → lift, power → gamma, slope → gain) ────
    /** Offset (aditivo global). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Offset = FLinearColor(0.0f, 0.0f, 0.0f, 0.0f);

    /** Power (gamma correction per channel). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Power = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

    /** Slope (multiplicador linear per channel). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Slope = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

    // ── Saturação e Contraste ───────────────────────────────────────────────
    /** Saturação global (0=grayscale, 1=normal, 2=oversaturado). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float Saturation = 1.0f;

    /** Contraste (0.5=flat, 1.0=normal, 2.0=high). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.5", ClampMax = "2.0"))
    float Contrast = 1.0f;

    // ── Tint de temperatura ─────────────────────────────────────────────────
    /** Tint de cor multiplicativo sobre o resultado. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor Tint = FLinearColor::White;

    /** Temperatura de white balance em Kelvin (1700-20000). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "1700", ClampMax = "20000"))
    float WhiteBalanceTemp = 6500.0f;

    // ── Curva S (S-Curve contrast) ──────────────────────────────────────────
    /** Intensidade da curva S (0=linear, 1=forte S-curve). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float SCurveIntensity = 0.0f;

    /** Ponto médio da curva S (0-1). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float SCurveMidpoint = 0.5f;
};

// ─── LUT Texture Factory Subsystem ────────────────────────────────────────────

/**
 * UKhaaosLUTTextureFactory — Fábrica procedural de LUTs 3D em runtime.
 *
 * Gera texturas UTexture2D no formato strip (LUTSize² × LUTSize slices)
 * que o ColorGradingLUT do PostProcessVolume consome nativamente no UE5.
 *
 * Benefícios vs .uasset manual:
 *   - Zero dependência de Content Browser — LUTs criados em Initialize()
 *   - Parametrização por receita (Lift/Gamma/Gain + Sat/Contrast + S-Curve)
 *   - Hot-reload sem restart — trocar receita → regenerar LUT
 *   - Tamanho adaptativo (32 mobile / 65 desktop) por QualityPreset
 *
 * Integração: estágio LUT_COLOR_GRADE do GraphicsPipelineManager.
 */
UCLASS()
class KHAAOSRUN_API UKhaaosLUTTextureFactory : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize(FSubsystemCollectionBase& Collection) override;

    // ─── LUT Generation ─────────────────────────────────────────────────────

    /** Gera o LUT procedural para um mood e retorna a textura criada. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|LUTFactory")
    UTexture2D* GenerateLUTForMood(EKhaaosWorldMood Mood);

    /** Gera um LUT a partir de uma receita customizada. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|LUTFactory")
    UTexture2D* GenerateLUTFromRecipe(const FKhaaosLUTRecipe& Recipe, const FString& DebugName = TEXT("Custom"));

    /** Constrói a receita de LUT hardcoded para um mood. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|LUTFactory")
    static FKhaaosLUTRecipe BuildRecipeForMood(EKhaaosWorldMood Mood);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Retorna o LUT gerado para um mood (null se não gerado ainda). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|LUTFactory")
    UTexture2D* GetLUTForMood(EKhaaosWorldMood Mood) const;

    /** Se o LUT para um mood já foi gerado. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|LUTFactory")
    bool HasLUTForMood(EKhaaosWorldMood Mood) const;

    /** Receita usada para o último LUT gerado de um mood. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|LUTFactory")
    FKhaaosLUTRecipe GetRecipeForMood(EKhaaosWorldMood Mood) const;

    // ─── Hot Reload ─────────────────────────────────────────────────────────

    /** Regenera todos os LUTs (para hot-reload de receitas sem restart). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|LUTFactory")
    void RegenerateAllLUTs();

private:
    // ─── Core Generation ────────────────────────────────────────────────────

    /** Gera pixels do LUT (RGBA8) a partir da receita.
     *  Formato: strip layout (LUTSize² × LUTSize slices, horizontal).
     *  Total pixels = LUTSize³, cada pixel = 4 bytes (RGBA).
     */
    void GenerateLUTPixels(const FKhaaosLUTRecipe& Recipe, TArray<uint8>& OutPixels) const;

    /** Cria UTexture2D a partir dos pixels gerados. */
    UTexture2D* CreateTextureFromPixels(const TArray<uint8>& Pixels, int32 LUTSize, const FString& TextureName) const;

    /** Aplica a transformação de color grading em um único pixel RGB. */
    void ApplyColorGrade(float& R, float& G, float& B, const FKhaaosLUTRecipe& Recipe) const;

    /** Aplica curva S (S-Curve contrast). */
    static float ApplySCurve(float Value, float Intensity, float Midpoint);

    /** Aplica saturação (luminance-preserving). */
    static void ApplySaturation(float& R, float& G, float& B, float Saturation3);

    /** Aplica white balance por temperatura de cor. */
    static void ApplyWhiteBalance(float& R, float& G, float& B, float TemperatureKelvin);

    // ─── State ──────────────────────────────────────────────────────────────

    /** LUTs gerados indexados por mood. */
    UPROPERTY(Transient)
    TMap<uint8, TObjectPtr<UTexture2D>> GeneratedLUTs;

    /** Receitas usadas indexadas por mood. */
    TMap<uint8, FKhaaosLUTRecipe> UsedRecipes;
};
