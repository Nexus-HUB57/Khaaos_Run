// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosSpeciesLODManager
// Species-specific LOD com distância adaptativa e Nanite impostor.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosSpeciesLODManager.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Materials/MaterialInstanceDynamic.h"

void UKhaaosSpeciesLODManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Construir configs para todas as 6 espécies
    SpeciesConfigs.Add(EKhaaosSpecies::HURAN,  BuildSpeciesLODConfig(EKhaaosSpecies::HURAN));
    SpeciesConfigs.Add(EKhaaosSpecies::KHAEL,  BuildSpeciesLODConfig(EKhaaosSpecies::KHAEL));
    SpeciesConfigs.Add(EKhaaosSpecies::VENEX,  BuildSpeciesLODConfig(EKhaaosSpecies::VENEX));
    SpeciesConfigs.Add(EKhaaosSpecies::ONITH,  BuildSpeciesLODConfig(EKhaaosSpecies::ONITH));
    SpeciesConfigs.Add(EKhaaosSpecies::ZHEERS, BuildSpeciesLODConfig(EKhaaosSpecies::ZHEERS));
    SpeciesConfigs.Add(EKhaaosSpecies::SKEETW, BuildSpeciesLODConfig(EKhaaosSpecies::SKEETW));

    // Inicializar distribuição
    LODDistribution.Add(EKhaaosLODLevel::LOD0, 0);
    LODDistribution.Add(EKhaaosLODLevel::LOD1, 0);
    LODDistribution.Add(EKhaaosLODLevel::LOD2, 0);
    LODDistribution.Add(EKhaaosLODLevel::LOD3, 0);
    LODDistribution.Add(EKhaaosLODLevel::LOD4, 0);

    UE_LOG(LogTemp, Display, TEXT("[SpeciesLOD] Subsystem inicializado. 6 espécies com configs de LOD."));
}

EKhaaosLODLevel UKhaaosSpeciesLODManager::CalculateLOD(EKhaaosSpecies Species, float DistanceCm, float ScreenSizeFraction) const
{
    const FKhaaosSpeciesLODConfig* Config = SpeciesConfigs.Find(Species);
    if (!Config) return EKhaaosLODLevel::LOD2; // Fallback

    // Determinar LOD baseado em distância
    EKhaaosLODLevel DistanceLOD = EKhaaosLODLevel::LOD0;

    for (int32 i = 0; i < Config->LODDistances.Num(); ++i)
    {
        if (DistanceCm >= Config->LODDistances[i])
        {
            DistanceLOD = static_cast<EKhaaosLODLevel>(i + 1);
        }
        else
        {
            break;
        }
    }

    // Determinar LOD baseado em screen size (pode ser mais restritivo)
    EKhaaosLODLevel ScreenLOD = EKhaaosLODLevel::LOD0;

    for (int32 i = 0; i < Config->ScreenSizeThresholds.Num(); ++i)
    {
        if (ScreenSizeFraction < Config->ScreenSizeThresholds[i])
        {
            ScreenLOD = static_cast<EKhaaosLODLevel>(i + 1);
        }
        else
        {
            break;
        }
    }

    // Usar o LOD mais agressivo (maior LOD = mais simples)
    return (LODToIndex(DistanceLOD) > LODToIndex(ScreenLOD)) ? DistanceLOD : ScreenLOD;
}

const FKhaaosSpeciesLODConfig& UKhaaosSpeciesLODManager::GetSpeciesLODConfig(EKhaaosSpecies Species) const
{
    static FKhaaosSpeciesLODConfig DefaultConfig;
    const FKhaaosSpeciesLODConfig* Config = SpeciesConfigs.Find(Species);
    return Config ? *Config : DefaultConfig;
}

void UKhaaosSpeciesLODManager::ApplyLODToMesh(USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species, EKhaaosLODLevel LODLevel)
{
    if (!MeshComp) return;

    const FKhaaosSpeciesLODConfig& Config = GetSpeciesLODConfig(Species);
    const int32 LODIdx = LODToIndex(LODLevel);

    // Forçar LOD no skeletal mesh
    MeshComp->SetForcedLodModel(LODIdx);

    // Desativar morph targets para LOD distante (economiza CPU de blend shapes)
    if (LODToIndex(LODLevel) >= LODToIndex(Config.DisableMorphTargetsAtLOD))
    {
        MeshComp->SetMorphTargetWeight(FName(), 0.0f); // Reset all morphs
        MeshComp->SetEnableMorphTargets(false);
    }
    else
    {
        MeshComp->SetEnableMorphTargets(true);
    }

    // Desativar emissive para LOD distante (economiza fragment shader)
    if (LODToIndex(LODLevel) >= LODToIndex(Config.DisableEmissiveAtLOD))
    {
        if (UMaterialInstanceDynamic* MID = MeshComp->CreateAndSetMID_Gameplay(0))
        {
            MID->SetScalarParameterValue(FName("EmissiveStrength"), 0.0f);
        }
    }

    // Reduzir tick rate de animação para LOD distante
    if (LODToIndex(LODLevel) >= LODToIndex(Config.ReduceBoneCountAtLOD))
    {
        MeshComp->SetAnimTickInterval(Config.DistantAnimTickRate);
    }
    else
    {
        MeshComp->SetAnimTickInterval(1); // Full tick rate
    }
}

bool UKhaaosSpeciesLODManager::ShouldDisableEmissive(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const
{
    const FKhaaosSpeciesLODConfig& Config = GetSpeciesLODConfig(Species);
    return LODToIndex(LODLevel) >= LODToIndex(Config.DisableEmissiveAtLOD);
}

bool UKhaaosSpeciesLODManager::ShouldDisableVFX(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const
{
    const FKhaaosSpeciesLODConfig& Config = GetSpeciesLODConfig(Species);
    return LODToIndex(LODLevel) >= LODToIndex(Config.DisableVFXAtLOD);
}

bool UKhaaosSpeciesLODManager::ShouldDisableMorphTargets(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const
{
    const FKhaaosSpeciesLODConfig& Config = GetSpeciesLODConfig(Species);
    return LODToIndex(LODLevel) >= LODToIndex(Config.DisableMorphTargetsAtLOD);
}

bool UKhaaosSpeciesLODManager::ShouldSignificanceCull(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const
{
    const FKhaaosSpeciesLODConfig& Config = GetSpeciesLODConfig(Species);
    return LODToIndex(LODLevel) >= LODToIndex(Config.SignificanceCullAtLOD);
}

int32 UKhaaosSpeciesLODManager::GetAnimTickRate(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const
{
    const FKhaaosSpeciesLODConfig& Config = GetSpeciesLODConfig(Species);
    if (LODToIndex(LODLevel) >= LODToIndex(Config.ReduceBoneCountAtLOD))
    {
        return Config.DistantAnimTickRate;
    }
    return 1;
}

void UKhaaosSpeciesLODManager::UpdateLODDistribution(const TMap<EKhaaosLODLevel, int32>& NewDistribution)
{
    LODDistribution = NewDistribution;
}

void UKhaaosSpeciesLODManager::DumpLODStats() const
{
    UE_LOG(LogTemp, Display, TEXT("[SpeciesLOD] === LOD Distribution ==="));
    for (const auto& Pair : LODDistribution)
    {
        UE_LOG(LogTemp, Display, TEXT("  %s: %d operatives"),
            *UEnum::GetDisplayValueAsText(Pair.Key).ToString(), Pair.Value);
    }
}

FKhaaosSpeciesLODConfig UKhaaosSpeciesLODManager::BuildSpeciesLODConfig(EKhaaosSpecies Species) const
{
    FKhaaosSpeciesLODConfig Config;
    Config.Species = Species;

    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
        // Huran: brânquias bioluminescentes e membranas
        // LOD1: desativar morph targets (membrana flexível)
        // LOD2: desativar emissive (bioluminescência das brânquias)
        // LOD3: desativar VFX aura
        Config.LODDistances = { 800.0f, 2000.0f, 4500.0f, 9000.0f };
        Config.ScreenSizeThresholds = { 0.45f, 0.20f, 0.10f, 0.05f };
        Config.DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableVFXAtLOD = EKhaaosLODLevel::LOD3;
        Config.ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;
        Config.DistantAnimTickRate = 12;
        Config.bEnableNaniteImpostor = true;
        break;

    case EKhaaosSpecies::KHAEL:
        // Khael: cristais arcanos e runas glow
        // LOD1: desativar morph targets (cristal flex)
        // LOD2: desativar emissive (glow rúnico — custo alto)
        // LOD3: desativar VFX aura (vórtice arcano)
        Config.LODDistances = { 1200.0f, 3000.0f, 6000.0f, 12000.0f };
        Config.ScreenSizeThresholds = { 0.50f, 0.22f, 0.11f, 0.05f };
        Config.DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableVFXAtLOD = EKhaaosLODLevel::LOD3;
        Config.ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;
        Config.DistantAnimTickRate = 10;
        Config.bEnableNaniteImpostor = true;
        break;

    case EKhaaosSpecies::VENEX:
        // Venex: implantes cybernéticos com emissive e hologramas
        // LOD1: desativar morph targets (implante adjust)
        // LOD2: desativar emissive (LED cyber)
        // LOD3: desativar VFX (scan holográfico)
        Config.LODDistances = { 900.0f, 2200.0f, 5000.0f, 10000.0f };
        Config.ScreenSizeThresholds = { 0.48f, 0.21f, 0.10f, 0.05f };
        Config.DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableVFXAtLOD = EKhaaosLODLevel::LOD3;
        Config.ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;
        Config.DistantAnimTickRate = 12;
        Config.bEnableNaniteImpostor = true;
        break;

    case EKhaaosSpecies::ONITH:
        // Onith: carapaça quitinosa complexa + cauda física
        // LOD0: full chitin detail + tail physics
        // LOD1: simplificar chitin normals, desativar morph targets
        // LOD2: desativar emissive (carapaça glow), reduzir tail bones
        // LOD3: desativar VFX, tail fixo
        Config.LODDistances = { 1000.0f, 2500.0f, 5500.0f, 11000.0f };
        Config.ScreenSizeThresholds = { 0.47f, 0.22f, 0.11f, 0.06f };
        Config.DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableVFXAtLOD = EKhaaosLODLevel::LOD3;
        Config.ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;
        Config.DistantAnimTickRate = 8;  // Tail physics é caro
        Config.bEnableNaniteImpostor = true;
        break;

    case EKhaaosSpecies::ZHEERS:
        // Zheers: tatuagens tribais e orelhas pontudas
        // LOD1: desativar morph targets (orelha/tattoo adjust)
        // LOD2: desativar emissive (tattoo glow)
        Config.LODDistances = { 700.0f, 1800.0f, 4000.0f, 8000.0f };
        Config.ScreenSizeThresholds = { 0.40f, 0.18f, 0.09f, 0.04f };
        Config.DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableVFXAtLOD = EKhaaosLODLevel::LOD3;
        Config.ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD3;
        Config.DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;
        Config.DistantAnimTickRate = 15;
        Config.bEnableNaniteImpostor = true;
        break;

    case EKhaaosSpecies::SKEETW:
        // Skeetw: plumas/penas com high bone count + bico
        // LOD0: full feather simulation (high cost)
        // LOD1: desativar morph targets, reduzir feather bones
        // LOD2: desativar emissive (plumage iridescence), simplificar feathers
        // LOD3: desativar VFX (feather glow), static wing pose
        Config.LODDistances = { 600.0f, 1500.0f, 3500.0f, 7000.0f };
        Config.ScreenSizeThresholds = { 0.35f, 0.15f, 0.08f, 0.04f };
        Config.DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;
        Config.DisableVFXAtLOD = EKhaaosLODLevel::LOD3;
        Config.ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD1;  // Feather bones são caros
        Config.DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;
        Config.DistantAnimTickRate = 8;  // Wings são caros para animar
        Config.bEnableNaniteImpostor = true;
        break;

    default:
        break;
    }

    return Config;
}
