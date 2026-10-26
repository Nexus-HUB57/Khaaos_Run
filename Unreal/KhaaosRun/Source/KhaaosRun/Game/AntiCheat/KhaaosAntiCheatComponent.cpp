// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AntiCheat/KhaaosAntiCheatComponent.h"
#include "KhaaosRun.h"

UKhaaosAntiCheatComponent::UKhaaosAntiCheatComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
    MaxDamagePerSecond = 3500.0f;
    MaxSpeed = 1200.0f;
    MaxHitDistance = 800.0f;
    TeleportThreshold = 5000.0f;
    MaxViolationsBeforeAction = 5;
}

bool UKhaaosAntiCheatComponent::ValidateHit(const FString& InstigatorId, float Damage, float DistanceM, float FireRate) const
{
    if (DistanceM > MaxHitDistance) return false;
    if (Damage > MaxDamagePerSecond / FMath::Max(FireRate / 60.0f, 1.0f) * 2.0f) return false;
    return true;
}

bool UKhaaosAntiCheatComponent::ValidateMovement(const FVector& OldLocation, const FVector& NewLocation, float DeltaTime) const
{
    if (DeltaTime <= 0.0f) return false;

    const float Distance = FVector::Dist(OldLocation, NewLocation);
    const float Speed = Distance / DeltaTime;

    if (Speed > MaxSpeed * 1.5f) return false;
    if (Distance > TeleportThreshold) return false;
    return true;
}

bool UKhaaosAntiCheatComponent::ValidateDamageDealt(const FString& InstigatorId, float DamageThisSecond) const
{
    return DamageThisSecond <= MaxDamagePerSecond;
}

void UKhaaosAntiCheatComponent::RecordViolation(const FString& PlayerId, FName Type, float Severity)
{
    FKhaaosAntiCheatViolation V;
    V.PlayerId = PlayerId;
    V.ViolationType = Type;
    V.Severity = Severity;
    V.Timestamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    RecentViolations.Add(V);

    // Keep only last 50 violations
    if (RecentViolations.Num() > 50)
    {
        RecentViolations.RemoveAt(0, RecentViolations.Num() - 50);
    }

    OnViolationDetected.Broadcast(V);

    UE_LOG(LogKhaaosRun, Warning, TEXT("AntiCheat - VIOLATION: %s Type=%s Severity=%.2f"),
        *PlayerId, *Type.ToString(), Severity);
}
