// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KhaaosAnimLayerInterface.generated.h"

// ─── Animation Layer Interface ────────────────────────────────────────────────
// Species-specific animation swapping interface.
// Each species (Zheers, Onith, Skeetw, Huran, Venex, Khael) implements this
// interface with unique animation sets. Allows swapping animation sets at
// runtime when the player's species changes (e.g. via SpeciesDataAsset).
// ═══════════════════════════════════════════════════════════════════════════════

UINTERFACE(MinimalAPI, BlueprintType, meta=(CannotImplementInterfaceInBlueprint))
class UKhaaosAnimLayerInterface : public UInterface
{
    GENERATED_BODY()
};

class IKhaaosAnimLayerInterface
{
    GENERATED_BODY()

public:

    /** Returns the locomotion BlendSpace for this species (idle/walk/run/jog blends). */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UBlendSpace* GetLocomotionBlendSpace();

    /** Returns the fire montage for the current weapon slot. */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UAnimMontage* GetFireMontage();

    /** Returns the reload montage for the current weapon slot. */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UAnimMontage* GetReloadMontage();

    /** Returns the ADS (Aim Down Sights) overlay sequence for upper-body blending. */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UAnimSequence* GetADSOverlay();

    /** Returns the melee attack montage (species-specific melee animations). */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UAnimMontage* GetMeleeMontage();

    /** Returns the downed/bleed-out montage when player enters DBNO state. */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UAnimMontage* GetDownedMontage();

    /** Returns the revive montage (being revived by a teammate). */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Khaaos|Animation")
    UAnimMontage* GetReviveMontage();
};
