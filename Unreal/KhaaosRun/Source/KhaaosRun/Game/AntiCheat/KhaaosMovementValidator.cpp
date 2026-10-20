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
	// When console latency compensation is active, provide jitter grace displacement
	float BaseDisp = Speed * DeltaTime * SpeedTolerance;
	if (bEnableConsoleLatencyCompensation)
	{
		float JitterGrace = Speed * (ConsoleJitterToleranceMs / 1000.0f) * 0.5f;
		return BaseDisp + JitterGrace;
	}
	return BaseDisp;
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

	// Effective speed tolerance accounting for console Wi-Fi / latency variance
	const float EffectiveTolerance = bEnableConsoleLatencyCompensation
		? (SpeedTolerance * 1.15f)
		: SpeedTolerance;

	// Latency burst allowance for console packet arrival bunching
	const float LatencyBurstAllowance = bEnableConsoleLatencyCompensation
		? (Threshold * (ConsoleJitterToleranceMs / 1000.0f) * 0.75f)
		: 0.0f;

	float AccumulatedViolationTime = 0.0f;
	int32 ConsecutiveViolations = 0;
	float TotalDistanceOverBuffer = 0.0f;

	double FirstTimestamp = History[0].Timestamp;
	double LastTimestamp = History.Last().Timestamp;
	float BufferTotalDuration = static_cast<float>(LastTimestamp - FirstTimestamp);

	// Pairwise validation with micro-delta jitter rejection and sustained duration accumulation
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
		TotalDistanceOverBuffer += Distance;

		// Console network packet bunching rejection:
		// If DeltaTime is smaller than MinSampleDeltaTime (e.g. 20ms), packets were received in a delayed burst.
		// Instantaneous division by near-zero produces false positive speed spikes.
		if (bEnableConsoleLatencyCompensation && DeltaTime < MinSampleDeltaTime)
		{
			continue;
		}

		float Speed = Distance / DeltaTime;

		if (Speed > Threshold * EffectiveTolerance)
		{
			AccumulatedViolationTime += DeltaTime;
			ConsecutiveViolations++;
		}
		else
		{
			// Decay accumulated violation duration to avoid false positives from transient hitching
			AccumulatedViolationTime = FMath::Max(0.0f, AccumulatedViolationTime - DeltaTime * 0.5f);
			ConsecutiveViolations = FMath::Max(0, ConsecutiveViolations - 1);
		}
	}

	// ── Windowed Integral Check across Circular Buffer ──
	// True speedhackers traverse more total distance than physically possible across the circular buffer.
	// In console latency recovery (packet burst), instantaneous speed appears high, but total windowed
	// displacement over 0.5s - 2.0s is strictly within physical limits.
	bool bWindowedDisplacementExceeded = false;
	if (BufferTotalDuration > 0.25f)
	{
		float MaxAllowedBufferDistance = (Threshold * BufferTotalDuration * WindowedCheckTolerance) + LatencyBurstAllowance;
		if (TotalDistanceOverBuffer > MaxAllowedBufferDistance)
		{
			bWindowedDisplacementExceeded = true;
		}
	}

	// Flag speed hack ONLY if:
	// 1. Violations were sustained across real elapsed gameplay time (not just 3 bunched packets within 15ms), AND
	// 2. The integrated circular buffer displacement exceeds physical boundaries with latency burst allowance.
	if (AccumulatedViolationTime >= SustainedViolationDurationThreshold && bWindowedDisplacementExceeded)
	{
		return true;
	}

	// If sustained violation is very severe (e.g. > 2.0x threshold for >= 0.6s)
	if (AccumulatedViolationTime >= (SustainedViolationDurationThreshold * 1.8f) && ConsecutiveViolations >= 6)
	{
		return true;
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
