// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Player/KhaaosPlayerAnimInstance.h"
#include "KhaaosRun.h"

#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/Controller.h"
#include "KismetMathLibrary.h"

#include "Player/KhaaosCharacter.h"
#include "Game/Combat/KhaaosADSComponent.h"
#include "Game/Data/KhaaosWeaponComponent.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "Game/Animation/KhaaosNaturalLocomotionComponent.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosPlayerAnimInstance::UKhaaosPlayerAnimInstance()
{
        bIsSprinting = false;
        bIsCrouching = false;
        bIsSliding = false;
        bIsInAir = false;
        bIsAiming = false;
        bIsFiring = false;
        bIsReloading = false;
        bIsDowned = false;
        bIsDead = false;
        bIsTurningInPlace = false;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosPlayerAnimInstance::NativeInitializeAnimation()
{
        Super::NativeInitializeAnimation();

        // Cache the owning character
        if (APawn* OwningPawn = TryGetPawnOwner())
        {
                CachedCharacter = Cast<AKhaaosCharacter>(OwningPawn);
                if (CachedCharacter)
                {
                        CachedADSComp = CachedCharacter->GetADSComponent();
                }
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerAnimInstance: NativeInitializeAnimation"));
}

void UKhaaosPlayerAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
        Super::NativeUpdateAnimation(DeltaSeconds);

        // ── Recache character if lost ──
        if (!CachedCharacter.IsValid())
        {
                if (APawn* OwningPawn = TryGetPawnOwner())
                {
                        CachedCharacter = Cast<AKhaaosCharacter>(OwningPawn);
                        if (CachedCharacter)
                        {
                                CachedADSComp = CachedCharacter->GetADSComponent();
                        }
                }
        }

        if (!CachedCharacter.IsValid())
        {
                return;
        }

        // ── Update animation properties ──
        UpdateLocomotion(DeltaSeconds);
        UpdateCombat(DeltaSeconds);
        UpdateAimOffset(DeltaSeconds);
        UpdateStateMachine();
}

// ─── Update Locomotion ──────────────────────────────────────────────────────────

void UKhaaosPlayerAnimInstance::UpdateLocomotion(float DeltaSeconds)
{
        AKhaaosCharacter* Char = CachedCharacter.Get();
        if (!Char)
        {
                return;
        }

        // ── Speed ──
        const FVector Velocity = Char->GetVelocity();
        PrevSpeed = Speed;
        Speed = Velocity.Size();

        // ── Direction (ATan2 for strafe/forward blend) ──
        if (Speed > 0.0f)
        {
                const FRotator ControlRotation = Char->Controller
                        ? Char->Controller->GetControlRotation()
                        : FRotator::ZeroRotator;
                const FRotator YawRotation(0.0f, ControlRotation.Yaw, 0.0f);

                const FVector ForwardDir = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
                const FVector RightDir = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

                const float ForwardSpeed = FVector::DotProduct(Velocity, ForwardDir);
                const float RightSpeed = FVector::DotProduct(Velocity, RightDir);

                // ATan2 gives angle in radians, convert to degrees
                Direction = FMath::RadiansToDegrees(FMath::Atan2(RightSpeed, ForwardSpeed));
        }
        else
        {
                // Preserve last direction when stationary
                Direction = 0.0f;
        }

        // ── Movement flags ──
        bIsSprinting = Char->bIsSprinting;
        bIsCrouching = Char->bIsCrouching;
        bIsSliding = Char->bIsSliding;

        // ── In air ──
        UCharacterMovementComponent* MoveComp = Char->GetCharacterMovement();
        if (MoveComp)
        {
                bIsInAir = MoveComp->IsFalling();
        }

        // ── Downed / Dead ──
        bIsDowned = Char->bIsDowned;
        bIsDead = Char->bIsDead;

        // ── Natural locomotion outputs (anti-robotization) ──
        // When the component is present, the Anim Graph consumes the
        // smoothed kernel outputs instead of the raw instant values above.
        if (UKhaaosNaturalLocomotionComponent* Natural = Char->GetNaturalLocomotion())
        {
                SmoothedSpeed = Natural->SmoothedSpeed;
                SmoothedDirection = Natural->SmoothedDirectionDeg;
                StopEase = Natural->StopEase;
                LeanRoll = Natural->LeanRollDeg;
                LeanPitch = Natural->LeanPitchDeg;
                StridePhase = Natural->StridePhase;
                LandRecovery = Natural->LandRecovery;
                bNaturalTurningInPlace = Natural->bTurningInPlace;
                TurnYawOffset = Natural->TurnYawOffsetDeg;
                HeadLookYaw = Natural->HeadLookYawDeg;
                HeadLookPitch = Natural->HeadLookPitchDeg;
                IdleBreath = Natural->Breath;
                FootIKOffsetLeft = Natural->FootOffsetLeftCm;
                FootIKOffsetRight = Natural->FootOffsetRightCm;
                FootIKTiltLeft = Natural->FootTiltLeftDeg;
                FootIKTiltRight = Natural->FootTiltRightDeg;
        }
        else
        {
                // Fallback: single-pole smoothing so even without the component
                // the Anim Graph never receives instantaneous parameter jumps.
                SmoothedSpeed = FMath::FInterpTo(SmoothedSpeed, Speed, DeltaSeconds, 8.0f);
                SmoothedDirection = FMath::FInterpTo(SmoothedDirection, Direction, DeltaSeconds, 10.0f);
        }
}

// ─── Update Combat ──────────────────────────────────────────────────────────────

void UKhaaosPlayerAnimInstance::UpdateCombat(float DeltaSeconds)
{
        AKhaaosCharacter* Char = CachedCharacter.Get();
        if (!Char)
        {
                return;
        }

        // ── Aiming ──
        bIsAiming = CachedADSComp.IsValid() && CachedADSComp->IsAiming();

        // ── Firing (from weapon component fire state) ──
        UKhaaosWeaponComponent* WeaponComp = Char->GetWeaponComponent();
        if (WeaponComp)
        {
                bIsReloading = WeaponComp->IsReloading();
        }

        // Note: bIsFiring is set by the anim blueprint via Notify from the
        // fire animation, or via a flag on the weapon component.
        // For now, derive from ADS + shoot input state.
        bIsFiring = false; // Will be set by animation notifies

        // ── Equip slot ──
        UKhaaosInventoryComponent* InvComp = Char->GetInventoryComponent();
        if (InvComp)
        {
                EKhaaosInventorySlot ActiveSlot = InvComp->GetActiveSlot();
                switch (ActiveSlot)
                {
                case EKhaaosInventorySlot::Primary:
                        EquipSlot = EAnimEquipSlot::Primary;
                        break;
                case EKhaaosInventorySlot::Secondary:
                        EquipSlot = EAnimEquipSlot::Secondary;
                        break;
                case EKhaaosInventorySlot::Melee:
                        EquipSlot = EAnimEquipSlot::Melee;
                        break;
                default:
                        EquipSlot = EAnimEquipSlot::None;
                        break;
                }
        }
}

// ─── Update Aim Offset ──────────────────────────────────────────────────────────

void UKhaaosPlayerAnimInstance::UpdateAimOffset(float DeltaSeconds)
{
        AKhaaosCharacter* Char = CachedCharacter.Get();
        if (!Char || !Char->Controller)
        {
                return;
        }

        // ── Get controller rotation for aim offset ──
        const FRotator ControlRotation = Char->Controller->GetControlRotation();
        const FRotator ActorRotation = Char->GetActorRotation();

        // Delta rotation between control and actor (for aim offset)
        FRotator DeltaRotation = ControlRotation - ActorRotation;
        DeltaRotation.Normalize();

        // Interpolate aim pitch and yaw for smooth offset
        float TargetPitch = FMath::Clamp(DeltaRotation.Pitch, -90.0f, 90.0f);
        float TargetYaw = DeltaRotation.Yaw;

        AimPitch = FMath::FInterpTo(AimPitch, TargetPitch, DeltaSeconds, AimOffsetInterpSpeed);
        AimYaw = FMath::FInterpTo(AimYaw, TargetYaw, DeltaSeconds, AimOffsetInterpSpeed);

        // ── Turn-in-place detection ──
        bIsTurningInPlace = (Speed < 10.0f) && (FMath::Abs(AimYaw) > TurnInPlaceThreshold);

        // ── Layered blending: upper body weight for ADS ──
        // When aiming: blend upper body to aim offset, lower body stays in locomotion
        float TargetBlendWeight = bIsAiming ? 1.0f : 0.0f;
        UpperBodyBlendWeight = FMath::FInterpTo(UpperBodyBlendWeight, TargetBlendWeight, DeltaSeconds, AimOffsetInterpSpeed);
}

// ─── Update State Machine Transitions ───────────────────────────────────────────

void UKhaaosPlayerAnimInstance::UpdateStateMachine()
{
        AKhaaosCharacter* Char = CachedCharacter.Get();
        if (!Char)
        {
                return;
        }

        // Current movement state as uint8 for comparison
        uint8 CurrentState = static_cast<uint8>(Char->GetMovementState());

        if (CurrentState != PrevMovementState)
        {
                // Log state transitions
                FString OldStateStr;
                FString NewStateStr;

                switch (static_cast<EMovementState>(PrevMovementState))
                {
                case EMovementState::Walk:   OldStateStr = TEXT("Walk"); break;
                case EMovementState::Sprint: OldStateStr = TEXT("Sprint"); break;
                case EMovementState::Crouch: OldStateStr = TEXT("Crouch"); break;
                case EMovementState::Slide:  OldStateStr = TEXT("Slide"); break;
                case EMovementState::Vault:  OldStateStr = TEXT("Vault"); break;
                case EMovementState::Swim:   OldStateStr = TEXT("Swim"); break;
                case EMovementState::Climb:  OldStateStr = TEXT("Climb"); break;
                default:                     OldStateStr = TEXT("Unknown"); break;
                }

                switch (Char->GetMovementState())
                {
                case EMovementState::Walk:   NewStateStr = TEXT("Walk"); break;
                case EMovementState::Sprint: NewStateStr = TEXT("Sprint"); break;
                case EMovementState::Crouch: NewStateStr = TEXT("Crouch"); break;
                case EMovementState::Slide:  NewStateStr = TEXT("Slide"); break;
                case EMovementState::Vault:  NewStateStr = TEXT("Vault"); break;
                case EMovementState::Swim:   NewStateStr = TEXT("Swim"); break;
                case EMovementState::Climb:  NewStateStr = TEXT("Climb"); break;
                default:                     NewStateStr = TEXT("Unknown"); break;
                }

                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosPlayerAnimInstance: State transition %s -> %s"),
                        *OldStateStr, *NewStateStr);

                PrevMovementState = CurrentState;
        }

        // Death state overrides everything
        if (bIsDead && PrevMovementState != static_cast<uint8>(EMovementState::Walk))
        {
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerAnimInstance: Character dead -- anim state override"));
                PrevMovementState = static_cast<uint8>(EMovementState::Walk);
        }
}
