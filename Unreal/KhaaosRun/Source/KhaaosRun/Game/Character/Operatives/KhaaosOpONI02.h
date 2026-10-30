// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Game/Character/KhaaosOperativeActor.h"
#include "KhaaosOpONI02.generated.h"

/**
 * AKhaaosOpONI02 - Operative subclass for Onith Male Elite.
 * Onith ethnicity: Nithrox elite spore-warlord - toxin-overlord geneline.
 * Species trait: +15% toxic resistance. Elite variant.
 */
UCLASS(BlueprintType, ClassGroup = (Khaaos, Operatives), meta = (DisplayName = "KhaaosOpONI02"))
class AKhaaosOpONI02 : public AKhaaosOperativeActor
{
    GENERATED_BODY()

public:
    AKhaaosOpONI02();

    /** Active species VFX components (for cleanup). */
    UPROPERTY()
    TArray<UNiagaraComponent*> ActiveSpeciesVFX;

    /** Apply species-specific traits for Onith. */
    virtual void ApplySpeciesTraits() override;
};
