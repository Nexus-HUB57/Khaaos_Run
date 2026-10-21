// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AntiCheat/KhaaosMovementValidator.h"
#include "GameFramework/PlayerState.h"

UKhaaosMovementValidator::UKhaaosMovementValidator()
{
}

void UKhaaosMovementValidator::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogTemp, Log, TEXT("[MovementValidator] Initialized — BufferSize: %d, SpeedTolerance: %.2fx"),
		MaxHistorySamples, SpeedTolerance);
}

void UKhaaosMovementValidator::Deinitialize()
{
	PlayerBuffers.Empty();
	Super::Deinitialize();
	UE_LOG(LogTemp, Log, TEXT("[MovementValidator] Deinitialized"));
}

void UKhaaosMovementValidator::RegisterPlayer(APlayerState* Player)
{
	if (!Player || PlayerBuffers.Contains(Player))
	{
		return;
	}

	FMovementBuffer Buffer;
	Buffer.Init(MaxHistorySamples);
	PlayerBuffers.Add(Player, MoveTemp(Buffer));

	UE_LOG(LogTemp, Verbose, TEXT("[MovementValidator] Player registered: %s"), *Player->GetPlayerName());
}

void UKhaaosMovementValidator::UnregisterPlayer(APlayerState* Player)
{
	if (!Player)
	{
		return;
	}

	PlayerBuffers.Remove(Player);
}

void UKhaaosMovementValidator::RecordMovementSample(APlayerState* Player, const FValidatedMovement& Sample)
{
	if (!Player)
	{
		return;
	}

	FMovementBuffer* Buffer = PlayerBuffers.Find(Player);
	if (!Buffer)
	{
		RegisterPlayer(Player);
		Buffer = PlayerBuffers.Find(Player);
		if (!Buffer)
		{
			return;
		}
	}

	Buffer->Push(Sample);
}

TArray<FValidatedMovement> UKhaaosMovementValidator::GetMovementHistory(APlayerState* Player) const
{
	const FMovementBuffer* Buffer = PlayerBuffers.Find(Player);
	if (Buffer)
	{
		return Buffer->GetAll();
	}
	return TArray<FValidatedMovement>();
}

// ─── Validation Methods ────────────────────────────────────────────────────────

bool UKhaaosMovementValidator::ValidateMovementDelta(const FValidatedMovement& Old, const FValidatedMovement& New,
	float MaxSpeed, float DeltaTime)
{
	if (DeltaTime <= 0.0f)
	{
		return false;
	}

	float MaxDisp = ComputeMaxDisplacement(MaxSpeed, DeltaTime);
	return IsLocationReachable(Old.Location, New.Location, MaxDisp);
}

float UKhaaosMovementValidator::ComputeMaxDisplacement(float Speed, float DeltaTime) const
{
	// Maximum displacement = speed * time * tolerance
	// The tolerance accounts for network jitter, interpolation, etc.
	return Speed * DeltaTime * SpeedTolerance;
}

bool UKhaaosMovementValidator::IsLocationReachable(FVector From, FVector To, float MaxDisplacement) const
{
	float Distance = FVector::Dist(From, To);
	return Distance <= MaxDisplacement;
}

bool UKhaaosMovementValidator::DetectSpeedHack(TArray<FValidatedMovement>& History, float Threshold)
{
	if (History.Num() < MinSamplesForDetection)
	{
		return false;
	}

	int32 SpeedViolationCount = 0;
	const int32 ViolationThreshold = 3; // Need 3 violations to flag

	for (int32 i = 1; i < History.Num(); i++)
	{
		const FValidatedMovement& Prev = History[i - 1];
		const FValidatedMovement& Curr = History[i];

		float DeltaTime = static_cast<float>(Curr.Timestamp - Prev.Timestamp);
		if (DeltaTime <= 0.0f || DeltaTime > 1.0f)
		{
			continue; // Skip invalid or large gaps
		}

		float Distance = FVector::Dist(Prev.Location, Curr.Location);
		float Speed = Distance / DeltaTime;

		if (Speed > Threshold * SpeedTolerance)
		{
			SpeedViolationCount++;
			if (SpeedViolationCount >= ViolationThreshold)
			{
				return true;
			}
		}
		else
		{
			// Reset counter on valid sample (avoid false positives from single spikes)
			SpeedViolationCount = FMath::Max(0, SpeedViolationCount - 1);
		}
	}

	return false;
}

bool UKhaaosMovementValidator::DetectFlyHack(TArray<FValidatedMovement>& History, float GroundZ, float Tolerance)
{
	if (History.Num() < MinSamplesForDetection)
	{
		return false;
	}

	int32 FlyViolationCount = 0;
	const int32 ViolationThreshold = 5; // Need 5 consecutive violations (sustained flying)

	for (int32 i = 0; i < History.Num(); i++)
	{
		const FValidatedMovement& Sample = History[i];

		// Check if player is above ground and not on ground flag
		float HeightAboveGround = Sample.Location.Z - GroundZ;
		if (HeightAboveGround > Tolerance && !Sample.bIsOnGround)
		{
			FlyViolationCount++;
			if (FlyViolationCount >= ViolationThreshold)
			{
				return true;
			}
		}
		else
		{
			// Reset on valid ground contact
			FlyViolationCount = 0;
		}
	}

	return false;
}

bool UKhaaosMovementValidator::DetectTeleport(FVector Old, FVector New, float MaxDisplacement) const
{
	float Distance = FVector::Dist(Old, New);
	return Distance > MaxDisplacement;
}
