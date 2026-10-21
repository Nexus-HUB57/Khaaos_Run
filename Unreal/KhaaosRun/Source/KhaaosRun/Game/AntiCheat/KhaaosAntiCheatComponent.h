// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosAntiCheatComponent.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosAntiCheatViolation
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    FString PlayerId;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    FName ViolationType;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    float Severity = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    float Timestamp = 0.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnViolationDetected, const FKhaaosAntiCheatViolation&, Violation);

/**
 * UKhaaosAntiCheatComponent — Server-side anti-cheat validation.
 * PhD-Level: rate limiting, movement validation, hit validation, damage sanity.
 * Server-only component — never replicated to clients.
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosAntiCheatComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosAntiCheatComponent();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
    bool ValidateHit(const FString& InstigatorId, float Damage, float DistanceM, float FireRate) const;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
    bool ValidateMovement(const FVector& OldLocation, const FVector& NewLocation, float DeltaTime) const;

    UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
    bool ValidateDamageDealt(const FString& InstigatorId, float DamageThisSecond) const;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    float MaxDamagePerSecond = 3500.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    float MaxSpeed = 1200.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    float MaxHitDistance = 800.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    float TeleportThreshold = 5000.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    int32 MaxViolationsBeforeAction = 5;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|AntiCheat")
    FOnViolationDetected OnViolationDetected;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
    TArray<FKhaaosAntiCheatViolation> RecentViolations;

protected:

    void RecordViolation(const FString& PlayerId, FName Type, float Severity);
};
