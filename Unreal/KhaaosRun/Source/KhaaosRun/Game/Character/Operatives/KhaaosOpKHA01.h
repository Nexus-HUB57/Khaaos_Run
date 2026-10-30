// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpKHA01.generated.h"

/**
 * AKhaaosOpKHA01 - Operative subclass for Khael Male.
 * Khael ethnicity: Cryok-thal frost-borne - permafrost-adapted geneline.
 * Species trait: 70% cryo resistance.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpKHA01"))
class AKhaaosOpKHA01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpKHA01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Khael. */
    virtual void ApplySpeciesTraits() override;
};
