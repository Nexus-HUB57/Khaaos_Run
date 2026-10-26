// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpSKWF01.generated.h"

/**
 * AKhaaosOpSKWF01 - Operative subclass for Skeetw Female.
 * Skeetw ethnicity: Tweek-fog weaver - mist-shroud geneline.
 * Species trait: fog stealth enabled.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpSKWF01"))
class AKhaaosOpSKWF01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpSKWF01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Skeetw. */
    virtual void ApplySpeciesTraits() override;
};
