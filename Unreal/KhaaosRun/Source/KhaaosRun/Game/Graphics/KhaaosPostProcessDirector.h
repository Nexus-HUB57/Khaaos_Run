// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosPostProcessDirector
// PROPÓSITO: Diretor de pós-processamento REAL (FPostProcessSettings via
//            APostProcessVolume unbounded) — substitui as CVars fake do
//            PostProcessManager por pós-processamento efetivo da engine.
//
//            "Assinatura Khaaos" inspirada no look Free Fire:
//            - Exposição fixa (AEM_Manual) — imagem consistente, sem pop de
//              auto-exposição ao entrar em sombras (padrão mobile)
//            - Tonemapper de alto contraste (FilmSlope/Toe/Shoulder apertados)
//            - Saturação punchy (~1.2x) + tint levemente quente
//            - Bloom suave com threshold alto (só emissivos brilham)
//            - Vignette sutil + film grain zerado + sharpen mobile
//
//            4 moods por mundo: PadraoBattle, NoiteNeon, NebulosaAlien,
//            AmanhecerVenenoso, LowEndLeve — crossfade via BlendWeight.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Containers/Ticker.h"
#include "Engine/Scene.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosPostProcessDirector.generated.h"

class APostProcessVolume;

// ─── World Mood Enumeration ───────────────────────────────────────────────────

/** Mood visual global — define a "cor do mundo" no estilo Free Fire. */
UENUM(BlueprintType)
enum class EKhaaosWorldMood : uint8
{
    PadraoBattle        UMETA(DisplayName = "Padrao Battle (Free Fire Signature)"),
    NoiteNeon           UMETA(DisplayName = "Noite Neon"),
    NebulosaAlien       UMETA(DisplayName = "Nebulosa Alienigena"),
    AmanhecerVenenoso   UMETA(DisplayName = "Amanhecer Venenoso (Barburhen)"),
    LowEndLeve          UMETA(DisplayName = "Low End Leve")
};

// ─── Post Process Recipe ──────────────────────────────────────────────────────

/**
 * Receita de pós-processamento — todos os valores que compõem o look.
 * É um dado puro (sem UObject) para permitir testes de lógica sem world.
 */
USTRUCT(BlueprintType)
struct FKhaaosPostProcessRecipe
{
    GENERATED_BODY()

    // ── Exposição ───────────────────────────────────────────────────────────
    /** Bias de exposição em EV (AEM_Manual — exposição fixa estilo mobile). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "-4.0", ClampMax = "4.0"))
    float ExposureBias = 0.3f;

    /** Limites de exposição quando bFixedExposure = false (modo Histograma). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.1", ClampMax = "10.0"))
    float AutoExposureMinBrightness = 0.7f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.1", ClampMax = "10.0"))
    float AutoExposureMaxBrightness = 1.3f;

    /** true = exposição fixa (AEM_Manual, padrão FF); false = histograma com limites. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bFixedExposure = true;

    // ── Tonemapper (contraste punchy do FF) ─────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float FilmSlope = 0.85f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float FilmToe = 0.30f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float FilmShoulder = 0.22f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float FilmBlackClip = 0.12f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float FilmWhiteClip = 0.22f;

    // ── Color Grading (saturação punchy + tint quente) ──────────────────────
    /** Saturação uniforme por canal RGB (alpha intacto). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float Saturation = 1.22f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float Contrast = 1.08f;

    /** Tint de cor de cena — levemente quente no padrão FF. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor SceneTint = FLinearColor(1.03f, 1.0f, 0.96f);

    /** Temperatura de white balance em Kelvin. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "1700", ClampMax = "20000"))
    float WhiteTemp = 6200.0f;

    // ── Bloom ────────────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "4.0"))
    float BloomIntensity = 0.6f;

    /** Threshold alto — apenas emissivos/pontos quentes geram bloom. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float BloomThreshold = 0.85f;

    /** Qualidade de bloom via CVar r.BloomQuality (0-5). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0", ClampMax = "5"))
    int32 BloomQualityCVar = 3;

    // ── Overlay ──────────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float VignetteIntensity = 0.22f;

    /** Film grain zerado — look limpo mobile. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float FilmGrainIntensity = 0.0f;

    /** Nitidez via CVar r.Tonemapper.Sharpen (0 = off, 1 = máximo). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Sharpen = 0.55f;

    /** Motion blur base (0 = off — padrão mobile competitivo). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float MotionBlurAmount = 0.0f;
};

// ─── Post Process Director Subsystem ─────────────────────────────────────────

/**
 * UKhaaosPostProcessDirector — Diretor de pós-processamento real por mundo.
 *
 * Cria e gerencia um APostProcessVolume unbounded com prioridade máxima,
 * aplica receitas de mood (estilo Free Fire) e expõe overlay por espécie
 * (tint + vignette) para o KhaaosPostProcessManager delegar efeitos de
 * espécie sem CVars fake.
 *
 * Integração: estágio POST_PROCESS_SETUP do GraphicsPipelineManager.
 */
UCLASS()
class KHAAOSRUN_API UKhaaosPostProcessDirector : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void OnWorldBeginPlay(UWorld& InWorld) override;
    virtual void Deinitialize() override;

    // ─── Mood Application ───────────────────────────────────────────────────

    /** Aplica um mood visual com fade via BlendWeight do volume.
     *  @param Mood - Mood desejado
     *  @param BlendTime - Segundos para o volume chegar a BlendWeight=1
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PostProcessDirector")
    void ApplyMood(EKhaaosWorldMood Mood, float BlendTime = 0.8f);

    /** Mapeia nome do mundo para o mood padrão (CIGKV=Padrao, Barburhen=Venenoso,
     *  Priadus=Padrao, Arukheea=NoiteNeon, Ckesalth=Nebulosa). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessDirector")
    static EKhaaosWorldMood AutoMoodForWorld(FName WorldName);

    /** Constrói a receita de pós-processamento para um mood. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessDirector")
    static FKhaaosPostProcessRecipe BuildRecipeForMood(EKhaaosWorldMood Mood);

    // ─── Species Overlay (chamado pelo KhaaosPostProcessManager) ────────────

    /** Aplica tint + vignette overlay de espécie (substitui CVars fake de LUT). */
    static void ApplySpeciesGrade(EKhaaosSpecies Species);

    /** Remove overlay de espécie (volta ao mood puro). */
    static void ClearSpeciesGrade();

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o diretor ativo no mundo de jogo corrente (null-safe). */
    static UKhaaosPostProcessDirector* GetActiveForGame();

    /** Volume de pós-processamento gerenciado (unbounded, prioridade 100). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessDirector")
    APostProcessVolume* GetActiveVolume() const { return ActiveVolume; }

    /** Receita correntemente aplicada. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessDirector")
    FKhaaosPostProcessRecipe GetCurrentRecipe() const { return CurrentRecipe; }

    UFUNCTION(BlueprintPure, Category = "Khaaos|PostProcessDirector")
    EKhaaosWorldMood GetCurrentMood() const { return CurrentMood; }

    // ─── Escrita de Settings (estático p/ testabilidade) ────────────────────

    /** Traduz receita + overlay de espécie para FPostProcessSettings real da engine. */
    static void WriteRecipeToSettings(const FKhaaosPostProcessRecipe& Recipe,
        const FLinearColor& SpeciesTint, float SpeciesVignetteBoost,
        FPostProcessSettings& OutSettings);

    /** Tint de cor por espécie (overlay sutil, não é LUT — multiplica mood). */
    static FLinearColor GetSpeciesTint(EKhaaosSpecies Species);

private:
    /** Cria o volume unbounded no mundo. */
    APostProcessVolume* SpawnVolume(UWorld& InWorld);

    /** Guarda comuns: false em dedicated server / -NullRHI / editor preview. */
    static bool IsVisualRuntime(const UWorld& World);

    /** Aplica o estado corrente (recipe + overlay) ao volume. */
    void RefreshVolumeSettings();

    /** Ticker para rampa de BlendWeight. */
    bool TickBlend(float DeltaTime);

    /** Volume unbounded gerenciado pelo diretor. */
    UPROPERTY(Transient)
    TObjectPtr<APostProcessVolume> ActiveVolume;

    /** Receita corrente (espelho para queries e debug). */
    UPROPERTY(Transient)
    FKhaaosPostProcessRecipe CurrentRecipe;

    /** Mood corrente. */
    UPROPERTY(Transient)
    EKhaaosWorldMood CurrentMood = EKhaaosWorldMood::PadraoBattle;

    /** Overlay de espécie ativo (NONE = sem overlay). */
    EKhaaosSpecies ActiveSpecies = EKhaaosSpecies::NONE;

    /** Tint/vignette overlay de espécie. */
    FLinearColor SpeciesTint = FLinearColor::White;
    float SpeciesVignetteBoost = 0.0f;

    /** Rampa de BlendWeight do volume. */
    float BlendWeightCurrent = 0.0f;
    float BlendWeightTarget = 1.0f;
    float BlendSpeedPerSec = 2.0f;

    /** Handle do ticker de blend. */
    FTSTicker::FDelegateHandle TickerHandle;
};
