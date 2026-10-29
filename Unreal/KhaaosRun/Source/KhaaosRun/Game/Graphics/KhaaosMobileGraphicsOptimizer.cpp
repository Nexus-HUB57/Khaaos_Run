// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosMobileGraphicsOptimizer
// Otimizador agressivo de gráficos mobile — coordena CVars de renderização,
// sombra, textura e pós-processamento em uma única chamada por tier.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosMobileGraphicsOptimizer.h"
#include "KhaaosRun.h"
#include "Engine/Engine.h"
#include "HAL/IConsoleManager.h"
#include "Misc/CommandLine.h"
#include "RHI.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosMobileGraphicsOptimizer::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    bIsMobilePlatform = CheckMobilePlatform();
    CurrentTier = EKhaaosMobileTier::MidRange;
    CurrentProfile = BuildProfileForTier(CurrentTier);

    UE_LOG(LogKhaaosRun, Display, TEXT("[MobileOptimizer] Subsystem inicializado. Plataforma mobile: %s"),
        bIsMobilePlatform ? TEXT("SIM") : TEXT("NÃO"));
}

void UKhaaosMobileGraphicsOptimizer::Deinitialize(FSubsystemCollectionBase& Collection)
{
    UE_LOG(LogKhaaosRun, Display, TEXT("[MobileOptimizer] Subsystem desinicializado."));
    Super::Deinitialize(Collection);
}

// ─── Mobile Optimization ──────────────────────────────────────────────────────

void UKhaaosMobileGraphicsOptimizer::ApplyMobileOptimizations(EKhaaosMobileTier Tier)
{
    // Guarda: só aplicar em plataforma mobile
    if (!bIsMobilePlatform)
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("[MobileOptimizer] Plataforma não-mobile — otimizações ignoradas."));
        return;
    }

    CurrentTier = Tier;
    CurrentProfile = BuildProfileForTier(Tier);

    UE_LOG(LogKhaaosRun, Display, TEXT("[MobileOptimizer] Aplicando otimizações para tier %s..."),
        *UEnum::GetDisplayValueAsText(Tier).ToString());

    // ── Pós-processamento em meia resolução ─────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Mobile.HalfResPP")))
    {
        CVar->Set(CurrentProfile.bHalfResPostProcess ? 1 : 0, ECVF_SetByGameSetting);
    }

    // ── GPU skinning cache ──────────────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.SkinCache.CompileShaderOnStartup")))
    {
        CVar->Set(CurrentProfile.bGPUSkinningCache ? 1 : 0, ECVF_SetByGameSetting);
    }

    // ── Anti-aliasing: FXAA para mobile (não TAA — TAA é caro em mobile) ──
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.DefaultFeature.AntiAliasing")))
    {
        CVar->Set(1, ECVF_SetByGameSetting); // 1 = FXAA
    }

    // ── Vertex fog desabilitado em mobile ───────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Mobile.DisableVertexFog")))
    {
        CVar->Set(1, ECVF_SetByGameSetting);
    }

    // ── Distance field shadows desabilitados em mobile ──────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Mobile.AllowDistanceFieldShadows")))
    {
        CVar->Set(0, ECVF_SetByGameSetting);
    }

    // ── Luzes direcionais móveis habilitadas (necessário para sol dinâmico) ─
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Mobile.AllowMovableDirectionalLights")))
    {
        CVar->Set(1, ECVF_SetByGameSetting);
    }

    // ── Cascatas de sombra mobile ───────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Shadow.CSM.MaxMobileCascades")))
    {
        CVar->Set(CurrentProfile.MaxCascades, ECVF_SetByGameSetting);
    }

    // ── Quality bias de sombra ──────────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Shadow.QualityBias")))
    {
        CVar->Set(CurrentTier == EKhaaosMobileTier::LowEnd ? 2 : 1, ECVF_SetByGameSetting);
    }

    // ── Streaming pool size ─────────────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Streaming.PoolSize")))
    {
        CVar->Set(CurrentProfile.TexturePoolSizeMB, ECVF_SetByGameSetting);
    }

    // ── Texture streaming habilitado ────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.TextureStreaming")))
    {
        CVar->Set(1, ECVF_SetByGameSetting);
    }

    // ── Qualidade de textura por tier ───────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ContentQuality.TextureQuality")))
    {
        const int32 TextureQuality =
            CurrentTier == EKhaaosMobileTier::LowEnd   ? 0 :
            CurrentTier == EKhaaosMobileTier::MidRange ? 1 : 2;
        CVar->Set(TextureQuality, ECVF_SetByGameSetting);
    }

    // ── Forward renderer (obrigatório em mobile) ────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Mobile.ShadingPath")))
    {
        CVar->Set(0, ECVF_SetByGameSetting); // 0 = Forward
    }

    // ── MSAA ────────────────────────────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.MSAACount")))
    {
        CVar->Set(CurrentProfile.MSAASamples, ECVF_SetByGameSetting);
    }

    // ── Ambient Occlusion: off em LowEnd, SSAO em MidRange ─────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.AmbientOcclusionMethod")))
    {
        const int32 AOMethod = CurrentTier == EKhaaosMobileTier::LowEnd ? 0 : 1; // 0=off, 1=SSAO
        CVar->Set(AOMethod, ECVF_SetByGameSetting);
    }

    // ── SSR desabilitado ────────────────────────────────────────────────────
    if (CurrentProfile.bDisableSSR)
    {
        if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.SSR.Quality")))
        {
            CVar->Set(0, ECVF_SetByGameSetting);
        }
    }

    // ── Lumen desabilitado ──────────────────────────────────────────────────
    if (CurrentProfile.bDisableLumen)
    {
        if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Lumen.DiffuseIndirect.Allow")))
        {
            CVar->Set(0, ECVF_SetByGameSetting);
        }
    }

    // ── Volumetric fog desabilitado ─────────────────────────────────────────
    if (CurrentProfile.bDisableVolumetricFog)
    {
        if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.VolumetricFog")))
        {
            CVar->Set(0, ECVF_SetByGameSetting);
        }
    }

    // ── Particle LOD bias ───────────────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("fx.Niagara.DebugLODBias")))
    {
        CVar->Set(CurrentProfile.ParticleLODBias, ECVF_SetByGameSetting);
    }

    // ── Texture mip bias ────────────────────────────────────────────────────
    if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(TEXT("r.TextureMipLodBias")))
    {
        CVar->Set(CurrentProfile.TextureMipBias, ECVF_SetByGameSetting);
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[MobileOptimizer] Tier %s aplicado — HalfResPP=%d, FXAA, Cascades=%d, Pool=%dMB, MSAA=%d, SSR=%s, Lumen=%s"),
        *UEnum::GetDisplayValueAsText(Tier).ToString(),
        CurrentProfile.bHalfResPostProcess ? 1 : 0,
        CurrentProfile.MaxCascades,
        CurrentProfile.TexturePoolSizeMB,
        CurrentProfile.MSAASamples,
        CurrentProfile.bDisableSSR ? TEXT("OFF") : TEXT("ON"),
        CurrentProfile.bDisableLumen ? TEXT("OFF") : TEXT("ON"));
}

FKhaaosMobileOptimizationProfile UKhaaosMobileGraphicsOptimizer::BuildProfileForTier(EKhaaosMobileTier Tier)
{
    FKhaaosMobileOptimizationProfile Profile;

    switch (Tier)
    {
    case EKhaaosMobileTier::LowEnd:
        // Adreno 506 / Mali-T880 — hardware muito fraco
        Profile.bHalfResPostProcess = true;
        Profile.bGPUSkinningCache = true;
        Profile.bMaxFP16Textures = true;
        Profile.bDisableLensFlare = true;
        Profile.bDisableSSR = true;
        Profile.bDisableLumen = true;
        Profile.bDisableVolumetricFog = true;
        Profile.ParticleLODBias = 2;
        Profile.TextureMipBias = 2;
        Profile.ShadowResolution = 256;
        Profile.MaxCascades = 1;
        Profile.bForwardRenderer = true;
        Profile.MSAASamples = 0;    // Sem MSAA — FXAA only
        Profile.TexturePoolSizeMB = 128;
        break;

    case EKhaaosMobileTier::MidRange:
        // Adreno 610 / Mali-G72 — hardware intermediário
        Profile.bHalfResPostProcess = true;
        Profile.bGPUSkinningCache = true;
        Profile.bMaxFP16Textures = true;
        Profile.bDisableLensFlare = true;
        Profile.bDisableSSR = true;
        Profile.bDisableLumen = true;
        Profile.bDisableVolumetricFog = true;
        Profile.ParticleLODBias = 1;
        Profile.TextureMipBias = 1;
        Profile.ShadowResolution = 512;
        Profile.MaxCascades = 2;
        Profile.bForwardRenderer = true;
        Profile.MSAASamples = 2;
        Profile.TexturePoolSizeMB = 256;
        break;

    case EKhaaosMobileTier::HighEnd:
        // Adreno 660+ / Mali-G78 — mobile potente
        Profile.bHalfResPostProcess = false; // Full-res PP em high-end
        Profile.bGPUSkinningCache = true;
        Profile.bMaxFP16Textures = true;
        Profile.bDisableLensFlare = false;   // Lens flare OK em high-end
        Profile.bDisableSSR = true;          // Ainda caro em mobile
        Profile.bDisableLumen = true;        // Ainda caro em mobile
        Profile.bDisableVolumetricFog = true;
        Profile.ParticleLODBias = 0;
        Profile.TextureMipBias = 0;
        Profile.ShadowResolution = 1024;
        Profile.MaxCascades = 2;
        Profile.bForwardRenderer = true;
        Profile.MSAASamples = 4;
        Profile.TexturePoolSizeMB = 512;
        break;

    default:
        break;
    }

    return Profile;
}

EKhaaosMobileTier UKhaaosMobileGraphicsOptimizer::DetectMobileTier() const
{
    // Detecção de GPU via GRHIAdapterName (disponível após RHI init)
    const FString AdapterName = GRHIAdapterName.ToString().ToLower();

    // ── Adreno (Qualcomm) ──────────────────────────────────────────────────
    if (AdapterName.Contains(TEXT("adreno")))
    {
        // Extrair número do modelo (ex: "Adreno (TM) 660")
        int32 ModelNumber = 0;
        TArray<FString> Parts;
        AdapterName.ParseIntoArrayWS(Parts);
        for (const FString& Part : Parts)
        {
            if (Part.IsNumeric() && Part.Len() >= 3)
            {
                ModelNumber = FCString::Atoi(*Part);
                break;
            }
        }

        if (ModelNumber >= 660)  return EKhaaosMobileTier::HighEnd;
        if (ModelNumber >= 610)  return EKhaaosMobileTier::MidRange;
        return EKhaaosMobileTier::LowEnd;
    }

    // ── Mali (ARM) ─────────────────────────────────────────────────────────
    if (AdapterName.Contains(TEXT("mali")))
    {
        // Mali-G78, G77, G76 = HighEnd
        // Mali-G72, G71, G52 = MidRange
        // Mali-T880, G51, G31 = LowEnd
        if (AdapterName.Contains(TEXT("g78")) || AdapterName.Contains(TEXT("g77")) || AdapterName.Contains(TEXT("g76")))
        {
            return EKhaaosMobileTier::HighEnd;
        }
        if (AdapterName.Contains(TEXT("g72")) || AdapterName.Contains(TEXT("g71")) || AdapterName.Contains(TEXT("g52")))
        {
            return EKhaaosMobileTier::MidRange;
        }
        return EKhaaosMobileTier::LowEnd;
    }

    // ── Apple GPU (A14+ = HighEnd, A12+ = MidRange) ────────────────────────
    if (AdapterName.Contains(TEXT("apple")))
    {
        // Apple GPUs são geralmente high-end
        return EKhaaosMobileTier::HighEnd;
    }

    // Fallback: MidRange (conservador)
    return EKhaaosMobileTier::MidRange;
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosMobileGraphicsOptimizer* UKhaaosMobileGraphicsOptimizer::GetActiveForGame()
{
    if (!GEngine)
    {
        return nullptr;
    }

    return GEngine->GetEngineSubsystem<UKhaaosMobileGraphicsOptimizer>();
}

// ─── Internos ─────────────────────────────────────────────────────────────────

bool UKhaaosMobileGraphicsOptimizer::CheckMobilePlatform()
{
    // Plataforma Android
#if PLATFORM_ANDROID
    return true;
#endif

    // Plataforma iOS
#if PLATFORM_IOS
    return true;
#endif

    // Flag -mobile na command line (emulação mobile no desktop)
    if (FParse::Param(FCommandLine::Get(), TEXT("mobile")))
    {
        return true;
    }

    return false;
}
