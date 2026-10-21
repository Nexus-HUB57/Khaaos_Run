// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraHeroComponent.generated.h"

/**
 * KhaaosLyraHeroComponent — Lyra Bridge for Khaaos Run.
 * Hero component bridge — overrides species selection and ability binding.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraHeroComponent"))
class KhaaosLyraHeroComponent : public ULyraHeroComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Species")
    FName SpeciesID;
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Hero")
    bool bKhaaosAbilityBound = false;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void BindKhaaosSpecies(FName InSpeciesID);
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Bridge")
    FName GetSpeciesID();
};
