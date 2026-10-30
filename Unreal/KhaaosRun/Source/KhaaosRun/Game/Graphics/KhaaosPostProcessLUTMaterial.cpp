// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosPostProcessLUTMaterial
// Material PostProcess para LUT de color grading — integra factory procedural
// com o pipeline de renderização via PostProcessVolume + MID.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosPostProcessLUTMaterial.h"
#include "KhaaosRun.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreMisc.h"
#include "HAL/IConsoleManager.h"
#include "UObject/UObjectGlobals.h"

// ─── Caminho do material master no Content Browser ────────────────────────────
// O material M_KhaaosColorGradeLUT deve existir em /Game/Graphics/Materials/
// Parâmetros esperados no material:
//   - LUTTexture (Texture2D) — textura LUT strip layout
//   - LUTSize (Scalar) — tamanho do LUT (32 ou 65)
//   - LUTBlend (Scalar) — intensidade do LUT (0-1)
//   - AdditionalTint (Vector) — tint multiplicativo
//   - AdditionalSaturation (Scalar) — boost de saturação
//   - DebugSplitScreen (Scalar) — 0 ou 1 para debug
static const FName PP_LUT_MATERIAL_PATH(TEXT("/Game/Graphics/Materials/M_KhaaosColorGradeLUT.M_KhaaosColorGradeLUT"));

// ─── Nomes de parâmetros do material ──────────────────────────────────────────
static const FName PARAM_LUT_TEXTURE(TEXT("LUTTexture"));
static const FName PARAM_LUT_SIZE(TEXT("LUTSize"));
static const FName PARAM_LUT_BLEND(TEXT("LUTBlend"));
static const FName PARAM_ADDITIONAL_TINT(TEXT("AdditionalTint"));
static const FName PARAM_ADDITIONAL_SATURATION(TEXT("AdditionalSaturation"));
static const FName PARAM_DEBUG_SPLIT_SCREEN(TEXT("DebugSplitScreen"));

// ─── Lifecycle ────────────────────────────────────────────────────────────────

bool UKhaaosPostProcessLUTMaterial::ShouldCreateSubsystem(UObject* Outer) const
{
    if (const UWorld* World = Cast<UWorld>(Outer))
    {
        if (World->WorldType == EWorldType::Editor || World->WorldType == EWorldType::EditorPreview)
        {
            return false;
        }
    }
    return Super::ShouldCreateSubsystem(Outer);
}

void UKhaaosPostProcessLUTMaterial::OnWorldBeginPlay(UWorld& InWorld)
{
    Super::OnWorldBeginPlay(InWorld);

    if (!IsVisualRuntime(InWorld))
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("[PostProcessLUT] Mundo %s é server/headless — inativo."), *InWorld.GetName());
        return;
    }

    // Referenciar volume
    ActiveVolume = GetOrCreateVolume(InWorld);
    if (!ActiveVolume)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[PostProcessLUT] FALHA ao obter PostProcessVolume."));
        return;
    }

    // Carregar material master
    const FSoftObjectPath MaterialPath(PP_LUT_MATERIAL_PATH);
    MasterMaterial = Cast<UMaterialInterface>(MaterialPath.TryLoad());

    // Aplicar LUT do mood automático
    const EKhaaosWorldMood WorldMood = UKhaaosPostProcessDirector::AutoMoodForWorld(InWorld.GetFName());
    ApplyLUTMaterial(WorldMood, 1.0f);

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessLUT] Inicializado. Mood %s, Material: %s"),
        *UEnum::GetDisplayValueAsText(WorldMood).ToString(),
        MasterMaterial ? TEXT("carregado") : TEXT("NÃO encontrado — usando fallback ColorGradingLUT"));
}

void UKhaaosPostProcessLUTMaterial::Deinitialize()
{
    if (TickerHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(TickerHandle);
        TickerHandle.Reset();
    }

    // Remover MID do volume
    RemoveLUTMaterial();

    ActiveVolume = nullptr;
    LUTMaterialMID = nullptr;
    MasterMaterial = nullptr;
    CurrentLUTTexture = nullptr;

    Super::Deinitialize();
}

// ─── LUT Material Application ────────────────────────────────────────────────

void UKhaaosPostProcessLUTMaterial::ApplyLUTMaterial(EKhaaosWorldMood Mood, float BlendTime)
{
    Config.ActiveMood = Mood;

    // Obter textura LUT do factory
    UKhaaosLUTTextureFactory* Factory = GEngine->GetEngineSubsystem<UKhaaosLUTTextureFactory>();
    if (!Factory)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[PostProcessLUT] LUTTextureFactory não disponível."));
        return;
    }

    CurrentLUTTexture = Factory->GetLUTForMood(Mood);
    if (!CurrentLUTTexture)
    {
        // Gerar se ainda não existe
        CurrentLUTTexture = Factory->GenerateLUTForMood(Mood);
    }

    if (!CurrentLUTTexture)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[PostProcessLUT] FALHA ao obter/generar LUT para mood %s."),
            *UEnum::GetDisplayValueAsText(Mood).ToString());
        return;
    }

    // Criar MID se não existe
    if (!LUTMaterialMID)
    {
        LUTMaterialMID = CreateLUTMaterialMID(CurrentLUTTexture);
    }

    if (LUTMaterialMID)
    {
        // Atualizar parâmetros do MID
        LUTMaterialMID->SetTextureParameterValue(PARAM_LUT_TEXTURE, CurrentLUTTexture);

        const FKhaaosLUTRecipe Recipe = UKhaaosLUTTextureFactory::BuildRecipeForMood(Mood);
        LUTMaterialMID->SetScalarParameterValue(PARAM_LUT_SIZE, static_cast<float>(Recipe.LUTSize));

        // Rampa de blend (começa em 0, anima para Config.LUTBlend)
        LUTMaterialMID->SetScalarParameterValue(PARAM_LUT_BLEND, 0.0f);
        LUTMaterialMID->SetVectorParameterValue(PARAM_ADDITIONAL_TINT, Config.AdditionalTint);
        LUTMaterialMID->SetScalarParameterValue(PARAM_ADDITIONAL_SATURATION, Config.AdditionalSaturation);
        LUTMaterialMID->SetScalarParameterValue(PARAM_DEBUG_SPLIT_SCREEN, Config.bDebugSplitScreen ? 1.0f : 0.0f);

        // Aplicar no volume
        ApplyMIDToVolume();

        // Animar blend via ticker
        if (BlendTime > KINDA_SMALL_NUMBER)
        {
            CrossfadeSpeed = 1.0f / BlendTime;
            CrossfadeProgress = 0.0f;
            bCrossfading = true;

            if (!TickerHandle.IsValid())
            {
                TWeakObjectPtr<UKhaaosPostProcessLUTMaterial> WeakThis(this);
                TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
                    [WeakThis](float DeltaTime) -> bool
                    {
                        if (UKhaaosPostProcessLUTMaterial* StrongThis = WeakThis.Get())
                        {
                            return StrongThis->TickCrossfade(DeltaTime);
                        }
                        return false;
                    }, 0.0f);
            }
        }
        else
        {
            // Sem animação — aplicar blend máximo imediatamente
            LUTMaterialMID->SetScalarParameterValue(PARAM_LUT_BLEND, Config.LUTBlend);
        }
    }

    // Se o material master não existe, usar o fallback da engine (ColorGradingLUT)
    if (!MasterMaterial && ActiveVolume)
    {
        // Fallback: aplicar via ColorGradingLUT nativo do PostProcessVolume
        FPostProcessSettings& Settings = ActiveVolume->Settings;
        Settings.bOverride_ColorGradingLUT = true;
        Settings.ColorGradingLUT = CurrentLUTTexture;
        Settings.bOverride_ColorGradingLUTBlend = true;
        Settings.ColorGradingLUTBlend = Config.LUTBlend;
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessLUT] Mood %s aplicado (blend=%.2fs, LUT=%s, MID=%s)"),
        *UEnum::GetDisplayValueAsText(Mood).ToString(),
        BlendTime,
        *CurrentLUTTexture->GetName(),
        LUTMaterialMID ? TEXT("ok") : TEXT("null"));
}

void UKhaaosPostProcessLUTMaterial::CrossfadeLUTMaterial(EKhaaosWorldMood From, EKhaaosWorldMood To, float Duration)
{
    // Garantir que o mood de origem está aplicado
    if (Config.ActiveMood != From)
    {
        ApplyLUTMaterial(From, 0.0f);
    }

    // Configurar crossfade
    CrossfadeTargetMood = To;
    bCrossfading = true;
    CrossfadeProgress = 0.0f;
    CrossfadeSpeed = Duration > KINDA_SMALL_NUMBER ? (1.0f / Duration) : 100.0f;

    // Iniciar ticker
    if (!TickerHandle.IsValid())
    {
        TWeakObjectPtr<UKhaaosPostProcessLUTMaterial> WeakThis(this);
        TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
            [WeakThis](float DeltaTime) -> bool
            {
                if (UKhaaosPostProcessLUTMaterial* StrongThis = WeakThis.Get())
                {
                    return StrongThis->TickCrossfade(DeltaTime);
                }
                return false;
            }, 0.0f);
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[PostProcessLUT] Crossfade: %s → %s (%.2fs)"),
        *UEnum::GetDisplayValueAsText(From).ToString(),
        *UEnum::GetDisplayValueAsText(To).ToString(),
        Duration);
}

void UKhaaosPostProcessLUTMaterial::RemoveLUTMaterial()
{
    if (ActiveVolume && LUTMaterialMID)
    {
        // Remover do array de PostProcess materials
        TArray<FWeightedBlendable>& Blendables = ActiveVolume->Settings.WeightedBlendables;
        for (int32 i = Blendables.Num() - 1; i >= 0; --i)
        {
            if (Blendables[i].Object == LUTMaterialMID)
            {
                Blendables.RemoveAt(i);
                break;
            }
        }
    }
    LUTMaterialMID = nullptr;
}

// ─── Runtime Controls ────────────────────────────────────────────────────────

void UKhaaosPostProcessLUTMaterial::SetLUTBlend(float Blend)
{
    Config.LUTBlend = FMath::Clamp(Blend, 0.0f, 1.0f);
    if (LUTMaterialMID)
    {
        LUTMaterialMID->SetScalarParameterValue(PARAM_LUT_BLEND, Config.LUTBlend);
    }
}

void UKhaaosPostProcessLUTMaterial::SetAdditionalTint(FLinearColor Tint)
{
    Config.AdditionalTint = Tint;
    if (LUTMaterialMID)
    {
        LUTMaterialMID->SetVectorParameterValue(PARAM_ADDITIONAL_TINT, Tint);
    }
}

void UKhaaosPostProcessLUTMaterial::SetAdditionalSaturation(float Saturation)
{
    Config.AdditionalSaturation = FMath::Clamp(Saturation, 0.0f, 2.0f);
    if (LUTMaterialMID)
    {
        LUTMaterialMID->SetScalarParameterValue(PARAM_ADDITIONAL_SATURATION, Config.AdditionalSaturation);
    }
}

// ─── Debug ────────────────────────────────────────────────────────────────────

void UKhaaosPostProcessLUTMaterial::SetDebugSplitScreen(bool bEnable)
{
    Config.bDebugSplitScreen = bEnable;
    if (LUTMaterialMID)
    {
        LUTMaterialMID->SetScalarParameterValue(PARAM_DEBUG_SPLIT_SCREEN, bEnable ? 1.0f : 0.0f);
    }
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosPostProcessLUTMaterial* UKhaaosPostProcessLUTMaterial::GetActiveForGame()
{
    if (!GEngine) return nullptr;
    UWorld* PlayWorld = GEngine->GetCurrentPlayWorld();
    if (!PlayWorld) return nullptr;
    return PlayWorld->GetSubsystem<UKhaaosPostProcessLUTMaterial>();
}

// ─── Internal ─────────────────────────────────────────────────────────────────

APostProcessVolume* UKhaaosPostProcessLUTMaterial::GetOrCreateVolume(UWorld& InWorld)
{
    // Reutilizar volume do PostProcessDirector
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
    SpawnParams.Name = MakeUniqueObjectName(&InWorld, APostProcessVolume::StaticClass(), FName(TEXT("KhaaosLUTPPVolume")));
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    SpawnParams.ObjectFlags |= RF_Transient;

    APostProcessVolume* Volume = InWorld.SpawnActor<APostProcessVolume>(
        APostProcessVolume::StaticClass(), FTransform::Identity, SpawnParams);

    if (Volume)
    {
        Volume->bUnbound = true;
        Volume->Priority = 95.0f; // Prioridade entre diretor (100) e LUT director (90)
        Volume->bEnabled = true;
        Volume->BlendWeight = 1.0f;
    }

    return Volume;
}

UMaterialInstanceDynamic* UKhaaosPostProcessLUTMaterial::CreateLUTMaterialMID(UTexture2D* LUTTexture)
{
    if (!MasterMaterial)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[PostProcessLUT] Material master não carregado — MID não criado."));
        return nullptr;
    }

    // Criar MID a partir do material master
    UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(MasterMaterial, GetTransientPackage(), FName(TEXT("MID_KhaaosColorGradeLUT")));

    if (MID)
    {
        MID->SetTextureParameterValue(PARAM_LUT_TEXTURE, LUTTexture);

        const FKhaaosLUTRecipe Recipe = UKhaaosLUTTextureFactory::BuildRecipeForMood(Config.ActiveMood);
        MID->SetScalarParameterValue(PARAM_LUT_SIZE, static_cast<float>(Recipe.LUTSize));
        MID->SetScalarParameterValue(PARAM_LUT_BLEND, Config.LUTBlend);
        MID->SetVectorParameterValue(PARAM_ADDITIONAL_TINT, Config.AdditionalTint);
        MID->SetScalarParameterValue(PARAM_ADDITIONAL_SATURATION, Config.AdditionalSaturation);
        MID->SetScalarParameterValue(PARAM_DEBUG_SPLIT_SCREEN, 0.0f);
    }

    return MID;
}

void UKhaaosPostProcessLUTMaterial::ApplyMIDToVolume()
{
    if (!ActiveVolume || !LUTMaterialMID)
    {
        return;
    }

    // Adicionar ao array de WeightedBlendables do PostProcessVolume
    TArray<FWeightedBlendable>& Blendables = ActiveVolume->Settings.WeightedBlendables;

    // Verificar se já está no array
    bool bFound = false;
    for (FWeightedBlendable& Blendable : Blendables)
    {
        if (Blendable.Object == LUTMaterialMID)
        {
            Blendable.Weight = Config.LUTBlend;
            bFound = true;
            break;
        }
    }

    if (!bFound)
    {
        // Adicionar novo blendable com peso = LUTBlend
        FWeightedBlendable& NewBlendable = Blendables.AddDefaulted_GetRef();
        NewBlendable.Object = LUTMaterialMID;
        NewBlendable.Weight = Config.LUTBlend;
    }
}

bool UKhaaosPostProcessLUTMaterial::IsVisualRuntime(const UWorld& World)
{
    if (World.GetNetMode() == NM_DedicatedServer) return false;
    if (IsRunningCommandlet()) return false;
    if (FParse::Param(FCommandLine::Get(), TEXT("NullRHI"))) return false;
    return true;
}

bool UKhaaosPostProcessLUTMaterial::TickCrossfade(float DeltaTime)
{
    bool bStillTicking = false;

    if (bCrossfading)
    {
        CrossfadeProgress = FMath::Min(CrossfadeProgress + CrossfadeSpeed * DeltaTime, 1.0f);

        // Animar blend do LUT
        if (LUTMaterialMID)
        {
            LUTMaterialMID->SetScalarParameterValue(PARAM_LUT_BLEND, CrossfadeProgress * Config.LUTBlend);
        }

        // Quando crossfade completa, trocar para mood de destino
        if (CrossfadeProgress >= 1.0f)
        {
            bCrossfading = false;
            ApplyLUTMaterial(CrossfadeTargetMood, 0.0f);
            return true; // Continuar um tick para o ApplyLUTMaterial surtir efeito
        }

        bStillTicking = true;
    }

    if (!bStillTicking)
    {
        TickerHandle.Reset();
        return false;
    }

    return true;
}
