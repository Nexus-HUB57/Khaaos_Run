// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
// Forward declare parent — included via module dependency
#include "KhaaosLyraEOSBridge.generated.h"

/**
 * KhaaosLyraEOSBridge — Lyra Bridge for Khaaos Run.
 * EOS bridge — connects Lyra online subsystem to Khaaos EOS manager.
 */
UCLASS(Abstract, BlueprintType, meta = (DisplayName = "KhaaosLyraEOSBridge"))
class KhaaosLyraEOSBridge : public UOnlineSubsystem
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS")
    bool bEOSBridgeActive = false;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void InitializeEOSSession();
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Bridge")
    void ShutdownEOSSession();
};
