// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosOutlineRenderer
// Outlines coloridos via CustomDepth stencil — lê stencil values escritos
// pelo KhaaosCharacterPopComponent para renderizar outlines por espécie.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosOutlineRenderer.h"
#include "KhaaosRun.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "Game/Graphics/KhaaosGraphicsPresetSubsystem.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreMisc.h"
#include "HAL/IConsoleManager.h"
#include "UObject/UObjectGlobals.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

bool UKhaaosOutlineRenderer::ShouldCreateSubsystem(UObject* Outer) const
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

void UKhaaosOutlineRenderer::OnWorldBeginPlay(UWorld& InWorld)
{
    Super::OnWorldBeginPlay(InWorld);

    // Dedicated server / NullRHI / commandlet: nada para renderizar
    if (!IsVisualRuntime(InWorld))
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("[OutlineRenderer] Mundo %s é server/headless — renderer inativo."),
            *InWorld.GetName());
        return;
    }

    // Inicializar configuração com cores padrão por espécie
    OutlineConfig.SpeciesOutlineColors = BuildDefaultSpeciesColors();
    OutlineConfig.bEnabled = true;
    OutlineConfig.OutlineThickness = 2.0f;
    OutlineConfig.OutlineIntensity = 0.8f;
    OutlineConfig.BlurSpread = 1.0f;
    OutlineConfig.Style = EKhaaosOutlineStyle::Glow;

    // Verificar se o preset suporta outlines
    if (!QualitySupportsOutlines())
    {
        OutlineConfig.bEnabled = false;
        UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Preset Mobile/Low — outlines desabilitados (caro p/ mobile)."));
        return;
    }

    // Referenciar o volume do PostProcessDirector
    if (UKhaaosPostProcessDirector* PPDirector = InWorld.GetSubsystem<UKhaaosPostProcessDirector>())
    {
        ActiveVolume = PPDirector->GetActiveVolume();
    }

    // Configurar CustomDepth stencil pass
    ConfigureCustomDepthCVars();

    // Aplicar material de outline
    ApplyOutlineMaterial();

    UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Inicializado. Stencil pass ativo, %d espécies com cor de outline."),
        OutlineConfig.SpeciesOutlineColors.Num());
}

void UKhaaosOutlineRenderer::Deinitialize()
{
    // Restaurar CustomDepth para estado padrão ao desinicializar
    if (IConsoleVariable* CVarCustomDepth = IConsoleManager::Get().FindConsoleVariable(TEXT("r.CustomDepth")))
    {
        CVarCustomDepth->Set(0, ECVF_SetByGameSetting); // Desabilitar stencil
    }

    ActiveVolume = nullptr;
    OutlineMaterial = nullptr;
    Super::Deinitialize();
}

// ─── Outline Control ──────────────────────────────────────────────────────────

void UKhaaosOutlineRenderer::EnableOutlines(bool bEnable)
{
    OutlineConfig.bEnabled = bEnable;

    if (bEnable)
    {
        // Reconfigurar CustomDepth stencil pass
        ConfigureCustomDepthCVars();
        ApplyOutlineMaterial();

        UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Outlines HABILITADOS."));
    }
    else
    {
        // Desabilitar CustomDepth stencil
        if (IConsoleVariable* CVarCustomDepth = IConsoleManager::Get().FindConsoleVariable(TEXT("r.CustomDepth")))
        {
            CVarCustomDepth->Set(0, ECVF_SetByGameSetting);
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Outlines DESABILITADOS."));
    }
}

void UKhaaosOutlineRenderer::SetOutlineThickness(float Pixels)
{
    OutlineConfig.OutlineThickness = FMath::Clamp(Pixels, 1.0f, 5.0f);

    // Reaplicar material com nova espessura
    if (OutlineConfig.bEnabled)
    {
        ApplyOutlineMaterial();
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Espessura ajustada: %.1f px"), OutlineConfig.OutlineThickness);
}

void UKhaaosOutlineRenderer::SetSpeciesOutlineColor(EKhaaosSpecies Species, FLinearColor Color)
{
    OutlineConfig.SpeciesOutlineColors.Add(Species, Color);

    UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Cor de outline ajustada p/ espécie %s: (%.2f,%.2f,%.2f)"),
        *UEnum::GetDisplayValueAsText(Species).ToString(),
        Color.R, Color.G, Color.B);
}

void UKhaaosOutlineRenderer::SetOutlineStyle(EKhaaosOutlineStyle Style)
{
    OutlineConfig.Style = Style;

    // Reaplicar material com novo estilo
    if (OutlineConfig.bEnabled)
    {
        ApplyOutlineMaterial();
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[OutlineRenderer] Estilo ajustado: %s"),
        *UEnum::GetDisplayValueAsText(Style).ToString());
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosOutlineRenderer* UKhaaosOutlineRenderer::GetActiveForGame()
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

    return PlayWorld->GetSubsystem<UKhaaosOutlineRenderer>();
}

// ─── Internos ─────────────────────────────────────────────────────────────────

TMap<EKhaaosSpecies, FLinearColor> UKhaaosOutlineRenderer::BuildDefaultSpeciesColors()
{
    TMap<EKhaaosSpecies, FLinearColor> Colors;

    // Cores de identidade por espécie (mesma identidade visual do CharacterPop)
    Colors.Add(EKhaaosSpecies::HURAN,  FLinearColor(0.0f, 0.85f, 1.0f));   // Ciano aquático
    Colors.Add(EKhaaosSpecies::KHAEL,  FLinearColor(0.65f, 0.20f, 1.0f));  // Violeta arcano
    Colors.Add(EKhaaosSpecies::VENEX,  FLinearColor(1.0f, 0.20f, 0.80f));  // Magenta cyber
    Colors.Add(EKhaaosSpecies::ONITH,  FLinearColor(1.0f, 0.55f, 0.10f));  // Laranja térmico
    Colors.Add(EKhaaosSpecies::ZHEERS, FLinearColor(0.55f, 0.20f, 0.90f)); // Violeta espiritual
    Colors.Add(EKhaaosSpecies::SKEETW, FLinearColor(0.20f, 0.85f, 0.40f)); // Verde-pena

    return Colors;
}

void UKhaaosOutlineRenderer::ConfigureCustomDepthCVars()
{
    // r.CustomDepth 3 = Stencil + Depth (necessário para outline via stencil)
    if (IConsoleVariable* CVarCustomDepth = IConsoleManager::Get().FindConsoleVariable(TEXT("r.CustomDepth")))
    {
        CVarCustomDepth->Set(3, ECVF_SetByGameSetting);
    }

    // Transição agendada de CustomDepth (evita hitching)
    if (IConsoleVariable* CVarTransition = IConsoleManager::Get().FindConsoleVariable(TEXT("r.CustomDepth.ScheduledTransition")))
    {
        CVarTransition->Set(1, ECVF_SetByGameSetting);
    }

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[OutlineRenderer] CVars CustomDepth configurados: r.CustomDepth=3, ScheduledTransition=1"));
}

void UKhaaosOutlineRenderer::ApplyOutlineMaterial()
{
    if (!ActiveVolume || !OutlineConfig.bEnabled)
    {
        return;
    }

    // Carregar material de outline via soft reference (convention path)
    if (!OutlineMaterial)
    {
        const FSoftObjectPath OutlineMaterialPath(TEXT("/Game/Graphics/Materials/PP/M_KhaaosOutline.M_KhaaosOutline"));
        OutlineMaterial = Cast<UMaterialInterface>(OutlineMaterialPath.TryLoad());
    }

    if (!OutlineMaterial)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[OutlineRenderer] Material de outline não encontrado em /Game/Graphics/Materials/PP/M_KhaaosOutline"));
        return;
    }

    // Adicionar material de outline no slot de PostProcess do volume
    // UE5 suporta blendable PostProcess materials via AddOrUpdateBlendable
    FPostProcessSettings& Settings = ActiveVolume->Settings;

    // Configurar o material de outline como PostProcess blendable
    // O material lê CustomStencil e aplica cor/espessura baseado no stencil value
    ActiveVolume->AddOrUpdateBlendable(OutlineMaterial, OutlineConfig.OutlineIntensity);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[OutlineRenderer] Material de outline aplicado — Espessura: %.1f, Intensidade: %.2f, Estilo: %s"),
        OutlineConfig.OutlineThickness, OutlineConfig.OutlineIntensity,
        *UEnum::GetDisplayValueAsText(OutlineConfig.Style).ToString());
}

bool UKhaaosOutlineRenderer::IsVisualRuntime(const UWorld& World)
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

bool UKhaaosOutlineRenderer::QualitySupportsOutlines() const
{
    // Outlines são caros — desabilitar em Mobile e Low
    if (UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>())
    {
        const EKhaaosQualityPreset Preset = PresetSubsystem->GetCurrentPreset();
        if (Preset == EKhaaosQualityPreset::Mobile || Preset == EKhaaosQualityPreset::Low)
        {
            return false;
        }
    }
    return true;
}
