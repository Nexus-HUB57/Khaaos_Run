// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosPostProcessDirector
// Pós-processamento REAL via FPostProcessSettings — assinatura visual
// inspirada no Free Fire (exposição estável, contraste punchy, saturação alta).
// DATA: 2026-10-28
// ==============================================================================

#include "KhaaosPostProcessDirector.h"
#include "KhaaosRun.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/Scene.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreMisc.h"
#include "HAL/IConsoleManager.h"
#include "UObject/UObjectGlobals.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

bool UKhaaosPostProcessDirector::ShouldCreateSubsystem(UObject* Outer) const
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

void UKhaaosPostProcessDirector::OnWorldBeginPlay(UWorld& InWorld)
{
    Super::OnWorldBeginPlay(InWorld);

    // Dedicated server / NullRHI / commandlet: nada para renderizar
    if (!IsVisualRuntime(InWorld))
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("[PostProcessDirector] Mundo %s é server/headless — diretor inativo."),
            *InWorld.GetName());
        return;
    }

    // Criar volume gerenciado
    ActiveVolume = SpawnVolume(InWorld);
    if (!ActiveVolume)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[PostProcessDirector] FALHA ao criar APostProcessVolume."));
        return;
    }

    // Auto-mood pelo nome do mundo (estágio POST_PROCESS_SETUP pode sobrescrever)
    const EKhaaosWorldMood WorldMood = AutoMoodForWorld(InWorld.GetFName());
    ApplyMood(WorldMood, 1.5f);

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessDirector] Volume criado. Mood auto: %s (mundo %s)"),
        *UEnum::GetDisplayValueAsText(WorldMood).ToString(),
        *InWorld.GetName());
}

void UKhaaosPostProcessDirector::Deinitialize()
{
    if (TickerHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(TickerHandle);
        TickerHandle.Reset();
    }
    ActiveVolume = nullptr;
    Super::Deinitialize();
}

// ─── Mood Application ─────────────────────────────────────────────────────────

void UKhaaosPostProcessDirector::ApplyMood(EKhaaosWorldMood Mood, float BlendTime)
{
    CurrentMood = Mood;
    CurrentRecipe = BuildRecipeForMood(Mood);

    // Velocidade da rampa de blend (1/blendTime por segundo)
    BlendSpeedPerSec = BlendTime > KINDA_SMALL_NUMBER ? (1.0f / BlendTime) : 100.0f;
    BlendWeightTarget = 1.0f;

    // Iniciar rampa se ainda não está rodando
    if (!TickerHandle.IsValid() && ActiveVolume)
    {
        // FTSTicker (UE5.8): delegado primitivo TFunction<bool(float)>
        TWeakObjectPtr<UKhaaosPostProcessDirector> WeakThis(this);
        TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
            [WeakThis](float DeltaTime) -> bool
            {
                if (UKhaaosPostProcessDirector* StrongThis = WeakThis.Get())
                {
                    return StrongThis->TickBlend(DeltaTime);
                }
                return false; // Subsystem destruído — remove o ticker
            }, 0.0f);
    }

    RefreshVolumeSettings();

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessDirector] Mood %s aplicado (blend %.2fs). Exposure=%.2f EV, Sat=%.2f, Bloom=%.2f, Sharpen=%.2f"),
        *UEnum::GetDisplayValueAsText(Mood).ToString(),
        BlendTime,
        CurrentRecipe.ExposureBias,
        CurrentRecipe.Saturation,
        CurrentRecipe.BloomIntensity,
        CurrentRecipe.Sharpen);
}

EKhaaosWorldMood UKhaaosPostProcessDirector::AutoMoodForWorld(FName WorldName)
{
    // Mapeamento mundo -> mood (alinhado com os 5 mundos do Khaaos Run)
    if (WorldName == FName(TEXT("CIGKV")) || WorldName.ToString().Contains(TEXT("CIGKV")))
    {
        return EKhaaosWorldMood::PadraoBattle;       // Mapa principal — assinatura FF
    }
    if (WorldName.ToString().Contains(TEXT("Barburhen")))
    {
        return EKhaaosWorldMood::AmanhecerVenenoso;  // Mundo ácido
    }
    if (WorldName.ToString().Contains(TEXT("Priadus")))
    {
        return EKhaaosWorldMood::PadraoBattle;       // Tropical
    }
    if (WorldName.ToString().Contains(TEXT("Arukheea")))
    {
        return EKhaaosWorldMood::NoiteNeon;          // Mundo cyber noturno
    }
    if (WorldName.ToString().Contains(TEXT("Ckesalth")))
    {
        return EKhaaosWorldMood::NebulosaAlien;      // Mundo nebuloso
    }

    return EKhaaosWorldMood::PadraoBattle; // Fallback: assinatura FF
}

FKhaaosPostProcessRecipe UKhaaosPostProcessDirector::BuildRecipeForMood(EKhaaosWorldMood Mood)
{
    FKhaaosPostProcessRecipe Recipe; // defaults = PadraoBattle (assinatura FF)

    switch (Mood)
    {
    case EKhaaosWorldMood::PadraoBattle:
        // Assinatura Free Fire: claro, saturado, contraste alto, sombras leves
        Recipe.ExposureBias = 0.3f;
        Recipe.FilmSlope = 0.85f;
        Recipe.FilmToe = 0.30f;
        Recipe.FilmShoulder = 0.22f;
        Recipe.Saturation = 1.22f;
        Recipe.Contrast = 1.08f;
        Recipe.SceneTint = FLinearColor(1.03f, 1.0f, 0.96f);
        Recipe.WhiteTemp = 6200.0f;
        Recipe.BloomIntensity = 0.6f;
        Recipe.BloomThreshold = 0.85f;
        Recipe.BloomQualityCVar = 3;
        Recipe.VignetteIntensity = 0.22f;
        Recipe.Sharpen = 0.55f;
        break;

    case EKhaaosWorldMood::NoiteNeon:
        // Noite cyber: tint azul frio, bloom forte para neon, vinheta mais densa
        Recipe.ExposureBias = -0.3f;
        Recipe.FilmSlope = 0.9f;
        Recipe.FilmToe = 0.35f;
        Recipe.FilmShoulder = 0.18f;
        Recipe.Saturation = 1.35f;
        Recipe.Contrast = 1.12f;
        Recipe.SceneTint = FLinearColor(0.92f, 0.96f, 1.08f);
        Recipe.WhiteTemp = 8000.0f;
        Recipe.BloomIntensity = 0.95f;
        Recipe.BloomThreshold = 0.7f;
        Recipe.BloomQualityCVar = 4;
        Recipe.VignetteIntensity = 0.35f;
        Recipe.Sharpen = 0.5f;
        break;

    case EKhaaosWorldMood::NebulosaAlien:
        // Nebulosa alienígena: violeta, névoa visual na coloração, bloom médio
        Recipe.ExposureBias = -0.1f;
        Recipe.FilmSlope = 0.88f;
        Recipe.FilmToe = 0.32f;
        Recipe.Saturation = 1.30f;
        Recipe.Contrast = 1.10f;
        Recipe.SceneTint = FLinearColor(1.05f, 0.95f, 1.10f);
        Recipe.WhiteTemp = 7500.0f;
        Recipe.BloomIntensity = 0.8f;
        Recipe.BloomThreshold = 0.8f;
        Recipe.BloomQualityCVar = 3;
        Recipe.VignetteIntensity = 0.30f;
        Recipe.Sharpen = 0.45f;
        break;

    case EKhaaosWorldMood::AmanhecerVenenoso:
        // Barburhen ácido: tint amarelo-esverdeado tóxico, quente
        Recipe.ExposureBias = 0.1f;
        Recipe.FilmSlope = 0.87f;
        Recipe.FilmToe = 0.28f;
        Recipe.Saturation = 1.25f;
        Recipe.Contrast = 1.10f;
        Recipe.SceneTint = FLinearColor(1.06f, 1.02f, 0.88f);
        Recipe.WhiteTemp = 5400.0f;
        Recipe.BloomIntensity = 0.7f;
        Recipe.BloomThreshold = 0.8f;
        Recipe.BloomQualityCVar = 3;
        Recipe.VignetteIntensity = 0.26f;
        Recipe.Sharpen = 0.5f;
        break;

    case EKhaaosWorldMood::LowEndLeve:
        // Hardware fraco: grading mínimo, bloom barato, sem vinheta forte
        Recipe.ExposureBias = 0.2f;
        Recipe.FilmSlope = 0.8f;
        Recipe.FilmToe = 0.25f;
        Recipe.Saturation = 1.10f;
        Recipe.Contrast = 1.04f;
        Recipe.SceneTint = FLinearColor(1.0f, 1.0f, 1.0f);
        Recipe.WhiteTemp = 6500.0f;
        Recipe.BloomIntensity = 0.4f;
        Recipe.BloomThreshold = 1.0f;
        Recipe.BloomQualityCVar = 1;
        Recipe.VignetteIntensity = 0.10f;
        Recipe.Sharpen = 0.30f;
        break;

    default:
        break;
    }

    return Recipe;
}

// ─── Species Overlay ──────────────────────────────────────────────────────────

void UKhaaosPostProcessDirector::ApplySpeciesGrade(EKhaaosSpecies Species)
{
    UKhaaosPostProcessDirector* Director = GetActiveForGame();
    if (!Director)
    {
        return; // Server/headless — sem efeitos visuais
    }

    Director->ActiveSpecies = Species;
    Director->SpeciesTint = GetSpeciesTint(Species);
    Director->SpeciesVignetteBoost = [Species]()
    {
        switch (Species)
        {
        case EKhaaosSpecies::HURAN:  return 0.10f; // Pressão aquática
        case EKhaaosSpecies::KHAEL:  return 0.15f; // Foco arcano
        case EKhaaosSpecies::VENEX:  return 0.12f; // HUD cyber
        case EKhaaosSpecies::ONITH:  return 0.18f; // Visão predatória
        case EKhaaosSpecies::ZHEERS: return 0.20f; // Shadow meld
        case EKhaaosSpecies::SKEETW: return 0.08f; // Leveza aviária
        default:                     return 0.0f;
        }
    }();

    Director->RefreshVolumeSettings();
}

void UKhaaosPostProcessDirector::ClearSpeciesGrade()
{
    UKhaaosPostProcessDirector* Director = GetActiveForGame();
    if (!Director)
    {
        return;
    }

    Director->ActiveSpecies = EKhaaosSpecies::NONE;
    Director->SpeciesTint = FLinearColor::White;
    Director->SpeciesVignetteBoost = 0.0f;
    Director->RefreshVolumeSettings();
}

FLinearColor UKhaaosPostProcessDirector::GetSpeciesTint(EKhaaosSpecies Species)
{
    switch (Species)
    {
    case EKhaaosSpecies::HURAN:  return FLinearColor(0.90f, 1.03f, 1.08f); // Aquático
    case EKhaaosSpecies::KHAEL:  return FLinearColor(0.94f, 0.90f, 1.10f); // Arcano
    case EKhaaosSpecies::VENEX:  return FLinearColor(0.92f, 0.95f, 1.12f); // Cyber
    case EKhaaosSpecies::ONITH:  return FLinearColor(1.12f, 0.98f, 0.90f); // Térmico
    case EKhaaosSpecies::ZHEERS: return FLinearColor(0.96f, 0.90f, 1.10f); // Espiritual
    case EKhaaosSpecies::SKEETW: return FLinearColor(0.94f, 1.06f, 0.95f); // Aviário
    default:                     return FLinearColor::White;
    }
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosPostProcessDirector* UKhaaosPostProcessDirector::GetActiveForGame()
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

    return PlayWorld->GetSubsystem<UKhaaosPostProcessDirector>();
}

// ─── Escrita de Settings ──────────────────────────────────────────────────────

void UKhaaosPostProcessDirector::WriteRecipeToSettings(const FKhaaosPostProcessRecipe& Recipe,
    const FLinearColor& SpeciesTint, float SpeciesVignetteBoost,
    FPostProcessSettings& OutSettings)
{
    // ── Exposição ───────────────────────────────────────────────────────────
    // Exposição "fixa" estilo mobile: histograma com range colapsado (Min==Max)
    // quando bFixedExposure — elimina o pop de adaptação ao entrar em sombras.
    OutSettings.bOverride_AutoExposureBias = true;
    OutSettings.AutoExposureBias = Recipe.ExposureBias;

    OutSettings.bOverride_AutoExposureMinBrightness = true;
    OutSettings.bOverride_AutoExposureMaxBrightness = true;
    if (Recipe.bFixedExposure)
    {
        const float FixedBrightness = FMath::Clamp(FMath::Pow(2.0f, Recipe.ExposureBias), 0.1f, 10.0f);
        OutSettings.AutoExposureMinBrightness = FixedBrightness;
        OutSettings.AutoExposureMaxBrightness = FixedBrightness;
    }
    else
    {
        OutSettings.AutoExposureMinBrightness = Recipe.AutoExposureMinBrightness;
        OutSettings.AutoExposureMaxBrightness = Recipe.AutoExposureMaxBrightness;
    }

    // ── Tonemapper (contraste punchy) ───────────────────────────────────────
    OutSettings.bOverride_FilmSlope = true;
    OutSettings.FilmSlope = Recipe.FilmSlope;
    OutSettings.bOverride_FilmToe = true;
    OutSettings.FilmToe = Recipe.FilmToe;
    OutSettings.bOverride_FilmShoulder = true;
    OutSettings.FilmShoulder = Recipe.FilmShoulder;
    OutSettings.bOverride_FilmBlackClip = true;
    OutSettings.FilmBlackClip = Recipe.FilmBlackClip;
    OutSettings.bOverride_FilmWhiteClip = true;
    OutSettings.FilmWhiteClip = Recipe.FilmWhiteClip;

    // ── Color Grading (tint do mood multiplicado pelo overlay de espécie) ───
    const FLinearColor FinalTint = FLinearColor(
        Recipe.SceneTint.R * SpeciesTint.R,
        Recipe.SceneTint.G * SpeciesTint.G,
        Recipe.SceneTint.B * SpeciesTint.B,
        1.0f);

    OutSettings.bOverride_ColorSaturation = true;
    OutSettings.ColorSaturation = FVector4(Recipe.Saturation, Recipe.Saturation, Recipe.Saturation, 1.0f);
    OutSettings.bOverride_ColorContrast = true;
    OutSettings.ColorContrast = FVector4(Recipe.Contrast, Recipe.Contrast, Recipe.Contrast, 1.0f);
    OutSettings.bOverride_SceneColorTint = true;
    OutSettings.SceneColorTint = FinalTint;
    OutSettings.bOverride_WhiteTemp = true;
    OutSettings.WhiteTemp = Recipe.WhiteTemp;

    // ── Bloom ────────────────────────────────────────────────────────────────
    OutSettings.bOverride_BloomIntensity = true;
    OutSettings.BloomIntensity = Recipe.BloomIntensity;
    OutSettings.bOverride_BloomThreshold = true;
    OutSettings.BloomThreshold = Recipe.BloomThreshold;

    // ── Overlay (vignette acumula boost de espécie) ─────────────────────────
    OutSettings.bOverride_VignetteIntensity = true;
    OutSettings.VignetteIntensity = FMath::Clamp(Recipe.VignetteIntensity + SpeciesVignetteBoost, 0.0f, 1.0f);

    OutSettings.bOverride_FilmGrainIntensity = true;
    OutSettings.FilmGrainIntensity = Recipe.FilmGrainIntensity;

    OutSettings.bOverride_MotionBlurAmount = true;
    OutSettings.MotionBlurAmount = Recipe.MotionBlurAmount;
}

// ─── Internos ─────────────────────────────────────────────────────────────────

APostProcessVolume* UKhaaosPostProcessDirector::SpawnVolume(UWorld& InWorld)
{
    FActorSpawnParameters SpawnParams;
    SpawnParams.Name = MakeUniqueObjectName(&InWorld, APostProcessVolume::StaticClass(), FName(TEXT("KhaaosPPDirectorVolume")));
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    SpawnParams.ObjectFlags |= RF_Transient;

    APostProcessVolume* Volume = InWorld.SpawnActor<APostProcessVolume>(
        APostProcessVolume::StaticClass(), FTransform::Identity, SpawnParams);

    if (Volume)
    {
        // Configuração pré-registro: unbounded cobre o mapa inteiro,
        // prioridade 100 vence volumes de nível/HUD
        Volume->bUnbound = true;
        Volume->Priority = 100.0f;
        Volume->bEnabled = true;
        Volume->BlendWeight = 0.0f; // Rampa sobe via TickBlend
    }

    return Volume;
}

bool UKhaaosPostProcessDirector::IsVisualRuntime(const UWorld& World)
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

void UKhaaosPostProcessDirector::RefreshVolumeSettings()
{
    if (!ActiveVolume)
    {
        return;
    }

    WriteRecipeToSettings(CurrentRecipe, SpeciesTint, SpeciesVignetteBoost, ActiveVolume->Settings);

    // CVars globais acopladas ao mood (bloom quality + sharpen mobile)
    if (IConsoleVariable* CVarBloomQ = IConsoleManager::Get().FindConsoleVariable(TEXT("r.BloomQuality")))
    {
        CVarBloomQ->Set(CurrentRecipe.BloomQualityCVar, ECVF_SetByGameSetting);
    }
    if (IConsoleVariable* CVarSharpen = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Tonemapper.Sharpen")))
    {
        CVarSharpen->Set(CurrentRecipe.Sharpen, ECVF_SetByGameSetting);
    }
}

bool UKhaaosPostProcessDirector::TickBlend(float DeltaTime)
{
    if (BlendWeightCurrent < BlendWeightTarget)
    {
        BlendWeightCurrent = FMath::Min(BlendWeightCurrent + BlendSpeedPerSec * DeltaTime, BlendWeightTarget);

        if (ActiveVolume)
        {
            ActiveVolume->BlendWeight = BlendWeightCurrent;
        }
    }

    if (BlendWeightCurrent >= BlendWeightTarget)
    {
        TickerHandle.Reset(); // Rampa completa — para o ticker
        return false;         // false = remove o ticker
    }

    return true; // Continua tickando
}
