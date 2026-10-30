// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosPostProcessManager
// PROPÓSITO: Gerenciamento de efeitos de pós-processamento por espécie com
//            blending suave, prioridade de camera effects, e otimizações de
//            GPU cost. Cada espécie tem efeitos visuais característicos:
//            - Huran: underwater distortion, caustics, bioluminescent bloom
//            - Khael: arcane glow bloom, crystal refraction, rune pulse
//            - Venex: cyber-hologram scanlines, chrome reflections, EMP flash
//            - Onith: thermal shimmer, chitin iridescence, predatory vision
//            - Zheers: spirit trail ghosting, tattoo glow, shadow meld
//            - Skeetw: feather iridescence, avian motion blur, wind distortion
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosPostProcessManager.generated.h"

UENUM(BlueprintType)
enum class EKhaaosPostEffectType : uint8
{
    Bloom,              // Glow/bloom para emissive e bioluminescência
    ChromaticAberration,// Distorção cromática (Venex implants, Khael crystals)
    DepthOfField,       // DoF para highlight de personagem
    Distortion,         // Distorção de tela (Huran underwater, Skeetw wind)
    MotionBlur,         // Motion blur species-specific
    ColorGrading,       // LUT/grading por espécie (Onith thermal, Venex cyber)
    Vignette,           // Vignette para emphasis emocional
    ScreenFade,         // Fade in/out para transições
    CustomMaterial      // Post-process material customizado
};

USTRUCT(BlueprintType)
struct FKhaaosPostEffectEntry
{
    GENERATED_BODY()

    /** Tipo do efeito */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosPostEffectType EffectType = EKhaaosPostEffectType::Bloom;

    /** Espécie que ativa este efeito */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    /** Intensidade do efeito (0.0-1.0) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Intensity = 1.0f;

    /** Tempo de fade in em segundos */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "5.0"))
    float FadeInTime = 0.5f;

    /** Tempo de fade out em segundos */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "5.0"))
    float FadeOutTime = 1.0f;

    /** Custo estimado em ms de GPU time */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float EstimatedGPUTimeMs = 0.5f;

    /** Prioridade (maior = mais importante, não é cortado primeiro) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 Priority = 0;

    /** Se true, efeito é global (não por operative) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bIsGlobal = false;
};

USTRUCT(BlueprintType)
struct FKhaaosSpeciesPostProfile
{
    GENERATED_BODY()

    /** Espécie */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    /** Efeitos ativos para esta espécie */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<FKhaaosPostEffectEntry> Effects;

    /** Custo total de GPU time estimado */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float TotalGPUTimeMs = 0.0f;
};

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosPostProcessManager : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Ativa efeitos de pós-processamento para uma espécie */
    void ActivateSpeciesEffects(EKhaaosSpecies Species, float BlendTime = 0.5f);

    /** Desativa efeitos de uma espécie */
    void DeactivateSpeciesEffects(EKhaaosSpecies Species, float BlendTime = 1.0f);

    /** Ativa um efeito global (não atrelado a espécie) */
    void ActivateGlobalEffect(EKhaaosPostEffectType EffectType, float Intensity, float Duration = 0.0f);

    /** Tick principal — atualiza fades e blending */
    void UpdatePostProcess(float DeltaTime);

    /** Obtém o perfil de pós-processamento ativo para uma espécie */
    const FKhaaosSpeciesPostProfile* GetSpeciesProfile(EKhaaosSpecies Species) const;

    /** Obtém custo total de GPU time dos efeitos ativos */
    float GetActiveGPUTimeMs() const { return ActiveGPUTimeMs; }

    /** Otimiza efeitos quando GPU está sobrecarregada — corta efeitos de baixa prioridade */
    void OptimizeForBudget(float TargetGPUTimeMs);

    /** Verifica se um efeito está ativo para uma espécie */
    bool IsEffectActive(EKhaaosSpecies Species, EKhaaosPostEffectType EffectType) const;

    /** Debug: lista efeitos ativos */
    void DumpActiveEffects() const;

protected:
    /** Constrói perfil de pós-processamento para cada espécie */
    FKhaaosSpeciesPostProfile BuildSpeciesPostProfile(EKhaaosSpecies Species) const;

    /** Aplica um efeito ao post process volume */
    void ApplyEffectToPostProcessVolume(const FKhaaosPostEffectEntry& Effect, float CurrentIntensity);

private:
    /** Perfis por espécie */
    TMap<EKhaaosSpecies, FKhaaosSpeciesPostProfile> SpeciesProfiles;

    /** Efeitos atualmente ativos com intensidade corrente (para blending) */
    TMap<FName, float> ActiveEffectIntensities;

    /** Fade timers para efeitos em transição */
    TMap<FName, float> EffectFadeTimers;

    /** Efeitos ativos ( Species + Type → entry key ) */
    TMap<FName, FKhaaosPostEffectEntry> ActiveEffects;

    /** Custo total ativo em ms */
    float ActiveGPUTimeMs = 0.0f;

    /** Gera chave única para efeito */
    static FName MakeEffectKey(EKhaaosSpecies Species, EKhaaosPostEffectType Type);
};
