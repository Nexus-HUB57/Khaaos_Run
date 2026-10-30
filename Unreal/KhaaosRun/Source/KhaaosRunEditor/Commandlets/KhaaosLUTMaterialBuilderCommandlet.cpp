// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosLUTMaterialBuilderCommandlet
// Gera os assets de LUT + PostProcess no Content Browser sem editor interativo:
//   - 5 texturas LUT persistentes (T_KhaaosLUT_*) em /Game/Graphics/LUTs/
//   - Material M_KhaaosColorGradeLUT (MD_PostProcess/Unlit) com grafo completo:
//     SceneColor → UV strip → TextureSample → blend/sat/tint → Emissive
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosLUTMaterialBuilderCommandlet.h"
#include "KhaaosRun.h"
#include "Game/Graphics/KhaaosLUTTextureFactory.h"
#include "Engine/Texture2D.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionSceneTexture.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionSaturate.h"
#include "Materials/MaterialExpressionScalarParameter.h"
#include "Materials/MaterialExpressionVectorParameter.h"
#include "Materials/MaterialExpressionTextureSampleParameter2D.h"
#include "Materials/MaterialExpressionLinearInterpolate.h"
#include "Materials/MaterialExpressionDesaturation.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionAdd.h"
#include "Materials/MaterialExpressionSubtract.h"
#include "Materials/MaterialExpressionDivide.h"
#include "Materials/MaterialExpressionFloor.h"
#include "Materials/MaterialExpressionAppendVector.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionIf.h"
#include "Materials/MaterialExpressionScreenPosition.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetTools/AssetToolsModule.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "UObject/UObjectGlobals.h"
#include "HAL/PlatformFileManager.h"

// ─── Caminhos dos assets gerados (espelham os paths do runtime) ───────────────
static const TCHAR* LUT_PACKAGE_PATH = TEXT("/Game/Graphics/LUTs");
static const TCHAR* MATERIAL_PACKAGE_PATH = TEXT("/Game/Graphics/Materials");
static const TCHAR* MATERIAL_ASSET_NAME = TEXT("M_KhaaosColorGradeLUT");

// ─── Nomes de parâmetros do material (idênticos aos de KhaaosPostProcessLUTMaterial) ──
static const FName BUILDER_PARAM_LUT_TEXTURE(TEXT("LUTTexture"));
static const FName BUILDER_PARAM_LUT_SIZE(TEXT("LUTSize"));
static const FName BUILDER_PARAM_LUT_BLEND(TEXT("LUTBlend"));
static const FName BUILDER_PARAM_ADDITIONAL_TINT(TEXT("AdditionalTint"));
static const FName BUILDER_PARAM_ADDITIONAL_SATURATION(TEXT("AdditionalSaturation"));
static const FName BUILDER_PARAM_DEBUG_SPLIT_SCREEN(TEXT("DebugSplitScreen"));

// ─── Main ──────────────────────────────────────────────────────────────────────

int32 UKhaaosLUTMaterialBuilderCommandlet::Main(const FString& Params)
{
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] Khaaos Run — Geração de assets LUT + PostProcess"));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] Data: %s"), *FDateTime::UtcNow().ToString());
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));

    PassCount = 0;
    FailCount = 0;

    const bool bSkipTextures = Params.Contains(TEXT("SkipTextures"));
    const bool bSkipMaterial = Params.Contains(TEXT("SkipMaterial"));

    // ── Passo 1: Baking das texturas LUT persistentes ────────────────────────
    if (!bSkipTextures)
    {
        if (BakeLUTTexturesToContent())
        {
            ++PassCount;
        }
        else
        {
            ++FailCount;
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA no baking das texturas LUT."));
        }
    }
    else
    {
        UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] -SkipTextures: baking de texturas pulado."));
    }

    // ── Passo 2: Material de PostProcess M_KhaaosColorGradeLUT ───────────────
    if (!bSkipMaterial)
    {
        if (BuildColorGradeLUTMaterial())
        {
            ++PassCount;
        }
        else
        {
            ++FailCount;
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA na construção do material."));
        }
    }
    else
    {
        UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] -SkipMaterial: material pulado."));
    }

    // ── Relatório ────────────────────────────────────────────────────────────
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] Relatório final: %d PASS / %d FAIL"), PassCount, FailCount);
    if (!bSkipTextures)
    {
        UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder]   Texturas LUT: %s (em %s)"),
            (!bSkipTextures && FailCount == 0) ? TEXT("OK") : TEXT("VERIFICAR"),
            LUT_PACKAGE_PATH);
    }
    if (!bSkipMaterial)
    {
        UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder]   Material: %s/%s.%s"),
            MATERIAL_PACKAGE_PATH, MATERIAL_ASSET_NAME, MATERIAL_ASSET_NAME);
    }
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));

    return (FailCount > 0) ? 1 : 0;
}

// ─── Baking de texturas LUT ────────────────────────────────────────────────────

const TCHAR* UKhaaosLUTMaterialBuilderCommandlet::AssetSuffixForMood(EKhaaosWorldMood Mood)
{
    switch (Mood)
    {
    case EKhaaosWorldMood::PadraoBattle:        return TEXT("PadraoBattle");
    case EKhaaosWorldMood::NoiteNeon:           return TEXT("NoiteNeon");
    case EKhaaosWorldMood::NebulosaAlien:       return TEXT("NebulosaAlien");
    case EKhaaosWorldMood::AmanhecerVenenoso:   return TEXT("AmanhecerVenenoso");
    case EKhaaosWorldMood::LowEndLeve:          return TEXT("LowEndLeve");
    default:                                    return TEXT("Unknown");
    }
}

FString UKhaaosLUTMaterialBuilderCommandlet::LUTAssetName(EKhaaosWorldMood Mood)
{
    return FString::Printf(TEXT("T_KhaaosLUT_%s"), AssetSuffixForMood(Mood));
}

UTexture2D* UKhaaosLUTMaterialBuilderCommandlet::BakeLUTAssetForMood(
    EKhaaosWorldMood Mood, const FString& AssetName)
{
    // Obter LUT transient do factory procedural (fonte da verdade das receitas)
    UKhaaosLUTTextureFactory* Factory = GEngine ? GEngine->GetEngineSubsystem<UKhaaosLUTTextureFactory>() : nullptr;
    if (!Factory)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] LUTTextureFactory indisponível — engine não inicializado."));
        return nullptr;
    }

    UTexture2D* TransientLUT = Factory->GetLUTForMood(Mood);
    if (!TransientLUT)
    {
        TransientLUT = Factory->GenerateLUTForMood(Mood);
    }
    if (!TransientLUT)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao gerar LUT transient para %s."),
            *UEnum::GetDisplayValueAsText(Mood).ToString());
        return nullptr;
    }

    // Criar package persistente e duplicar o transient para asset salvável
    const FString PackageName = FString::Printf(TEXT("%s/%s"), LUT_PACKAGE_PATH, *AssetName);
    UPackage* Package = CreatePackage(*PackageName);
    if (!Package)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao criar package %s."), *PackageName);
        return nullptr;
    }
    Package->FullyLoad();

    UTexture2D* AssetTexture = StaticDuplicateObject(TransientLUT, Package, FName(*AssetName),
        RF_Public | RF_Standalone);
    if (!AssetTexture)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao duplicar textura para %s."), *PackageName);
        return nullptr;
    }

    // Configurações de LUT persistentes (sem compressão — valores exatos do grading;
    // sem mips — o strip não pode ser mipado senão o sample sai do tile correto)
    AssetTexture->NeverStream = true;
    AssetTexture->SRGB = false;                       // LUT é dado linear
    AssetTexture->CompressionNone = true;             // RGBA8 sem lossy
    AssetTexture->MipGenSettings = TMGS_NoMipmaps;
    AssetTexture->Filter = TF_Bilinear;               // interpolação entre células
    AssetTexture->AddressX = TA_Clamp;
    AssetTexture->AddressY = TA_Clamp;
    AssetTexture->LODGroup = TEXTUREGROUP_ColorLookupTable;
    AssetTexture->PostEditChange();

    // Registrar no Asset Registry e salvar em disco (.uasset no Content Browser)
    FAssetRegistryModule::AssetCreated(AssetTexture);

    FSavePackageArgs SaveArgs;
    SaveArgs.TopLevelFlags = RF_Public | RF_Standalone;
    SaveArgs.Error = GError;
    const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
    const bool bSaved = UPackage::SavePackage(Package, AssetTexture, *Filename, SaveArgs);

    if (!bSaved)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao salvar %s."), *Filename);
        return nullptr;
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] LUT salvo: %s (%dx%d)"), 
        *Filename, AssetTexture->GetSizeX(), AssetTexture->GetSizeY());
    return AssetTexture;
}

bool UKhaaosLUTMaterialBuilderCommandlet::BakeLUTTexturesToContent()
{
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] === Baking das 5 texturas LUT ==="));

    // Garantir que o diretório de destino exista no disco
    const FString ContentDir = FPackageName::LongPackageNameToFilename(LUT_PACKAGE_PATH, TEXT("/"));
    IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
    if (!PlatformFile.DirectoryExists(*ContentDir))
    {
        PlatformFile.CreateDirectoryTree(*ContentDir);
    }

    bool bAllOk = true;
    for (uint8 MoodInt = 0; MoodInt <= static_cast<uint8>(EKhaaosWorldMood::LowEndLeve); ++MoodInt)
    {
        const EKhaaosWorldMood Mood = static_cast<EKhaaosWorldMood>(MoodInt);
        const FString AssetName = LUTAssetName(Mood);

        UTexture2D* Baked = BakeLUTAssetForMood(Mood, AssetName);
        if (Baked)
        {
            UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder]   ✔ %s (mood %s)"),
                *AssetName, *UEnum::GetDisplayValueAsText(Mood).ToString());
        }
        else
        {
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder]   ✘ %s (mood %s)"),
                *AssetName, *UEnum::GetDisplayValueAsText(Mood).ToString());
            bAllOk = false;
        }
    }

    return bAllOk;
}

// ─── Construção do grafo do material ───────────────────────────────────────────

namespace
{
    /** Helper: cria um nó de expressão, posiciona no editor e adiciona à coleção do material. */
    template <typename T>
    T* NewNode(UMaterial* Material, const int32 X, const int32 Y)
    {
        T* Node = NewObject<T>(Material);
        Node->MaterialExpressionEditorX = X;
        Node->MaterialExpressionEditorY = Y;
        Material->GetExpressionCollection().AddExpression(Node);
        return Node;
    }

    /** Helper: constante float. */
    UMaterialExpressionConstant* NewConstant(UMaterial* Material, const float Value, const int32 X, const int32 Y)
    {
        UMaterialExpressionConstant* Node = NewNode<UMaterialExpressionConstant>(Material, X, Y);
        Node->R = Value;
        return Node;
    }
}

bool UKhaaosLUTMaterialBuilderCommandlet::BuildColorGradeLUTMaterial()
{
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] === Material M_KhaaosColorGradeLUT ==="));

    // Textura LUT padrão do parâmetro (PadraoBattle — assinatura Free Fire)
    const FString DefaultLUTPath = FString::Printf(TEXT("%s/T_KhaaosLUT_PadraoBattle.T_KhaaosLUT_PadraoBattle"), LUT_PACKAGE_PATH);
    UTexture2D* DefaultLUT = Cast<UTexture2D>(StaticLoadObject(UTexture2D::StaticClass(), nullptr, *DefaultLUTPath));
    if (!DefaultLUT)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[LUTMaterialBuilder] T_KhaaosLUT_PadraoBattle não encontrado (%s) — material será criado com slot de textura vazio. Rode o builder sem -SkipTextures antes."), *DefaultLUTPath);
    }

    // Package persistente + material
    const FString PackageName = FString::Printf(TEXT("%s/%s"), MATERIAL_PACKAGE_PATH, MATERIAL_ASSET_NAME);
    UPackage* Package = CreatePackage(*PackageName);
    if (!Package)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao criar package %s."), *PackageName);
        return false;
    }
    Package->FullyLoad();

    UMaterial* Material = NewObject<UMaterial>(Package, FName(MATERIAL_ASSET_NAME), RF_Public | RF_Standalone);
    if (!Material)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao criar UMaterial."));
        return false;
    }

    Material->MaterialDomain = MD_PostProcess;          // domínio PostProcess — shading model exibido: Unlit
    Material->BlendableLocation = BL_AfterTonemapping;  // LUT aplica sobre a imagem final (padrão de color grading)

    // ═══ Grafo de nós ═══════════════════════════════════════════════════════
    // Layout em colunas (X avança 180-220 por estágio) para leitura no editor.

    // ── Coluna 1: SceneColor ─────────────────────────────────────────────────
    UMaterialExpressionSceneTexture* SceneTex = NewNode<UMaterialExpressionSceneTexture>(Material, -1600, 0);
    SceneTex->SceneTextureId = PPI_PostProcessInput0;

    UMaterialExpressionComponentMask* MaskRGB = NewNode<UMaterialExpressionComponentMask>(Material, -1380, 0);
    MaskRGB->R = true;
    MaskRGB->G = true;
    MaskRGB->B = true;
    MaskRGB->A = false;
    MaskRGB->Input.Connect(0, SceneTex);

    UMaterialExpressionSaturate* Clamped = NewNode<UMaterialExpressionSaturate>(Material, -1200, 0);
    Clamped->Input.Connect(0, MaskRGB);

    // ── Coluna 2: separação de canais + LUTSize ─────────────────────────────
    UMaterialExpressionComponentMask* MaskR = NewNode<UMaterialExpressionComponentMask>(Material, -1020, 160);
    MaskR->R = true; MaskR->G = false; MaskR->B = false; MaskR->A = false;
    MaskR->Input.Connect(0, Clamped);

    UMaterialExpressionComponentMask* MaskG = NewNode<UMaterialExpressionComponentMask>(Material, -1020, 320);
    MaskG->R = false; MaskG->G = true; MaskG->B = false; MaskG->A = false;
    MaskG->Input.Connect(0, Clamped);

    UMaterialExpressionComponentMask* MaskB = NewNode<UMaterialExpressionComponentMask>(Material, -1020, 480);
    MaskB->R = false; MaskB->G = false; MaskB->B = true; MaskB->A = false;
    MaskB->Input.Connect(0, Clamped);

    UMaterialExpressionScalarParameter* LUTSizeParam = NewNode<UMaterialExpressionScalarParameter>(Material, -1020, 680);
    LUTSizeParam->ParameterName = BUILDER_PARAM_LUT_SIZE;
    LUTSizeParam->DefaultValue = 32.0f;

    UMaterialExpressionConstant* ConstOne = NewConstant(Material, 1.0f, -1020, 840);

    // ── Coluna 3: q = LUTSize - 1 ────────────────────────────────────────────
    UMaterialExpressionSubtract* SubQ = NewNode<UMaterialExpressionSubtract>(Material, -820, 700);
    SubQ->A.Connect(0, LUTSizeParam);
    SubQ->B.Connect(0, ConstOne);

    // ── Coluna 4: decomposição do UV do strip LUT ───────────────────────────
    // U = (floor(B*q) * Size + R*q + 0.5) / (Size*Size)
    // V = (G*q + 0.5) / Size
    UMaterialExpressionMultiply* MulBQ = NewNode<UMaterialExpressionMultiply>(Material, -620, 480);
    MulBQ->A.Connect(0, MaskB);
    MulBQ->B.Connect(0, SubQ);

    UMaterialExpressionFloor* FloorSlice = NewNode<UMaterialExpressionFloor>(Material, -440, 480);
    FloorSlice->Input.Connect(0, MulBQ);

    UMaterialExpressionMultiply* MulSliceOff = NewNode<UMaterialExpressionMultiply>(Material, -260, 480);
    MulSliceOff->A.Connect(0, FloorSlice);
    MulSliceOff->B.Connect(0, LUTSizeParam);

    UMaterialExpressionMultiply* MulRQ = NewNode<UMaterialExpressionMultiply>(Material, -620, 160);
    MulRQ->A.Connect(0, MaskR);
    MulRQ->B.Connect(0, SubQ);

    UMaterialExpressionAdd* AddR = NewNode<UMaterialExpressionAdd>(Material, -60, 320);
    AddR->A.Connect(0, MulSliceOff);
    AddR->B.Connect(0, MulRQ);

    UMaterialExpressionConstant* ConstHalf = NewConstant(Material, 0.5f, -620, 820);

    UMaterialExpressionAdd* AddHalfU = NewNode<UMaterialExpressionAdd>(Material, 120, 320);
    AddHalfU->A.Connect(0, AddR);
    AddHalfU->B.Connect(0, ConstHalf);

    UMaterialExpressionMultiply* MulLL = NewNode<UMaterialExpressionMultiply>(Material, -820, 900);
    MulLL->A.Connect(0, LUTSizeParam);
    MulLL->B.Connect(0, LUTSizeParam);

    UMaterialExpressionDivide* DivU = NewNode<UMaterialExpressionDivide>(Material, 300, 320);
    DivU->A.Connect(0, AddHalfU);
    DivU->B.Connect(0, MulLL);

    UMaterialExpressionMultiply* MulGQ = NewNode<UMaterialExpressionMultiply>(Material, -620, 320);
    MulGQ->A.Connect(0, MaskG);
    MulGQ->B.Connect(0, SubQ);

    UMaterialExpressionAdd* AddGHalf = NewNode<UMaterialExpressionAdd>(Material, -60, 560);
    AddGHalf->A.Connect(0, MulGQ);
    AddGHalf->B.Connect(0, ConstHalf);

    UMaterialExpressionDivide* DivV = NewNode<UMaterialExpressionDivide>(Material, 300, 560);
    DivV->A.Connect(0, AddGHalf);
    DivV->B.Connect(0, LUTSizeParam);

    UMaterialExpressionAppendVector* AppendUV = NewNode<UMaterialExpressionAppendVector>(Material, 480, 440);
    AppendUV->A.Connect(0, DivU);
    AppendUV->B.Connect(0, DivV);

    // ── Sample do LUT ────────────────────────────────────────────────────────
    UMaterialExpressionTextureSampleParameter2D* LUTSample = NewNode<UMaterialExpressionTextureSampleParameter2D>(Material, 660, 360);
    LUTSample->ParameterName = BUILDER_PARAM_LUT_TEXTURE;
    LUTSample->Texture = DefaultLUT;
    LUTSample->Coordinates.Connect(0, AppendUV);

    UMaterialExpressionComponentMask* MaskLUTRGB = NewNode<UMaterialExpressionComponentMask>(Material, 880, 360);
    MaskLUTRGB->R = true; MaskLUTRGB->G = true; MaskLUTRGB->B = true; MaskLUTRGB->A = false;
    MaskLUTRGB->Input.Connect(0, LUTSample);

    UMaterialExpressionScalarParameter* LUTBlendParam = NewNode<UMaterialExpressionScalarParameter>(Material, 660, 660);
    LUTBlendParam->ParameterName = BUILDER_PARAM_LUT_BLEND;
    LUTBlendParam->DefaultValue = 1.0f;

    // ── Lerp(Clamped, LUT, LUTBlend) → Graded ───────────────────────────────
    UMaterialExpressionLinearInterpolate* LerpBlend = NewNode<UMaterialExpressionLinearInterpolate>(Material, 1060, 240);
    LerpBlend->A.Connect(0, Clamped);
    LerpBlend->B.Connect(0, MaskLUTRGB);
    LerpBlend->Alpha.Connect(0, LUTBlendParam);

    // ── Boost de saturação adicional (AdditionalSaturation) ─────────────────
    UMaterialExpressionDesaturation* Desat = NewNode<UMaterialExpressionDesaturation>(Material, 1060, 560);
    Desat->Input.Connect(0, LerpBlend);

    UMaterialExpressionScalarParameter* AddSatParam = NewNode<UMaterialExpressionScalarParameter>(Material, 1060, 760);
    AddSatParam->ParameterName = BUILDER_PARAM_ADDITIONAL_SATURATION;
    AddSatParam->DefaultValue = 1.0f;

    UMaterialExpressionLinearInterpolate* LerpSat = NewNode<UMaterialExpressionLinearInterpolate>(Material, 1260, 480);
    LerpSat->A.Connect(0, Desat);
    LerpSat->B.Connect(0, LerpBlend);
    LerpSat->Alpha.Connect(0, AddSatParam);

    // ── Tint multiplicativo (AdditionalTint) ────────────────────────────────
    UMaterialExpressionVectorParameter* TintParam = NewNode<UMaterialExpressionVectorParameter>(Material, 1060, 940);
    TintParam->ParameterName = BUILDER_PARAM_ADDITIONAL_TINT;
    TintParam->DefaultValue = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

    UMaterialExpressionComponentMask* MaskTintRGB = NewNode<UMaterialExpressionComponentMask>(Material, 1260, 940);
    MaskTintRGB->R = true; MaskTintRGB->G = true; MaskTintRGB->B = true; MaskTintRGB->A = false;
    MaskTintRGB->Input.Connect(4, TintParam);   // saída RGB do VectorParameter (índice 4)

    UMaterialExpressionMultiply* MulTint = NewNode<UMaterialExpressionMultiply>(Material, 1440, 620);
    MulTint->A.Connect(0, LerpSat);
    MulTint->B.Connect(0, MaskTintRGB);

    // ── Debug split-screen (esquerda = raw, direita = graded) ───────────────
    UMaterialExpressionScreenPosition* ScreenPos = NewNode<UMaterialExpressionScreenPosition>(Material, 1060, 1180);

    UMaterialExpressionComponentMask* MaskScreenX = NewNode<UMaterialExpressionComponentMask>(Material, 1260, 1180);
    MaskScreenX->R = true; MaskScreenX->G = false; MaskScreenX->B = false; MaskScreenX->A = false;
    MaskScreenX->Input.Connect(0, ScreenPos);

    UMaterialExpressionScalarParameter* DebugParam = NewNode<UMaterialExpressionScalarParameter>(Material, 1060, 1340);
    DebugParam->ParameterName = BUILDER_PARAM_DEBUG_SPLIT_SCREEN;
    DebugParam->DefaultValue = 0.0f;

    // Threshold = lerp(-0.5, 0.5, Debug):
    //   Debug=0 → -0.5  → ScreenX < -0.5 nunca  → If=0 → sempre GRADED (LUT ativo)
    //   Debug=1 → +0.5  → ScreenX < +0.5 na metade esquerda → RAW (sem LUT)
    UMaterialExpressionConstant* ConstNegHalf = NewConstant(Material, -0.5f, 1060, 1500);
    UMaterialExpressionConstant* ConstHalf2 = NewConstant(Material, 0.5f, 1060, 1600);

    UMaterialExpressionLinearInterpolate* LerpThreshold = NewNode<UMaterialExpressionLinearInterpolate>(Material, 1440, 1400);
    LerpThreshold->A.Connect(0, ConstNegHalf);
    LerpThreshold->B.Connect(0, ConstHalf2);
    LerpThreshold->Alpha.Connect(0, DebugParam);

    UMaterialExpressionConstant* ConstOne2 = NewConstant(Material, 1.0f, 1440, 1560);
    UMaterialExpressionConstant* ConstZero = NewConstant(Material, 0.0f, 1440, 1660);

    UMaterialExpressionIf* IfSplit = NewNode<UMaterialExpressionIf>(Material, 1620, 1180);
    IfSplit->A.Connect(0, MaskScreenX);
    IfSplit->B.Connect(0, LerpThreshold);
    IfSplit->ALessThanB.Connect(0, ConstOne2);      // metade esquerda em modo debug = raw
    IfSplit->AGreaterThanB.Connect(0, ConstZero);
    IfSplit->AEqualsB.Connect(0, ConstZero);

    UMaterialExpressionLinearInterpolate* LerpFinal = NewNode<UMaterialExpressionLinearInterpolate>(Material, 1820, 800);
    LerpFinal->A.Connect(0, MulTint);               // graded (com LUT)
    LerpFinal->B.Connect(0, Clamped);               // raw (sem LUT)
    LerpFinal->Alpha.Connect(0, IfSplit);

    // ── Saída: EmissiveColor (a saída de um material PostProcess/Unlit) ─────
    Material->EmissiveColor.Connect(0, LerpFinal);

    // ═══ Compilação + registro + save ═══════════════════════════════════════
    Material->PreEditChange(nullptr);
    Material->PostEditChange();

    FAssetRegistryModule::AssetCreated(Material);

    FSavePackageArgs SaveArgs;
    SaveArgs.TopLevelFlags = RF_Public | RF_Standalone;
    SaveArgs.Error = GError;
    const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
    const bool bSaved = UPackage::SavePackage(Package, Material, *Filename, SaveArgs);

    if (!bSaved)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTMaterialBuilder] FALHA ao salvar %s."), *Filename);
        return false;
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder] Material salvo: %s"), *Filename);
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder]   Domínio: PostProcess (Unlit) | Blendable: AfterTonemapping"));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTMaterialBuilder]   Parâmetros: LUTTexture, LUTSize, LUTBlend, AdditionalTint, AdditionalSaturation, DebugSplitScreen"));
    return true;
}
