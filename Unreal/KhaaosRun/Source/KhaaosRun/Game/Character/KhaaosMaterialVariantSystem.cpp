// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// IMPLEMENTAÇÃO: UKhaaosMaterialVariantSystem
// Sistema de variantes de material com MID creation, blending, e KRC purchase.
// ==============================================================================

#include "Game/Character/KhaaosMaterialVariantSystem.h"
#include "KhaaosRun.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Components/MeshComponent.h"

// ─── Constructor ─────────────────────────────────────────────────────────────

UKhaaosMaterialVariantSystem::UKhaaosMaterialVariantSystem()
{
    PrimaryComponentTick.bCanEverTick = false;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

void UKhaaosMaterialVariantSystem::BeginPlay()
{
    Super::BeginPlay();

    // Registrar variantes pré-construídas por espécie
    RegisterSpeciesVariants();

    // Cache do Bankhaoos
    CachedBankhaoos = ResolveBankhaoos();

    UE_LOG(LogKhaaosRun, Log, TEXT("[MaterialVariant] Inicializado com %d variantes registradas"), VariantRegistry.Num());
}

// ─── Variant Registration ────────────────────────────────────────────────────

bool UKhaaosMaterialVariantSystem::RegisterVariant(const FKhaaosMaterialVariant& Variant)
{
    if (VariantRegistry.Contains(Variant.VariantID))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Variante já registrada: %s"), *Variant.VariantID.ToString());
        return false;
    }

    VariantRegistry.Add(Variant.VariantID, Variant);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[MaterialVariant] Registrada: %s (tipo=%s, preço=%d KRC)"),
        *Variant.VariantID.ToString(),
        *UEnum::GetDisplayValueAsText(Variant.VariantType).ToString(),
        Variant.PriceKRC);

    return true;
}

void UKhaaosMaterialVariantSystem::UnregisterVariant(FName VariantID)
{
    VariantRegistry.Remove(VariantID);
    OwnedVariants.Remove(VariantID);
}

// ─── Variant Application ─────────────────────────────────────────────────────

bool UKhaaosMaterialVariantSystem::ApplyVariant(FName VariantID, UMeshComponent* TargetMesh, int32 MaterialIndex)
{
    if (!TargetMesh) return false;

    const FKhaaosMaterialVariant* VariantDef = VariantRegistry.Find(VariantID);
    if (!VariantDef)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Variante não encontrada: %s"), *VariantID.ToString());
        OnVariantApplied.Broadcast(VariantID, false, MaterialIndex);
        return false;
    }

    // Verificar ownership — variantes gratuitas (PriceKRC == 0) são sempre disponíveis
    if (VariantDef->PriceKRC > 0 && !OwnedVariants.Contains(VariantID))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Variante não comprada: %s"), *VariantID.ToString());
        OnVariantApplied.Broadcast(VariantID, false, MaterialIndex);
        return false;
    }

    // Salvar material original para restauração
    UMaterialInterface* OriginalMat = TargetMesh->GetMaterial(MaterialIndex);

    // Remover variante ativa anterior neste componente
    RemoveVariant(TargetMesh);

    // Carregar material base da variante
    UMaterialInterface* BaseMat = nullptr;
    if (VariantDef->BaseMaterial.IsValid())
    {
        BaseMat = VariantDef->BaseMaterial.LoadSynchronous();
    }

    // Se não tem material base na variante, usar o original como base
    if (!BaseMat && OriginalMat)
    {
        BaseMat = OriginalMat;
    }

    if (!BaseMat)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Sem material base para variante: %s"), *VariantID.ToString());
        OnVariantApplied.Broadcast(VariantID, false, MaterialIndex);
        return false;
    }

    // Criar MaterialInstanceDynamic com parâmetros overrides
    UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    if (!DynMat)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[MaterialVariant] Falha ao criar MID para: %s"), *VariantID.ToString());
        OnVariantApplied.Broadcast(VariantID, false, MaterialIndex);
        return false;
    }

    // Aplicar overrides escalares
    for (const auto& ScalarPair : VariantDef->ScalarOverrides)
    {
        DynMat->SetScalarParameterValue(ScalarPair.Key, ScalarPair.Value);
    }

    // Aplicar overrides de cor
    for (const auto& ColorPair : VariantDef->ColorOverrides)
    {
        DynMat->SetVectorParameterValue(ColorPair.Key, ColorPair.Value);
    }

    // Aplicar ao componente
    TargetMesh->SetMaterial(MaterialIndex, DynMat);

    // Registrar variante ativa
    FKhaaosActiveVariant ActiveVar;
    ActiveVar.TargetComponent = TargetMesh;
    ActiveVar.Variant = *VariantDef;
    ActiveVar.DynamicMaterialInstance = DynMat;
    if (OriginalMat)
    {
        ActiveVar.OriginalMaterial = TSoftObjectPtr<UMaterialInterface>(OriginalMat);
    }
    ActiveVariants.Add(ActiveVar);

    UE_LOG(LogKhaaosRun, Log, TEXT("[MaterialVariant] Aplicada: %s no material[%d]"), *VariantID.ToString(), MaterialIndex);
    OnVariantApplied.Broadcast(VariantID, true, MaterialIndex);

    return true;
}

void UKhaaosMaterialVariantSystem::RemoveVariant(UMeshComponent* TargetMesh)
{
    if (!TargetMesh) return;

    for (int32 i = ActiveVariants.Num() - 1; i >= 0; --i)
    {
        if (ActiveVariants[i].TargetComponent.Get() == TargetMesh)
        {
            // Restaurar material original
            if (ActiveVariants[i].OriginalMaterial.IsValid())
            {
                UMaterialInterface* OrigMat = ActiveVariants[i].OriginalMaterial.LoadSynchronous();
                if (OrigMat)
                {
                    TargetMesh->SetMaterial(0, OrigMat);
                }
            }

            ActiveVariants.RemoveAt(i);
            break;
        }
    }
}

bool UKhaaosMaterialVariantSystem::BlendVariants(FName VariantA_ID, FName VariantB_ID, UMeshComponent* TargetMesh, float BlendAlpha, int32 MaterialIndex)
{
    if (!TargetMesh) return false;

    const FKhaaosMaterialVariant* DefA = VariantRegistry.Find(VariantA_ID);
    const FKhaaosMaterialVariant* DefB = VariantRegistry.Find(VariantB_ID);
    if (!DefA || !DefB)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Blend: variante(s) não encontrada(s)"));
        return false;
    }

    // Clamp blend alpha
    BlendAlpha = FMath::Clamp(BlendAlpha, 0.0f, 1.0f);

    // Usar material base da variante A como base para o MID
    UMaterialInterface* BaseMat = nullptr;
    if (DefA->BaseMaterial.IsValid())
    {
        BaseMat = DefA->BaseMaterial.LoadSynchronous();
    }
    if (!BaseMat)
    {
        BaseMat = TargetMesh->GetMaterial(MaterialIndex);
    }
    if (!BaseMat) return false;

    // Criar MID para o blend
    UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    if (!DynMat) return false;

    // Lerp de parâmetros escalares
    TSet<FName> AllScalarKeys;
    for (const auto& Pair : DefA->ScalarOverrides) AllScalarKeys.Add(Pair.Key);
    for (const auto& Pair : DefB->ScalarOverrides) AllScalarKeys.Add(Pair.Key);

    for (const FName& Key : AllScalarKeys)
    {
        float ValueA = DefA->ScalarOverrides.FindRef(Key);
        float ValueB = DefB->ScalarOverrides.FindRef(Key);
        float BlendedValue = FMath::Lerp(ValueA, ValueB, BlendAlpha);
        DynMat->SetScalarParameterValue(Key, BlendedValue);
    }

    // Lerp de parâmetros de cor
    TSet<FName> AllColorKeys;
    for (const auto& Pair : DefA->ColorOverrides) AllColorKeys.Add(Pair.Key);
    for (const auto& Pair : DefB->ColorOverrides) AllColorKeys.Add(Pair.Key);

    for (const FName& Key : AllColorKeys)
    {
        FLinearColor ColorA = DefA->ColorOverrides.FindRef(Key);
        FLinearColor ColorB = DefB->ColorOverrides.FindRef(Key);
        FLinearColor BlendedColor = FMath::Lerp(ColorA, ColorB, BlendAlpha);
        DynMat->SetVectorParameterValue(Key, BlendedColor);
    }

    // Parâmetro de blend alpha no material (para shaders que suportam)
    DynMat->SetScalarParameterValue(FName("BlendAlpha"), BlendAlpha);

    // Aplicar ao componente
    TargetMesh->SetMaterial(MaterialIndex, DynMat);

    UE_LOG(LogKhaaosRun, Log, TEXT("[MaterialVariant] Blend: %s ↔ %s (alpha=%.2f)"),
        *VariantA_ID.ToString(), *VariantB_ID.ToString(), BlendAlpha);

    return true;
}

// ─── Query ───────────────────────────────────────────────────────────────────

TArray<FKhaaosMaterialVariant> UKhaaosMaterialVariantSystem::GetAvailableVariants() const
{
    TArray<FKhaaosMaterialVariant> Result;
    VariantRegistry.GenerateValueArray(Result);
    return Result;
}

TArray<FKhaaosMaterialVariant> UKhaaosMaterialVariantSystem::GetVariantsForSpecies(EKhaaosSpecies Species) const
{
    TArray<FKhaaosMaterialVariant> Result;
    for (const auto& Pair : VariantRegistry)
    {
        // NONE = disponível para todas as espécies
        if (Pair.Value.SpeciesRestriction == EKhaaosSpecies::NONE ||
            Pair.Value.SpeciesRestriction == Species)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}

TArray<FKhaaosMaterialVariant> UKhaaosMaterialVariantSystem::GetVariantsByType(EKhaaosMaterialVariantType Type) const
{
    TArray<FKhaaosMaterialVariant> Result;
    for (const auto& Pair : VariantRegistry)
    {
        if (Pair.Value.VariantType == Type)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}

// ─── Economy Integration ─────────────────────────────────────────────────────

bool UKhaaosMaterialVariantSystem::PurchaseVariant(FName VariantID)
{
    const FKhaaosMaterialVariant* VariantDef = VariantRegistry.Find(VariantID);
    if (!VariantDef)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Variante não encontrada para compra: %s"), *VariantID.ToString());
        OnVariantPurchased.Broadcast(VariantID, false);
        return false;
    }

    // Já comprada
    if (OwnedVariants.Contains(VariantID))
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("[MaterialVariant] Variante já comprada: %s"), *VariantID.ToString());
        OnVariantPurchased.Broadcast(VariantID, true);
        return true;
    }

    // Variante gratuita
    if (VariantDef->PriceKRC <= 0)
    {
        OwnedVariants.Add(VariantID);
        OnVariantPurchased.Broadcast(VariantID, true);
        return true;
    }

    // Debitar KRC via Bankhaoos
    UKhaaosBankhaoosComponent* Bankhaoos = ResolveBankhaoos();
    if (!Bankhaoos || !Bankhaoos->HasAccount())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Bankhaoos não disponível para compra"));
        OnVariantPurchased.Broadcast(VariantID, false);
        return false;
    }

    // Verificar saldo suficiente
    if (Bankhaoos->GetBalance() < VariantDef->PriceKRC)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Saldo insuficiente: %d KRC (preço: %d KRC)"),
            Bankhaoos->GetBalance(), VariantDef->PriceKRC);
        OnVariantPurchased.Broadcast(VariantID, false);
        return false;
    }

    // Debitar
    FString Reason = FString::Printf(TEXT("MaterialVariant: %s"), *VariantID.ToString());
    if (!Bankhaoos->DebitKRC(VariantDef->PriceKRC, Reason))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialVariant] Falha ao debitar %d KRC"), VariantDef->PriceKRC);
        OnVariantPurchased.Broadcast(VariantID, false);
        return false;
    }

    OwnedVariants.Add(VariantID);

    UE_LOG(LogKhaaosRun, Log, TEXT("[MaterialVariant] Comprada: %s por %d KRC"), *VariantID.ToString(), VariantDef->PriceKRC);
    OnVariantPurchased.Broadcast(VariantID, true);

    return true;
}

bool UKhaaosMaterialVariantSystem::IsVariantOwned(FName VariantID) const
{
    return OwnedVariants.Contains(VariantID);
}

// ─── Internal ────────────────────────────────────────────────────────────────

void UKhaaosMaterialVariantSystem::RegisterSpeciesVariants()
{
    // ── HURAN: AquaticCamo, DeepSea, Bioluminescent ──
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_HUR_AquaticCamo");
        V.VariantType = EKhaaosMaterialVariantType::Pattern;
        V.DisplayName = FText::FromString(TEXT("Aquatic Camo"));
        V.PriceKRC = 800;
        V.SpeciesRestriction = EKhaaosSpecies::HURAN;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.0f, 0.3f, 0.5f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.0f, 0.5f, 0.7f));
        V.ScalarOverrides.Add(FName("PatternScale"), 2.0f);
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 0.3f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_HUR_DeepSea");
        V.VariantType = EKhaaosMaterialVariantType::Color;
        V.DisplayName = FText::FromString(TEXT("Deep Sea"));
        V.PriceKRC = 1200;
        V.SpeciesRestriction = EKhaaosSpecies::HURAN;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.0f, 0.05f, 0.15f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.0f, 0.15f, 0.3f));
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 0.8f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_HUR_Bioluminescent");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Bioluminescent"));
        V.PriceKRC = 2500;
        V.SpeciesRestriction = EKhaaosSpecies::HURAN;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.0f, 1.0f, 0.6f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.0f, 0.8f, 0.4f));
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 3.0f);
        V.ScalarOverrides.Add(FName("PulseSpeed"), 1.5f);
        RegisterVariant(V);
    }

    // ── KHAEL: CrystalAmber, RuneGlow, FrostForged ──
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_KHA_CrystalAmber");
        V.VariantType = EKhaaosMaterialVariantType::Pattern;
        V.DisplayName = FText::FromString(TEXT("Crystal Amber"));
        V.PriceKRC = 800;
        V.SpeciesRestriction = EKhaaosSpecies::KHAEL;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.8f, 0.5f, 0.0f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(1.0f, 0.7f, 0.2f));
        V.ScalarOverrides.Add(FName("RefractStrength"), 0.6f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_KHA_RuneGlow");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Rune Glow"));
        V.PriceKRC = 1500;
        V.SpeciesRestriction = EKhaaosSpecies::KHAEL;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.6f, 0.2f, 1.0f));
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 2.5f);
        V.ScalarOverrides.Add(FName("RunePulse"), 0.8f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_KHA_FrostForged");
        V.VariantType = EKhaaosMaterialVariantType::Wear;
        V.DisplayName = FText::FromString(TEXT("Frost Forged"));
        V.PriceKRC = 2000;
        V.SpeciesRestriction = EKhaaosSpecies::KHAEL;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.7f, 0.85f, 1.0f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.5f, 0.7f, 0.9f));
        V.ScalarOverrides.Add(FName("FrostCoverage"), 0.7f);
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 1.0f);
        RegisterVariant(V);
    }

    // ── VENEX: ChromeFinish, NeonCircuit, StealthMatte ──
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_VEN_ChromeFinish");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Chrome Finish"));
        V.PriceKRC = 1000;
        V.SpeciesRestriction = EKhaaosSpecies::VENEX;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.9f, 0.9f, 0.95f));
        V.ScalarOverrides.Add(FName("Metallic"), 1.0f);
        V.ScalarOverrides.Add(FName("Roughness"), 0.1f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_VEN_NeonCircuit");
        V.VariantType = EKhaaosMaterialVariantType::Pattern;
        V.DisplayName = FText::FromString(TEXT("Neon Circuit"));
        V.PriceKRC = 1800;
        V.SpeciesRestriction = EKhaaosSpecies::VENEX;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.0f, 0.0f, 0.05f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.0f, 1.0f, 0.8f));
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 2.0f);
        V.ScalarOverrides.Add(FName("CircuitSpeed"), 3.0f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_VEN_StealthMatte");
        V.VariantType = EKhaaosMaterialVariantType::Wear;
        V.DisplayName = FText::FromString(TEXT("Stealth Matte"));
        V.PriceKRC = 600;
        V.SpeciesRestriction = EKhaaosSpecies::VENEX;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.15f, 0.15f, 0.18f));
        V.ScalarOverrides.Add(FName("Metallic"), 0.0f);
        V.ScalarOverrides.Add(FName("Roughness"), 0.95f);
        RegisterVariant(V);
    }

    // ── ONITH: ChitinPolish, ThermalCoating, CarapaceGold ──
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_ONI_ChitinPolish");
        V.VariantType = EKhaaosMaterialVariantType::Wear;
        V.DisplayName = FText::FromString(TEXT("Chitin Polish"));
        V.PriceKRC = 700;
        V.SpeciesRestriction = EKhaaosSpecies::ONITH;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.4f, 0.35f, 0.25f));
        V.ScalarOverrides.Add(FName("Roughness"), 0.3f);
        V.ScalarOverrides.Add(FName("ChitinShine"), 0.8f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_ONI_ThermalCoating");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Thermal Coating"));
        V.PriceKRC = 2200;
        V.SpeciesRestriction = EKhaaosSpecies::ONITH;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.8f, 0.2f, 0.0f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(1.0f, 0.5f, 0.0f));
        V.ScalarOverrides.Add(FName("ThermalPulse"), 1.2f);
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 1.5f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_ONI_CarapaceGold");
        V.VariantType = EKhaaosMaterialVariantType::Color;
        V.DisplayName = FText::FromString(TEXT("Carapace Gold"));
        V.PriceKRC = 3000;
        V.SpeciesRestriction = EKhaaosSpecies::ONITH;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.85f, 0.65f, 0.13f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(1.0f, 0.84f, 0.0f));
        V.ScalarOverrides.Add(FName("Metallic"), 0.9f);
        V.ScalarOverrides.Add(FName("Roughness"), 0.2f);
        RegisterVariant(V);
    }

    // ── ZHEERS: TribalInk, ShadowWeave, EarDecor ──
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_ZHE_TribalInk");
        V.VariantType = EKhaaosMaterialVariantType::Pattern;
        V.DisplayName = FText::FromString(TEXT("Tribal Ink"));
        V.PriceKRC = 500;
        V.SpeciesRestriction = EKhaaosSpecies::ZHEERS;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.1f, 0.1f, 0.1f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.6f, 0.0f, 0.0f));
        V.ScalarOverrides.Add(FName("PatternScale"), 1.5f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_ZHE_ShadowWeave");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Shadow Weave"));
        V.PriceKRC = 1600;
        V.SpeciesRestriction = EKhaaosSpecies::ZHEERS;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.05f, 0.0f, 0.1f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.3f, 0.0f, 0.5f));
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 0.5f);
        V.ScalarOverrides.Add(FName("ShadowPulse"), 2.0f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_ZHE_EarDecor");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Ear Decor"));
        V.PriceKRC = 400;
        V.SpeciesRestriction = EKhaaosSpecies::ZHEERS;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.55f, 0.35f, 0.15f));
        V.ScalarOverrides.Add(FName("Metallic"), 0.7f);
        RegisterVariant(V);
    }

    // ── SKEETW: FeatherDye, Iridescent, WindMarking ──
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_SKW_FeatherDye");
        V.VariantType = EKhaaosMaterialVariantType::Color;
        V.DisplayName = FText::FromString(TEXT("Feather Dye"));
        V.PriceKRC = 600;
        V.SpeciesRestriction = EKhaaosSpecies::SKEETW;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.2f, 0.6f, 0.8f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.9f, 0.4f, 0.1f));
        V.ScalarOverrides.Add(FName("FeatherDetail"), 1.2f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_SKW_Iridescent");
        V.VariantType = EKhaaosMaterialVariantType::Custom;
        V.DisplayName = FText::FromString(TEXT("Iridescent"));
        V.PriceKRC = 2800;
        V.SpeciesRestriction = EKhaaosSpecies::SKEETW;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.5f, 0.3f, 0.7f));
        V.ScalarOverrides.Add(FName("IridescenceStrength"), 1.0f);
        V.ScalarOverrides.Add(FName("EmissiveIntensity"), 1.5f);
        RegisterVariant(V);
    }
    {
        FKhaaosMaterialVariant V;
        V.VariantID = FName("MV_SKW_WindMarking");
        V.VariantType = EKhaaosMaterialVariantType::Pattern;
        V.DisplayName = FText::FromString(TEXT("Wind Marking"));
        V.PriceKRC = 900;
        V.SpeciesRestriction = EKhaaosSpecies::SKEETW;
        V.ColorOverrides.Add(FName("ColorPrimary"), FLinearColor(0.7f, 0.8f, 0.9f));
        V.ColorOverrides.Add(FName("ColorAccent"), FLinearColor(0.9f, 0.95f, 1.0f));
        V.ScalarOverrides.Add(FName("PatternScale"), 3.0f);
        V.ScalarOverrides.Add(FName("WindSpeed"), 5.0f);
        RegisterVariant(V);
    }
}

UKhaaosBankhaoosComponent* UKhaaosMaterialVariantSystem::ResolveBankhaoos()
{
    if (CachedBankhaoos && CachedBankhaoos->IsValidLowLevel()) return CachedBankhaoos;

    AActor* Owner = GetOwner();
    if (!Owner) return nullptr;

    CachedBankhaoos = Owner->FindComponentByClass<UKhaaosBankhaoosComponent>();
    return CachedBankhaoos;
}
