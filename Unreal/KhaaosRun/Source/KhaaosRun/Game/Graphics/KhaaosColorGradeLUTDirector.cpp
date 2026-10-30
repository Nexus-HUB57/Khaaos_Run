// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosColorGradeLUTDirector
// Color grading cinematográfico via 3D LUT — substitui SceneTint linear por
// LUTs por mood no estilo Free Fire. Crossfade animado entre moods.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosColorGradeLUTDirector.h"
#include "KhaaosRun.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/Scene.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreMisc.h"
#include "HAL/IConsoleManager.h"
#include "UObject/UObjectGlobals.h"
#include "Engine/Texture.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

bool UKhaaosColorGradeLUTDirector::ShouldCreateSubsystem(UObject* Outer) const
{
    // Não criar em worlds de editor/preview — apenas gameplay
    if (const UWorld* World = Cast<UWorld>(Outer))
    {
        if (World->WorldType == EWorldType::Editor || World->WorldType == EWorldType::EditorPreview)
        {
            return false;
        }
    }
    return Super::ShouldCreateSubsystem(Outer);
}

void UKhaaosColorGradeLUTDirector::OnWorldBeginPlay(UWorld& InWorld)
{
    Super::OnWorldBeginPlay(InWorld);

    // Dedicated server / NullRHI / commandlet: nada para renderizar
    if (!IsVisualRuntime(InWorld))
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("[ColorGradeLUT] Mundo %s é server/headless — diretor inativo."),
            *InWorld.GetName());
        return;
    }

    // Referenciar volume do PostProcessDirector ou criar o próprio
    ActiveVolume = GetOrCreateVolume(InWorld);
    if (!ActiveVolume)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[ColorGradeLUT] FALHA ao obter PostProcessVolume."));
        return;
    }

    // Aplicar LUT do mood automático do mundo
    const EKhaaosWorldMood WorldMood = UKhaaosPostProcessDirector::AutoMoodForWorld(InWorld.GetFName());
    ApplyLUTForMood(WorldMood, 1.0f);

    UE_LOG(LogKhaaosRun, Display, TEXT("[ColorGradeLUT] Inicializado. LUT do mood %s aplicado (volume %s)."),
        *UEnum::GetDisplayValueAsText(WorldMood).ToString(),
        bUsingDirectorVolume ? TEXT("do PostProcessDirector") : TEXT("próprio"));
}

void UKhaaosColorGradeLUTDirector::Deinitialize()
{
    if (TickerHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(TickerHandle);
        TickerHandle.Reset();
    }
    ActiveVolume = nullptr;
    LoadedLUTTexture = nullptr;
    Super::Deinitialize();
}

// ─── LUT Application ──────────────────────────────────────────────────────────

void UKhaaosColorGradeLUTDirector::ApplyLUTForMood(EKhaaosWorldMood Mood, float BlendTime)
{
    CurrentMood = Mood;
    CurrentConfig = BuildLUTConfigForMood(Mood);

    // Carregar textura LUT via soft reference
    if (!CurrentConfig.LUTTexturePath.IsNull())
    {
        LoadedLUTTexture = Cast<UTexture>(CurrentConfig.LUTTexturePath.TryLoad());
    }

    // Configurar animação de blend
    LUTBlendSpeedPerSec = BlendTime > KINDA_SMALL_NUMBER ? (1.0f / BlendTime) : 100.0f;
    LUTIntensityTarget = CurrentConfig.LUTIntensity;
    LUTIntensityCurrent = 0.0f; // Rampa de 0→1

    // Iniciar ticker de blend se necessário
    if (!TickerHandle.IsValid())
    {
        TWeakObjectPtr<UKhaaosColorGradeLUTDirector> WeakThis(this);
        TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
            [WeakThis](float DeltaTime) -> bool
            {
                if (UKhaaosColorGradeLUTDirector* StrongThis = WeakThis.Get())
                {
                    return StrongThis->TickLUTBlend(DeltaTime);
                }
                return false;
            }, 0.0f);
    }

    // Aplicar imediatamente no volume
    ApplyLUTToVolume();

    UE_LOG(LogKhaaosRun, Display, TEXT("[ColorGradeLUT] Mood %s — LUT: %s, Intensidade: %.2f, Tint: (%.2f,%.2f,%.2f), Sat: %.2f, Contraste: %.2f"),
        *UEnum::GetDisplayValueAsText(Mood).ToString(),
        *CurrentConfig.LUTTexturePath.ToString(),
        CurrentConfig.LUTIntensity,
        CurrentConfig.TintColor.R, CurrentConfig.TintColor.G, CurrentConfig.TintColor.B,
        CurrentConfig.SaturationBoost, CurrentConfig.ContrastBoost);
}

FKhaaosColorGradeLUTConfig UKhaaosColorGradeLUTDirector::BuildLUTConfigForMood(EKhaaosWorldMood Mood)
{
    FKhaaosColorGradeLUTConfig Config;

    switch (Mood)
    {
    case EKhaaosWorldMood::PadraoBattle:
        // Assinatura Free Fire: LUT quente e saturado
        Config.LUTTexturePath = FSoftObjectPath(TEXT("/Game/Graphics/LUTs/LUT_PadraoBattle.LUT_PadraoBattle"));
        Config.LUTIntensity = 1.0f;
        Config.LUTSize = 32;
        Config.TintColor = FLinearColor(1.03f, 1.0f, 0.96f);
        Config.SaturationBoost = 1.15f;
        Config.ContrastBoost = 1.08f;
        break;

    case EKhaaosWorldMood::NoiteNeon:
        // Noite cyber: LUT frio azul-neon com contraste alto
        Config.LUTTexturePath = FSoftObjectPath(TEXT("/Game/Graphics/LUTs/LUT_NoiteNeon.LUT_NoiteNeon"));
        Config.LUTIntensity = 1.0f;
        Config.LUTSize = 32;
        Config.TintColor = FLinearColor(0.92f, 0.96f, 1.08f);
        Config.SaturationBoost = 1.25f;
        Config.ContrastBoost = 1.12f;
        break;

    case EKhaaosWorldMood::NebulosaAlien:
        // Nebulosa alienígena: LUT violeta com desaturação parcial
        Config.LUTTexturePath = FSoftObjectPath(TEXT("/Game/Graphics/LUTs/LUT_NebulosaAlien.LUT_NebulosaAlien"));
        Config.LUTIntensity = 0.9f;
        Config.LUTSize = 32;
        Config.TintColor = FLinearColor(1.05f, 0.95f, 1.10f);
        Config.SaturationBoost = 1.10f;
        Config.ContrastBoost = 1.05f;
        break;

    case EKhaaosWorldMood::AmanhecerVenenoso:
        // Barburhen ácido: LUT tóxico amarelo-esverdeado
        Config.LUTTexturePath = FSoftObjectPath(TEXT("/Game/Graphics/LUTs/LUT_AmanhecerVenenoso.LUT_AmanhecerVenenoso"));
        Config.LUTIntensity = 0.95f;
        Config.LUTSize = 32;
        Config.TintColor = FLinearColor(1.06f, 1.02f, 0.88f);
        Config.SaturationBoost = 1.20f;
        Config.ContrastBoost = 1.10f;
        break;

    case EKhaaosWorldMood::LowEndLeve:
        // Hardware fraco: LUT neutro, grading mínimo
        Config.LUTTexturePath = FSoftObjectPath(TEXT("/Game/Graphics/LUTs/LUT_LowEndLeve.LUT_LowEndLeve"));
        Config.LUTIntensity = 0.5f;
        Config.LUTSize = 32;
        Config.TintColor = FLinearColor::White;
        Config.SaturationBoost = 1.0f;
        Config.ContrastBoost = 1.0f;
        break;

    default:
        break;
    }

    return Config;
}

void UKhaaosColorGradeLUTDirector::CrossfadeLUT(EKhaaosWorldMood From, EKhaaosWorldMood To, float Duration)
{
    // Garantir que o mood de origem está aplicado
    if (CurrentMood != From)
    {
        ApplyLUTForMood(From, 0.0f); // Aplicar sem blend
        LUTIntensityCurrent = 1.0f;  // Origem já em intensidade máxima
    }

    // Configurar crossfade
    CrossfadeTargetMood = To;
    bCrossfading = true;
    LUTBlendSpeedPerSec = Duration > KINDA_SMALL_NUMBER ? (1.0f / Duration) : 100.0f;
    LUTIntensityTarget = 1.0f;

    // Iniciar ticker se necessário
    if (!TickerHandle.IsValid())
    {
        TWeakObjectPtr<UKhaaosColorGradeLUTDirector> WeakThis(this);
        TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
            [WeakThis](float DeltaTime) -> bool
            {
                if (UKhaaosColorGradeLUTDirector* StrongThis = WeakThis.Get())
                {
                    return StrongThis->TickLUTBlend(DeltaTime);
                }
                return false;
            }, 0.0f);
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[ColorGradeLUT] Crossfade: %s → %s (%.2fs)"),
        *UEnum::GetDisplayValueAsText(From).ToString(),
        *UEnum::GetDisplayValueAsText(To).ToString(),
        Duration);
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosColorGradeLUTDirector* UKhaaosColorGradeLUTDirector::GetActiveForGame()
{
    if (!GEngine)
    {
        return nullptr;
    }

    UWorld* PlayWorld = GEngine->GetCurrentPlayWorld();
    if (!PlayWorld)
    {
        return nullptr;
    }

    return PlayWorld->GetSubsystem<UKhaaosColorGradeLUTDirector>();
}

// ─── Internos ─────────────────────────────────────────────────────────────────

APostProcessVolume* UKhaaosColorGradeLUTDirector::GetOrCreateVolume(UWorld& InWorld)
{
    // Tentar reutilizar o volume do PostProcessDirector
    if (UKhaaosPostProcessDirector* PPDirector = InWorld.GetSubsystem<UKhaaosPostProcessDirector>())
    {
        if (APostProcessVolume* DirectorVolume = PPDirector->GetActiveVolume())
        {
            bUsingDirectorVolume = true;
            return DirectorVolume;
        }
    }

    // Fallback: criar volume próprio
    bUsingDirectorVolume = false;

    FActorSpawnParameters SpawnParams;
    SpawnParams.Name = MakeUniqueObjectName(&InWorld, APostProcessVolume::StaticClass(), FName(TEXT("KhaaosLUTVolume")));
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    SpawnParams.ObjectFlags |= RF_Transient;

    APostProcessVolume* Volume = InWorld.SpawnActor<APostProcessVolume>(
        APostProcessVolume::StaticClass(), FTransform::Identity, SpawnParams);

    if (Volume)
    {
        Volume->bUnbound = true;
        Volume->Priority = 90.0f; // Prioridade menor que o diretor (100)
        Volume->bEnabled = true;
        Volume->BlendWeight = 1.0f;
    }

    return Volume;
}

bool UKhaaosColorGradeLUTDirector::IsVisualRuntime(const UWorld& World)
{
    if (World.GetNetMode() == NM_DedicatedServer)
    {
        return false;
    }
    if (IsRunningCommandlet())
    {
        return false;
    }
    if (FParse::Param(FCommandLine::Get(), TEXT("NullRHI")))
    {
        return false;
    }
    return true;
}

void UKhaaosColorGradeLUTDirector::ApplyLUTToVolume()
{
    if (!ActiveVolume)
    {
        return;
    }

    FPostProcessSettings& Settings = ActiveVolume->Settings;

    // Ativar override de Color Grading LUT
    Settings.bOverride_ColorGradingLUT = true;

    // Aplicar textura LUT carregada
    if (LoadedLUTTexture)
    {
        Settings.ColorGradingLUT = LoadedLUTTexture;
    }

    // Aplicar intensidade do LUT (crossfade/blend)
    Settings.bOverride_ColorGradingLUTBlend = true;
    Settings.ColorGradingLUTBlend = FMath::Clamp(LUTIntensityCurrent, 0.0f, 1.0f);

    // Aplicar tint, saturação e contraste adicionais sobre o LUT
    Settings.bOverride_SceneColorTint = true;
    Settings.SceneColorTint = CurrentConfig.TintColor;

    Settings.bOverride_ColorSaturation = true;
    Settings.ColorSaturation = FVector4(CurrentConfig.SaturationBoost, CurrentConfig.SaturationBoost,
        CurrentConfig.SaturationBoost, 1.0f);

    Settings.bOverride_ColorContrast = true;
    Settings.ColorContrast = FVector4(CurrentConfig.ContrastBoost, CurrentConfig.ContrastBoost,
        CurrentConfig.ContrastBoost, 1.0f);
}

bool UKhaaosColorGradeLUTDirector::TickLUTBlend(float DeltaTime)
{
    bool bStillTicking = false;

    // Animar intensidade do LUT
    if (LUTIntensityCurrent < LUTIntensityTarget)
    {
        LUTIntensityCurrent = FMath::Min(LUTIntensityCurrent + LUTBlendSpeedPerSec * DeltaTime, LUTIntensityTarget);
        bStillTicking = true;
    }

    // Aplicar estado intermediário
    ApplyLUTToVolume();

    // Crossfade: quando a intensidade chega ao alvo, trocar para o mood de destino
    if (bCrossfading && LUTIntensityCurrent >= LUTIntensityTarget)
    {
        bCrossfading = false;
        ApplyLUTForMood(CrossfadeTargetMood, 0.5f); // Aplicar mood destino com blend curto
        return true; // Continuar para o blend do mood destino
    }

    if (!bStillTicking)
    {
        TickerHandle.Reset();
        return false; // Blend completo — remover ticker
    }

    return true;
}
