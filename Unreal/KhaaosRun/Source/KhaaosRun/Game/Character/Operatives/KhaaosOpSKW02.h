// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpSKW02.generated.h"

/**
 * AKhaaosOpSKW02 - Operative subclass for Skeetw Male Elite.
 * Skeetw ethnicity: Tweek elite fog-dominator - mist-sovereign geneline.
 * Species trait: fog stealth enabled. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpSKW02"))
class AKhaaosOpSKW02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpSKW02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Skeetw. */
    virtual void ApplySpeciesTraits() override;
};
