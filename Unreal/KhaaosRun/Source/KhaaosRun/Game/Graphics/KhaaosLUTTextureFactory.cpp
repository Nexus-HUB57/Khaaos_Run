// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosLUTTextureFactory
// Geração procedural de texturas 3D LUT (Color Lookup Tables) em runtime.
// Strip layout 32²×32 slices — consumível nativamente pelo ColorGradingLUT da engine.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosLUTTextureFactory.h"
#include "KhaaosRun.h"
#include "Engine/Texture2D.h"
#include "RenderUtils.h"
#include "RHI.h"
#include "DynamicRHI.h"
#include "RHIDefinitions.h"
#include "RenderGraphUtils.h"
#include "Logging/LogMacros.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosLUTTextureFactory::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Pré-gerar os 5 LUTs no Initialize — custo ~2ms total em desktop
    for (uint8 MoodInt = 0; MoodInt <= static_cast<uint8>(EKhaaosWorldMood::LowEndLeve); ++MoodInt)
    {
        EKhaaosWorldMood Mood = static_cast<EKhaaosWorldMood>(MoodInt);
        GenerateLUTForMood(Mood);
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTFactory] 5 LUTs procedurais gerados (32³ strip layout)."));
}

void UKhaaosLUTTextureFactory::Deinitialize(FSubsystemCollectionBase& Collection)
{
    GeneratedLUTs.Empty();
    UsedRecipes.Empty();

    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTFactory] Deinicializado."));
    Super::Deinitialize(Collection);
}

// ─── LUT Generation ──────────────────────────────────────────────────────────

UTexture2D* UKhaaosLUTTextureFactory::GenerateLUTForMood(EKhaaosWorldMood Mood)
{
    const FKhaaosLUTRecipe Recipe = BuildRecipeForMood(Mood);
    const FString DebugName = FString::Printf(TEXT("LUT_%s"), *UEnum::GetDisplayValueAsText(Mood).ToString());

    UTexture2D* Texture = GenerateLUTFromRecipe(Recipe, DebugName);

    const uint8 Key = static_cast<uint8>(Mood);
    GeneratedLUTs.Add(Key, Texture);
    UsedRecipes.Add(Key, Recipe);

    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTFactory] LUT gerado: %s (size=%d, sat=%.2f, contrast=%.2f, temp=%.0fK)"),
        *DebugName, Recipe.LUTSize, Recipe.Saturation, Recipe.Contrast, Recipe.WhiteBalanceTemp);

    return Texture;
}

UTexture2D* UKhaaosLUTTextureFactory::GenerateLUTFromRecipe(const FKhaaosLUTRecipe& Recipe, const FString& DebugName)
{
    // Gerar pixels RGBA8
    TArray<uint8> Pixels;
    GenerateLUTPixels(Recipe, Pixels);

    // Criar textura UTexture2D
    return CreateTextureFromPixels(Pixels, Recipe.LUTSize, DebugName);
}

FKhaaosLUTRecipe UKhaaosLUTTextureFactory::BuildRecipeForMood(EKhaaosWorldMood Mood)
{
    FKhaaosLUTRecipe Recipe;

    switch (Mood)
    {
    case EKhaaosWorldMood::PadraoBattle:
        // ═══ Assinatura Free Fire ═══
        // LUT quente e saturado com sombras levemente aquecidas,
        // realces levemente dourados, e contraste punchy.
        Recipe.LUTSize = 32;
        Recipe.Lift   = FLinearColor(-0.02f, -0.03f, -0.04f, 0.0f);  // Sombras: empurrar azul pra fora
        Recipe.Gamma  = FLinearColor(1.02f, 1.0f, 0.97f, 1.0f);       // Midtones: levemente quente
        Recipe.Gain   = FLinearColor(1.06f, 1.03f, 0.96f, 1.0f);      // Highlights: dourado
        Recipe.Offset = FLinearColor(0.005f, 0.003f, 0.0f, 0.0f);     // Lift global mínimo
        Recipe.Power  = FLinearColor(0.98f, 1.0f, 1.02f, 1.0f);       // Gamma: curvar vermelho
        Recipe.Slope  = FLinearColor(1.08f, 1.05f, 1.0f, 1.0f);       // Contraste: punch nos quentes
        Recipe.Saturation = 1.15f;
        Recipe.Contrast = 1.08f;
        Recipe.Tint = FLinearColor(1.03f, 1.0f, 0.96f, 1.0f);
        Recipe.WhiteBalanceTemp = 6200.0f;
        Recipe.SCurveIntensity = 0.3f;
        Recipe.SCurveMidpoint = 0.5f;
        break;

    case EKhaaosWorldMood::NoiteNeon:
        // ═══ Noite Cyber ═══
        // LUT frio azul-neon com contraste alto e sombras profundas.
        // Realces puxam pro ciano/neon, midtones frios.
        Recipe.LUTSize = 32;
        Recipe.Lift   = FLinearColor(-0.04f, -0.02f, 0.01f, 0.0f);   // Sombras: azular
        Recipe.Gamma  = FLinearColor(0.96f, 0.98f, 1.04f, 1.0f);     // Midtones: frio
        Recipe.Gain   = FLinearColor(0.92f, 0.98f, 1.10f, 1.0f);     // Highlights: neon ciano
        Recipe.Offset = FLinearColor(0.0f, 0.0f, 0.01f, 0.0f);
        Recipe.Power  = FLinearColor(1.02f, 1.0f, 0.96f, 1.0f);
        Recipe.Slope  = FLinearColor(1.0f, 1.06f, 1.14f, 1.0f);      // Slope: azul/neon boost
        Recipe.Saturation = 1.25f;
        Recipe.Contrast = 1.12f;
        Recipe.Tint = FLinearColor(0.92f, 0.96f, 1.08f, 1.0f);
        Recipe.WhiteBalanceTemp = 8000.0f;
        Recipe.SCurveIntensity = 0.4f;
        Recipe.SCurveMidpoint = 0.45f;
        break;

    case EKhaaosWorldMood::NebulosaAlien:
        // ═══ Nebulosa Alienígena ═══
        // LUT violeta com desaturação parcial nas sombras e
        // iridescência simulada via shift de canal.
        Recipe.LUTSize = 32;
        Recipe.Lift   = FLinearColor(-0.02f, -0.04f, 0.02f, 0.0f);   // Sombras: violeta
        Recipe.Gamma  = FLinearColor(1.02f, 0.96f, 1.06f, 1.0f);     // Midtones: puxar violeta
        Recipe.Gain   = FLinearColor(1.05f, 0.95f, 1.10f, 1.0f);     // Highlights: magenta
        Recipe.Offset = FLinearColor(0.01f, -0.01f, 0.02f, 0.0f);
        Recipe.Power  = FLinearColor(0.97f, 1.02f, 0.95f, 1.0f);
        Recipe.Slope  = FLinearColor(1.08f, 0.96f, 1.12f, 1.0f);
        Recipe.Saturation = 1.10f;
        Recipe.Contrast = 1.05f;
        Recipe.Tint = FLinearColor(1.05f, 0.95f, 1.10f, 1.0f);
        Recipe.WhiteBalanceTemp = 7500.0f;
        Recipe.SCurveIntensity = 0.25f;
        Recipe.SCurveMidpoint = 0.5f;
        break;

    case EKhaaosWorldMood::AmanhecerVenenoso:
        // ═══ Barburhen Ácido ═══
        // LUT tóxico amarelo-esverdeado — sombras esverdeadas,
        // midtones ácidos, realces amarelados.
        Recipe.LUTSize = 32;
        Recipe.Lift   = FLinearColor(-0.01f, 0.02f, -0.05f, 0.0f);   // Sombras: verde escuro
        Recipe.Gamma  = FLinearColor(1.04f, 1.02f, 0.94f, 1.0f);     // Midtones: ácido
        Recipe.Gain   = FLinearColor(1.08f, 1.04f, 0.86f, 1.0f);     // Highlights: amarelo forte
        Recipe.Offset = FLinearColor(0.01f, 0.01f, -0.01f, 0.0f);
        Recipe.Power  = FLinearColor(0.96f, 0.98f, 1.06f, 1.0f);
        Recipe.Slope  = FLinearColor(1.10f, 1.06f, 0.90f, 1.0f);
        Recipe.Saturation = 1.20f;
        Recipe.Contrast = 1.10f;
        Recipe.Tint = FLinearColor(1.06f, 1.02f, 0.88f, 1.0f);
        Recipe.WhiteBalanceTemp = 5400.0f;
        Recipe.SCurveIntensity = 0.35f;
        Recipe.SCurveMidpoint = 0.48f;
        break;

    case EKhaaosWorldMood::LowEndLeve:
        // ═══ Hardware Fraco ═══
        // LUT quase neutro — grading mínimo, contraste suave,
        // saturação normal. Menor custo de processamento.
        Recipe.LUTSize = 32;
        Recipe.Lift   = FLinearColor(0.0f, 0.0f, 0.0f, 0.0f);
        Recipe.Gamma  = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);
        Recipe.Gain   = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);
        Recipe.Offset = FLinearColor(0.0f, 0.0f, 0.0f, 0.0f);
        Recipe.Power  = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);
        Recipe.Slope  = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);
        Recipe.Saturation = 1.0f;
        Recipe.Contrast = 1.0f;
        Recipe.Tint = FLinearColor::White;
        Recipe.WhiteBalanceTemp = 6500.0f;
        Recipe.SCurveIntensity = 0.0f;
        Recipe.SCurveMidpoint = 0.5f;
        break;

    default:
        break;
    }

    return Recipe;
}

// ─── Query ────────────────────────────────────────────────────────────────────

UTexture2D* UKhaaosLUTTextureFactory::GetLUTForMood(EKhaaosWorldMood Mood) const
{
    const uint8 Key = static_cast<uint8>(Mood);
    const TObjectPtr<UTexture2D>* Found = GeneratedLUTs.Find(Key);
    return Found ? Found->Get() : nullptr;
}

bool UKhaaosLUTTextureFactory::HasLUTForMood(EKhaaosWorldMood Mood) const
{
    return GeneratedLUTs.Contains(static_cast<uint8>(Mood));
}

FKhaaosLUTRecipe UKhaaosLUTTextureFactory::GetRecipeForMood(EKhaaosWorldMood Mood) const
{
    const FKhaaosLUTRecipe* Found = UsedRecipes.Find(static_cast<uint8>(Mood));
    return Found ? *Found : FKhaaosLUTRecipe();
}

// ─── Hot Reload ───────────────────────────────────────────────────────────────

void UKhaaosLUTTextureFactory::RegenerateAllLUTs()
{
    GeneratedLUTs.Empty();
    UsedRecipes.Empty();

    for (uint8 MoodInt = 0; MoodInt <= static_cast<uint8>(EKhaaosWorldMood::LowEndLeve); ++MoodInt)
    {
        GenerateLUTForMood(static_cast<EKhaaosWorldMood>(MoodInt));
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[LUTFactory] Todos os LUTs regenerados (hot-reload)."));
}

// ─── Core Generation ──────────────────────────────────────────────────────────

void UKhaaosLUTTextureFactory::GenerateLUTPixels(const FKhaaosLUTRecipe& Recipe, TArray<uint8>& OutPixels) const
{
    const int32 Size = Recipe.LUTSize;
    const int32 TotalPixels = Size * Size * Size; // 32³ = 32768
    OutPixels.SetNumUninitialized(TotalPixels * 4); // RGBA8

    int32 PixelIndex = 0;

    // Strip layout: slices ao longo de B (blue), cada slice é Size×Size (R×G)
    for (int32 B = 0; B < Size; ++B)
    {
        for (int32 G = 0; G < Size; ++G)
        {
            for (int32 R = 0; R < Size; ++R)
            {
                // Normalizar para [0, 1]
                float Red   = static_cast<float>(R) / static_cast<float>(Size - 1);
                float Green = static_cast<float>(G) / static_cast<float>(Size - 1);
                float Blue  = static_cast<float>(B) / static_cast<float>(Size - 1);

                // Aplicar transformação de color grading
                ApplyColorGrade(Red, Green, Blue, Recipe);

                // Clamp para [0, 1]
                Red   = FMath::Clamp(Red, 0.0f, 1.0f);
                Green = FMath::Clamp(Green, 0.0f, 1.0f);
                Blue  = FMath::Clamp(Blue, 0.0f, 1.0f);

                // Converter para RGBA8 (sRGB — a engine converte ao amostrar)
                OutPixels[PixelIndex + 0] = static_cast<uint8>(FMath::RoundToInt(Red   * 255.0f));
                OutPixels[PixelIndex + 1] = static_cast<uint8>(FMath::RoundToInt(Green * 255.0f));
                OutPixels[PixelIndex + 2] = static_cast<uint8>(FMath::RoundToInt(Blue  * 255.0f));
                OutPixels[PixelIndex + 3] = 255; // Alpha = 1.0

                PixelIndex += 4;
            }
        }
    }
}

UTexture2D* UKhaaosLUTTextureFactory::CreateTextureFromPixels(
    const TArray<uint8>& Pixels, int32 LUTSize, const FString& TextureName) const
{
    // Strip layout: Width = LUTSize² (horizontal strips), Height = LUTSize
    const int32 StripWidth = LUTSize * LUTSize;
    const int32 StripHeight = LUTSize;

    // Criar UTexture2D transient
    UTexture2D* Texture = NewObject<UTexture2D>(
        GetTransientPackage(),
        FName(*TextureName),
        RF_Transient | RF_Dynamic);

    if (!Texture)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[LUTFactory] FALHA ao criar UTexture2D: %s"), *TextureName);
        return nullptr;
    }

    // Inicializar a textura com formato RGBA8
    Texture->Source.Init2DWithMipChain(
        StripWidth,
        StripHeight,
        TSF_RGBA8);

    // Lock e copiar pixels
    FTexture2DMipMap& Mip0 = Texture->PlatformData->Mips[0];
    void* MipData = Mip0.BulkData.Lock(LOCK_READ_WRITE);
    FMemory::Memcpy(MipData, Pixels.GetData(), Pixels.Num());
    Mip0.BulkData.Unlock();

#if WITH_EDITORONLY_DATA
    // Espelhar os pixels no Source (dados de origem do editor). Sem isso, o
    // PlatformData tem o LUT correto mas o Source fica zerado — e o asset
    // salvo no Content Browser (via KhaaosLUTMaterialBuilder) perde os pixels
    // ao re-cozinhar para qualquer plataforma.
    if (FTextureSourceMip* SourceMip = Texture->Source.GetMip(0))
    {
        void* SourceData = SourceMip->BulkData.Lock(LOCK_READ_WRITE);
        if (SourceData)
        {
            FMemory::Memcpy(SourceData, Pixels.GetData(), Pixels.Num());
        }
        SourceMip->BulkData.Unlock();
    }
#endif

    // Atualizar a textura no render thread
    Texture->UpdateResource();

    // Configurações de LUT
    Texture->NeverStream = true;   // LUTs não fazem streaming
    Texture->SRGB = false;         // LUTs são dados lineares (a engine aplica sRGB)
    Texture->Filter = TF_Trilinear;
    Texture->AddressX = TA_Clamp;
    Texture->AddressY = TA_Clamp;

    return Texture;
}

void UKhaaosLUTTextureFactory::ApplyColorGrade(
    float& R, float& G, float& B, const FKhaaosLUTRecipe& Recipe) const
{
    // ── 1. Lift/Gamma/Gain (ASC CDL style) ─────────────────────────────────
    // Output = (Input * Slope + Offset) ^ Power
    // Equivalente a: Lift/Gamma/Gain no DaVinci Resolve

    // Slope (Gain multiplicativo)
    R = R * Recipe.Slope.R + Recipe.Offset.R;
    G = G * Recipe.Slope.G + Recipe.Offset.G;
    B = B * Recipe.Slope.B + Recipe.Offset.B;

    // Power (Gamma correction per channel)
    R = FMath::Pow(FMath::Max(R, 0.0f), 1.0f / FMath::Max(Recipe.Power.R, KINDA_SMALL_NUMBER));
    G = FMath::Pow(FMath::Max(G, 0.0f), 1.0f / FMath::Max(Recipe.Power.G, KINDA_SMALL_NUMBER));
    B = FMath::Pow(FMath::Max(B, 0.0f), 1.0f / FMath::Max(Recipe.Power.B, KINDA_SMALL_NUMBER));

    // Lift (aditivo nas sombras — só afeta valores baixos)
    const float RInv = 1.0f - R;
    const float GInv = 1.0f - G;
    const float BInv = 1.0f - B;
    R = R + Recipe.Lift.R * RInv;
    G = G + Recipe.Lift.G * GInv;
    B = B + Recipe.Lift.B * BInv;

    // Gain (multiplicativo nos realces)
    R *= Recipe.Gain.R;
    G *= Recipe.Gain.G;
    B *= Recipe.Gain.B;

    // Gamma (midtones)
    R = FMath::Pow(FMath::Max(R, 0.0f), 1.0f / FMath::Max(Recipe.Gamma.R, KINDA_SMALL_NUMBER));
    G = FMath::Pow(FMath::Max(G, 0.0f), 1.0f / FMath::Max(Recipe.Gamma.G, KINDA_SMALL_NUMBER));
    B = FMath::Pow(FMath::Max(B, 0.0f), 1.0f / FMath::Max(Recipe.Gamma.B, KINDA_SMALL_NUMBER));

    // ── 2. White Balance ────────────────────────────────────────────────────
    ApplyWhiteBalance(R, G, B, Recipe.WhiteBalanceTemp);

    // ── 3. Saturação (luminance-preserving) ────────────────────────────────
    ApplySaturation(R, G, B, Recipe.Saturation);

    // ── 4. Contraste ────────────────────────────────────────────────────────
    // Contraste centrado em 0.5
    R = (R - 0.5f) * Recipe.Contrast + 0.5f;
    G = (G - 0.5f) * Recipe.Contrast + 0.5f;
    B = (B - 0.5f) * Recipe.Contrast + 0.5f;

    // ── 5. Curva S (S-Curve contrast) ──────────────────────────────────────
    R = ApplySCurve(R, Recipe.SCurveIntensity, Recipe.SCurveMidpoint);
    G = ApplySCurve(G, Recipe.SCurveIntensity, Recipe.SCurveMidpoint);
    B = ApplySCurve(B, Recipe.SCurveIntensity, Recipe.SCurveMidpoint);

    // ── 6. Tint multiplicativo final ───────────────────────────────────────
    R *= Recipe.Tint.R;
    G *= Recipe.Tint.G;
    B *= Recipe.Tint.B;
}

float UKhaaosLUTTextureFactory::ApplySCurve(float Value, float Intensity, float Midpoint)
{
    if (Intensity < KINDA_SMALL_NUMBER)
    {
        return Value; // Sem curva S
    }

    // Curva S via smoothstep modificado
    const float Clamped = FMath::Clamp(Value, 0.0f, 1.0f);

    // Smoothstep com midpoint customizável
    const float T = (Clamped - Midpoint) / (1.0f - Midpoint + KINDA_SMALL_NUMBER);
    const float SmoothT = FMath::Clamp(T, 0.0f, 1.0f);
    const float SmoothResult = SmoothT * SmoothT * (3.0f - 2.0f * SmoothT);

    // Blend entre linear e curva S
    return FMath::Lerp(Clamped, SmoothResult, Intensity);
}

void UKhaaosLUTTextureFactory::ApplySaturation(float& R, float& G, float& B, float Saturation3)
{
    // Luminância Rec.709
    const float Luma = 0.2126f * R + 0.7152f * G + 0.0722f * B;

    // Interpolar entre luminância (grayscale) e cor original
    R = FMath::Lerp(Luma, R, Saturation3);
    G = FMath::Lerp(Luma, G, Saturation3);
    B = FMath::Lerp(Luma, B, Saturation3);
}

void UKhaaosLUTTextureFactory::ApplyWhiteBalance(float& R, float& G, float& B, float TemperatureKelvin)
{
    // Aproximação simplificada de white balance por temperatura
    // Baseado no algoritmo de Tanner Helland (simplificado)
    const float Temp = FMath::Clamp(TemperatureKelvin, 1000.0f, 40000.0f) / 100.0f;

    // Red
    float RedAdjust;
    if (Temp <= 66.0f)
    {
        RedAdjust = 1.0f;
    }
    else
    {
        RedAdjust = 1.29293618606f * FMath::Pow(Temp - 60.0f, -0.1332047592f);
    }

    // Green
    float GreenAdjust;
    if (Temp <= 66.0f)
    {
        GreenAdjust = 0.39008157867f * FMath::Loge(Temp) - 0.631760436f;
    }
    else
    {
        GreenAdjust = 1.12989084888f * FMath::Pow(Temp - 60.0f, -0.0755148492f);
    }

    // Blue
    float BlueAdjust;
    if (Temp >= 66.0f)
    {
        BlueAdjust = 1.0f;
    }
    else if (Temp <= 19.0f)
    {
        BlueAdjust = 0.0f;
    }
    else
    {
        BlueAdjust = 0.43272654881f * FMath::Loge(Temp - 10.0f) - 0.436036431f;
    }

    // Normalizar: em 6500K (neutro), todos ≈ 1.0
    // Usar 65 como referência
    const float RefTemp = 65.0f;
    const float RefRed   = 1.0f;
    const float RefGreen = 0.39008157867f * FMath::Loge(RefTemp) - 0.631760436f;
    const float RefBlue  = 0.43272654881f * FMath::Loge(RefTemp - 10.0f) - 0.436036431f;

    R *= FMath::Clamp(RedAdjust / FMath::Max(RefRed, KINDA_SMALL_NUMBER), 0.5f, 2.0f);
    G *= FMath::Clamp(GreenAdjust / FMath::Max(RefGreen, KINDA_SMALL_NUMBER), 0.5f, 2.0f);
    B *= FMath::Clamp(BlueAdjust / FMath::Max(RefBlue, KINDA_SMALL_NUMBER), 0.5f, 2.0f);
}
