// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpSKW01.generated.h"

/**
 * AKhaaosOpSKW01 - Operative subclass for Skeetw Male.
 * Skeetw ethnicity: Tweek-fog native - mist-walker geneline.
 * Species trait: fog stealth enabled.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpSKW01"))
class AKhaaosOpSKW01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpSKW01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Skeetw. */
    virtual void ApplySpeciesTraits() override;
};
