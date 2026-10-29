// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosShaderQualityTiers
// Gerenciador de tiers de qualidade de shader — controla ShadingQuality (0-4)
// em MIDs registrados, habilitando features do master material por tier.
// DATA: 2026-10-29
// ==============================================================================

#include "KhaaosShaderQualityTiers.h"
#include "KhaaosRun.h"
#include "Engine/Engine.h"

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosShaderQualityTiers::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    CurrentTier = EKhaaosShaderTier::Medium;
    CurrentConfig = BuildTierConfig(CurrentTier);

    UE_LOG(LogKhaaosRun, Display, TEXT("[ShaderTiers] Subsystem inicializado. Tier padrão: %s (%d MIDs registrados)"),
        *UEnum::GetDisplayValueAsText(CurrentTier).ToString(), RegisteredMIDs.Num());
}

void UKhaaosShaderQualityTiers::Deinitialize(FSubsystemCollectionBase& Collection)
{
    RegisteredMIDs.Empty();

    UE_LOG(LogKhaaosRun, Display, TEXT("[ShaderTiers] Subsystem desinicializado. MIDs liberados."));
    Super::Deinitialize(Collection);
}

// ─── Tier Management ──────────────────────────────────────────────────────────

void UKhaaosShaderQualityTiers::SetShaderTier(EKhaaosShaderTier Tier)
{
    if (CurrentTier == Tier)
    {
        return; // Já está no tier desejado
    }

    const EKhaaosShaderTier PreviousTier = CurrentTier;
    CurrentTier = Tier;
    CurrentConfig = BuildTierConfig(Tier);

    // Aplicar tier a todos os MIDs registrados
    ApplyTierToAll();

    UE_LOG(LogKhaaosRun, Display, TEXT("[ShaderTiers] Tier alterado: %s → %s. Config: Normal=%s Emissive=%s Subsurface=%s ClearCoat=%s Rim=%s Iridescence=%s Anisotropy=%s WetMap=%s"),
        *UEnum::GetDisplayValueAsText(PreviousTier).ToString(),
        *UEnum::GetDisplayValueAsText(Tier).ToString(),
        CurrentConfig.bEnableNormalMap     ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableEmissive      ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableSubsurface    ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableClearCoat     ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableRimLight      ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableIridescence   ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableAnisotropy    ? TEXT("ON") : TEXT("OFF"),
        CurrentConfig.bEnableWetMap        ? TEXT("ON") : TEXT("OFF"));
}

FKhaaosShaderTierConfig UKhaaosShaderQualityTiers::BuildTierConfig(EKhaaosShaderTier Tier)
{
    FKhaaosShaderTierConfig Config;
    Config.Tier = Tier;

    switch (Tier)
    {
    case EKhaaosShaderTier::Minimal:
        // Apenas diffuse — para hardware muito fraco ou LOD distante
        Config.bEnableNormalMap     = false;
        Config.bEnableEmissive      = false;
        Config.bEnableSubsurface    = false;
        Config.bEnableClearCoat     = false;
        Config.bEnableRimLight      = false;
        Config.bEnableIridescence   = false;
        Config.bEnableAnisotropy    = false;
        Config.bEnableWetMap        = false;
        Config.MaxEmissiveIntensity = 0.0f;
        Config.MaxRimIntensity      = 0.0f;
        Config.MaterialComplexityScalar = 0.0f;
        break;

    case EKhaaosShaderTier::Low:
        // Base + normal + rim — basic character pop
        Config.bEnableNormalMap     = true;
        Config.bEnableEmissive      = false;
        Config.bEnableSubsurface    = false;
        Config.bEnableClearCoat     = false;
        Config.bEnableRimLight      = true;
        Config.bEnableIridescence   = false;
        Config.bEnableAnisotropy    = false;
        Config.bEnableWetMap        = false;
        Config.MaxEmissiveIntensity = 0.0f;
        Config.MaxRimIntensity      = 1.0f;
        Config.MaterialComplexityScalar = 1.0f;
        break;

    case EKhaaosShaderTier::Medium:
        // + emissive + subsurface — default desktop
        Config.bEnableNormalMap     = true;
        Config.bEnableEmissive      = true;
        Config.bEnableSubsurface    = true;
        Config.bEnableClearCoat     = false;
        Config.bEnableRimLight      = true;
        Config.bEnableIridescence   = false;
        Config.bEnableAnisotropy    = false;
        Config.bEnableWetMap        = false;
        Config.MaxEmissiveIntensity = 2.0f;
        Config.MaxRimIntensity      = 1.5f;
        Config.MaterialComplexityScalar = 2.0f;
        break;

    case EKhaaosShaderTier::High:
        // + clear coat + wet map — high-end desktop
        Config.bEnableNormalMap     = true;
        Config.bEnableEmissive      = true;
        Config.bEnableSubsurface    = true;
        Config.bEnableClearCoat     = true;
        Config.bEnableRimLight      = true;
        Config.bEnableIridescence   = false;
        Config.bEnableAnisotropy    = false;
        Config.bEnableWetMap        = true;
        Config.MaxEmissiveIntensity = 3.0f;
        Config.MaxRimIntensity      = 2.0f;
        Config.MaterialComplexityScalar = 3.0f;
        break;

    case EKhaaosShaderTier::Ultra:
        // + iridescence + anisotropy — max quality, all features
        Config.bEnableNormalMap     = true;
        Config.bEnableEmissive      = true;
        Config.bEnableSubsurface    = true;
        Config.bEnableClearCoat     = true;
        Config.bEnableRimLight      = true;
        Config.bEnableIridescence   = true;
        Config.bEnableAnisotropy    = true;
        Config.bEnableWetMap        = true;
        Config.MaxEmissiveIntensity = 5.0f;
        Config.MaxRimIntensity      = 3.0f;
        Config.MaterialComplexityScalar = 4.0f;
        break;

    default:
        break;
    }

    return Config;
}

// ─── MID Registration ─────────────────────────────────────────────────────────

void UKhaaosShaderQualityTiers::RegisterMID(UMaterialInstanceDynamic* MID)
{
    if (!MID)
    {
        return;
    }

    // Verificar se já está registrado
    for (const TWeakObjectPtr<UMaterialInstanceDynamic>& WeakMID : RegisteredMIDs)
    {
        if (WeakMID.Get() == MID)
        {
            return; // Já registrado
        }
    }

    RegisteredMIDs.Add(MID);

    // Aplicar tier corrente ao novo MID imediatamente
    ApplyTierToMID(MID, CurrentTier);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[ShaderTiers] MID registrado: %s (total: %d)"),
        *MID->GetName(), RegisteredMIDs.Num());
}

void UKhaaosShaderQualityTiers::UnregisterMID(UMaterialInstanceDynamic* MID)
{
    if (!MID)
    {
        return;
    }

    RegisteredMIDs.RemoveAll([MID](const TWeakObjectPtr<UMaterialInstanceDynamic>& WeakMID)
    {
        return WeakMID.Get() == MID;
    });

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[ShaderTiers] MID desregistrado: %s (total: %d)"),
        *MID->GetName(), RegisteredMIDs.Num());
}

// ─── MID Application ──────────────────────────────────────────────────────────

void UKhaaosShaderQualityTiers::ApplyTierToMID(UMaterialInstanceDynamic* MID, EKhaaosShaderTier Tier)
{
    if (!MID)
    {
        return;
    }

    const FKhaaosShaderTierConfig Config = BuildTierConfig(Tier);

    // Definir parâmetros escalares no MID para o master material
    MID->SetScalarParameterValue(FName(TEXT("ShadingQuality")),       Config.MaterialComplexityScalar);
    MID->SetScalarParameterValue(FName(TEXT("EnableNormalMap")),      Config.bEnableNormalMap     ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableEmissive")),       Config.bEnableEmissive      ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableSubsurface")),     Config.bEnableSubsurface    ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableClearCoat")),      Config.bEnableClearCoat     ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableRimLight")),       Config.bEnableRimLight      ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableIridescence")),    Config.bEnableIridescence   ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableAnisotropy")),     Config.bEnableAnisotropy    ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("EnableWetMap")),         Config.bEnableWetMap        ? 1.0f : 0.0f);
    MID->SetScalarParameterValue(FName(TEXT("MaxEmissiveIntensity")), Config.MaxEmissiveIntensity);
    MID->SetScalarParameterValue(FName(TEXT("MaxRimIntensity")),      Config.MaxRimIntensity);
}

void UKhaaosShaderQualityTiers::ApplyTierToAll()
{
    // Limpar MIDs expirados (destruídos)
    RegisteredMIDs.RemoveAll([](const TWeakObjectPtr<UMaterialInstanceDynamic>& WeakMID)
    {
        return !WeakMID.IsValid();
    });

    // Aplicar tier corrente a todos os MIDs válidos
    int32 AppliedCount = 0;
    for (const TWeakObjectPtr<UMaterialInstanceDynamic>& WeakMID : RegisteredMIDs)
    {
        if (UMaterialInstanceDynamic* MID = WeakMID.Get())
        {
            ApplyTierToMID(MID, CurrentTier);
            AppliedCount++;
        }
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[ShaderTiers] Tier %s aplicado a %d MIDs (total registrado: %d)"),
        *UEnum::GetDisplayValueAsText(CurrentTier).ToString(),
        AppliedCount, RegisteredMIDs.Num());
}

// ─── Query ────────────────────────────────────────────────────────────────────

UKhaaosShaderQualityTiers* UKhaaosShaderQualityTiers::GetActiveForGame()
{
    if (!GEngine)
    {
        return nullptr;
    }

    return GEngine->GetEngineSubsystem<UKhaaosShaderQualityTiers>();
}

int32 UKhaaosShaderQualityTiers::GetRegisteredMIDCount() const
{
    // Contar apenas MIDs válidos (não expirados)
    int32 ValidCount = 0;
    for (const TWeakObjectPtr<UMaterialInstanceDynamic>& WeakMID : RegisteredMIDs)
    {
        if (WeakMID.IsValid())
        {
            ValidCount++;
        }
    }
    return ValidCount;
}
