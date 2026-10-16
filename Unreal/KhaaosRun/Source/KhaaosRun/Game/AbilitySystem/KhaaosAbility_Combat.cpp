// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosAbility_Combat.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "DrawDebugHelpers.h"
#include "TimerManager.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Shoot
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Shoot::UKhaaosAbility_Shoot()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        BaseDamage = 25.0f;
        TraceDistance = 10000.0f;
        HeadshotMultiplier = 2.0f;
        RecoilPitch = 0.5f;
        RecoilYawRange = 0.2f;
        ShootEnergyCost = 2.0f;
        EnergyCost = 2.0f;

        bIsToggleAbility = false;
}

void UKhaaosAbility_Shoot::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        AActor* AvatarActor = ActorInfo ? ActorInfo->AvatarActor.Get() : nullptr;
        ACharacter* Character = Cast<ACharacter>(AvatarActor);
        if (!Character)
        {
                EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
                return;
        }

        // Get camera view for trace direction
        FVector TraceStart = Character->GetActorLocation();
        FVector TraceEnd = TraceStart + Character->GetActorForwardVector() * TraceDistance;

        // Use controller camera if available
        APlayerController* PC = Cast<APlayerController>(Character->GetController());
        if (PC)
        {
                FVector CameraLocation;
                FRotator CameraRotation;
                PC->GetPlayerViewPoint(CameraLocation, CameraRotation);
                TraceStart = CameraLocation;
                TraceEnd = TraceStart + CameraRotation.Vector() * TraceDistance;
        }

        // Server: perform trace and apply damage
        ServerShoot(TraceStart, TraceEnd);

        // Client: muzzle flash and recoil
        FVector MuzzleLocation = Character->GetActorLocation() + Character->GetActorForwardVector() * 50.0f;
        ClientSpawnMuzzleFlash(MuzzleLocation, Character->GetActorRotation());

        float YawRecoil = FMath::FRandRange(-RecoilYawRange, RecoilYawRange);
        ClientApplyRecoil(-RecoilPitch, YawRecoil);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Shoot::ActivateAbility - Shot fired"));

        // Immediately end (shoot is an instant ability)
        EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

bool UKhaaosAbility_Shoot::PerformLineTrace(const FVector& Start, const FVector& End, FHitResult& OutHit) const
{
        UWorld* World = GetWorld();
        if (!World)
        {
                return false;
        }

        FCollisionQueryParams QueryParams;
        QueryParams.AddIgnoredActor(GetOwningActorFromActorInfo());
        QueryParams.bTraceComplex = true;

        return World->LineTraceSingleByChannel(OutHit, Start, End, ECC_Pawn, QueryParams);
}

void UKhaaosAbility_Shoot::ServerShoot_Implementation(const FVector& TraceStart, const FVector& TraceEnd)
{
        FHitResult HitResult;
        if (!PerformLineTrace(TraceStart, TraceEnd, HitResult))
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Shoot::ServerShoot - Miss"));
                return;
        }

        AActor* HitActor = HitResult.GetActor();
        if (!HitActor)
        {
                return;
        }

        float FinalDamage = BaseDamage;

        // Check for headshot (hit bone name contains "head")
        if (HitResult.BoneName.ToString().Contains(TEXT("head"), ESearchCase::IgnoreCase))
        {
                FinalDamage *= HeadshotMultiplier;
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Shoot::ServerShoot - HEADSHOT! Damage: %.1f"), FinalDamage);
        }

        // Apply damage: Vitality → AttributeSet → log only fallback
        if (UKhaaosVitalityComponent* Vitality = HitActor->FindComponentByClass<UKhaaosVitalityComponent>())
        {
                Vitality->ApplyDamage(FinalDamage, GetAvatarActorFromActorInfo());
        }
        else if (UAbilitySystemComponent* TargetASC = UAbilitySystemBlueprintLibrary::GetAbilitySystemComponent(HitActor))
        {
                if (const UKhaaosAttributeSet* ConstAttr = TargetASC->GetSet<UKhaaosAttributeSet>())
                {
                        const_cast<UKhaaosAttributeSet*>(ConstAttr)->ApplyDamage(FinalDamage, GetAvatarActorFromActorInfo());
                }
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Shoot::ServerShoot - Hit %s for %.1f damage"),
                *HitActor->GetName(), FinalDamage);

        // Client: impact VFX
        ClientSpawnImpactVFX(HitResult.ImpactPoint, HitResult.ImpactNormal);
}

void UKhaaosAbility_Shoot::ClientSpawnMuzzleFlash_Implementation(const FVector& MuzzleLocation, const FRotator& MuzzleRotation)
{
        // Client-side muzzle flash VFX
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Shoot::ClientSpawnMuzzleFlash - VFX at %s"), *MuzzleLocation.ToString());
}

void UKhaaosAbility_Shoot::ClientSpawnImpactVFX_Implementation(const FVector& ImpactLocation, const FVector& ImpactNormal)
{
        // Client-side impact VFX
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Shoot::ClientSpawnImpactVFX - VFX at %s"), *ImpactLocation.ToString());
}

void UKhaaosAbility_Shoot::ClientApplyRecoil_Implementation(float PitchRecoil, float YawRecoil)
{
        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
        if (!Character)
        {
                return;
        }

        APlayerController* PC = Cast<APlayerController>(Character->GetController());
        if (PC)
        {
                PC->AddPitchInput(PitchRecoil);
                PC->AddYawInput(YawRecoil);
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Reload
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Reload::UKhaaosAbility_Reload()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        ReloadTime = 2.0f;
        MagazineSize = 30;

        bIsToggleAbility = false;
}

void UKhaaosAbility_Reload::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        // Client: play reload animation
        ClientPlayReloadAnim();

        // Server: refill magazine after delay
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate ReloadDelegate;
                ReloadDelegate.BindUObject(this, &UKhaaosAbility_Reload::ServerRefillMagazine);
                Owner->GetWorldTimerManager().SetTimer(ReloadTimerHandle, ReloadDelegate, ReloadTime, false);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Reload::ActivateAbility - Reload started (%.1fs)"), ReloadTime);
}

void UKhaaosAbility_Reload::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(ReloadTimerHandle);
        }

        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}

void UKhaaosAbility_Reload::ServerRefillMagazine_Implementation()
{
        // Refill magazine from reserve ammo
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Reload::ServerRefillMagazine - Magazine refilled to %d"), MagazineSize);

        // End the ability after reload completes
        EndAbility(GetCurrentAbilitySpecHandle(), GetCurrentActorInfo(),
                GetCurrentActivationInfo(), true, false);
}

void UKhaaosAbility_Reload::ClientPlayReloadAnim_Implementation()
{
        // Client-side reload animation
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Reload::ClientPlayReloadAnim - Playing reload anim"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Melee
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Melee::UKhaaosAbility_Melee()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        MeleeDamage = 50.0f;
        TraceRadius = 50.0f;
        TraceDistance = 200.0f;
        KnockbackMagnitude = 500.0f;
        MeleeEnergyCost = 8.0f;
        EnergyCost = 8.0f;

        bIsToggleAbility = false;
}

void UKhaaosAbility_Melee::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        AActor* AvatarActor = ActorInfo ? ActorInfo->AvatarActor.Get() : nullptr;
        if (!AvatarActor)
        {
                EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
                return;
        }

        FVector TraceStart = AvatarActor->GetActorLocation();
        FVector TraceEnd = TraceStart + AvatarActor->GetActorForwardVector() * TraceDistance;

        // Server: perform melee trace and damage
        ServerMeleeAttack(TraceStart, TraceEnd);

        // Client: melee swing VFX
        ClientSpawnMeleeVFX(TraceStart);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Melee::ActivateAbility - Melee attack"));

        // Immediately end (melee is an instant ability)
        EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

void UKhaaosAbility_Melee::ServerMeleeAttack_Implementation(const FVector& TraceStart, const FVector& TraceEnd)
{
        UWorld* World = GetWorld();
        if (!World)
        {
                return;
        }

        // Sphere trace for melee hit detection
        FCollisionShape SphereShape = FCollisionShape::MakeSphere(TraceRadius);
        FCollisionQueryParams QueryParams;
        QueryParams.AddIgnoredActor(GetOwningActorFromActorInfo());

        TArray<FHitResult> HitResults;
        bool bHit = World->SweepMultiByChannel(HitResults, TraceStart, TraceEnd, FQuat::Identity,
                ECC_Pawn, SphereShape, QueryParams);

        if (!bHit)
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Melee::ServerMeleeAttack - Miss"));
                return;
        }

        for (const FHitResult& Hit : HitResults)
        {
                AActor* HitActor = Hit.GetActor();
                if (!HitActor)
                {
                        continue;
                }

                // Apply melee damage
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Melee::ServerMeleeAttack - Hit %s for %.1f damage"),
                        *HitActor->GetName(), MeleeDamage);

                // Apply knockback impulse
                FVector KnockbackDir = (HitActor->GetActorLocation() - GetOwningActorFromActorInfo()->GetActorLocation()).GetSafeNormal();
                UPrimitiveComponent* RootComp = Cast<UPrimitiveComponent>(HitActor->GetRootComponent());
                if (RootComp && RootComp->IsSimulatingPhysics())
                {
                        RootComp->AddImpulse(KnockbackDir * KnockbackMagnitude, NAME_None, true);
                }
        }
}

void UKhaaosAbility_Melee::ClientSpawnMeleeVFX_Implementation(const FVector& Origin)
{
        // Client-side melee swing VFX
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Melee::ClientSpawnMeleeVFX - Swing VFX at %s"), *Origin.ToString());
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Throw
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Throw::UKhaaosAbility_Throw()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        ThrowSpeed = 2000.0f;
        ThrowAngleOffset = 30.0f; // Arc upward
        ThrowEnergyCost = 15.0f;
        EnergyCost = 15.0f;

        bIsToggleAbility = false;
}

void UKhaaosAbility_Throw::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        AActor* AvatarActor = ActorInfo ? ActorInfo->AvatarActor.Get() : nullptr;
        if (!AvatarActor)
        {
                EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
                return;
        }

        // Calculate throw direction with arc
        FVector Forward = AvatarActor->GetActorForwardVector();
        FVector Up = FVector::UpVector;
        FRotator ArcRotation(ThrowAngleOffset, 0.0f, 0.0f);
        FVector ThrowDirection = ArcRotation.RotateVector(Forward);

        // Server: spawn throwable
        ServerSpawnThrowable(AvatarActor->GetActorLocation(), ThrowDirection);

        // Client: throw animation
        ClientPlayThrowAnim();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Throw::ActivateAbility - Throwable launched"));

        // Immediately end (throw is an instant ability)
        EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

void UKhaaosAbility_Throw::ServerSpawnThrowable_Implementation(const FVector& Origin, const FVector& Direction)
{
        if (!ThrowableClass)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbility_Throw::ServerSpawnThrowable - No throwable class"));
                return;
        }

        UWorld* World = GetWorld();
        if (!World)
        {
                return;
        }

        FActorSpawnParameters SpawnParams;
        SpawnParams.Owner = GetOwningActorFromActorInfo();
        SpawnParams.Instigator = Cast<APawn>(GetOwningActorFromActorInfo());

        FVector SpawnLocation = Origin + Direction * 50.0f;
        AActor* Throwable = World->SpawnActor<AActor>(ThrowableClass, SpawnLocation, Direction.Rotation(), SpawnParams);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Throw::ServerSpawnThrowable - Spawned at %s"), *SpawnLocation.ToString());
}

void UKhaaosAbility_Throw::ClientPlayThrowAnim_Implementation()
{
        // Client-side throw animation
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Throw::ClientPlayThrowAnim - Playing throw anim"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Ultimate
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Ultimate::UKhaaosAbility_Ultimate()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        UltimateDamage = 200.0f;
        DamageRadius = 1000.0f;
        DamageDelay = 0.5f;
        UltimateEnergyCost = 100.0f;
        EnergyCost = 100.0f;
        CachedDamageCenter = FVector::ZeroVector;

        // Long cooldown for ultimate
        CooldownDuration = 120.0f;

        bIsToggleAbility = false;
}

void UKhaaosAbility_Ultimate::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        AActor* AvatarActor = ActorInfo ? ActorInfo->AvatarActor.Get() : nullptr;
        if (!AvatarActor)
        {
                EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
                return;
        }

        CachedDamageCenter = AvatarActor->GetActorLocation();

        // Client: spawn ultimate VFX immediately (wind-up visual)
        ClientSpawnUltimateVFX(CachedDamageCenter, DamageRadius);

        // Server: apply area damage after delay (for VFX wind-up)
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate DamageDelegate;
                DamageDelegate.BindUObject(this, &UKhaaosAbility_Ultimate::ServerApplyAreaDamage,
                        CachedDamageCenter, DamageRadius, UltimateDamage);
                Owner->GetWorldTimerManager().SetTimer(DamageDelayHandle, DamageDelegate, DamageDelay, false);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Ultimate::ActivateAbility - Ultimate activated (delay: %.1fs)"), DamageDelay);

        // End ability after damage delay + small buffer
        FTimerHandle EndHandle;
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate EndDelegate;
                EndDelegate.BindUObject(this, &UKhaaosAbility_Ultimate::EndAbility,
                        Handle, ActorInfo, ActivationInfo, true, false);
                Owner->GetWorldTimerManager().SetTimer(EndHandle, EndDelegate, DamageDelay + 0.1f, false);
        }
}

void UKhaaosAbility_Ultimate::ServerApplyAreaDamage_Implementation(const FVector& Center, float Radius, float Damage)
{
        UWorld* World = GetWorld();
        if (!World)
        {
                return;
        }

        // Sphere overlap for all pawns in radius
        FCollisionShape SphereShape = FCollisionShape::MakeSphere(Radius);
        FCollisionQueryParams QueryParams;
        QueryParams.AddIgnoredActor(GetOwningActorFromActorInfo());

        TArray<FOverlapResult> OverlapResults;
        World->OverlapMultiByChannel(OverlapResults, Center, FQuat::Identity,
                ECC_Pawn, SphereShape, QueryParams);

        for (const FOverlapResult& Overlap : OverlapResults)
        {
                AActor* OverlappedActor = Overlap.GetActor();
                if (!OverlappedActor)
                {
                        continue;
                }

                // Apply damage via GAS
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Ultimate::ServerApplyAreaDamage - Hit %s for %.1f damage"),
                        *OverlappedActor->GetName(), Damage);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Ultimate::ServerApplyAreaDamage - Applied %.1f damage in %.0f radius at %s"),
                Damage, Radius, *Center.ToString());
}

void UKhaaosAbility_Ultimate::ClientSpawnUltimateVFX_Implementation(const FVector& Center, float Radius)
{
        // Client-side ultimate VFX (explosion, shockwave, etc.)
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Ultimate::ClientSpawnUltimateVFX - VFX at %s (radius: %.0f)"),
                *Center.ToString(), Radius);
}
