// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosCharacterPopComponent
// Rim light por espécie + custom depth + point light de ancoragem local.
// DATA: 2026-10-28
// ==============================================================================

#include "KhaaosCharacterPopComponent.h"
#include "KhaaosRun.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "GameFramework/Pawn.h"
#include "Engine/Engine.h"
#include "Game/Graphics/KhaaosGraphicsPresetSubsystem.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosCharacterPopComponent::UKhaaosCharacterPopComponent()
{
    // Sem tick — rim é estático salvo SetRimBoost (event-driven)
    PrimaryComponentTick.bCanEverTick = false;
    PrimaryComponentTick.bStartWithTickEnabled = false;
}

// ─── Initialization ───────────────────────────────────────────────────────────

void UKhaaosCharacterPopComponent::InitializePop(EKhaaosSpecies InSpecies)
{
    Species = InSpecies;
    GetSpeciesRimProfile(Species, BaseRimColor, BaseRimIntensity);

    if (!GetOwner())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[CharacterPop] InitializePop sem owner."));
        return;
    }

    CachedMesh = GetOwner()->FindComponentByClass<USkeletalMeshComponent>();
    if (!CachedMesh)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[CharacterPop] Owner %s sem SkeletalMeshComponent."),
            *GetOwner()->GetName());
        return;
    }

    bPopActive = true;

    // 1. Rim light via material (todos os devices — custo desprezível)
    ApplyRimToMaterials();

    // 2. Custom depth stencil (silhueta para outline pós-processo)
    //    Pulo em Low — bRenderCustomDepth custa um pass de depth extra
    if (QualityAllowsHeavyEffects())
    {
        CachedMesh->bRenderCustomDepth = true;
        // Stencil = espécie (1-6) — outline colorido por espécie no PP material
        CachedMesh->SetCustomDepthStencilValue(FMath::Clamp(1 + static_cast<int32>(Species), 1, 255));
        CachedMesh->MarkRenderStateDirty();
    }

    // 3. Point light de ancoragem (apenas pawn local — 1 luz por jogador)
    SpawnRimLight();

    UE_LOG(LogKhaaosRun, Display, TEXT("[CharacterPop] Pop ativo para %s: Rim=%.1f, CustomDepth=%s, PointLight=%s"),
        *UEnum::GetDisplayValueAsText(Species).ToString(),
        BaseRimIntensity * RimBoostMultiplier,
        QualityAllowsHeavyEffects() ? TEXT("SIM") : TEXT("NÃO"),
        RimLight ? TEXT("SIM") : TEXT("NÃO"));
}

void UKhaaosCharacterPopComponent::SetRimBoost(float Multiplier)
{
    RimBoostMultiplier = FMath::Clamp(Multiplier, 0.0f, 3.0f);

    if (bPopActive)
    {
        ApplyRimToMaterials();

        if (RimLight)
        {
            RimLight->SetIntensity(BaseRimIntensity * 2.5f * RimBoostMultiplier);
        }

        UE_LOG(LogKhaaosRun, Verbose, TEXT("[CharacterPop] Rim boost ajustado: %.2fx (%s)"),
            RimBoostMultiplier,
            *UEnum::GetDisplayValueAsText(Species).ToString());
    }
}

// ─── Species Rim Profile ──────────────────────────────────────────────────────

void UKhaaosCharacterPopComponent::GetSpeciesRimProfile(EKhaaosSpecies Species, FLinearColor& OutColor, float& OutIntensity)
{
    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
        // Ciano aquático — brânquias bioluminescentes
        OutColor = FLinearColor(0.22f, 0.89f, 0.94f);
        OutIntensity = 0.9f;
        break;

    case EKhaaosSpecies::KHAEL:
        // Violeta arcano — runas de cristal
        OutColor = FLinearColor(0.55f, 0.36f, 0.96f);
        OutIntensity = 1.1f;
        break;

    case EKhaaosSpecies::VENEX:
        // Magenta cyber — implantes holográficos
        OutColor = FLinearColor(1.0f, 0.18f, 0.72f);
        OutIntensity = 1.0f;
        break;

    case EKhaaosSpecies::ONITH:
        // Laranja térmico — ventes de carapaça
        OutColor = FLinearColor(1.0f, 0.48f, 0.10f);
        OutIntensity = 0.8f;
        break;

    case EKhaaosSpecies::ZHEERS:
        // Violeta espiritual — tatuagens tribais
        OutColor = FLinearColor(0.65f, 0.55f, 0.98f);
        OutIntensity = 0.7f;
        break;

    case EKhaaosSpecies::SKEETW:
        // Verde-pena — iridescência aviária
        OutColor = FLinearColor(0.49f, 1.0f, 0.42f);
        OutIntensity = 0.6f;
        break;

    default:
        OutColor = FLinearColor::White;
        OutIntensity = 0.0f;
        break;
    }
}

// ─── Internos ─────────────────────────────────────────────────────────────────

void UKhaaosCharacterPopComponent::ApplyRimToMaterials()
{
    if (!CachedMesh || !bPopActive)
    {
        return;
    }

    const float FinalIntensity = BaseRimIntensity * RimBoostMultiplier;

    // Aplica em todos os slots de material do mesh
    const int32 NumSlots = CachedMesh->GetNumMaterials();
    for (int32 Slot = 0; Slot < NumSlots; ++Slot)
    {
        UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>(CachedMesh->GetMaterial(Slot));
        if (!MID && Slot == 0)
        {
            // MaterialPipeline ainda não criou o MID do slot 0 — cria agora
            MID = CachedMesh->CreateAndSetMID_Gameplay(0);
        }
        if (!MID)
        {
            continue;
        }

        // Convenção de parâmetros do master material Khaaos:
        MID->SetScalarParameterValue(FName("RimLightIntensity"), FinalIntensity);
        MID->SetVectorParameterValue(FName("RimLightColor"), BaseRimColor);
    }
}

void UKhaaosCharacterPopComponent::SpawnRimLight()
{
    if (RimLight || !CachedMesh || !bPopActive)
    {
        return;
    }

    // Só pawn local (não repliica, não roda no server dedicado)
    const APawn* Pawn = Cast<APawn>(GetOwner());
    if (!Pawn || !Pawn->IsLocallyControlled())
    {
        return;
    }

    // Preset Low não ganha point light (budget de luz mobile)
    if (!QualityAllowsHeavyEffects())
    {
        return;
    }

    RimLight = NewObject<UPointLightComponent>(GetOwner());
    if (!RimLight)
    {
        return;
    }

    RimLight->SetupAttachment(CachedMesh);
    RimLight->SetRelativeLocation(FVector(0.0f, 0.0f, 60.0f)); // Peito do operative
    RimLight->SetLightColor(BaseRimColor);
    RimLight->SetIntensity(BaseRimIntensity * 2.5f);
    RimLight->SetAttenuationRadius(220.0f);
    RimLight->SetLightFalloffExponent(2.0f);
    RimLight->SetCastShadows(false); // Crítico: sombras de rim são proibidas
    RimLight->bVisible = true;
    RimLight->RegisterComponent();
}

bool UKhaaosCharacterPopComponent::QualityAllowsHeavyEffects() const
{
    if (!GEngine)
    {
        return false;
    }

    const UKhaaosGraphicsPresetSubsystem* PresetSubsystem =
        GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>();
    if (!PresetSubsystem)
    {
        return false;
    }

    return PresetSubsystem->GetCurrentPreset() != EKhaaosQualityPreset::Low;
}
