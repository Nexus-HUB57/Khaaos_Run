// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpHURF01.generated.h"

/**
 * AKhaaosOpHURF01 - Operative subclass for Huran Female.
 * Huran ethnicity: Ruvok-dal matriarch line - regenerative geneline.
 * Species trait: +5 HP/s regeneration.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpHURF01"))
class AKhaaosOpHURF01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpHURF01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Huran. */
    virtual void ApplySpeciesTraits() override;
};
