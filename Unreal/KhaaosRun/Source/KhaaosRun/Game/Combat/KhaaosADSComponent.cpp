// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Combat/KhaaosADSComponent.h"
#include "KhaaosRun.h"

UKhaaosADSComponent::UKhaaosADSComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    bIsAiming = false;
    bIsToggleMode = false;
    BaseFOV = 90.0f;
    ADSFOV = 60.0f;
    FOVInterpSpeed = 12.0f;
    ADSAccuracyModifier = -0.5f;
    ADSMovementSpeedModifier = 0.5f;
    CurrentFOV = BaseFOV;
}

void UKhaaosADSComponent::EnterADS()
{
    if (bIsAiming) return;
    bIsAiming = true;
    OnADSEntered.Broadcast();
}

void UKhaaosADSComponent::ExitADS()
{
    if (!bIsAiming) return;
    bIsAiming = false;
    OnADSExited.Broadcast();
}

void UKhaaosADSComponent::ToggleADS()
{
    if (bIsAiming) ExitADS();
    else EnterADS();
}

float UKhaaosADSComponent::GetAccuracyModifier() const
{
    return bIsAiming ? ADSAccuracyModifier : 0.0f;
}

float UKhaaosADSComponent::GetMovementSpeedModifier() const
{
    return bIsAiming ? ADSMovementSpeedModifier : 1.0f;
}

void UKhaaosADSComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Smooth FOV interpolation
    const float TargetFOV = bIsAiming ? ADSFOV : BaseFOV;
    CurrentFOV = FMath::FInterpTo(CurrentFOV, TargetFOV, DeltaTime, FOVInterpSpeed);
}
