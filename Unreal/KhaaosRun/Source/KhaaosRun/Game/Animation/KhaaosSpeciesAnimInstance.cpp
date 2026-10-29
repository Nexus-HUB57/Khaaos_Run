// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Animation/KhaaosSpeciesAnimInstance.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Game/Animation/KhaaosNaturalLocomotionComponent.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosSpeciesAnimInstance::UKhaaosSpeciesAnimInstance()
{
        MovementSpeed     = 0.0f;
        MovementDirection = 0.0f;
        AimPitch          = 0.0f;
        AimYaw            = 0.0f;
        Species           = EKhaaosSpecies::Huran; // Default
        MovementState     = EKhaaosMovementState::Idle;
        CombatState       = EKhaaosCombatState::Relaxed;
        bIsDowned         = false;
        bIsInVehicle      = false;
        bIsParachuting    = false;
        TurnInPlaceThreshold = 90.0f;
        SprintSpeedMultiplier = 1.0f;
        MeleeReach = 150.0f;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosSpeciesAnimInstance::NativeInitializeAnimation()
{
        Super::NativeInitializeAnimation();
        ApplySpeciesProfile(Species);
}

void UKhaaosSpeciesAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
        Super::NativeUpdateAnimation(DeltaSeconds);

        UpdateMovementParams();
}

// ─── Species Selection ─────────────────────────────────────────────────────────

void UKhaaosSpeciesAnimInstance::SetSpecies(EKhaaosSpecies InSpecies)
{
        if (InSpecies != Species)
        {
                Species = InSpecies;
                ApplySpeciesProfile(InSpecies);
        }
}

// ─── State Updates ──────────────────────────────────────────────────────────────

void UKhaaosSpeciesAnimInstance::SetMovementState(EKhaaosMovementState State)
{
        MovementState = State;
}

void UKhaaosSpeciesAnimInstance::SetCombatState(EKhaaosCombatState State)
{
        CombatState = State;
}

void UKhaaosSpeciesAnimInstance::SetAimPitch(float Pitch)
{
        AimPitch = FMath::Clamp(Pitch, -90.0f, 90.0f);
}

void UKhaaosSpeciesAnimInstance::SetAimYaw(float Yaw)
{
        AimYaw = FMath::Clamp(Yaw, -180.0f, 180.0f);
}

// ─── Private ────────────────────────────────────────────────────────────────────

void UKhaaosSpeciesAnimInstance::ApplySpeciesProfile(EKhaaosSpecies InSpecies)
{
        switch (InSpecies)
        {
        case EKhaaosSpecies::Zheers:
                // Heavy armored: slow turns, long melee reach
                TurnInPlaceThreshold = 120.0f;
                SprintSpeedMultiplier = 0.85f;
                MeleeReach = 200.0f;
                break;

        case EKhaaosSpecies::Onith:
                // Agile: quick direction changes, dual-wield
                TurnInPlaceThreshold = 60.0f;
                SprintSpeedMultiplier = 1.15f;
                MeleeReach = 130.0f;
                break;

        case EKhaaosSpecies::Skeetw:
                // Mechanical: rigid, LMG bracing
                TurnInPlaceThreshold = 100.0f;
                SprintSpeedMultiplier = 0.9f;
                MeleeReach = 140.0f;
                break;

        case EKhaaosSpecies::Huran:
                // Military: efficient, cover animations
                TurnInPlaceThreshold = 90.0f;
                SprintSpeedMultiplier = 1.0f;
                MeleeReach = 150.0f;
                break;

        case EKhaaosSpecies::Venex:
                // Fluid: dash, deceptive movements
                TurnInPlaceThreshold = 45.0f;
                SprintSpeedMultiplier = 1.2f;
                MeleeReach = 120.0f;
                break;

        case EKhaaosSpecies::Khael:
                // Mystical: float idle, energy channeling
                TurnInPlaceThreshold = 80.0f;
                SprintSpeedMultiplier = 1.05f;
                MeleeReach = 180.0f; // Energy reach
                break;
        }
}

void UKhaaosSpeciesAnimInstance::UpdateMovementParams()
{
        if (!TryGetPawnOwner()) return;

        ACharacter* Character = Cast<ACharacter>(TryGetPawnOwner());
        if (!Character) return;

        // Velocity and speed (raw samples; smoothing happens below).
        FVector Velocity = Character->GetVelocity();
        const float RawSpeed = Velocity.Size();
        float RawDirection = MovementDirection;

        // Direction relative to character facing
        if (RawSpeed > 10.0f)
        {
                const FRotator Rotation = Character->GetActorRotation();
                const FRotator YawRotation(0, Rotation.Yaw, 0);
                const FVector Forward = YawRotation.Vector();
                const FVector Right = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

                const float ForwardSpeed = FVector::DotProduct(Velocity, Forward);
                const float RightSpeed = FVector::DotProduct(Velocity, Right);

                RawDirection = FMath::RadiansToDegrees(FMath::Atan2(RightSpeed, ForwardSpeed));
        }

        // Movement state from character movement
        UCharacterMovementComponent* MoveComp = Character->GetCharacterMovement();
        if (MoveComp)
        {
                if (MoveComp->IsFalling())
                {
                        MovementState = EKhaaosMovementState::Fall;
                }
                else if (MoveComp->IsSwimming())
                {
                        MovementState = EKhaaosMovementState::Swim;
                }
                else if (MoveComp->IsCrouching())
                {
                        MovementState = EKhaaosMovementState::Crouch;
                }
                else if (RawSpeed > 600.0f)
                {
                        MovementState = EKhaaosMovementState::Sprint;
                }
                else if (RawSpeed > 100.0f)
                {
                        MovementState = EKhaaosMovementState::Run;
                }
                else if (RawSpeed > 10.0f)
                {
                        MovementState = EKhaaosMovementState::Walk;
                }
                else
                {
                        MovementState = EKhaaosMovementState::Idle;
                }
        }

        // Override states
        if (bIsDowned)       MovementState = EKhaaosMovementState::Downed;
        if (bIsInVehicle)    MovementState = EKhaaosMovementState::Vehicle;
        if (bIsParachuting)  MovementState = EKhaaosMovementState::Parachute;

        // ── Natural locomotion outputs (anti-robotization) ──
        // Smoothed parameters for the species blend trees; without the
        // component, fall back to single-pole smoothing on the raw values.
        if (const UKhaaosNaturalLocomotionComponent* Natural = Character->FindComponentByClass<UKhaaosNaturalLocomotionComponent>())
        {
                MovementSpeed = Natural->SmoothedSpeed;
                MovementDirection = Natural->SmoothedDirectionDeg;
                NaturalLeanRoll = Natural->LeanRollDeg;
                NaturalLeanPitch = Natural->LeanPitchDeg;
                NaturalStridePhase = Natural->StridePhase;
                NaturalLandRecovery = Natural->LandRecovery;
                NaturalBreath = Natural->Breath;
                NaturalHeadLookYaw = Natural->HeadLookYawDeg;
                NaturalHeadLookPitch = Natural->HeadLookPitchDeg;
                NaturalFootIKOffsetL = Natural->FootOffsetLeftCm;
                NaturalFootIKOffsetR = Natural->FootOffsetRightCm;
                bNaturalTurningInPlace = Natural->bTurningInPlace;
                NaturalTurnYawOffset = Natural->TurnYawOffsetDeg;
                NaturalStopDistanceCm = Natural->StopDistanceCm;
                NaturalStopMatchPhase = Natural->StopMatchPhase;
                NaturalAirPoseBlend = Natural->AirPoseBlend;
                NaturalPivotFootIsLeft = Natural->bPivotFootLeft;
                NaturalPivotWeight = Natural->PivotWeight;
                bNaturalHasVaultTarget = Natural->bHasVaultTarget;
                NaturalVaultWarpPhase = Natural->VaultWarpPhase;
                NaturalVaultWarpScale = Natural->VaultWarpScale;
        }
        else
        {
                MovementSpeed = FMath::FInterpTo(MovementSpeed, RawSpeed, DeltaSeconds, 8.0f);
                MovementDirection = FMath::FInterpTo(MovementDirection, RawDirection, DeltaSeconds, 10.0f);

                // Fase 32 fallbacks: honest clamped raw paths (no component).
                if (const UCharacterMovementComponent* MC = Character->GetCharacterMovement())
                {
                        const float Braking = FMath::Max(MC->BrakingDecelerationWalking, 1.0f);
                        NaturalStopDistanceCm = (RawSpeed * RawSpeed) / (2.0f * Braking);
                        NaturalAirPoseBlend = FMath::FInterpTo(NaturalAirPoseBlend,
                                MC->IsFalling()
                                        ? FMath::Clamp(-Character->GetVelocity().Z / 700.0f, -1.0f, 1.0f)
                                        : 0.0f,
                                DeltaSeconds, 7.0f);
                }
                NaturalStopMatchPhase = (RawSpeed <= 10.0f)
                        ? FMath::FInterpTo(NaturalStopMatchPhase, 1.0f, DeltaSeconds, 14.0f)
                        : 0.0f;
        }
}
