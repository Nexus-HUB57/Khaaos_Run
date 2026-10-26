// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpSKWF02.generated.h"

/**
 * AKhaaosOpSKWF02 - Operative subclass for Skeetw Female Elite.
 * Skeetw ethnicity: Tweek elite fog-queen - mist-empress geneline.
 * Species trait: fog stealth enabled. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpSKWF02"))
class AKhaaosOpSKWF02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpSKWF02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Skeetw. */
    virtual void ApplySpeciesTraits() override;
};
