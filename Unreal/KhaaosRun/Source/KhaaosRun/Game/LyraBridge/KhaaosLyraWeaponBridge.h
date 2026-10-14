// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraWeaponBridge.generated.h"

/**
 * KhaaosLyraWeaponBridge — Lyra Bridge for Khaaos Run.
 * Weapon bridge — connects Lyra weapon instances to KhaaosWeaponDataAsset.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraWeaponBridge"))
class KhaaosLyraWeaponBridge : public ULyraWeaponInstance
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Weapon")
    class UKhaaosWeaponDataAsset* WeaponData;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void SetWeaponData(class UKhaaosWeaponDataAsset* Data);
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Bridge")
    class UKhaaosWeaponDataAsset* GetWeaponData();
};
