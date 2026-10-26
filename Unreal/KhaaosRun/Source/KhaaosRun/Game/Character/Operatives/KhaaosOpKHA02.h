// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpKHA02.generated.h"

/**
 * AKhaaosOpKHA02 - Operative subclass for Khael Male Elite.
 * Khael ethnicity: Cryok-thal elite frost-lord - cryo-supremacy geneline.
 * Species trait: 70% cryo resistance. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpKHA02"))
class AKhaaosOpKHA02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpKHA02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Khael. */
    virtual void ApplySpeciesTraits() override;
};
