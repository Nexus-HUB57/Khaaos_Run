// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraInputBridge.generated.h"

/**
 * KhaaosLyraInputBridge — Lyra Bridge for Khaaos Run.
 * Input bridge — maps Khaaos-specific input actions to GAS abilities.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraInputBridge"))
class KhaaosLyraInputBridge : public UEnhancedInputComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Input")
    bool bKhaaosInputBound = false;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void BindKhaaosInput();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void UnbindKhaaosInput();
};
