// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpHUR02.generated.h"

/**
 * AKhaaosOpHUR02 - Operative subclass for Huran Male Elite.
 * Huran ethnicity: Ruvok-dal elite war-caste - reinforced geneline.
 * Species trait: +5 HP/s regeneration. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpHUR02"))
class AKhaaosOpHUR02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpHUR02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Huran. */
    virtual void ApplySpeciesTraits() override;
};
