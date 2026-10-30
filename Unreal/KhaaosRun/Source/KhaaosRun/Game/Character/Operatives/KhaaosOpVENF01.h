// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpVENF01.generated.h"

/**
 * AKhaaosOpVENF01 - Operative subclass for Venex Female.
 * Venex ethnicity: Vekkar swift-sister caste - velocity geneline.
 * Species trait: +20% speed bonus.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpVENF01"))
class AKhaaosOpVENF01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpVENF01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Venex. */
    virtual void ApplySpeciesTraits() override;
};
