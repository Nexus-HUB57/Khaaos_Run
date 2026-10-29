// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosLightingDirector
// Rig de iluminação programático — sol, céu, névoa e atmosfera com presets
// do planeta Khaaos. Look Free Fire = sol forte + ambient + névoa de
// profundidade. DATA: 2026-10-28
// ==============================================================================

#include "KhaaosLightingDirector.h"
#include "KhaaosRun.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/SkyAtmosphere.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreMisc.h"
#include "HAL/IConsoleManager.h"
#include "UObject/UObjectGlobals.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

bool UKhaaosLightingDirector::ShouldCreateSubsystem(UObject* Outer) const
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

void UKhaaosLightingDirector::OnWorldBeginPlay(UWorld& InWorld)
{
    Super::OnWorldBeginPlay(InWorld);

    if (!IsVisualRuntime(InWorld))
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("[LightingDirector] Mundo %s é server/headless — diretor inativo."),
            *InWorld.GetName());
        return;
    }

    // Garantir rig e aplicar preset automático do mundo
    if (!EnsureLightingRig(InWorld))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[LightingDirector] FALHA ao construir rig de iluminação."));
        return;
    }

    const EKhaaosLightingPreset WorldPreset = AutoPresetForWorld(InWorld.GetFName());
    ApplyLightingPreset(WorldPreset);
}

// ─── Preset Application ───────────────────────────────────────────────────────

void UKhaaosLightingDirector::ApplyLightingPreset(EKhaaosLightingPreset Preset)
{
    UWorld* World = GetWorld();
    if (!World || !EnsureLightingRig(*World))
    {
        return;
    }

    const FKhaaosLightingPresetConfig Config = BuildConfigForPreset(Preset);
    CurrentPreset = Preset;

    // ── Sol (DirectionalLight) ──────────────────────────────────────────────
    if (SunLight)
    {
        if (UDirectionalLightComponent* SunComp = Cast<UDirectionalLightComponent>(SunLight->GetLightComponent()))
        {
            SunComp->SetIntensity(Config.SunIntensityLux);
            SunComp->SetUseTemperature(true);
            SunComp->SetTemperature(Config.SunTemperature);
            SunComp->SetCastShadows(true);
            SunComp->DynamicShadowCascades = Config.ShadowCascades;
            SunComp->ContactShadowLength = Config.ContactShadowLength;
            SunComp->bAtmosphereSunLight = Config.bSkyAtmosphereVisible;
            SunComp->bAtmosphereSunLightDisk = Config.bSkyAtmosphereVisible;
            SunLight->SetActorRotation(FRotator(Config.SunPitchDeg, Config.SunYawDeg, 0.0f));
            SunComp->MarkRenderStateDirty();
        }
    }

    // ── Céu (SkyLight) ──────────────────────────────────────────────────────
    if (SkyLight)
    {
        if (USkyLightComponent* SkyComp = Cast<USkyLightComponent>(SkyLight->GetLightComponent()))
        {
            SkyComp->SetSourceType(SLS_CapturedScene);
            SkyComp->SetIntensity(Config.SkyLightIntensity);

            // Captura única do céu corrente (custo único, sem real-time capture)
            SkyComp->RecaptureSky();
        }
    }

    // ── Névoa (ExponentialHeightFog) ────────────────────────────────────────
    if (HeightFog)
    {
        if (UExponentialHeightFogComponent* FogComp = HeightFog->GetComponent())
        {
            FogComp->SetFogDensity(Config.FogDensity);
            FogComp->SetFogHeightFalloff(Config.FogHeightFalloff);
            FogComp->SetFogInscatteringLuminance(Config.FogInscatteringLuminance);
            FogComp->StartDistance = Config.FogStartDistance;
            FogComp->bEnableHeightFog = true;
            FogComp->bVolumetricFog = false; // Off no mobile — custo proibitivo
            FogComp->MarkRenderStateDirty();
        }
    }

    // ── Atmosfera (SkyAtmosphere) ───────────────────────────────────────────
    if (SkyAtmosphere)
    {
        SkyAtmosphere->SetActorHiddenInGame(!Config.bSkyAtmosphereVisible);
    }

    // ── CVars de sombra acopladas ao preset ─────────────────────────────────
    if (IConsoleVariable* CVarCascades = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Shadow.CSM.MaxMobileCascades")))
    {
        CVarCascades->Set(Config.ShadowCascades, ECVF_SetByGameSetting);
    }

    const float ShadowDistanceScale =
        Preset == EKhaaosLightingPreset::DiaSolarPadrao  ? 1.0f :
        Preset == EKhaaosLightingPreset::TardeDourada    ? 0.9f :
        Preset == EKhaaosLightingPreset::NoiteNeon       ? 0.7f : 0.6f;

    if (IConsoleVariable* CVarDist = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Shadow.DistanceScale")))
    {
        CVarDist->Set(ShadowDistanceScale, ECVF_SetByGameSetting);
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[LightingDirector] Preset %s aplicado: Sol=%.1flux@%.0fK (pitch %.0f), Sky=%.2f, Fog=%.3f, Cascades=%d"),
        *UEnum::GetDisplayValueAsText(Preset).ToString(),
        Config.SunIntensityLux, Config.SunTemperature, Config.SunPitchDeg,
        Config.SkyLightIntensity, Config.FogDensity, Config.ShadowCascades);
}

EKhaaosLightingPreset UKhaaosLightingDirector::AutoPresetForWorld(FName WorldName)
{
    const FString Name = WorldName.ToString();

    if (Name.Contains(TEXT("CIGKV")))
    {
        return EKhaaosLightingPreset::DiaSolarPadrao;   // Mapa principal — sol forte FF
    }
    if (Name.Contains(TEXT("Priadus")))
    {
        return EKhaaosLightingPreset::TardeDourada;     // Tropical dourado
    }
    if (Name.Contains(TEXT("Arukheea")))
    {
        return EKhaaosLightingPreset::NoiteNeon;        // Cyber noturno
    }
    if (Name.Contains(TEXT("Barburhen")) || Name.Contains(TEXT("Ckesalth")))
    {
        return EKhaaosLightingPreset::NebulosaVioleta;  // Mundos de neblina
    }

    return EKhaaosLightingPreset::DiaSolarPadrao; // Fallback: assinatura FF
}

FKhaaosLightingPresetConfig UKhaaosLightingDirector::BuildConfigForPreset(EKhaaosLightingPreset Preset)
{
    FKhaaosLightingPresetConfig Config; // defaults = DiaSolarPadrao

    switch (Preset)
    {
    case EKhaaosLightingPreset::TardeDourada:
        // Hora dourada: sol baixo quente, névoa dourada, sombras longas
        Config.SunIntensityLux = 6.5f;
        Config.SunTemperature = 4200.0f;
        Config.SunPitchDeg = 22.0f;
        Config.SunYawDeg = 130.0f;
        Config.ShadowCascades = 2;
        Config.ContactShadowLength = 0.12f;
        Config.SkyLightIntensity = 0.85f;
        Config.FogDensity = 0.05f;
        Config.FogHeightFalloff = 0.45f;
        Config.FogInscatteringLuminance = FLinearColor(0.95f, 0.72f, 0.50f);
        Config.FogStartDistance = 1500.0f;
        break;

    case EKhaaosLightingPreset::NoiteNeon:
        // Noite cyber: lua fria fraca, ambient azul escuro, névoa neon
        Config.SunIntensityLux = 0.6f;
        Config.SunTemperature = 12000.0f;
        Config.SunPitchDeg = 65.0f;
        Config.SunYawDeg = 200.0f;
        Config.ShadowCascades = 2;
        Config.ContactShadowLength = 0.06f;
        Config.SkyLightIntensity = 0.25f;
        Config.FogDensity = 0.06f;
        Config.FogHeightFalloff = 0.50f;
        Config.FogInscatteringLuminance = FLinearColor(0.15f, 0.20f, 0.38f);
        Config.FogStartDistance = 800.0f;
        break;

    case EKhaaosLightingPreset::NebulosaVioleta:
        // Nebulosa alienígena: luz difusa violeta, névoa densa que esconde o horizonte
        Config.SunIntensityLux = 4.0f;
        Config.SunTemperature = 7000.0f;
        Config.SunPitchDeg = 40.0f;
        Config.SunYawDeg = 90.0f;
        Config.ShadowCascades = 2;
        Config.ContactShadowLength = 0.08f;
        Config.SkyLightIntensity = 0.70f;
        Config.FogDensity = 0.09f;
        Config.FogHeightFalloff = 0.60f;
        Config.FogInscatteringLuminance = FLinearColor(0.62f, 0.50f, 0.85f);
        Config.FogStartDistance = 400.0f;
        break;

    case EKhaaosLightingPreset::DiaSolarPadrao:
    default:
        // Meio-dia claro — assinatura Free Fire (defaults da struct)
        break;
    }

    return Config;
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosLightingDirector* UKhaaosLightingDirector::GetActiveForGame()
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

    return PlayWorld->GetSubsystem<UKhaaosLightingDirector>();
}

// ─── Internos ─────────────────────────────────────────────────────────────────

bool UKhaaosLightingDirector::EnsureLightingRig(UWorld& InWorld)
{
    if (!IsVisualRuntime(InWorld))
    {
        return false;
    }

    // ── Sol ──────────────────────────────────────────────────────────────────
    if (!SunLight)
    {
        FActorSpawnParameters Params;
        Params.Name = MakeUniqueObjectName(&InWorld, ADirectionalLight::StaticClass(), FName(TEXT("KhaaosSun")));
        Params.ObjectFlags |= RF_Transient;

        ADirectionalLight* Actor = InWorld.SpawnActorDeferred<ADirectionalLight>(
            ADirectionalLight::StaticClass(), FTransform::Identity, nullptr, nullptr,
            ESpawnActorCollisionHandlingMethod::AlwaysSpawn, ESpawnActorScaleMethod::MultiplyRoot, Params);

        if (Actor)
        {
            Actor->FinishSpawning(FTransform::Identity);
            SunLight = Actor;
        }
    }

    // ── SkyLight (ambient) ───────────────────────────────────────────────────
    if (!SkyLight)
    {
        FActorSpawnParameters Params;
        Params.Name = MakeUniqueObjectName(&InWorld, ASkyLight::StaticClass(), FName(TEXT("KhaaosSky")));
        Params.ObjectFlags |= RF_Transient;

        ASkyLight* Actor = InWorld.SpawnActorDeferred<ASkyLight>(
            ASkyLight::StaticClass(), FTransform::Identity, nullptr, nullptr,
            ESpawnActorCollisionHandlingMethod::AlwaysSpawn, ESpawnActorScaleMethod::MultiplyRoot, Params);

        if (Actor)
        {
            // Pré-registro: captura única (sem real-time — mobile)
            if (USkyLightComponent* SkyComp = Cast<USkyLightComponent>(Actor->GetLightComponent()))
            {
                SkyComp->SetSourceType(SLS_CapturedScene);
                SkyComp->bRealTimeCapture = false;
                SkyComp->bCaptureEveryFrame = false;
                SkyComp->bCaptureOnMovement = false;
            }
            Actor->FinishSpawning(FTransform::Identity);
            SkyLight = Actor;
        }
    }

    // ── Névoa exponencial ────────────────────────────────────────────────────
    if (!HeightFog)
    {
        FActorSpawnParameters Params;
        Params.Name = MakeUniqueObjectName(&InWorld, AExponentialHeightFog::StaticClass(), FName(TEXT("KhaaosFog")));
        Params.ObjectFlags |= RF_Transient;

        AExponentialHeightFog* Actor = InWorld.SpawnActorDeferred<AExponentialHeightFog>(
            AExponentialHeightFog::StaticClass(), FTransform::Identity, nullptr, nullptr,
            ESpawnActorCollisionHandlingMethod::AlwaysSpawn, ESpawnActorScaleMethod::MultiplyRoot, Params);

        if (Actor)
        {
            if (UExponentialHeightFogComponent* FogComp = Actor->GetComponent())
            {
                FogComp->bEnableHeightFog = true;
                FogComp->bVolumetricFog = false; // Mobile-first
            }
            Actor->FinishSpawning(FTransform::Identity);
            HeightFog = Actor;
        }
    }

    // ── Atmosfera ────────────────────────────────────────────────────────────
    if (!SkyAtmosphere)
    {
        FActorSpawnParameters Params;
        Params.Name = MakeUniqueObjectName(&InWorld, ASkyAtmosphere::StaticClass(), FName(TEXT("KhaaosAtmosphere")));
        Params.ObjectFlags |= RF_Transient;

        ASkyAtmosphere* Actor = InWorld.SpawnActorDeferred<ASkyAtmosphere>(
            ASkyAtmosphere::StaticClass(), FTransform::Identity, nullptr, nullptr,
            ESpawnActorCollisionHandlingMethod::AlwaysSpawn, ESpawnActorScaleMethod::MultiplyRoot, Params);

        if (Actor)
        {
            Actor->FinishSpawning(FTransform::Identity);
            SkyAtmosphere = Actor;
        }
    }

    return SunLight && SkyLight && HeightFog && SkyAtmosphere;
}

bool UKhaaosLightingDirector::IsVisualRuntime(const UWorld& World)
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
