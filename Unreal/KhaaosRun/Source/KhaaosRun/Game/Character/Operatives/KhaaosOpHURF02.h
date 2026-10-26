// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpHURF02.generated.h"

/**
 * AKhaaosOpHURF02 - Operative subclass for Huran Female Elite.
 * Huran ethnicity: Ruvok-dal elite matriarch - reinforced geneline.
 * Species trait: +5 HP/s regeneration. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpHURF02"))
class AKhaaosOpHURF02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpHURF02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Huran. */
    virtual void ApplySpeciesTraits() override;
};
