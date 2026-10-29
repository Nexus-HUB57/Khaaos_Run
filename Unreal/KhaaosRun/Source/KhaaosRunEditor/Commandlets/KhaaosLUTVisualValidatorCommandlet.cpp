// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosLUTVisualValidatorCommandlet
// Validação visual dos LUTs com captura PNG headless (sem RHI, sampling CPU):
//   Strip/Antes/Depois/Comparacao por mood + relatório JSON numérico.
// O sampling replica EXATAMENTE a matemática de UV do material
// M_KhaaosColorGradeLUT — o preview é o strip que o material vai amostrar.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosLUTVisualValidatorCommandlet.h"
#include "KhaaosRun.h"
#include "Game/Graphics/KhaaosLUTTextureFactory.h"
#include "Engine/Texture2D.h"
#include "TextureSource.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Modules/ModuleManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/PlatformFileManager.h"
#include "Containers/UnrealString.h"

// ─── Caminhos dos assets (idênticos aos do KhaaosLUTMaterialBuilder) ──────────
static const TCHAR* VALIDATOR_LUT_PACKAGE_PATH = TEXT("/Game/Graphics/LUTs");

// ─── Dimensões do padrão de teste (512×256, 4 bandas de 64px) ─────────────────
static constexpr int32 PATTERN_W = 512;
static constexpr int32 PATTERN_H = 256;
static constexpr int32 BAND_H = 64;
static constexpr int32 SEPARATOR_H = 4;

// ─── Sufixo de asset por mood (espelha KhaaosLUTMaterialBuilderCommandlet) ────
static const TCHAR* ValidatorSuffixForMood(EKhaaosWorldMood Mood)
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

// ─── Swatches de gameplay (banda 4 — cores que o jogo de fato produz) ─────────
static const FLinearColor GameplaySwatches[16] = {
    FLinearColor(0.96f, 0.80f, 0.69f, 1.0f),   // pele clara
    FLinearColor(0.55f, 0.36f, 0.24f, 1.0f),   // pele escura
    FLinearColor(0.45f, 0.70f, 0.95f, 1.0f),   // céu dia
    FLinearColor(0.05f, 0.07f, 0.20f, 1.0f),   // céu noite
    FLinearColor(0.90f, 0.10f, 0.80f, 1.0f),   // neon magenta
    FLinearColor(0.10f, 0.85f, 0.90f, 1.0f),   // neon ciano
    FLinearColor(0.30f, 0.85f, 0.15f, 1.0f),   // verde tóxico
    FLinearColor(0.55f, 0.30f, 0.75f, 1.0f),   // violeta alien
    FLinearColor(0.15f, 0.45f, 0.12f, 1.0f),   // folhagem
    FLinearColor(0.85f, 0.75f, 0.50f, 1.0f),   // areia
    FLinearColor(0.70f, 0.05f, 0.05f, 1.0f),   // sangue
    FLinearColor(0.50f, 0.52f, 0.56f, 1.0f),   // metal
    FLinearColor(0.95f, 0.45f, 0.10f, 1.0f),   // lava
    FLinearColor(0.75f, 0.90f, 1.00f, 1.0f),   // gelo
    FLinearColor(0.02f, 0.02f, 0.04f, 1.0f),   // sombra profunda
    FLinearColor(1.00f, 1.00f, 1.00f, 1.0f),   // highlight
};

// ─── Main ──────────────────────────────────────────────────────────────────────

int32 UKhaaosLUTVisualValidatorCommandlet::Main(const FString& Params)
{
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTVisualValidator] Khaaos Run — Validação visual dos LUTs (captura PNG)"));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTVisualValidator] Data: %s"), *FDateTime::UtcNow().ToString());
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));

    PassCount = 0;
    FailCount = 0;

    // ── Resolução do diretório de saída ──────────────────────────────────────
    FString OutputDir;
    if (!FParse::Value(*Params, TEXT("OutputDir="), OutputDir) || OutputDir.IsEmpty())
    {
        OutputDir = FPaths::ProjectSavedDir() / TEXT("LUTValidation");
    }
    // Normalizar barras finais
    while (OutputDir.EndsWith(TEXT("/")) || OutputDir.EndsWith(TEXT("\\")))
    {
        OutputDir.LeftChopInline(1);
    }

    IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
    if (!PlatformFile.DirectoryExists(*OutputDir))
    {
        if (!PlatformFile.CreateDirectoryTree(*OutputDir))
        {
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTVisualValidator] FALHA ao criar diretório de saída %s."), *OutputDir);
            return 1;
        }
    }
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTVisualValidator] Saída das capturas: %s"), *OutputDir);

    // ── Padrão de teste neutro (o "antes" comum a todos os moods) ────────────
    TArray<FLinearColor> Pattern;
    int32 PatternW = 0, PatternH = 0;
    BuildTestPattern(Pattern, PatternW, PatternH);
    if (Pattern.Num() == 0)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTVisualValidator] FALHA ao gerar padrão de teste."));
        return 1;
    }

    // "Antes" em bytes RGBA (comum a todos os moods)
    TArray<uint8> BeforeBytes;
    BeforeBytes.SetNumUninitialized(PatternW * PatternH * 4);
    for (int32 i = 0; i < Pattern.Num(); ++i)
    {
        BeforeBytes[i * 4 + 0] = static_cast<uint8>(FMath::RoundToInt(FMath::Clamp(Pattern[i].R, 0.0f, 1.0f) * 255.0f));
        BeforeBytes[i * 4 + 1] = static_cast<uint8>(FMath::RoundToInt(FMath::Clamp(Pattern[i].G, 0.0f, 1.0f) * 255.0f));
        BeforeBytes[i * 4 + 2] = static_cast<uint8>(FMath::RoundToInt(FMath::Clamp(Pattern[i].B, 0.0f, 1.0f) * 255.0f));
        BeforeBytes[i * 4 + 3] = 255;
    }

    TArray<FMoodValidationReport> Reports;

    // ── Loop dos 5 moods (idêntico ao builder) ───────────────────────────────
    for (uint8 MoodInt = 0; MoodInt <= static_cast<uint8>(EKhaaosWorldMood::LowEndLeve); ++MoodInt)
    {
        const EKhaaosWorldMood Mood = static_cast<EKhaaosWorldMood>(MoodInt);
        const FString Suffix = ValidatorSuffixForMood(Mood);

        FMoodValidationReport Report;
        Report.MoodName = Suffix;

        // ── 1. Carregar LUT (asset persistente → fallback transient) ─────────
        FString AssetPath;
        UTexture2D* LUTTexture = LoadLUTForMood(Mood, AssetPath);
        Report.AssetPath = AssetPath;
        if (!LUTTexture)
        {
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTVisualValidator] ✘ %s — LUT não carregado (nem asset nem fallback)."), *Suffix);
            ++FailCount;
            Reports.Add(Report);
            continue;
        }
        Report.bTextureLoaded = true;

        // ── 2. Extrair pixels do strip via Source ────────────────────────────
        TArray<uint8> StripPixels;
        int32 StripW = 0, StripH = 0;
        if (!ExtractStripPixels(LUTTexture, StripPixels, StripW, StripH) || StripPixels.Num() == 0)
        {
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTVisualValidator] ✘ %s — strip vazio (Source sem pixels?)."), *Suffix);
            ++FailCount;
            Reports.Add(Report);
            continue;
        }
        Report.StripWidth = StripW;
        Report.StripHeight = StripH;

        const int32 LUTSize = StripH; // strip é Size² × Size
        if (StripW != LUTSize * LUTSize || LUTSize < 16)
        {
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTVisualValidator] ✘ %s — dimensões de strip inválidas (%dx%d, Size=%d)."),
                *Suffix, StripW, StripH, LUTSize);
            ++FailCount;
            Reports.Add(Report);
            continue;
        }

        // ── 3. Captura 1: strip cru ──────────────────────────────────────────
        const FString StripPng = OutputDir / FString::Printf(TEXT("Strip_%s.png"), *Suffix);
        const bool bStripSaved = SavePNG(StripPixels, StripW, StripH, StripPng);

        // ── 4. Amostragem: "depois" = padrão graduado pelo LUT ───────────────
        TArray<uint8> AfterBytes;
        AfterBytes.SetNumUninitialized(PatternW * PatternH * 4);

        double DeltaSum = 0.0;
        int32 DeltaMax = 0;
        int32 ChangedPixels = 0;

        for (int32 i = 0; i < Pattern.Num(); ++i)
        {
            const FLinearColor Graded = SampleLUTStrip(StripPixels, StripW, StripH, LUTSize, Pattern[i]);

            const uint8 GR = static_cast<uint8>(FMath::RoundToInt(FMath::Clamp(Graded.R, 0.0f, 1.0f) * 255.0f));
            const uint8 GG = static_cast<uint8>(FMath::RoundToInt(FMath::Clamp(Graded.G, 0.0f, 1.0f) * 255.0f));
            const uint8 GB = static_cast<uint8>(FMath::RoundToInt(FMath::Clamp(Graded.B, 0.0f, 1.0f) * 255.0f));

            AfterBytes[i * 4 + 0] = GR;
            AfterBytes[i * 4 + 1] = GG;
            AfterBytes[i * 4 + 2] = GB;
            AfterBytes[i * 4 + 3] = 255;

            // Deltas vs "antes" (evidência numérica de que o grading atua)
            const int32 DR = FMath::Abs(static_cast<int32>(GR) - static_cast<int32>(BeforeBytes[i * 4 + 0]));
            const int32 DG = FMath::Abs(static_cast<int32>(GG) - static_cast<int32>(BeforeBytes[i * 4 + 1]));
            const int32 DB = FMath::Abs(static_cast<int32>(GB) - static_cast<int32>(BeforeBytes[i * 4 + 2]));
            const int32 Px = (DR + DG + DB) / 3;
            DeltaSum += Px;
            DeltaMax = FMath::Max(DeltaMax, FMath::Max3(DR, DG, DB));
            if (Px > 2) { ++ChangedPixels; }
        }

        Report.MeanDelta = static_cast<float>(DeltaSum / FMath::Max<int64>(Pattern.Num(), 1));
        Report.MaxDelta = static_cast<float>(DeltaMax);
        Report.PctPixelsChanged = 100.0f * static_cast<float>(ChangedPixels) / static_cast<float>(Pattern.Num());

        // ── 5. Capturas 2 e 3: antes / depois ────────────────────────────────
        const FString BeforePng = OutputDir / FString::Printf(TEXT("Antes_%s.png"), *Suffix);
        const FString AfterPng  = OutputDir / FString::Printf(TEXT("Depois_%s.png"), *Suffix);
        const bool bBeforeSaved = SavePNG(BeforeBytes, PatternW, PatternH, BeforePng);
        const bool bAfterSaved  = SavePNG(AfterBytes, PatternW, PatternH, AfterPng);

        // ── 6. Captura 4: folha de contato (antes + separador + depois) ──────
        const int32 CompH = PatternH * 2 + SEPARATOR_H;
        TArray<uint8> CompBytes;
        CompBytes.SetNumUninitialized(PatternW * CompH * 4);
        const int32 RowStride = PatternW * 4;
        FMemory::Memcpy(CompBytes.GetData(), BeforeBytes.GetData(), RowStride * PatternH);
        for (int32 y = PatternH; y < PatternH + SEPARATOR_H; ++y)
        {
            for (int32 x = 0; x < PatternW; ++x)
            {
                const int32 Idx = (y * PatternW + x) * 4;
                CompBytes[Idx + 0] = 255; CompBytes[Idx + 1] = 255; CompBytes[Idx + 2] = 255; CompBytes[Idx + 3] = 255;
            }
        }
        FMemory::Memcpy(CompBytes.GetData() + RowStride * (PatternH + SEPARATOR_H), AfterBytes.GetData(), RowStride * PatternH);

        const FString CompPng = OutputDir / FString::Printf(TEXT("Comparacao_%s.png"), *Suffix);
        const bool bCompSaved = SavePNG(CompBytes, PatternW, CompH, CompPng);

        Report.bCapturesSaved = bStripSaved && bBeforeSaved && bAfterSaved && bCompSaved;
        Reports.Add(Report);

        if (Report.bCapturesSaved)
        {
            ++PassCount;
            UE_LOG(LogKhaaosRun, Display, TEXT("[LUTVisualValidator] ✔ %s — strip %dx%d | Δmédio=%.2f Δmáx=%.0f | %.1f%% pixels alterados | capturas salvas"),
                *Suffix, StripW, StripH, Report.MeanDelta, Report.MaxDelta, Report.PctPixelsChanged);
        }
        else
        {
            ++FailCount;
            UE_LOG(LogKhaaosRun, Error, TEXT("[LUTVisualValidator] ✘ %s — falha ao salvar capturas (strip=%d antes=%d depois=%d comp=%d)."),
                *Suffix, bStripSaved ? 1 : 0, bBeforeSaved ? 1 : 0, bAfterSaved ? 1 : 0, bCompSaved ? 1 : 0);
        }
    }

    // ── Relatório JSON ───────────────────────────────────────────────────────
    const FString ReportPath = OutputDir / TEXT("lut_visual_report.json");
    if (!WriteReportJSON(Reports, ReportPath))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[LUTVisualValidator] Relatório JSON não pôde ser salvo em %s (capturas continuam válidas)."), *ReportPath);
    }
    else
    {
        UE_LOG(LogKhaaosRun, Display, TEXT("[LUTVisualValidator] Relatório numérico: %s"), *ReportPath);
    }

    // ── Resumo ───────────────────────────────────────────────────────────────
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));
    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTVisualValidator] Relatório final: %d PASS / %d FAIL (capturas em %s)"), PassCount, FailCount, *OutputDir);
    UE_LOG(LogKhaaosRun, Display, TEXT("============================================================="));

    return (FailCount > 0) ? 1 : 0;
}

// ─── Carregamento do LUT (asset → fallback transient) ──────────────────────────

UTexture2D* UKhaaosLUTVisualValidatorCommandlet::LoadLUTForMood(EKhaaosWorldMood Mood, FString& OutAssetPath)
{
    const FString AssetName = FString::Printf(TEXT("T_KhaaosLUT_%s"), ValidatorSuffixForMood(Mood));
    OutAssetPath = FString::Printf(TEXT("%s/%s.%s"), VALIDATOR_LUT_PACKAGE_PATH, *AssetName, *AssetName);

    // 1) Asset persistente gerado pelo KhaaosLUTMaterialBuilder
    if (UTexture2D* Asset = Cast<UTexture2D>(StaticLoadObject(UTexture2D::StaticClass(), nullptr, *OutAssetPath)))
    {
        return Asset;
    }

    UE_LOG(LogKhaaosRun, Warning, TEXT("[LUTVisualValidator] Asset %s não encontrado — fallback para LUT transient da factory (rode o builder antes p/ validar o asset REAL)."),
        *OutAssetPath);

    // 2) Fallback: transient procedural (mesma receita — valida a geração, não o save)
    UKhaaosLUTTextureFactory* Factory = GEngine ? GEngine->GetEngineSubsystem<UKhaaosLUTTextureFactory>() : nullptr;
    if (!Factory)
    {
        return nullptr;
    }
    UTexture2D* Transient = Factory->GetLUTForMood(Mood);
    if (!Transient)
    {
        Transient = Factory->GenerateLUTForMood(Mood);
    }
    return Transient;
}

// ─── Extração dos pixels do strip via Source ───────────────────────────────────

bool UKhaaosLUTVisualValidatorCommandlet::ExtractStripPixels(
    UTexture2D* Texture, TArray<uint8>& OutPixels, int32& OutW, int32& OutH)
{
    if (!Texture)
    {
        return false;
    }

    // Fonte da verdade: Source (dados de origem do editor) — sobrevive a
    // -NullRHI e a assets re-cozinhados. Fallback: PlatformData mip 0.
    const FTextureSourceMip* SourceMip = Texture->Source.GetMip(0);
    if (SourceMip && SourceMip->SizeX > 0 && SourceMip->SizeY > 0)
    {
        void* Data = const_cast<FTextureSourceMip*>(SourceMip)->BulkData.Lock(LOCK_READ_ONLY);
        if (Data)
        {
            const int64 NumBytes = SourceMip->BulkData.GetLockSize();
            OutW = SourceMip->SizeX;
            OutH = SourceMip->SizeY;
            OutPixels.SetNumUninitialized(static_cast<int32>(NumBytes));
            FMemory::Memcpy(OutPixels.GetData(), Data, static_cast<size_t>(NumBytes));
            const_cast<FTextureSourceMip*>(SourceMip)->BulkData.Unlock();
            return true;
        }
    }

    if (Texture->GetPlatformData() && Texture->GetPlatformData()->Mips.Num() > 0)
    {
        FTexture2DMipMap& Mip0 = Texture->GetPlatformData()->Mips[0];
        void* Data = Mip0.BulkData.Lock(LOCK_READ_ONLY);
        if (Data)
        {
            const int64 NumBytes = Mip0.BulkData.GetLockSize();
            OutW = Mip0.SizeX;
            OutH = Mip0.SizeY;
            OutPixels.SetNumUninitialized(static_cast<int32>(NumBytes));
            FMemory::Memcpy(OutPixels.GetData(), Data, static_cast<size_t>(NumBytes));
            Mip0.BulkData.Unlock();
            return true;
        }
    }

    return false;
}

// ─── Padrão de teste 512×256 (4 bandas de 64px) ────────────────────────────────

void UKhaaosLUTVisualValidatorCommandlet::BuildTestPattern(
    TArray<FLinearColor>& OutPattern, int32& OutW, int32& OutH)
{
    OutW = PATTERN_W;
    OutH = PATTERN_H;
    OutPattern.SetNumUninitialized(PATTERN_W * PATTERN_H);

    for (int32 y = 0; y < PATTERN_H; ++y)
    {
        const float U = static_cast<float>(y % BAND_H) / static_cast<float>(BAND_H - 1);
        for (int32 x = 0; x < PATTERN_W; ++x)
        {
            const float V = static_cast<float>(x) / static_cast<float>(PATTERN_W - 1);
            FLinearColor Color;

            if (y < BAND_H)
            {
                // Banda 1: varredura de matiz (arco-íris completo, S=1, V=1)
                Color = HSVToLinear(V, 1.0f, 1.0f);
            }
            else if (y < BAND_H * 2)
            {
                // Banda 2: varredura de saturação no quente (assinatura FF)
                Color = HSVToLinear(0.08f, U, 1.0f);
            }
            else if (y < BAND_H * 3)
            {
                // Banda 3: rampa de cinza (value sweep)
                Color = FLinearColor(V, V, V, 1.0f);
            }
            else
            {
                // Banda 4: swatches de gameplay fixos (16 cores reais do jogo)
                const int32 SwatchIndex = (x * 16) / PATTERN_W;
                Color = GameplaySwatches[FMath::Clamp(SwatchIndex, 0, 15)];
            }

            OutPattern[y * PATTERN_W + x] = Color;
        }
    }
}

// ─── Sampling do strip — MESMA matemática do material M_KhaaosColorGradeLUT ────

FLinearColor UKhaaosLUTVisualValidatorCommandlet::SampleLUTStrip(
    const TArray<uint8>& StripPixels, int32 StripW, int32 StripH, int32 LUTSize,
    const FLinearColor& InputColor)
{
    // Clamp do input (espelha o Saturate do grafo do material)
    const float R = FMath::Clamp(InputColor.R, 0.0f, 1.0f);
    const float G = FMath::Clamp(InputColor.G, 0.0f, 1.0f);
    const float B = FMath::Clamp(InputColor.B, 0.0f, 1.0f);

    // U = (floor(B*q) * Size + R*q + 0.5) / (Size*Size); V = (G*q + 0.5) / Size
    const float q = static_cast<float>(LUTSize - 1);
    const float SliceF = FMath::FloorToFloat(B * q);
    const float XF = SliceF * static_cast<float>(LUTSize) + R * q + 0.5f;
    const float YF = G * q + 0.5f;

    const int32 X = FMath::Clamp(static_cast<int32>(XF), 0, StripW - 1);
    const int32 Y = FMath::Clamp(static_cast<int32>(YF), 0, StripH - 1);
    const int32 Idx = (Y * StripW + X) * 4;

    return FLinearColor(
        static_cast<float>(StripPixels[Idx + 0]) / 255.0f,
        static_cast<float>(StripPixels[Idx + 1]) / 255.0f,
        static_cast<float>(StripPixels[Idx + 2]) / 255.0f,
        1.0f);
}

// ─── HSV → RGB ─────────────────────────────────────────────────────────────────

FLinearColor UKhaaosLUTVisualValidatorCommandlet::HSVToLinear(float H, float S, float V)
{
    H = FMath::Frac(FMath::Clamp(H, 0.0f, 1.0f));
    const int32 I = static_cast<int32>(H * 6.0f) % 6;
    const float F = H * 6.0f - static_cast<float>(static_cast<int32>(H * 6.0f));
    const float P = V * (1.0f - S);
    const float Qt = V * (1.0f - F * S);
    const float T = V * (1.0f - (1.0f - F) * S);

    float R = 0.0f, G = 0.0f, B = 0.0f;
    switch (I)
    {
    case 0: R = V; G = T; B = P; break;
    case 1: R = Qt; G = V; B = P; break;
    case 2: R = P; G = V; B = T; break;
    case 3: R = P; G = Qt; B = V; break;
    case 4: R = T; G = P; B = V; break;
    default: R = V; G = P; B = Qt; break;
    }
    return FLinearColor(R, G, B, 1.0f);
}

// ─── Salvamento PNG via ImageWrapper ───────────────────────────────────────────

bool UKhaaosLUTVisualValidatorCommandlet::SavePNG(
    const TArray<uint8>& RGBA, int32 W, int32 H, const FString& Filename)
{
    IImageWrapperModule& ImageWrapperModule =
        FModuleManager::LoadModuleChecked<IImageWrapperModule>(FName("ImageWrapper"));
    TSharedPtr<IImageWrapper> PngWrapper = ImageWrapperModule.CreateImageWrapper(EImageFormat::PNG);
    if (!PngWrapper.IsValid())
    {
        return false;
    }
    if (!PngWrapper->SetRaw(RGBA.GetData(), RGBA.Num(), W, H, ERGBFormat::RGBA, 8))
    {
        return false;
    }
    const TArray64<uint8> Compressed = PngWrapper->GetCompressed(100);
    if (Compressed.Num() == 0)
    {
        return false;
    }
    return FFileHelper::SaveArrayToFile(Compressed, *Filename);
}

// ─── Relatório JSON agregado ───────────────────────────────────────────────────

bool UKhaaosLUTVisualValidatorCommandlet::WriteReportJSON(
    const TArray<FMoodValidationReport>& Reports, const FString& Filename) const
{
    FString Json = TEXT("{\n");
    Json += FString::Printf(TEXT("  \"generatedAt\": \"%s\",\n"), *FDateTime::UtcNow().ToString(TEXT("%Y-%m-%dT%H:%M:%SZ")));
    Json += FString::Printf(TEXT("  \"passCount\": %d,\n"), PassCount);
    Json += FString::Printf(TEXT("  \"failCount\": %d,\n"), FailCount);
    Json += TEXT("  \"moods\": [\n");

    for (int32 i = 0; i < Reports.Num(); ++i)
    {
        const FMoodValidationReport& R = Reports[i];
        Json += TEXT("    {\n");
        Json += FString::Printf(TEXT("      \"mood\": \"%s\",\n"), *R.MoodName);
        Json += FString::Printf(TEXT("      \"assetPath\": \"%s\",\n"), *R.AssetPath);
        Json += FString::Printf(TEXT("      \"textureLoaded\": %s,\n"), R.bTextureLoaded ? TEXT("true") : TEXT("false"));
        Json += FString::Printf(TEXT("      \"stripWidth\": %d,\n"), R.StripWidth);
        Json += FString::Printf(TEXT("      \"stripHeight\": %d,\n"), R.StripHeight);
        Json += FString::Printf(TEXT("      \"meanDelta255\": %.3f,\n"), R.MeanDelta);
        Json += FString::Printf(TEXT("      \"maxDelta255\": %.0f,\n"), R.MaxDelta);
        Json += FString::Printf(TEXT("      \"pctPixelsChanged\": %.2f,\n"), R.PctPixelsChanged);
        Json += FString::Printf(TEXT("      \"capturesSaved\": %s\n"), R.bCapturesSaved ? TEXT("true") : TEXT("false"));
        Json += (i < Reports.Num() - 1) ? TEXT("    },\n") : TEXT("    }\n");
    }

    Json += TEXT("  ]\n}\n");

    return FFileHelper::SaveStringToFile(Json, *Filename,
        FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}
