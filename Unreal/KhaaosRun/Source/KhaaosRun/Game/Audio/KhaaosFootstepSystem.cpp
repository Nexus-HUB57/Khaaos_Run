// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosFootstepSystem.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "PhysicalMaterials/PhysicalMaterial.h"
#include "KhaaosRun.h"
#include "DrawDebugHelpers.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosFootstepSystem::UKhaaosFootstepSystem()
{
	PrimaryComponentTick.bCanEverTick = false;

	FootTraceDistance    = 100.0f;
	WalkVolume          = 0.4f;
	RunVolume           = 0.7f;
	SprintVolume        = 1.0f;
	MaxFootstepsPerSecond = 4;
	SpeciesWeight       = 1.0f;

	RateLimitTimer      = 0.0f;
	FootstepsThisSecond = 0;

	LeftFootOffset  = FVector(0.0f, -20.0f, 0.0f);
	RightFootOffset = FVector(0.0f, 20.0f, 0.0f);
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosFootstepSystem::InitializeComponent()
{
	Super::InitializeComponent();
}

// ─── Footstep Trigger ──────────────────────────────────────────────────────────

void UKhaaosFootstepSystem::TriggerFootstep(bool bIsLeftFoot)
{
	AActor* Owner = GetOwner();
	if (!Owner) return;

	// Rate limit check
	float Delta = 0.016f; // Approximate
	if (!CheckRateLimit(Delta)) return;

	// Compute foot world position
	FVector OwnerLocation = Owner->GetActorLocation();
	FVector FootOffset = bIsLeftFoot ? LeftFootOffset : RightFootOffset;
	FVector FootLocation = OwnerLocation + Owner->GetActorRotation().RotateVector(FootOffset);

	// Detect surface
	EKhaaosSurfaceType Surface = DetectSurface(FootLocation);

	// Compute volume
	float Volume = ComputeVolume() * SpeciesWeight;

	// Broadcast footstep event
	OnFootstep.Broadcast(Surface, FootLocation, Volume);

	UE_LOG(LogKhaaosRun, VeryVerbose, TEXT("KhaaosFootstepSystem: %s foot on %s (vol: %.2f)"),
		bIsLeftFoot ? TEXT("Left") : TEXT("Right"), *GetSurfaceAudioName(Surface), Volume);
}

EKhaaosSurfaceType UKhaaosFootstepSystem::DetectSurface(const FVector& Location) const
{
	// Line trace down to detect physical material
	FHitResult HitResult;
	FVector TraceStart = Location + FVector(0, 0, FootTraceDistance);
	FVector TraceEnd = Location - FVector(0, 0, FootTraceDistance);

	FCollisionQueryParams QueryParams;
	QueryParams.bReturnPhysicalMaterial = true;
	QueryParams.AddIgnoredActor(GetOwner());

	if (GetWorld()->LineTraceSingleByChannel(HitResult, TraceStart, TraceEnd, ECC_WorldStatic, QueryParams))
	{
		if (UPhysicalMaterial* PhysMat = HitResult.PhysMaterial.Get())
		{
			// Map physical material to surface type
			// In production, use a TMap<UPhysicalMaterial*, EKhaaosSurfaceType>
			FString MatName = PhysMat->GetName();
			if (MatName.Contains(TEXT("Grass")))   return EKhaaosSurfaceType::Grass;
			if (MatName.Contains(TEXT("Dirt")))    return EKhaaosSurfaceType::Dirt;
			if (MatName.Contains(TEXT("Sand")))    return EKhaaosSurfaceType::Sand;
			if (MatName.Contains(TEXT("Stone")))   return EKhaaosSurfaceType::Stone;
			if (MatName.Contains(TEXT("Metal")))   return EKhaaosSurfaceType::Metal;
			if (MatName.Contains(TEXT("Wood")))    return EKhaaosSurfaceType::Wood;
			if (MatName.Contains(TEXT("Water")))   return EKhaaosSurfaceType::Water;
			if (MatName.Contains(TEXT("Mud")))     return EKhaaosSurfaceType::Mud;
			if (MatName.Contains(TEXT("Snow")))    return EKhaaosSurfaceType::Snow;
			if (MatName.Contains(TEXT("Lava")))    return EKhaaosSurfaceType::Lava;
			if (MatName.Contains(TEXT("Crystal"))) return EKhaaosSurfaceType::Crystal;
		}
	}

	return EKhaaosSurfaceType::Default;
}

FString UKhaaosFootstepSystem::GetSurfaceAudioName(EKhaaosSurfaceType Surface)
{
	switch (Surface)
	{
	case EKhaaosSurfaceType::Grass:   return TEXT("Footstep_Grass");
	case EKhaaosSurfaceType::Dirt:    return TEXT("Footstep_Dirt");
	case EKhaaosSurfaceType::Sand:    return TEXT("Footstep_Sand");
	case EKhaaosSurfaceType::Stone:   return TEXT("Footstep_Stone");
	case EKhaaosSurfaceType::Metal:   return TEXT("Footstep_Metal");
	case EKhaaosSurfaceType::Wood:    return TEXT("Footstep_Wood");
	case EKhaaosSurfaceType::Water:   return TEXT("Footstep_Water");
	case EKhaaosSurfaceType::Mud:     return TEXT("Footstep_Mud");
	case EKhaaosSurfaceType::Snow:    return TEXT("Footstep_Snow");
	case EKhaaosSurfaceType::Lava:    return TEXT("Footstep_Lava");
	case EKhaaosSurfaceType::Crystal: return TEXT("Footstep_Crystal");
	default:                          return TEXT("Footstep_Default");
	}
}

// ─── Private ────────────────────────────────────────────────────────────────────

bool UKhaaosFootstepSystem::CheckRateLimit(float DeltaSeconds)
{
	RateLimitTimer += DeltaSeconds;
	if (RateLimitTimer >= 1.0f)
	{
		FootstepsThisSecond = 0;
		RateLimitTimer = 0.0f;
	}

	if (FootstepsThisSecond >= MaxFootstepsPerSecond)
	{
		return false;
	}

	++FootstepsThisSecond;
	return true;
}

float UKhaaosFootstepSystem::ComputeVolume() const
{
	ACharacter* Character = Cast<ACharacter>(GetOwner());
	if (!Character) return WalkVolume;

	float Speed = Character->GetVelocity().Size();
	UCharacterMovementComponent* MoveComp = Character->GetCharacterMovement();
	float WalkSpeed = MoveComp ? MoveComp->MaxWalkSpeed : 600.0f;

	if (Speed > WalkSpeed * 1.5f) return SprintVolume;
	if (Speed > WalkSpeed * 0.8f) return RunVolume;
	return WalkVolume;
}
