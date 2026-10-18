// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "KhaaosWeaponDataAsset.generated.h"

/** Attachment slot on a weapon. */
USTRUCT(BlueprintType)
struct FKhaaosWeaponAttachmentSlot
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachment")
    FName SlotName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachment")
    bool bEnabled = true;
};

/**
 * UKhaaosWeaponDataAsset — PrimaryDataAsset for weapon definition.
 * PrimaryAssetId type: "KhaaosWeapon"
 */
UCLASS(Abstract, BlueprintType, Const)
class UKhaaosWeaponDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName WeaponID;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName Slot;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName Category;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 Damage = 30;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 FireRate = 600;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 Accuracy = 70;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 Range = 50;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    int32 MagazineSize = 30;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    float ReloadTime = 2.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName Rarity;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Economy")
    int32 Price = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    float HeadshotMultiplier = 2.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Stats")
    float SpeedModifier = 1.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    FName AmmoType;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon|Attachments")
    TArray<FKhaaosWeaponAttachmentSlot> AttachmentSlots;

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosWeapon"), WeaponID);
    }

    /** Calculate damage at distance with linear falloff. */
    UFUNCTION(BlueprintPure, Category = "Weapon|Stats")
    float CalculateDamageAtDistance(float Distance) const
    {
        if (Distance <= 0.0f || Range <= 0) return static_cast<float>(Damage);
        if (Distance >= static_cast<float>(Range)) return static_cast<float>(Damage) * 0.3f;
        const float Falloff = 1.0f - 0.7f * (Distance / static_cast<float>(Range));
        return static_cast<float>(Damage) * Falloff;
    }

    /** Calculate DPS (Damage Per Second). */
    UFUNCTION(BlueprintPure, Category = "Weapon|Stats")
    float CalculateDPS() const
    {
        if (FireRate <= 0) return static_cast<float>(Damage);
        return static_cast<float>(Damage) * (static_cast<float>(FireRate) / 60.0f);
    }
};
