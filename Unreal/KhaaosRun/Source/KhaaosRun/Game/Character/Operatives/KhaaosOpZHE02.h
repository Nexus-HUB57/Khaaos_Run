// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpZHE02.generated.h"

/**
 * AKhaaosOpZHE02 - Operative subclass for Zheers Male Elite.
 * Zheers ethnicity: Zherkan elite rad-overlord - rad-supremacy geneline.
 * Species trait: +10% radiation resistance. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpZHE02"))
class AKhaaosOpZHE02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpZHE02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Zheers. */
    virtual void ApplySpeciesTraits() override;
};
