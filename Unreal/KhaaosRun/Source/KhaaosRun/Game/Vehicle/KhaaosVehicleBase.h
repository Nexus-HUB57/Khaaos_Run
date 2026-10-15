// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosVehicleBase.generated.h"

UENUM(BlueprintType)
enum class EKhaaosVehicleType : uint8
{
    Ground UMETA(DisplayName = "GROUND"),
    Water  UMETA(DisplayName = "WATER"),
    Air    UMETA(DisplayName = "AIR")
};

UENUM(BlueprintType)
enum class EKhaaosSeatRole : uint8
{
    Driver    UMETA(DisplayName = "DRIVER"),
    Passenger UMETA(DisplayName = "PASSENGER"),
    Gunner    UMETA(DisplayName = "GUNNER")
};

USTRUCT(BlueprintType)
struct FKhaaosVehicleSeat
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    int32 SeatIndex = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    EKhaaosSeatRole Role = EKhaaosSeatRole::Driver;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    FString OccupantId;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    FVector OffsetFromCenter = FVector::ZeroVector;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnVehicleEntered, const FString&, PlayerId, int32, SeatIndex);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnVehicleExited, const FString&, PlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnVehicleDestroyed, EKhaaosVehicleType, VehicleType);

UCLASS(Abstract, BlueprintType)
class AKhaaosVehicleBase : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosVehicleBase();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Vehicle")
    bool EnterVehicle(const FString& PlayerId, int32 SeatIndex);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Vehicle")
    void ExitVehicle(const FString& PlayerId);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Vehicle")
    void ApplyThrottle(float ThrottleInput);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Vehicle")
    void ApplySteering(float SteeringInput);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Vehicle")
    void ApplyBrake(float BrakeInput);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Vehicle")
    bool HasEmptySeat() const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Vehicle")
    int32 GetOccupantCount() const;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    EKhaaosVehicleType VehicleType = EKhaaosVehicleType::Ground;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float MaxSpeed = 3000.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float Acceleration = 1500.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float MaxHealth = 500.0f;

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float VehicleHealth = 500.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float MaxFuel = 100.0f;

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float CurrentFuel = 100.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    float FuelConsumptionPerSecond = 1.0f;

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Vehicle")
    TArray<FKhaaosVehicleSeat> Seats;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Vehicle")
    FOnVehicleEntered OnVehicleEntered;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Vehicle")
    FOnVehicleExited OnVehicleExited;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Vehicle")
    FOnVehicleDestroyed OnVehicleDestroyed;

    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

    UPROPERTY(Replicated)
    FVector VehicleVelocity = FVector::ZeroVector;

    UPROPERTY(Replicated)
    FRotator VehicleRotation = FRotator::ZeroRotator;

    float CurrentThrottle = 0.0f;
    float CurrentSteering = 0.0f;
    float CurrentBrake = 0.0f;
};
