// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpKHAF02.generated.h"

/**
 * AKhaaosOpKHAF02 - Operative subclass for Khael Female Elite.
 * Khael ethnicity: Cryok-thal elite frost-dancer - cryo-amped geneline.
 * Species trait: 70% cryo resistance. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpKHAF02"))
class AKhaaosOpKHAF02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpKHAF02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Khael. */
    virtual void ApplySpeciesTraits() override;
};
