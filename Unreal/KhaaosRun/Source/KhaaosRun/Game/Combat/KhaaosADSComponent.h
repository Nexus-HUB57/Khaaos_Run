// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosADSComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnADSEntered);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnADSExited);

/**
 * UKhaaosADSComponent — Aim Down Sights system.
 * PhD-Level: FOV interpolation, accuracy modifier, movement speed reduction.
 * Supports both Toggle and Hold ADS modes.
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosADSComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosADSComponent();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|ADS")
    void EnterADS();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|ADS")
    void ExitADS();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|ADS")
    void ToggleADS();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ADS")
    bool IsAiming() const { return bIsAiming; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ADS")
    float GetCurrentFOV() const { return CurrentFOV; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ADS")
    float GetAccuracyModifier() const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|ADS")
    float GetMovementSpeedModifier() const;

    /** ADS mode: true = toggle, false = hold. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|ADS")
    uint8 bIsToggleMode : 1;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|ADS")
    float BaseFOV = 90.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|ADS")
    float ADSFOV = 60.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|ADS")
    float FOVInterpSpeed = 12.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|ADS")
    float ADSAccuracyModifier = -0.5f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|ADS")
    float ADSMovementSpeedModifier = 0.5f;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|ADS")
    FOnADSEntered OnADSEntered;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|ADS")
    FOnADSExited OnADSExited;

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|ADS")
    uint8 bIsAiming : 1;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|ADS")
    float CurrentFOV = 90.0f;
};
