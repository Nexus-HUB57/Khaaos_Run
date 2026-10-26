// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpONIF01.generated.h"

/**
 * AKhaaosOpONIF01 - Operative subclass for Onith Female.
 * Onith ethnicity: Nithrox spore-healer - toxin-neutral geneline.
 * Species trait: +15% toxic resistance.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpONIF01"))
class AKhaaosOpONIF01 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpONIF01();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Onith. */
    virtual void ApplySpeciesTraits() override;
};
