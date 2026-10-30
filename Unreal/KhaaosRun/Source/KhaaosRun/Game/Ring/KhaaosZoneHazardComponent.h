#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Ring/KhaaosZoneHazardComponent.generated.h"

UENUM(BlueprintType)
enum class EZoneHazardType : uint8
{
    NONE            UMETA(DisplayName = "None"),
    ELECTRIC_ENERGY UMETA(DisplayName = "Electric Energy"),
    TOXIC_FOG       UMETA(DisplayName = "Toxic Fog"),
    RADIATION_ZONE  UMETA(DisplayName = "Radiation Zone"),
    CRYO_STORM      UMETA(DisplayName = "Cryo Storm")
};

USTRUCT(BlueprintType)
struct FHazardConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EZoneHazardType HazardType = EZoneHazardType::NONE;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FString VFXAsset;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float DamageModifier = 0.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bSlowsMovement = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float SlowPercentage = 0.f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float HuranResistance = 0.f;
};

UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosZoneHazardComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosZoneHazardComponent();

    EZoneHazardType GetActiveHazard(EKhaaosWorld World) const;
    float GetHazardDamage(EZoneHazardType Hazard, float BaseDamage) const;
    float GetHuranResistance(EZoneHazardType Hazard) const;
    void ApplySecondaryEffects();
    void ActivateHazardVFX(EZoneHazardType Hazard);

private:
    UPROPERTY()
    EZoneHazardType ActiveHazard = EZoneHazardType::NONE;

    UPROPERTY()
    TMap<EZoneHazardType, FHazardConfig> HazardConfigs;

    UPROPERTY()
    bool bHazardActive = false;
};
