// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// COMMANDLET: UKhaaosLUTMaterialBuilderCommandlet
// PROPÓSITO: Gera programaticamente os assets de LUT + PostProcess no Content
//            Browser, sem precisar montar nada à mão no editor:
//
//            1. Baking das 5 texturas LUT persistentes (strip 32²×32):
//               /Game/Graphics/LUTs/T_KhaaosLUT_PadraoBattle
//               /Game/Graphics/LUTs/T_KhaaosLUT_NoiteNeon
//               /Game/Graphics/LUTs/T_KhaaosLUT_NebulosaAlien
//               /Game/Graphics/LUTs/T_KhaaosLUT_AmanhecerVenenoso
//               /Game/Graphics/LUTs/T_KhaaosLUT_LowEndLeve
//
//            2. Material de PostProcess M_KhaaosColorGradeLUT em
//               /Game/Graphics/Materials/M_KhaaosColorGradeLUT — grafo:
//               SceneTexture(PostProcessInput0) → ComponentMask RGB → Saturate
//               → matemática de UV do strip LUT → TextureSample("LUTTexture")
//               → Lerp(LUTBlend) → boost de saturação → tint → debug split-
//               screen → EmissiveColor. Domínio MD_PostProcess (shading model
//               Unlit — o modo correto para material de post-process), com
//               BlendableLocation AfterTonemapping.
//
//            Os parâmetros do material são exatamente os que
//            UKhaaosPostProcessLUTMaterial define em runtime:
//               LUTTexture (Texture2D), LUTSize, LUTBlend, AdditionalTint
//               (Vector), AdditionalSaturation, DebugSplitScreen (Scalar).
//
//            Uso:
//              UnrealEditor-Cmd.exe KhaaosRun.uproject -run=KhaaosLUTMaterialBuilder
//                  -NullRHI -unattended -nopause -nosplash
//
//            Flags opcionais:
//              -SkipTextures  (pula o baking das texturas LUT)
//              -SkipMaterial  (pula o material de PostProcess)
//
//            Integração: gera os assets consumidos pelo estágio
//            POST_PROCESS_SETUP do GraphicsPipelineManager.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "KhaaosLUTMaterialBuilderCommandlet.generated.h"

UCLASS()
class UKhaaosLUTMaterialBuilderCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    virtual int32 Main(const FString& Params) override;

private:
    /** Baking das 5 texturas LUT persistentes em /Game/Graphics/LUTs/. */
    bool BakeLUTTexturesToContent();

    /** Constrói e salva o material M_KhaaosColorGradeLUT em /Game/Graphics/Materials/. */
    bool BuildColorGradeLUTMaterial();

    /** Baking de uma textura LUT individual (duplicate transient → asset persistente). */
    UTexture2D* BakeLUTAssetForMood(EKhaaosWorldMood Mood, const FString& AssetName);

    /** Nome de asset (sem prefixo) para cada mood — determinístico, sem espaços. */
    static const TCHAR* AssetSuffixForMood(EKhaaosWorldMood Mood);

    /** Helper: nome completo do asset LUT (T_KhaaosLUT_<Suffix>). */
    static FString LUTAssetName(EKhaaosWorldMood Mood);

    // ─── Contadores PASS/FAIL (padrão dos commandlets do projeto) ───────────
    int32 PassCount = 0;
    int32 FailCount = 0;
};
