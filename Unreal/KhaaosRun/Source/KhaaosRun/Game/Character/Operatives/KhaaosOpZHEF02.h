// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpZHEF02.generated.h"

/**
 * AKhaaosOpZHEF02 - Operative subclass for Zheers Female Elite.
 * Zheers ethnicity: Zherkan elite rad-queen - rad-fortress geneline.
 * Species trait: +10% radiation resistance. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpZHEF02"))
class AKhaaosOpZHEF02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpZHEF02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Zheers. */
    virtual void ApplySpeciesTraits() override;
};
