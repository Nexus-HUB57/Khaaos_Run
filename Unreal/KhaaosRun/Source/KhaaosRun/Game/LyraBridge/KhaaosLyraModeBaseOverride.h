// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraModeBaseOverride.generated.h"

/**
 * KhaaosLyraModeBaseOverride — Lyra Bridge for Khaaos Run.
 * GameMode override — routes Lyra game mode to Khaaos game mode logic.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraModeBaseOverride"))
class KhaaosLyraModeBaseOverride : public ALyraGameMode
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Mode")
    FName KhaaosWorldID = CIGKV;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void SetKhaaosWorld(FName WorldID);
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Bridge")
    FName GetKhaaosWorld();
};
