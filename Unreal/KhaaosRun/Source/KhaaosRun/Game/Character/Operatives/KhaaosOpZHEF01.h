// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpZHEF01.generated.h"

/**
 * AKhaaosOpZHEF01 - Operative subclass for Zheers Female.
 * Zheers ethnicity: Zherkan rad-survivor - shielded geneline.
 * Species trait: +10% radiation resistance.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpZHEF01"))
class AKhaaosOpZHEF01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpZHEF01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Zheers. */
    virtual void ApplySpeciesTraits() override;
};
