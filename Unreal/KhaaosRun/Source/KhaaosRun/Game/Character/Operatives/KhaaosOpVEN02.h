// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpVEN02.generated.h"

/**
 * AKhaaosOpVEN02 - Operative subclass for Venex Male Elite.
 * Venex ethnicity: Vekkar elite sprint-caste - hyper-accel geneline.
 * Species trait: +20% speed bonus. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpVEN02"))
class AKhaaosOpVEN02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpVEN02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Venex. */
    virtual void ApplySpeciesTraits() override;
};
