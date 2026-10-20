// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Animation/KhaaosSpeciesAnimInstance.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
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

	// Velocity and speed
	FVector Velocity = Character->GetVelocity();
	MovementSpeed = Velocity.Size();

	// Direction relative to character facing
	if (MovementSpeed > 10.0f)
	{
		const FRotator Rotation = Character->GetActorRotation();
		const FRotator YawRotation(0, Rotation.Yaw, 0);
		const FVector Forward = YawRotation.Vector();
		const FVector Right = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

		const float ForwardSpeed = FVector::DotProduct(Velocity, Forward);
		const float RightSpeed = FVector::DotProduct(Velocity, Right);

		MovementDirection = FMath::RadiansToDegrees(FMath::Atan2(RightSpeed, ForwardSpeed));
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
		else if (MovementSpeed > 600.0f)
		{
			MovementState = EKhaaosMovementState::Sprint;
		}
		else if (MovementSpeed > 100.0f)
		{
			MovementState = EKhaaosMovementState::Run;
		}
		else if (MovementSpeed > 10.0f)
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
}
