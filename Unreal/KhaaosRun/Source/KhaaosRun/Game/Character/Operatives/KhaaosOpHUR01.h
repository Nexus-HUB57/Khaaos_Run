// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpHUR01.generated.h"

/**
 * AKhaaosOpHUR01 - Operative subclass for Huran Male.
 * Huran ethnicity: Ruvok-dal highland clans - dense-muscle geneline.
 * Species trait: +5 HP/s regeneration.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpHUR01"))
class AKhaaosOpHUR01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpHUR01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Huran. */
    virtual void ApplySpeciesTraits() override;
};
