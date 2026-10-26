// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Combat/KhaaosDamageManager.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── Headshot Bones ─────────────────────────────────────────────────────────────

static const TArray<FName> HeadshotBones = {
    FName("head"), FName("Head"), FName("neck_01"), FName("Neck"),
    FName("SK_Head"), FName("B_Head"), FName("C_Head")
};

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosDamageManagerComponent::UKhaaosDamageManagerComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;

    MaxDamageEventsPerSecond = 30.0f;
    MaxSingleHitDamage = 500.0f;
    DefaultHeadshotMultiplier = 2.0f;
    MaxHitDistance = 1000.0f;

    TimeSinceLastCleanup = 0.0f;
}

// ─── Damage Processing ──────────────────────────────────────────────────────────

float UKhaaosDamageManagerComponent::ProcessDamage(const FKhaaosHitResult& Hit)
{
    if (GetOwnerRole() != ROLE_Authority)
    {
        return 0.0f;
    }

    // Validate hit (sanity checks)
    if (!ValidateHit(Hit))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("DamageManager::ProcessDamage - INVALID hit from %s to %s (%.1f dmg)"),
            *Hit.InstigatorId, *Hit.VictimId, Hit.DamageAmount);
        return 0.0f;
    }

    // Rate limit check
    const float CurrentTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
    if (!Hit.InstigatorId.IsEmpty() && !CheckRateLimit(Hit.InstigatorId, CurrentTime))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("DamageManager::ProcessDamage - RATE LIMITED for %s"), *Hit.InstigatorId);
        return 0.0f;
    }

    // Calculate final damage
    float FinalDamage = Hit.DamageAmount;

    // Apply headshot multiplier
    if (Hit.bIsHeadshot && Hit.DamageType == EKhaaosDamageType::Bullet)
    {
        FinalDamage *= DefaultHeadshotMultiplier;
        UE_LOG(LogKhaaosRun, Log, TEXT("DamageManager - HEADSHOT! %.1f → %.1f (x%.1f)"),
            Hit.DamageAmount, FinalDamage, DefaultHeadshotMultiplier);
    }

    // Cap to max single hit
    FinalDamage = FMath::Min(FinalDamage, MaxSingleHitDamage);

    // Find victim PlayerState and apply damage
    float ActualDamage = 0.0f;
    if (UWorld* World = GetWorld())
    {
        for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState))
                {
                    if (KPS->GetUniqueId().ToString() == Hit.VictimId)
                    {
						const FGameplayTag DamageTag = GetGameplayTagForDamageType(Hit.DamageType);
						ActualDamage = KPS->ApplyDamageOfType(FinalDamage, DamageTag, nullptr);

                        // Track damage dealt by instigator
                        if (!Hit.InstigatorId.IsEmpty() && ActualDamage > 0.0f)
                        {
                            // Find instigator and add to their DamageDealt
                            for (FConstPlayerControllerIterator It2 = World->GetPlayerControllerIterator(); It2; ++It2)
                            {
                                if (APlayerController* PC2 = It2->Get())
                                {
                                    if (AKhaaosPlayerState* InstKPS = Cast<AKhaaosPlayerState>(PC2->PlayerState))
                                    {
                                        if (InstKPS->GetUniqueId().ToString() == Hit.InstigatorId)
                                        {
                                            InstKPS->DamageDealt += ActualDamage;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        // Check for kill
                        if (KPS->Health <= 0.0f && KPS->PlayerStatus == EPlayerStatus::Eliminado)
                        {
                            OnPlayerKilled.Broadcast(Hit.VictimId, Hit.InstigatorId, Hit.WeaponID);
                        }

                        break;
                    }
                }
            }
        }
    }

    // Broadcast processed damage (for kill feed, damage numbers, etc.)
    if (ActualDamage > 0.0f)
    {
        FKhaaosHitResult ProcessedHit = Hit;
        ProcessedHit.DamageAmount = ActualDamage;
        OnDamageProcessed.Broadcast(ProcessedHit, ActualDamage);
    }

    return ActualDamage;
}

// ─── Headshot Detection ─────────────────────────────────────────────────────────

bool UKhaaosDamageManagerComponent::IsHeadshotBone(const FName& BoneName)
{
    return HeadshotBones.Contains(BoneName);
}

FGameplayTag UKhaaosDamageManagerComponent::GetGameplayTagForDamageType(EKhaaosDamageType DamageType)
{
	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	switch (DamageType)
	{
	case EKhaaosDamageType::Bullet: return Tags.Effect_Damage_Bullet;
	case EKhaaosDamageType::Explosion: return Tags.Effect_Damage_Explosion;
	case EKhaaosDamageType::Zone: return Tags.Effect_Damage_Zone;
	case EKhaaosDamageType::Melee: return Tags.Effect_Damage_Melee;
	case EKhaaosDamageType::Fall: return Tags.Effect_Damage_Fall;
	case EKhaaosDamageType::Pulso: return Tags.Effect_Damage_Pulso;
	default: return FGameplayTag();
	}
}

// ─── Validation ─────────────────────────────────────────────────────────────────

bool UKhaaosDamageManagerComponent::ValidateHit(const FKhaaosHitResult& Hit) const
{
    // Basic sanity: must have a victim
    if (Hit.VictimId.IsEmpty()) return false;

    // Damage must be positive and reasonable
    if (Hit.DamageAmount <= 0.0f || Hit.DamageAmount > MaxSingleHitDamage) return false;

    // Distance check (reject impossible shots)
    if (Hit.DistanceM > MaxHitDistance) return false;

    // Self-damage only allowed for zone/fall/bleed
    if (Hit.VictimId == Hit.InstigatorId)
    {
        if (Hit.DamageType != EKhaaosDamageType::Zone &&
            Hit.DamageType != EKhaaosDamageType::Fall &&
            Hit.DamageType != EKhaaosDamageType::Bleed &&
            Hit.DamageType != EKhaaosDamageType::Pulso)
        {
            return false;
        }
    }

    return true;
}

bool UKhaaosDamageManagerComponent::CheckRateLimit(const FString& InstigatorId, float CurrentTime)
{
    TArray<float>& Timestamps = InstigatorDamageTimestamps.FindOrAdd(InstigatorId);

    // Remove timestamps outside the window
    Timestamps.RemoveAll([CurrentTime](float Ts) {
        return (CurrentTime - Ts) > RateLimitWindowSeconds;
    });

    // Count events in the window
    int32 CountInWindow = Timestamps.Num();
    float MaxEventsInWindow = MaxDamageEventsPerSecond * RateLimitWindowSeconds;

    if (CountInWindow >= static_cast<int32>(MaxEventsInWindow))
    {
        return false;
    }

    // Record this event
    Timestamps.Add(CurrentTime);
    return true;
}

void UKhaaosDamageManagerComponent::CleanupOldTimestamps(float CurrentTime)
{
    for (auto& Pair : InstigatorDamageTimestamps)
    {
        Pair.Value.RemoveAll([CurrentTime](float Ts) {
            return (CurrentTime - Ts) > RateLimitWindowSeconds * 2.0f;
        });
    }

    // Remove empty entries
    TArray<FString> EmptyKeys;
    for (const auto& Pair : InstigatorDamageTimestamps)
    {
        if (Pair.Value.Num() == 0) EmptyKeys.Add(Pair.Key);
    }
    for (const FString& Key : EmptyKeys)
    {
        InstigatorDamageTimestamps.Remove(Key);
    }
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosDamageManagerComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority) return;

    // Periodic cleanup of old rate-limit timestamps
    TimeSinceLastCleanup += DeltaTime;
    if (TimeSinceLastCleanup >= 5.0f)
    {
        const float CurrentTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
        CleanupOldTimestamps(CurrentTime);
        TimeSinceLastCleanup = 0.0f;
    }
}
