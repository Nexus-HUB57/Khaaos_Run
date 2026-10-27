// Khaaos Run — Skin & Cosmetic System Implementation
// ====================================================

#include "Game/Character/KhaaosSkinSystem.h"
#include "Components/SkeletalMeshComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "Materials/MaterialInstanceDynamic.h"

// ─── Helper for rarity color mapping ─────────────────────────────

static FLinearColor GetRarityColor(EKhaaosSkinRarity Rarity)
{
  switch (Rarity)
  {
    case EKhaaosSkinRarity::COMUM:    return FLinearColor(0.6f, 0.6f, 0.6f);   // Gray
    case EKhaaosSkinRarity::INCOMUM:  return FLinearColor(0.2f, 0.8f, 0.2f);   // Green
    case EKhaaosSkinRarity::RARO:     return FLinearColor(0.2f, 0.5f, 1.0f);   // Blue
    case EKhaaosSkinRarity::EPICO:    return FLinearColor(0.6f, 0.2f, 1.0f);   // Purple
    case EKhaaosSkinRarity::LENDARIO: return FLinearColor(1.0f, 0.6f, 0.0f);   // Orange/Gold
    case EKhaaosSkinRarity::MITICO:  return FLinearColor(1.0f, 0.0f, 0.4f);   // Red/Crimson
    default: return FLinearColor::White;
  }
}

static float GetRarityEmissiveIntensity(EKhaaosSkinRarity Rarity)
{
  switch (Rarity)
  {
    case EKhaaosSkinRarity::COMUM:    return 0.0f;
    case EKhaaosSkinRarity::INCOMUM:  return 0.0f;
    case EKhaaosSkinRarity::RARO:     return 0.5f;
    case EKhaaosSkinRarity::EPICO:    return 1.5f;
    case EKhaaosSkinRarity::LENDARIO: return 3.0f;
    case EKhaaosSkinRarity::MITICO:  return 5.0f;
    default: return 0.0f;
  }
}

// ─── Constructor ────────────────────────────────────────────────────────────

UKhaaosSkinSystem::UKhaaosSkinSystem()
{
  PrimaryComponentTick.bCanEverTick = false;
}

// ─── Skin Registry ──────────────────────────────────────────────────────────

void UKhaaosSkinSystem::RegisterSkin(const FKhaaosSkinDef& SkinDef)
{
  SkinRegistry.Add(SkinDef.SkinId, SkinDef);
}

bool UKhaaosSkinSystem::GetSkinDef(FName SkinId, FKhaaosSkinDef& OutDef) const
{
  const FKhaaosSkinDef* Found = SkinRegistry.Find(SkinId);
  if (Found)
  {
    OutDef = *Found;
    return true;
  }
  return false;
}

TArray<FKhaaosSkinDef> UKhaaosSkinSystem::GetSkinsForSpecies(FName SpeciesId) const
{
  TArray<FKhaaosSkinDef> Result;
  for (const auto& Pair : SkinRegistry)
  {
    if (Pair.Value.SpeciesId == SpeciesId)
    {
      Result.Add(Pair.Value);
    }
  }
  return Result;
}

TArray<FKhaaosSkinDef> UKhaaosSkinSystem::GetSkinsByRarity(EKhaaosSkinRarity Rarity) const
{
  TArray<FKhaaosSkinDef> Result;
  for (const auto& Pair : SkinRegistry)
  {
    if (Pair.Value.Rarity == Rarity)
    {
      Result.Add(Pair.Value);
    }
  }
  return Result;
}

// ─── Equipment ──────────────────────────────────────────────────────────────

bool UKhaaosSkinSystem::EquipSkin(EKhaaosCosmeticSlot Slot, FName SkinId)
{
  // Validate: skin must exist and be owned
  const FKhaaosSkinDef* Def = SkinRegistry.Find(SkinId);
  if (!Def) return false;
  if (!OwnedSkins.Contains(SkinId)) return false;

  // Equip to slot
  Loadout.EquippedSkins.Add(Slot, SkinId);

  // Auto-apply cosmetics
  ApplyCosmetics();

  return true;
}

void UKhaaosSkinSystem::UnequipSlot(EKhaaosCosmeticSlot Slot)
{
  Loadout.EquippedSkins.Add(Slot, NAME_None);
  ApplyCosmetics();
}

// ─── Runtime Application ────────────────────────────────────────────────────

void UKhaaosSkinSystem::ApplyCosmetics()
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  // Save defaults if first apply
  if (!DefaultMesh)
  {
    DefaultMesh = Mesh->GetSkeletalMeshAsset();
    DefaultMaterial = Cast<UMaterialInstance>(Mesh->GetMaterial(0));
  }

  // Apply BODY slot skin (primary appearance)
  FName BodySkinId = Loadout.EquippedSkins.FindRef(EKhaaosCosmeticSlot::BODY);
  if (BodySkinId != NAME_None)
  {
    const FKhaaosSkinDef* Def = SkinRegistry.Find(BodySkinId);
    if (Def)
    {
      // Step 1: Material overrides (INCOMUM+)
      ApplyMaterialOverrides(*Def);

      // Step 2: Mesh overrides (RARO+)
      if (Def->Rarity >= EKhaaosSkinRarity::RARO)
      {
        ApplyMeshOverride(*Def);
      }

      // Step 3: VFX aura (EPICO+)
      if (Def->Rarity >= EKhaaosSkinRarity::EPICO)
      {
        ActivateRarityVFX(Def->Rarity);
      }
      else
      {
        DeactivateRarityVFX();
      }
    }
  }

  // Apply HEAD slot (helmet/head accessory)
  FName HeadSkinId = Loadout.EquippedSkins.FindRef(EKhaaosCosmeticSlot::HEAD);
  // Head slot would attach a separate static/skeletal mesh component
  // Implementation depends on character component hierarchy

  // Apply BACK slot (backpack/wings)
  FName BackSkinId = Loadout.EquippedSkins.FindRef(EKhaaosCosmeticSlot::BACK);
  // Back slot attaches to spine socket

  // Apply MELEE slot (melee weapon skin)
  FName MeleeSkinId = Loadout.EquippedSkins.FindRef(EKhaaosCosmeticSlot::MELEE);
  // Melee skin overrides the equipped melee weapon material
}

void UKhaaosSkinSystem::RevertToDefault()
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  // Restore default mesh
  if (DefaultMesh)
  {
    Mesh->SetSkeletalMeshAsset(DefaultMesh);
  }

  // Restore default material
  if (DefaultMaterial)
  {
    Mesh->SetMaterial(0, DefaultMaterial);
  }

  // Deactivate VFX
  DeactivateRarityVFX();
}

// ─── Rarity Visual Effects ──────────────────────────────────────────────────

void UKhaaosSkinSystem::ActivateRarityVFX(EKhaaosSkinRarity Rarity)
{
  if (Rarity < EKhaaosSkinRarity::EPICO) return;

  DeactivateRarityVFX(); // Remove existing aura

  // Find the currently equipped BODY skin for its VFX system
  FName BodySkinId = Loadout.EquippedSkins.FindRef(EKhaaosCosmeticSlot::BODY);
  const FKhaaosSkinDef* Def = SkinRegistry.Find(BodySkinId);
  if (!Def || !Def->AuraVFX.IsValid()) return;

  // Load and spawn the Niagara aura
  UNiagaraSystem* VFXSystem = Def->AuraVFX.LoadSynchronous();
  if (!VFXSystem) return;

  AActor* Owner = GetOwner();
  if (!Owner) return;

  ActiveAuraVFX = UNiagaraFunctionLibrary::SpawnSystemAttached(
    VFXSystem,
    ResolveCharacterMesh(),
    FName("Spine_03"),  // Attach to spine
    FVector::ZeroVector,
    FRotator::ZeroRotator,
    EAttachLocation::KeepRelativeOffset,
    true  // Auto-destroy
  );

  if (ActiveAuraVFX)
  {
    // Set rarity-based color and intensity
    FLinearColor RarityColor = GetRarityColor(Rarity);
    ActiveAuraVFX->SetNiagaraVariableLinearColor(FName("RarityColor"), RarityColor);
    ActiveAuraVFX->SetNiagaraVariableFloat(FName("Intensity"), GetRarityEmissiveIntensity(Rarity));
  }
}

void UKhaaosSkinSystem::DeactivateRarityVFX()
{
  if (ActiveAuraVFX)
  {
    ActiveAuraVFX->DestroyComponent();
    ActiveAuraVFX = nullptr;
  }
}

// ─── Shop Integration ───────────────────────────────────────────────────────

void UKhaaosSkinSystem::GrantSkinOwnership(FName SkinId)
{
  OwnedSkins.Add(SkinId);

  // Update the registry entry
  FKhaaosSkinDef* Def = SkinRegistry.Find(SkinId);
  if (Def)
  {
    Def->bOwned = true;
  }
}

bool UKhaaosSkinSystem::IsSkinOwned(FName SkinId) const
{
  return OwnedSkins.Contains(SkinId);
}

bool UKhaaosSkinSystem::CanEquipSkin(FName SkinId, FName SpeciesId) const
{
  if (!OwnedSkins.Contains(SkinId)) return false;
  const FKhaaosSkinDef* Def = SkinRegistry.Find(SkinId);
  if (!Def) return false;
  return Def->SpeciesId == SpeciesId;
}

// ─── Material Parameter Interface ───────────────────────────────────────────

void UKhaaosSkinSystem::SetColorPrimary(const FLinearColor& Color)
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  UMaterialInstanceDynamic* DynMat = Mesh->CreateDynamicMaterialInstance(0);
  if (DynMat)
  {
    DynMat->SetVectorParameterValue(FName("ColorPrimary"), Color);
    Mesh->SetMaterial(0, DynMat);
  }
}

void UKhaaosSkinSystem::SetColorAccent(const FLinearColor& Color)
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  UMaterialInstanceDynamic* DynMat = Mesh->CreateDynamicMaterialInstance(0);
  if (DynMat)
  {
    DynMat->SetVectorParameterValue(FName("ColorAccent"), Color);
    Mesh->SetMaterial(0, DynMat);
  }
}

void UKhaaosSkinSystem::SetEmissiveIntensity(float Intensity)
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  UMaterialInstanceDynamic* DynMat = Mesh->CreateDynamicMaterialInstance(0);
  if (DynMat)
  {
    DynMat->SetScalarParameterValue(FName("EmissiveIntensity"), Intensity);
    Mesh->SetMaterial(0, DynMat);
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

USkeletalMeshComponent* UKhaaosSkinSystem::ResolveCharacterMesh()
{
  if (CharacterMesh) return CharacterMesh;

  AActor* Owner = GetOwner();
  if (!Owner) return nullptr;

  // Try to find the character's skeletal mesh component
  CharacterMesh = Owner->FindComponentByClass<USkeletalMeshComponent>();

  return CharacterMesh;
}

void UKhaaosSkinSystem::ApplyMaterialOverrides(const FKhaaosSkinDef& SkinDef)
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  // Load override material if specified (INCOMUM+)
  UMaterialInstance* Mat = nullptr;
  if (SkinDef.OverrideMaterial.IsValid())
  {
    Mat = SkinDef.OverrideMaterial.LoadSynchronous();
  }

  if (Mat)
  {
    // Create dynamic instance for per-instance parameter control
    UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(Mat, this);
    if (DynMat)
    {
      DynMat->SetVectorParameterValue(FName("ColorPrimary"), SkinDef.ColorPrimary);
      DynMat->SetVectorParameterValue(FName("ColorAccent"), SkinDef.ColorAccent);
      DynMat->SetScalarParameterValue(FName("EmissiveIntensity"),
        SkinDef.EmissiveIntensity > 0 ? SkinDef.EmissiveIntensity : GetRarityEmissiveIntensity(SkinDef.Rarity));
      Mesh->SetMaterial(0, DynMat);
    }
  }
  else
  {
    // No override material — just update parameters on existing material
    SetColorPrimary(SkinDef.ColorPrimary);
    SetColorAccent(SkinDef.ColorAccent);
    SetEmissiveIntensity(GetRarityEmissiveIntensity(SkinDef.Rarity));
  }
}

void UKhaaosSkinSystem::ApplyMeshOverride(const FKhaaosSkinDef& SkinDef)
{
  USkeletalMeshComponent* Mesh = ResolveCharacterMesh();
  if (!Mesh) return;

  if (SkinDef.OverrideMesh.IsValid())
  {
    USkeletalMesh* NewMesh = SkinDef.OverrideMesh.LoadSynchronous();
    if (NewMesh)
    {
      Mesh->SetSkeletalMeshAsset(NewMesh);
    }
  }
}
