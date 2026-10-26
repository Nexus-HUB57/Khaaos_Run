// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpVEN01.generated.h"

/**
 * AKhaaosOpVEN01 - Operative subclass for Venex Male.
 * Venex ethnicity: Vekkar sprint-caste - low-grav limb geneline.
 * Species trait: +20% speed bonus.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpVEN01"))
class AKhaaosOpVEN01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpVEN01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Venex. */
    virtual void ApplySpeciesTraits() override;
};
