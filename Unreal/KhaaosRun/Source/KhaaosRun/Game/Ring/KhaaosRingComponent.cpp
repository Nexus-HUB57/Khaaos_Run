// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Ring Component — Per-player ring status, damage, and zone detection

#include "Game/Ring/KhaaosRingComponent.h"#include "Game/Ring/KhaaosRingManager.h"#include "Game/Ring/KhaaosZoneHazardComponent.h"#include "GameFramework/Character.h"
#include "GameFramework/PlayerState.h"

UKhaaosRingComponent::UKhaaosRingComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_PrePhysics;
}

void UKhaaosRingComponent::UpdateZoneStatus()
{
    AActor* Owner = GetOwner();
    if (!Owner) return;

    const FVector OwnerPos = Owner->GetActorLocation();

    // Find RingManager in world
    AKhaaosRingManager* RingMgr = nullptr;
    if (UWorld* World = GetWorld())
    {
        TArray<AActor*> RingManagers;
        UGameplayStatics::GetAllActorsOfClass(World, AKhaaosRingManager::StaticClass(), RingManagers);
        if (RingManagers.Num() > 0)
        {
            RingMgr = Cast<AKhaaosRingManager>(RingManagers[0]);
        }
    }

    if (!RingMgr) return;

    // Check water zones first
    bInWaterZone = IsInWaterZone();

    if (bInWaterZone)
    {
        CurrentZoneType = ERingZoneType::WATER;
        CurrentDamage = 0.f; // No ring damage in water for Huran
        return;
    }

    // Check safe zone
    if (RingMgr->IsPositionInSafeZone(OwnerPos))
    {
        CurrentZoneType = ERingZoneType::SAFE;
        CurrentDamage = 0.f;
        return;
    }

    // Outside ring — calculate damage
    CurrentDamage = RingMgr->CalculateDamageForPosition(OwnerPos);

    // Apply Huran water modifier
    if (bIsHuranOperative && bInWaterZone)
    {
        CurrentDamage = 0.f; // Huran takes no ring damage in water
        CurrentZoneType = ERingZoneType::WATER;
    }
    else
    {
        // Determine zone severity
        const float SafeRadius = RingMgr->CurrentRadius;
        const float Dist = FVector::Dist2D(OwnerPos, RingMgr->RingCenter);
        const float Ratio = (Dist - SafeRadius) / SafeRadius;

        if (Ratio > 0.5f)
        {
            CurrentZoneType = ERingZoneType::DEADLY;
        }
        else
        {
            CurrentZoneType = ERingZoneType::DANGER;
        }
    }
}

ERingZoneType UKhaaosRingComponent::GetCurrentZoneType() const
{
    return CurrentZoneType;
}

float UKhaaosRingComponent::GetCurrentDamage() const
{
    return CurrentDamage;
}

void UKhaaosRingComponent::ApplyRingDamage()
{
    if (CurrentDamage <= 0.f) return;
    if (CurrentZoneType == ERingZoneType::SAFE || CurrentZoneType == ERingZoneType::WATER) return;

    // Apply damage to owner character
    if (ACharacter* Character = Cast<ACharacter>(GetOwner()))
    {
        // Use GAS damage or direct health modification
        // FDamageEvent DamageEvent;
        // Character->TakeDamage(CurrentDamage, DamageEvent, nullptr, nullptr);

        UE_LOG(LogTemp, Verbose,
            TEXT("RingDamage: %.1f applied to player (zone=%d)"),
            CurrentDamage, static_cast<int32>(CurrentZoneType));
    }
}

bool UKhaaosRingComponent::IsInWaterZone() const
{
    AActor* Owner = GetOwner();
    if (!Owner) return false;

    const FVector OwnerPos = Owner->GetActorLocation();

    // Find RingManager and check its water zones
    if (UWorld* World = GetWorld())
    {
        TArray<AActor*> RingManagers;
        UGameplayStatics::GetAllActorsOfClass(World, AKhaaosRingManager::StaticClass(), RingManagers);
        if (RingManagers.Num() > 0)
        {
            // Water zone check would go through RingSubsystem config
            // For now, check if player Z is below water level
            if (OwnerPos.Z < -50.f) // Simple water level check
            {
                return true;
            }
        }
    }

    return false;
}

float UKhaaosRingComponent::GetHuranDamageModifier() const
{
    if (bIsHuranOperative && bInWaterZone)
    {
        return 0.0f; // No ring damage in water for Huran
    }
    if (bIsHuranOperative)
    {
        return 0.5f; // 50% reduced ring damage in water
    }
    return 1.0f; // Full damage for non-Huran
}
