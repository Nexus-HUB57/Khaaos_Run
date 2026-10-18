// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraHUDOverride.generated.h"

/**
 * KhaaosLyraHUDOverride — Lyra Bridge for Khaaos Run.
 * HUD override — replaces Lyra HUD with Khaaos HUD widgets.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraHUDOverride"))
class KhaaosLyraHUDOverride : public ULyraHUD
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|HUD")
    bool bKhaaosHUDActive = false;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void ActivateKhaaosHUD();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void DeactivateKhaaosHUD();
};
