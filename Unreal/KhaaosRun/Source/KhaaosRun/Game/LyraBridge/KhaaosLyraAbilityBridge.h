// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraAbilityBridge.generated.h"

/**
 * KhaaosLyraAbilityBridge — Lyra Bridge for Khaaos Run.
 * Ability system bridge — maps Lyra abilities to Khaaos GAS abilities.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraAbilityBridge"))
class KhaaosLyraAbilityBridge : public UAbilitySystemComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability")
    class UKhaaosAbilitySet* KhaaosAbilitySet;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void BridgeAbilitySet(class UKhaaosAbilitySet* Set);
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    bool ActivateKhaaosAbility(FGameplayTag Tag);
};
