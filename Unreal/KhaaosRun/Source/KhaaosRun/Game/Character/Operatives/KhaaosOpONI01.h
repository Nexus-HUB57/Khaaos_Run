// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpONI01.generated.h"

/**
 * AKhaaosOpONI01 - Operative subclass for Onith Male.
 * Onith ethnicity: Nithrox spore-tolerant - mycelial-symbiont geneline.
 * Species trait: +15% toxic resistance.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpONI01"))
class AKhaaosOpONI01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpONI01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Onith. */
    virtual void ApplySpeciesTraits() override;
};
