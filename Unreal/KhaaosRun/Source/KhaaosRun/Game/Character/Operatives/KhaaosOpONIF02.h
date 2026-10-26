// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpONIF02.generated.h"

/**
 * AKhaaosOpONIF02 - Operative subclass for Onith Female Elite.
 * Onith ethnicity: Nithrox elite spore-healer - toxin-immune geneline.
 * Species trait: +15% toxic resistance. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpONIF02"))
class AKhaaosOpONIF02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpONIF02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Onith. */
    virtual void ApplySpeciesTraits() override;
};
