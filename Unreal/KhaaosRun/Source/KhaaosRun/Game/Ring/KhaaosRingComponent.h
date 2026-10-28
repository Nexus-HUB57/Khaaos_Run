#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Ring/KhaaosRingManager.h"
#include "Ring/KhaaosRingComponent.generated.h"

UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosRingComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosRingComponent();

    void UpdateZoneStatus();
    ERingZoneType GetCurrentZoneType() const;
    float GetCurrentDamage() const;
    void ApplyRingDamage();
    bool IsInWaterZone() const;
    float GetHuranDamageModifier() const;

private:
    UPROPERTY()
    ERingZoneType CurrentZoneType = ERingZoneType::SAFE;

    UPROPERTY()
    float CurrentDamage = 0.f;

    UPROPERTY()
    bool bInWaterZone = false;

    UPROPERTY()
    bool bIsHuranOperative = false;
};
