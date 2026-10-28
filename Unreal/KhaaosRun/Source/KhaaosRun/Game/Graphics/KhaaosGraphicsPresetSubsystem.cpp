// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosGraphicsPresetSubsystem
// Auto-detecção de GPU, presets adaptativos, DLSS/FSR/XeSS/TSR, console commands.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosGraphicsPresetSubsystem.h"
#include "Engine/Engine.h"
#include "HAL/PlatformProcess.h"
#include "Misc/CommandLine.h"

void UKhaaosGraphicsPresetSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Pré-construir todos os 5 perfis na inicialização
    CachedPresets.Add(EKhaaosQualityPreset::Low,    BuildPresetProfile(EKhaaosQualityPreset::Low));
    CachedPresets.Add(EKhaaosQualityPreset::Medium,  BuildPresetProfile(EKhaaosQualityPreset::Medium));
    CachedPresets.Add(EKhaaosQualityPreset::High,    BuildPresetProfile(EKhaaosQualityPreset::High));
    CachedPresets.Add(EKhaaosQualityPreset::Ultra,   BuildPresetProfile(EKhaaosQualityPreset::Ultra));
    CachedPresets.Add(EKhaaosQualityPreset::PhD,     BuildPresetProfile(EKhaaosQualityPreset::PhD));

    UE_LOG(LogTemp, Display, TEXT("[GraphicsPreset] Subsystem inicializado. 5 perfis pré-calculados."));
}

EKhaaosQualityPreset UKhaaosGraphicsPresetSubsystem::AutoDetectAndApply()
{
    const int32 VRAM = DetectGPUVRAM();
    EKhaaosQualityPreset DetectedPreset;

    if (VRAM >= 24000)       DetectedPreset = EKhaaosQualityPreset::PhD;     // RTX 4090 (24GB)
    else if (VRAM >= 12000)  DetectedPreset = EKhaaosQualityPreset::Ultra;   // RTX 4070 Ti (12GB)
    else if (VRAM >= 8000)   DetectedPreset = EKhaaosQualityPreset::High;    // RTX 3060 Ti (8GB)
    else if (VRAM >= 4000)   DetectedPreset = EKhaaosQualityPreset::Medium;  // GTX 1060 (6GB)
    else                     DetectedPreset = EKhaaosQualityPreset::Low;      // Integrado

    UE_LOG(LogTemp, Display, TEXT("[GraphicsPreset] Auto-detecção: VRAM=%dMB -> Preset=%s"),
        VRAM, *UEnum::GetDisplayValueAsText(DetectedPreset).ToString());

    ApplyPreset(DetectedPreset);
    return DetectedPreset;
}

void UKhaaosGraphicsPresetSubsystem::ApplyPreset(EKhaaosQualityPreset Preset)
{
    if (const FKhaaosGraphicsProfile* Profile = CachedPresets.Find(Preset))
    {
        ActiveProfile = *Profile;
        CurrentPreset = Preset;

        // Override upscaler com melhor disponível no hardware
        ActiveProfile.Upscaler = DetectBestUpscaler();

        ApplyConsoleCommands(ActiveProfile);

        UE_LOG(LogTemp, Display, TEXT("[GraphicsPreset] Preset %s aplicado: %dx%d @ %dfps, Upscaler=%s"),
            *UEnum::GetDisplayValueAsText(Preset).ToString(),
            ActiveProfile.RenderResolutionX, ActiveProfile.RenderResolutionY,
            ActiveProfile.TargetFPS,
            *UEnum::GetDisplayValueAsText(ActiveProfile.Upscaler).ToString());

        PresetChangedEvent.Broadcast(Preset);
    }
}

FKhaaosGraphicsProfile UKhaaosGraphicsPresetSubsystem::BuildPresetProfile(EKhaaosQualityPreset Preset) const
{
    FKhaaosGraphicsProfile Profile;

    switch (Preset)
    {
    case EKhaaosQualityPreset::Low:
        Profile.RenderResolutionX = 1280;  Profile.RenderResolutionY = 720;
        Profile.ShadowQuality = EKhaaosShadowQuality::Low;
        Profile.AmbientOcclusion = EKhaaosAOQuality::Off;
        Profile.ViewDistanceScale = 0.4f;
        Profile.TextureQuality = 0;
        Profile.VFXBudgetPercent = 0.35f;
        Profile.bEnableLumenGI = false;
        Profile.bEnableNanite = false;
        Profile.bEnableMotionBlur = false;
        Profile.TargetFPS = 30;
        Profile.Upscaler = EKhaaosUpscalerTech::TSR;
        break;

    case EKhaaosQualityPreset::Medium:
        Profile.RenderResolutionX = 1920;  Profile.RenderResolutionY = 1080;
        Profile.ShadowQuality = EKhaaosShadowQuality::Medium;
        Profile.AmbientOcclusion = EKhaaosAOQuality::SSAO;
        Profile.ViewDistanceScale = 0.7f;
        Profile.TextureQuality = 2;
        Profile.VFXBudgetPercent = 0.65f;
        Profile.bEnableLumenGI = false;
        Profile.bEnableNanite = true;
        Profile.bEnableMotionBlur = false;
        Profile.TargetFPS = 60;
        Profile.Upscaler = EKhaaosUpscalerTech::TSR;
        break;

    case EKhaaosQualityPreset::High:
        Profile.RenderResolutionX = 2560;  Profile.RenderResolutionY = 1440;
        Profile.ShadowQuality = EKhaaosShadowQuality::High;
        Profile.AmbientOcclusion = EKhaaosAOQuality::GTAO;
        Profile.ViewDistanceScale = 0.85f;
        Profile.TextureQuality = 3;
        Profile.VFXBudgetPercent = 0.80f;
        Profile.bEnableLumenGI = true;
        Profile.bEnableNanite = true;
        Profile.bEnableMotionBlur = true;
        Profile.TargetFPS = 60;
        Profile.Upscaler = EKhaaosUpscalerTech::FSR;
        break;

    case EKhaaosQualityPreset::Ultra:
        Profile.RenderResolutionX = 3840;  Profile.RenderResolutionY = 2160;
        Profile.ShadowQuality = EKhaaosShadowQuality::Ultra;
        Profile.AmbientOcclusion = EKhaaosAOQuality::Lumen;
        Profile.ViewDistanceScale = 1.0f;
        Profile.TextureQuality = 4;
        Profile.VFXBudgetPercent = 0.95f;
        Profile.bEnableLumenGI = true;
        Profile.bEnableNanite = true;
        Profile.bEnableMotionBlur = true;
        Profile.TargetFPS = 60;
        Profile.Upscaler = EKhaaosUpscalerTech::DLSS;
        break;

    case EKhaaosQualityPreset::PhD:
        Profile.RenderResolutionX = 3840;  Profile.RenderResolutionY = 2160;
        Profile.ShadowQuality = EKhaaosShadowQuality::RayTraced;
        Profile.AmbientOcclusion = EKhaaosAOQuality::Lumen;
        Profile.ViewDistanceScale = 1.0f;
        Profile.TextureQuality = 4;
        Profile.VFXBudgetPercent = 1.0f;
        Profile.bEnableLumenGI = true;
        Profile.bEnableNanite = true;
        Profile.bEnableMotionBlur = true;
        Profile.TargetFPS = 120;
        Profile.Upscaler = EKhaaosUpscalerTech::DLSS;
        break;
    }

    return Profile;
}

void UKhaaosGraphicsPresetSubsystem::ApplyConsoleCommands(const FKhaaosGraphicsProfile& Profile)
{
    // View Distance Scale
    static IConsoleVariable* CVarViewDist = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ViewDistanceScale"));
    if (CVarViewDist)
    {
        CVarViewDist->Set(Profile.ViewDistanceScale, ECVF_SetByConsole);
    }

    // Texture Quality
    static IConsoleVariable* CVarTexQuality = IConsoleManager::Get().FindConsoleVariable(TEXT("r.TextureQuality"));
    if (CVarTexQuality)
    {
        CVarTexQuality->Set(Profile.TextureQuality, ECVF_SetByConsole);
    }

    // Shadow Quality (0=Off, 1=Low, 2=Medium, 3=High, 4=Ultra/Cinematic)
    static IConsoleVariable* CVarShadowQuality = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ShadowQuality"));
    if (CVarShadowQuality)
    {
        int32 ShadowInt = 0;
        switch (Profile.ShadowQuality)
        {
        case EKhaaosShadowQuality::Off:        ShadowInt = 0; break;
        case EKhaaosShadowQuality::Low:         ShadowInt = 1; break;
        case EKhaaosShadowQuality::Medium:     ShadowInt = 2; break;
        case EKhaaosShadowQuality::High:       ShadowInt = 3; break;
        case EKhaaosShadowQuality::Ultra:      ShadowInt = 4; break;
        case EKhaaosShadowQuality::RayTraced:  ShadowInt = 4; break; // RT shadows via Lumen
        }
        CVarShadowQuality->Set(ShadowInt, ECVF_SetByConsole);
    }

    // Motion Blur
    static IConsoleVariable* CVarMotionBlur = IConsoleManager::Get().FindConsoleVariable(TEXT("r.MotionBlurQuality"));
    if (CVarMotionBlur)
    {
        CVarMotionBlur->Set(Profile.bEnableMotionBlur ? 2 : 0, ECVF_SetByConsole);
    }

    // Lumen GI
    if (GEngine)
    {
        if (Profile.bEnableLumenGI)
        {
            GEngine->Exec(nullptr, TEXT("r.Lumen.DiffuseIndirect.Allow 1"));
            GEngine->Exec(nullptr, TEXT("r.Lumen.ScreenProbeGather.TracingOctahedronResolution 8"));
        }
        else
        {
            GEngine->Exec(nullptr, TEXT("r.Lumen.DiffuseIndirect.Allow 0"));
        }

        // Upscaler selection
        switch (Profile.Upscaler)
        {
        case EKhaaosUpscalerTech::DLSS:
            GEngine->Exec(nullptr, TEXT("r.AntiAliasingMethod 4"));
            GEngine->Exec(nullptr, TEXT("r.DLSS.Enable 1"));
            GEngine->Exec(nullptr, TEXT("r.DLSS.Quality.Level 2")); // Quality mode
            break;
        case EKhaaosUpscalerTech::FSR:
            GEngine->Exec(nullptr, TEXT("r.AntiAliasingMethod 5"));
            GEngine->Exec(nullptr, TEXT("r.FSR.Enabled 1"));
            GEngine->Exec(nullptr, TEXT("r.FSR.Quality.Mode 2")); // Quality
            break;
        case EKhaaosUpscalerTech::XeSS:
            GEngine->Exec(nullptr, TEXT("r.AntiAliasingMethod 6"));
            break;
        case EKhaaosUpscalerTech::TSR:
        default:
            GEngine->Exec(nullptr, TEXT("r.AntiAliasingMethod 2")); // TSR
            break;
        }

        // Frame rate target
        GEngine->Exec(nullptr, *FString::Printf(TEXT("t.MaxFPS %d"), Profile.TargetFPS));

        // ── Nitidez + AA tuning v3 (assinatura Free Fire) ───────────────────
        // Sharpen tonemapper: mobile games usam nitidez agressiva para
        // compensar resolução reduzida — chave para o "crisp" do FF
        if (IConsoleVariable* CVarSharpen = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Tonemapper.Sharpen")))
        {
            const float Sharpen = Profile.TargetFPS >= 120 ? 0.7f :
                                  Profile.TargetFPS >= 60  ? 0.5f : 0.35f;
            CVarSharpen->Set(Sharpen, ECVF_SetByConsole);
        }

        // Baseline de screen percentage (DRS ajusta em runtime)
        if (IConsoleVariable* CVarScreenPct = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ScreenPercentage")))
        {
            CVarScreenPct->Set(100.0f, ECVF_SetByConsole);
        }

        // TSR: histórico de amostras — presets High+ usam 4 samples (bordas
        // limpas em movimento), presets baixos usam 2 (custo mínimo)
        if (IConsoleVariable* CVarTSR = IConsoleManager::Get().FindConsoleVariable(TEXT("r.TSR.History.SampleCount")))
        {
            CVarTSR->Set(Profile.ViewDistanceScale >= 0.85f ? 4 : 2, ECVF_SetByConsole);
        }
    }
}

EKhaaosUpscalerTech UKhaaosGraphicsPresetSubsystem::DetectBestUpscaler() const
{
    // Prioridade: DLSS > FSR > XeSS > TSR
    if (GEngine)
    {
        if (GEngine->FindPlugin(TEXT("DLSS")) != nullptr)
        {
            return EKhaaosUpscalerTech::DLSS;
        }
        if (GEngine->FindPlugin(TEXT("FSR3")) != nullptr)
        {
            return EKhaaosUpscalerTech::FSR;
        }
        if (GEngine->FindPlugin(TEXT("XeSS")) != nullptr)
        {
            return EKhaaosUpscalerTech::XeSS;
        }
    }
    return EKhaaosUpscalerTech::TSR;
}

int32 UKhaaosGraphicsPresetSubsystem::DetectGPUVRAM() const
{
    // Windows: DXGI adapter desc (via D3D SDK)
    // Linux: parse nvidia-smi output
    // Fallback: assumir 6GB (GTX 1060 tier) para detecção conservadora

#if PLATFORM_WINDOWS
    static IConsoleVariable* CVarVRAM = IConsoleManager::Get().FindConsoleVariable(TEXT("r.GraphicsAdapterVRAM"));
    if (CVarVRAM)
    {
        return CVarVRAM->GetInt();
    }
#endif

    return 6144; // 6GB default (conservative)
}
