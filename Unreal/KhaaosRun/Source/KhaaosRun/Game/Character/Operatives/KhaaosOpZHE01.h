// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpZHE01.generated.h"

/**
 * AKhaaosOpZHE01 - Operative subclass for Zheers Male.
 * Zheers ethnicity: Zherkan irradiated-steppe - rad-hardened geneline.
 * Species trait: +10% radiation resistance.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpZHE01"))
class AKhaaosOpZHE01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpZHE01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Zheers. */
    virtual void ApplySpeciesTraits() override;
};
