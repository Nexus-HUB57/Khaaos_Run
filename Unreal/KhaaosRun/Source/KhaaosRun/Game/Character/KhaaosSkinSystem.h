// Khaaos Run — Skin & Cosmetic System
// =====================================
// Runtime skin application pipeline with material swap, mesh swap,
// rarity-tier VFX auras, and cosmetic loadout slots.
//
// Skin Rarity Tiers:
//   COMUM → INCOMUM → RARO → EPICO → LENDARIO → MITICO
//
// Cosmetic Slots:
//   HEAD | BODY | LEGS | BACK | MELEE | PARACHUTE | EMOTE | BANNER
//
// Design: Data-driven from KhaaosSpeciesDataAsset skin definitions.
// Higher rarities add: material overrides → mesh overrides → VFX auras → animation overrides

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "NiagaraComponent.h"
#include "KhaaosSkinSystem.generated.h"

// ─── Enums ──────────────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosSkinRarity : uint8
{
  COMUM      UMETA(DisplayName = "Comum"),
  INCOMUM    UMETA(DisplayName = "Incomum"),
  RARO       UMETA(DisplayName = "Raro"),
  EPICO      UMETA(DisplayName = "Épico"),
  LENDARIO   UMETA(DisplayName = "Lendário"),
  MITICO     UMETA(DisplayName = "Mítico"),
};

UENUM(BlueprintType)
enum class EKhaaosCosmeticSlot : uint8
{
  HEAD       UMETA(DisplayName = "Head"),
  BODY       UMETA(DisplayName = "Body"),
  LEGS       UMETA(DisplayName = "Legs"),
  BACK       UMETA(DisplayName = "Back"),
  MELEE      UMETA(DisplayName = "Melee Weapon Skin"),
  PARACHUTE  UMETA(DisplayName = "Parachute"),
  EMOTE      UMETA(DisplayName = "Emote"),
  BANNER     UMETA(DisplayName = "Banner"),
};

// ─── Skin Definition ────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosSkinDef
{
  GENERATED_BODY()

  /** Unique skin ID (e.g., "SKN_HUR_F_01_RECRUTA") */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FName SkinId;

  /** Display name */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FText DisplayName;

  /** Rarity tier */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  EKhaaosSkinRarity Rarity = EKhaaosSkinRarity::COMUM;

  /** Species this skin belongs to */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FName SpeciesId;

  /** Primary color (hex → LinearColor) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FLinearColor ColorPrimary = FLinearColor(0.5f, 0.5f, 0.5f);

  /** Accent color */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FLinearColor ColorAccent = FLinearColor(0.8f, 0.8f, 0.8f);

  /** Emissive glow intensity (0 = none, higher = more glow for EPICO+) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  float EmissiveIntensity = 0.f;

  /** Override skeletal mesh (RARO+ only) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  TSoftObjectPtr<USkeletalMesh> OverrideMesh;

  /** Override material instance (INCOMUM+) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  TSoftObjectPtr<UMaterialInstance> OverrideMaterial;

  /** VFX aura Niagara system (EPICO+) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  TSoftObjectPtr<UNiagaraSystem> AuraVFX;

  /** KRC price in shop */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  int32 PriceKRC = 0;

  /** Whether this skin is currently owned by the player */
  UPROPERTY(BlueprintReadOnly)
  bool bOwned = false;
};

// ─── Cosmetic Loadout ───────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosCosmeticLoadout
{
  GENERATED_BODY()

  /** Currently equipped skin per slot */
  UPROPERTY(EditAnywhere, BlueprintReadWrite)
  TMap<EKhaaosCosmeticSlot, FName> EquippedSkins;

  /** Default: empty loadout */
  FKhaaosCosmeticLoadout()
  {
    for (uint8 i = 0; i <= static_cast<uint8>(EKhaaosCosmeticSlot::BANNER); ++i)
    {
      EquippedSkins.Add(static_cast<EKhaaosCosmeticSlot>(i), NAME_None);
    }
  }
};

// ─── Skin System Component ──────────────────────────────────────────────────

UCLASS(ClassGroup=(Khaaos, Cosmetics), meta=(BlueprintSpawnableComponent))
class UKhaaosSkinSystem : public UActorComponent
{
  GENERATED_BODY()

public:
  UKhaaosSkinSystem();

  // ─── Skin Registry ──────────────────────────────────────────────────────

  /** Register a skin definition (called from data asset loader) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void RegisterSkin(const FKhaaosSkinDef& SkinDef);

  /** Get skin definition by ID */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  bool GetSkinDef(FName SkinId, FKhaaosSkinDef& OutDef) const;

  /** Get all skins for a species */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  TArray<FKhaaosSkinDef> GetSkinsForSpecies(FName SpeciesId) const;

  /** Get all skins of a specific rarity */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  TArray<FKhaaosSkinDef> GetSkinsByRarity(EKhaaosSkinRarity Rarity) const;

  // ─── Equipment ──────────────────────────────────────────────────────────

  /** Equip a skin to a cosmetic slot (validates ownership + rarity) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  bool EquipSkin(EKhaaosCosmeticSlot Slot, FName SkinId);

  /** Unequip a slot (reverts to default) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void UnequipSlot(EKhaaosCosmeticSlot Slot);

  /** Get current cosmetic loadout */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  const FKhaaosCosmeticLoadout& GetLoadout() const { return Loadout; }

  // ─── Runtime Application ────────────────────────────────────────────────

  /** Apply all equipped cosmetics to the owning character's mesh */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void ApplyCosmetics();

  /** Revert to default appearance (remove all overrides) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void RevertToDefault();

  // ─── Rarity Visual Effects ──────────────────────────────────────────────

  /** Spawn/activate rarity-tier VFX aura (EPICO+ only) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void ActivateRarityVFX(EKhaaosSkinRarity Rarity);

  /** Deactivate rarity VFX aura */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void DeactivateRarityVFX();

  // ─── Shop Integration ───────────────────────────────────────────────────

  /** Mark a skin as owned (after purchase) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void GrantSkinOwnership(FName SkinId);

  /** Check if a skin is owned */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  bool IsSkinOwned(FName SkinId) const;

  /** Check if a skin can be equipped (owned + correct species) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  bool CanEquipSkin(FName SkinId, FName SpeciesId) const;

  // ─── Material Parameter Interface ───────────────────────────────────────

  /** Set primary color on character material */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void SetColorPrimary(const FLinearColor& Color);

  /** Set accent color on character material */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void SetColorAccent(const FLinearColor& Color);

  /** Set emissive glow intensity */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Skins")
  void SetEmissiveIntensity(float Intensity);

private:
  /** All registered skin definitions */
  UPROPERTY()
  TMap<FName, FKhaaosSkinDef> SkinRegistry;

  /** Current cosmetic loadout */
  UPROPERTY()
  FKhaaosCosmeticLoadout Loadout;

  /** Owned skin IDs */
  UPROPERTY()
  TSet<FName> OwnedSkins;

  /** Active VFX aura component */
  UPROPERTY()
  UNiagaraComponent* ActiveAuraVFX = nullptr;

  /** Cached reference to owning skeletal mesh */
  UPROPERTY()
  USkeletalMeshComponent* CharacterMesh = nullptr;

  /** Default mesh (saved for revert) */
  UPROPERTY()
  USkeletalMesh* DefaultMesh = nullptr;

  /** Default material (saved for revert) */
  UPROPERTY()
  UMaterialInstance* DefaultMaterial = nullptr;

  // ─── Internal ───────────────────────────────────────────────────────────

  /** Resolve the character mesh component from the owning actor */
  USkeletalMeshComponent* ResolveCharacterMesh();

  /** Apply material overrides for a skin */
  void ApplyMaterialOverrides(const FKhaaosSkinDef& SkinDef);

  /** Apply mesh override for a skin (RARO+) */
  void ApplyMeshOverride(const FKhaaosSkinDef& SkinDef);
};
