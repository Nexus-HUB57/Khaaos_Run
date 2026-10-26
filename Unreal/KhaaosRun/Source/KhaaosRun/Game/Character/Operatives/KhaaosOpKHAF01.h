// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpKHAF01.generated.h"

/**
 * AKhaaosOpKHAF01 - Operative subclass for Khael Female.
 * Khael ethnicity: Cryok-thal frost-dancer - cryo-adapted geneline.
 * Species trait: 70% cryo resistance.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpKHAF01"))
class AKhaaosOpKHAF01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpKHAF01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Khael. */
    virtual void ApplySpeciesTraits() override;
};
