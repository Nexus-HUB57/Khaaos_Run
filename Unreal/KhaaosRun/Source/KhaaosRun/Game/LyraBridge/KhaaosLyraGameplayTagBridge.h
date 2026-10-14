// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraGameplayTagBridge.generated.h"

/**
 * KhaaosLyraGameplayTagBridge — Lyra Bridge for Khaaos Run.
 * GameplayTag bridge — ensures Khaaos tags are registered in Lyra manager.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraGameplayTagBridge"))
class KhaaosLyraGameplayTagBridge : public UGameplayTagsManager
{
    GENERATED_BODY()

public:


    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void RegisterKhaaosTags();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    FGameplayTag GetKhaaosTag(FName TagName);
};
