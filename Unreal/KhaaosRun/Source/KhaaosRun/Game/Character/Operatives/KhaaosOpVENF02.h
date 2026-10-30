// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpVENF02.generated.h"

/**
 * AKhaaosOpVENF02 - Operative subclass for Venex Female Elite.
 * Venex ethnicity: Vekkar elite swift-sister - hyper-accel geneline.
 * Species trait: +20% speed bonus. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpVENF02"))
class AKhaaosOpVENF02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpVENF02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Venex. */
    virtual void ApplySpeciesTraits() override;
};
