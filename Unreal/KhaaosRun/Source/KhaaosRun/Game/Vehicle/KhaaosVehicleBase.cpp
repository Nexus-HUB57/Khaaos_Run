// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Vehicle/KhaaosVehicleBase.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

AKhaaosVehicleBase::AKhaaosVehicleBase()
{
    PrimaryActorTick.bCanEverTick = true;
    VehicleType = EKhaaosVehicleType::Ground;
    MaxSpeed = 3000.0f;
    Acceleration = 1500.0f;
    MaxHealth = 500.0f;
    VehicleHealth = 500.0f;
    MaxFuel = 100.0f;
    CurrentFuel = 100.0f;
    FuelConsumptionPerSecond = 1.0f;

    // Default: 1 driver + 3 passengers
    Seats.SetNum(4);
    Seats[0] = {0, EKhaaosSeatRole::Driver, TEXT(""), FVector(0, 0, 50)};
    Seats[1] = {1, EKhaaosSeatRole::Passenger, TEXT(""), FVector(0, 100, 50)};
    Seats[2] = {2, EKhaaosSeatRole::Passenger, TEXT(""), FVector(0, -100, 50)};
    Seats[3] = {3, EKhaaosSeatRole::Passenger, TEXT(""), FVector(-150, 0, 50)};
}

bool AKhaaosVehicleBase::EnterVehicle(const FString& PlayerId, int32 SeatIndex)
{
    if (!Seats.IsValidIndex(SeatIndex)) return false;
    if (!Seats[SeatIndex].OccupantId.IsEmpty()) return false;

    Seats[SeatIndex].OccupantId = PlayerId;
    OnVehicleEntered.Broadcast(PlayerId, SeatIndex);

    UE_LOG(LogKhaaosRun, Log, TEXT("Vehicle::EnterVehicle - %s → seat %d"), *PlayerId, SeatIndex);
    return true;
}

void AKhaaosVehicleBase::ExitVehicle(const FString& PlayerId)
{
    for (FKhaaosVehicleSeat& Seat : Seats)
    {
        if (Seat.OccupantId == PlayerId)
        {
            Seat.OccupantId.Empty();
            OnVehicleExited.Broadcast(PlayerId);
            UE_LOG(LogKhaaosRun, Log, TEXT("Vehicle::ExitVehicle - %s"), *PlayerId);
            return;
        }
    }
}

void AKhaaosVehicleBase::ApplyThrottle(float ThrottleInput)
{
    CurrentThrottle = FMath::Clamp(ThrottleInput, -1.0f, 1.0f);
}

void AKhaaosVehicleBase::ApplySteering(float SteeringInput)
{
    CurrentSteering = FMath::Clamp(SteeringInput, -1.0f, 1.0f);
}

void AKhaaosVehicleBase::ApplyBrake(float BrakeInput)
{
    CurrentBrake = FMath::Clamp(BrakeInput, 0.0f, 1.0f);
}

bool AKhaaosVehicleBase::HasEmptySeat() const
{
    for (const FKhaaosVehicleSeat& Seat : Seats)
    {
        if (Seat.OccupantId.IsEmpty()) return true;
    }
    return false;
}

int32 AKhaaosVehicleBase::GetOccupantCount() const
{
    int32 Count = 0;
    for (const FKhaaosVehicleSeat& Seat : Seats)
    {
        if (!Seat.OccupantId.IsEmpty()) Count++;
    }
    return Count;
}

void AKhaaosVehicleBase::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (GetLocalRole() != ROLE_Authority) return;
    if (VehicleHealth <= 0.0f) return;

    // Consume fuel when engine is running
    if (GetOccupantCount() > 0 && FMath::Abs(CurrentThrottle) > 0.01f)
    {
        CurrentFuel -= FuelConsumptionPerSecond * DeltaSeconds;
        if (CurrentFuel <= 0.0f)
        {
            CurrentFuel = 0.0f;
            CurrentThrottle = 0.0f;
        }
    }

    // Simple physics: acceleration + velocity integration
    if (CurrentFuel > 0.0f)
    {
        const float Speed = VehicleVelocity.Size();
        if (Speed < MaxSpeed)
        {
            VehicleVelocity += GetActorForwardVector() * CurrentThrottle * Acceleration * DeltaSeconds;
        }

        // Steering: rotate velocity
        if (FMath::Abs(CurrentSteering) > 0.01f && Speed > 10.0f)
        {
            const float YawDelta = CurrentSteering * 90.0f * DeltaSeconds;
            VehicleRotation.Yaw += YawDelta;
            SetActorRotation(VehicleRotation);
        }

        // Brake: decelerate
        if (CurrentBrake > 0.01f)
        {
            VehicleVelocity *= FMath::Max(0.0f, 1.0f - CurrentBrake * 3.0f * DeltaSeconds);
        }

        // Move actor
        SetActorLocation(GetActorLocation() + VehicleVelocity * DeltaSeconds);
    }
}

void AKhaaosVehicleBase::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME(AKhaaosVehicleBase, VehicleHealth);
    DOREPLIFETIME(AKhaaosVehicleBase, CurrentFuel);
    DOREPLIFETIME(AKhaaosVehicleBase, VehicleVelocity);
    DOREPLIFETIME(AKhaaosVehicleBase, VehicleRotation);
    DOREPLIFETIME(AKhaaosVehicleBase, Seats);
}
