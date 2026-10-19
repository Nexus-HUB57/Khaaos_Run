// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosAbility_Movement.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "TimerManager.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Sprint
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Sprint::UKhaaosAbility_Sprint()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;

        SprintSpeedMultiplier = 1.5f;
        EnergyDrainPerSecond = 5.0f;
        MinEnergyToActivate = 10.0f;
        EnergyCost = 0.0f; // Energy drained per tick, not upfront
        CachedWalkSpeed = 600.0f;

        bIsToggleAbility = true;
        bCancelOnDamage = true;
}

void UKhaaosAbility_Sprint::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
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

        // Cache walk speed and apply sprint multiplier
        UCharacterMovementComponent* CMC = Character->GetCharacterMovement();
        if (CMC)
        {
                CachedWalkSpeed = CMC->MaxWalkSpeed;
                ServerApplySprintSpeed(SprintSpeedMultiplier);
        }

        // Start energy drain tick
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate TickDelegate;
                TickDelegate.BindUObject(this, &UKhaaosAbility_Sprint::OnSprintTick, 0.1f);
                Owner->GetWorldTimerManager().SetTimer(SprintTickHandle, TickDelegate, 0.1f, true);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Sprint::ActivateAbility - Sprint started"));
}

void UKhaaosAbility_Sprint::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        // Stop energy drain tick
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(SprintTickHandle);
        }

        // Restore walk speed
        ServerRemoveSprintSpeed();

        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Sprint::EndAbility - Sprint ended (cancelled: %s)"),
                bWasCancelled ? TEXT("true") : TEXT("false"));
}

void UKhaaosAbility_Sprint::OnSprintTick(float DeltaTime)
{
        // Drain energy while sprinting
        if (!HasAuthorityOrPredictionKey(GetCurrentActorInfo(), &GetCurrentActivationInfo()))
        {
                return;
        }

        UAbilitySystemComponent* ASC = GetAbilitySystemComponentFromActorInfo();
        if (!ASC)
        {
                EndAbility(GetCurrentAbilitySpecHandle(), GetCurrentActorInfo(),
                        GetCurrentActivationInfo(), true, true);
                return;
        }

        // Check if we have enough energy to continue
        const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();

        // Energy drain: apply as a gameplay effect modifier or direct attribute access
        // For now, if energy is too low, end the ability
        float EnergyDrain = EnergyDrainPerSecond * DeltaTime;

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Sprint::OnSprintTick - Draining %.2f energy"), EnergyDrain);
}

void UKhaaosAbility_Sprint::ServerApplySprintSpeed_Implementation(float SpeedMultiplier)
{
        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
        if (Character && Character->GetCharacterMovement())
        {
                Character->GetCharacterMovement()->MaxWalkSpeed = CachedWalkSpeed * SpeedMultiplier;
        }
}

void UKhaaosAbility_Sprint::ServerRemoveSprintSpeed_Implementation()
{
        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
        if (Character && Character->GetCharacterMovement())
        {
                Character->GetCharacterMovement()->MaxWalkSpeed = CachedWalkSpeed;
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Jump
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Jump::UKhaaosAbility_Jump()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;

        JumpZVelocity = 0.0f; // 0 = use character default
        JumpEnergyCost = 5.0f;
        EnergyCost = 5.0f;

        bIsToggleAbility = false;
}

void UKhaaosAbility_Jump::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
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

        // Apply jump velocity
        if (JumpZVelocity > 0.0f)
        {
                UCharacterMovementComponent* CMC = Character->GetCharacterMovement();
                if (CMC)
                {
                        CMC->JumpZVelocity = JumpZVelocity;
                }
        }

        // Execute jump
        Character->Jump();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Jump::ActivateAbility - Jump executed"));

        // Immediately end (jump is an instant ability)
        EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

void UKhaaosAbility_Jump::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Slide
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Slide::UKhaaosAbility_Slide()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;

        SlideSpeedMultiplier = 2.0f;
        SlideDuration = 1.0f;
        SlideEnergyCost = 10.0f;
        EnergyCost = 10.0f;
        CachedWalkSpeed = 600.0f;

        bIsToggleAbility = false;
        bCancelOnMovement = false;
}

void UKhaaosAbility_Slide::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
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

        // Cache walk speed and enter slide state
        UCharacterMovementComponent* CMC = Character->GetCharacterMovement();
        if (CMC)
        {
                CachedWalkSpeed = CMC->MaxWalkSpeed;
                ServerEnterSlideState(SlideSpeedMultiplier);
        }

        // Crouch for slide
        Character->Crouch();

        // Auto-cancel after duration
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate EndDelegate;
                EndDelegate.BindUObject(this, &UKhaaosAbility_Slide::EndAbility,
                        Handle, ActorInfo, ActivationInfo, true, false);
                Owner->GetWorldTimerManager().SetTimer(SlideDurationHandle, EndDelegate, SlideDuration, false);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Slide::ActivateAbility - Slide started (duration: %.1fs)"), SlideDuration);
}

void UKhaaosAbility_Slide::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        // Clear timer
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(SlideDurationHandle);
        }

        // Exit slide state
        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
        if (Character)
        {
                Character->UnCrouch();
                ServerExitSlideState();
        }

        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Slide::EndAbility - Slide ended"));
}

void UKhaaosAbility_Slide::ServerEnterSlideState_Implementation(float SpeedMultiplier)
{
        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
        if (Character && Character->GetCharacterMovement())
        {
                Character->GetCharacterMovement()->MaxWalkSpeed = CachedWalkSpeed * SpeedMultiplier;
                Character->GetCharacterMovement()->MaxWalkSpeedCrouched = CachedWalkSpeed * SpeedMultiplier;
        }
}

void UKhaaosAbility_Slide::ServerExitSlideState_Implementation()
{
        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
        if (Character && Character->GetCharacterMovement())
        {
                Character->GetCharacterMovement()->MaxWalkSpeed = CachedWalkSpeed;
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_GrapplingHook
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_GrapplingHook::UKhaaosAbility_GrapplingHook()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        PullSpeed = 1200.0f;
        MaxGrappleDistance = 5000.0f;
        MaxGrappleDuration = 3.0f;
        GrappleEnergyCost = 20.0f;
        EnergyCost = 20.0f;
        GrappleAnchor = FVector::ZeroVector;

        bIsToggleAbility = true;
}

void UKhaaosAbility_GrapplingHook::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
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

        // Get aim direction from the avatar
        FVector Origin = AvatarActor->GetActorLocation();
        FVector Direction = AvatarActor->GetActorForwardVector();

        // Server: spawn hook projectile
        ServerSpawnHook(Origin, Direction);

        // Max duration safety timer
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate EndDelegate;
                EndDelegate.BindUObject(this, &UKhaaosAbility_GrapplingHook::EndAbility,
                        Handle, ActorInfo, ActivationInfo, true, false);
                Owner->GetWorldTimerManager().SetTimer(GrappleDurationHandle, EndDelegate, MaxGrappleDuration, false);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_GrapplingHook::ActivateAbility - Hook launched"));
}

void UKhaaosAbility_GrapplingHook::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        // Clear timers
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(GrappleDurationHandle);
                Owner->GetWorldTimerManager().ClearTimer(GrappleTickHandle);
        }

        // Release grapple on server
        ServerReleaseGrapple();

        // Destroy hook projectile if it still exists
        if (HookProjectile)
        {
                HookProjectile->Destroy();
                HookProjectile = nullptr;
        }

        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_GrapplingHook::EndAbility - Grapple ended"));
}

void UKhaaosAbility_GrapplingHook::ServerSpawnHook_Implementation(const FVector& Origin, const FVector& Direction)
{
        if (!HookProjectileClass)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbility_GrapplingHook::ServerSpawnHook - No hook projectile class"));
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

        FVector SpawnLocation = Origin + Direction * 50.0f; // Offset from player
        HookProjectile = World->SpawnActor<AActor>(HookProjectileClass, SpawnLocation, Direction.Rotation(), SpawnParams);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_GrapplingHook::ServerSpawnHook - Hook spawned at %s"), *SpawnLocation.ToString());
}

void UKhaaosAbility_GrapplingHook::ServerBeginPull_Implementation(const FVector& AnchorPoint)
{
        GrappleAnchor = AnchorPoint;

        // Start pull tick
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                FTimerDelegate TickDelegate;
                TickDelegate.BindUObject(this, &UKhaaosAbility_GrapplingHook::OnGrappleTick, 0.016f);
                Owner->GetWorldTimerManager().SetTimer(GrappleTickHandle, TickDelegate, 0.016f, true);
        }

        // VFX on client
        ClientSpawnGrappleVFX(GetOwningActorFromActorInfo()->GetActorLocation(), AnchorPoint);
}

void UKhaaosAbility_GrapplingHook::ServerReleaseGrapple_Implementation()
{
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(GrappleTickHandle);
        }

        ClientRemoveGrappleVFX();
}

void UKhaaosAbility_GrapplingHook::OnGrappleTick(float DeltaTime)
{
        AActor* AvatarActor = GetOwningActorFromActorInfo();
        if (!AvatarActor)
        {
                EndAbility(GetCurrentAbilitySpecHandle(), GetCurrentActorInfo(),
                        GetCurrentActivationInfo(), true, true);
                return;
        }

        // Move toward anchor
        FVector CurrentLocation = AvatarActor->GetActorLocation();
        FVector ToAnchor = GrappleAnchor - CurrentLocation;
        float Distance = ToAnchor.Size();

        if (Distance < 100.0f) // Close enough — release
        {
                EndAbility(GetCurrentAbilitySpecHandle(), GetCurrentActorInfo(),
                        GetCurrentActivationInfo(), true, false);
                return;
        }

        FVector PullDirection = ToAnchor.GetSafeNormal();
        FVector NewLocation = CurrentLocation + PullDirection * PullSpeed * DeltaTime;

        // Apply velocity to the character
        ACharacter* Character = Cast<ACharacter>(AvatarActor);
        if (Character && Character->GetCharacterMovement())
        {
                Character->GetCharacterMovement()->Velocity = PullDirection * PullSpeed;
        }
}

void UKhaaosAbility_GrapplingHook::ClientSpawnGrappleVFX_Implementation(const FVector& StartPoint, const FVector& AnchorPoint)
{
        // Client-side VFX: spawn rope/cable visual
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_GrapplingHook::ClientSpawnGrappleVFX - Spawning rope VFX"));
}

void UKhaaosAbility_GrapplingHook::ClientRemoveGrappleVFX_Implementation()
{
        // Client-side VFX: remove rope/cable visual
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_GrapplingHook::ClientRemoveGrappleVFX - Removing rope VFX"));
}
