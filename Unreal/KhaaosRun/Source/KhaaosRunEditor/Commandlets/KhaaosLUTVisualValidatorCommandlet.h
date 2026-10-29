// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// COMMANDLET: UKhaaosLUTVisualValidatorCommandlet
// PROPÓSITO: Validação VISUAL dos LUTs gerados pelo KhaaosLUTMaterialBuilder —
//            captura em PNG (sem RHI, sampling 100% CPU) para inspeção humana
//            no artifact do CI depois da primeira compilação:
//
//            Por mood (5 no total), salva em <OutputDir> (default Saved/LUTValidation):
//              1. Strip_<Mood>.png        — o strip cru do LUT (Size²×Size)
//              2. Antes_<Mood>.png        — padrão de teste neutro (512×256)
//              3. Depois_<Mood>.png       — padrão de teste graduado PELO LUT
//              4. Comparacao_<Mood>.png   — antes sobre depois (folha de contato)
//
//            Assets validados (gerados pelo KhaaosLUTMaterialBuilder em
//            /Game/Graphics/LUTs/ — fallback: transient da factory):
//              T_KhaaosLUT_PadraoBattle
//              T_KhaaosLUT_NoiteNeon
//              T_KhaaosLUT_NebulosaAlien
//              T_KhaaosLUT_AmanhecerVenenoso
//              T_KhaaosLUT_LowEndLeve
//
//            O sampling usa EXATAMENTE a mesma matemática de UV do material
//            M_KhaaosColorGradeLUT:
//              U = (floor(B*q) * Size + R*q + 0.5) / (Size*Size)
//              V = (G*q + 0.5) / Size            (q = Size - 1)
//            — ou seja, o preview prova que o strip salvo é o strip que o
//            material vai amostrar (mesmo layout, mesmos centros de célula).
//
//            Saída numérica: lut_visual_report.json com deltas médios/máximos
//            por mood (evidência de que o grading altera a imagem) + exit code
//            0 apenas se os 5 moods forem carregados, amostrados e salvos.
//
//            Uso:
//              UnrealEditor-Cmd KhaaosRun.uproject -run=KhaaosLUTVisualValidator
//                  -NullRHI -unattended -nopause -nosplash
//            Flags opcionais:
//              -OutputDir=<path>  (default: Saved/LUTValidation)
//
//            Integração: step "Validate LUTs Visually" no ue5-headless-compile.yml,
//            roda DEPOIS de "Generate LUT + PostProcess Material Assets".
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "KhaaosLUTVisualValidatorCommandlet.generated.h"

UCLASS()
class UKhaaosLUTVisualValidatorCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    virtual int32 Main(const FString& Params) override;

private:
    /** Relatório numérico de um mood (vai para o JSON). */
    struct FMoodValidationReport
    {
        FString MoodName;
        FString AssetPath;
        bool bTextureLoaded = false;
        int32 StripWidth = 0;
        int32 StripHeight = 0;
        float MeanDelta = 0.0f;          // delta médio absoluto (0-255) sobre o padrão
        float MaxDelta = 0.0f;           // delta máximo absoluto (0-255)
        float PctPixelsChanged = 0.0f;   // % de pixels com delta > 2/255
        bool bCapturesSaved = false;
    };

    /** Carrega o LUT de um mood: asset persistentes primeiro, fallback transient da factory. */
    UTexture2D* LoadLUTForMood(EKhaaosWorldMood Mood, FString& OutAssetPath);

    /** Extrai os pixels RGBA8 do mip 0 via Source (dados de origem do editor). */
    bool ExtractStripPixels(UTexture2D* Texture, TArray<uint8>& OutPixels, int32& OutW, int32& OutH);

    /** Gera o padrão de teste neutro 512×256 (hue/sat/gray + swatches de gameplay). */
    static void BuildTestPattern(TArray<FLinearColor>& OutPattern, int32& OutW, int32& OutH);

    /** Amostra o strip com a mesma matemática de UV do material (centro de célula). */
    static FLinearColor SampleLUTStrip(const TArray<uint8>& StripPixels, int32 StripW,
        int32 StripH, int32 LUTSize, const FLinearColor& InputColor);

    /** Converte HSV→RGB (para o padrão de teste). */
    static FLinearColor HSVToLinear(float H, float S, float V);

    /** Salva um array RGBA8 como PNG em disco. */
    static bool SavePNG(const TArray<uint8>& RGBA, int32 W, int32 H, const FString& Filename);

    /** Escreve o relatório JSON agregado dos moods. */
    bool WriteReportJSON(const TArray<FMoodValidationReport>& Reports, const FString& Filename) const;

    // ─── Contadores PASS/FAIL (padrão dos commandlets do projeto) ───────────
    int32 PassCount = 0;
    int32 FailCount = 0;
};
