// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosMovementValidator.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class APlayerState;

// ─── Validated Movement Struct ─────────────────────────────────────────────────

/**
 * FValidatedMovement
 *
 * A single snapshot of a player's movement state at a point in time.
 * Used for server-side movement validation and cheat detection.
 */
USTRUCT(BlueprintType)
struct FValidatedMovement
{
	GENERATED_BODY()

	/** Timestamp of this movement sample. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	double Timestamp = 0.0;

	/** World location at this sample. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	FVector Location = FVector::ZeroVector;

	/** Velocity at this sample. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	FVector Velocity = FVector::ZeroVector;

	/** Rotation at this sample. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	FRotator Rotation = FRotator::ZeroRotator;

	/** Whether the player is on the ground. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	uint8 bIsOnGround : 1 = true;

	/** Whether the player is crouched. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	uint8 bIsCrouched : 1 = false;

	/** Whether the player is sprinting. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Movement")
	uint8 bIsSprinting : 1 = false;
};

// ── Movement Validator Subsystem ───────────────────────────────────────────────

/**
 * UKhaaosMovementValidator
 *
 * Server-side movement validation subsystem.
 *
 * Maintains a circular buffer of movement samples per player
 * and provides methods to detect speed hacks, fly hacks, and
 * teleports by analyzing movement history.
 *
 * Buffer size: 120 samples = 2 seconds at 60Hz tick rate.
 * This gives enough history to detect anomalies while keeping
 * memory usage bounded.
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos Movement Validator"))
class UKhaaosMovementValidator : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosMovementValidator();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Validation Methods ─────────────────────────────────────────────────

	/**
	 * Validate movement delta between two samples.
	 * Returns true if the movement is physically possible.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	bool ValidateMovementDelta(const FValidatedMovement& Old, const FValidatedMovement& New,
		float MaxSpeed, float DeltaTime);

	/**
	 * Compute maximum possible displacement given speed and time.
	 * Accounts for acceleration and tolerance.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Movement")
	float ComputeMaxDisplacement(float Speed, float DeltaTime) const;

	/**
	 * Check if a location is reachable from another within max displacement.
	 * Returns true if reachable.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Movement")
	bool IsLocationReachable(FVector From, FVector To, float MaxDisplacement) const;

	/**
	 * Detect speed hack by analyzing movement history.
	 * Returns true if speed hack is detected.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	bool DetectSpeedHack(TArray<FValidatedMovement>& History, float Threshold);

	/**
	 * Detect fly hack by analyzing movement history.
	 * Checks for sustained Z-axis displacement above ground.
	 * Returns true if fly hack is detected.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	bool DetectFlyHack(TArray<FValidatedMovement>& History, float GroundZ, float Tolerance);

	/**
	 * Detect a teleport between two positions.
	 * Returns true if teleport is detected.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Movement")
	bool DetectTeleport(FVector Old, FVector New, float MaxDisplacement) const;

	// ─── Player Tracking ────────────────────────────────────────────────────

	/** Register a player for movement tracking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	void RegisterPlayer(APlayerState* Player);

	/** Unregister a player (on disconnect). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	void UnregisterPlayer(APlayerState* Player);

	/**
	 * Record a movement sample for a player.
	 * Adds to the circular buffer (oldest samples are overwritten).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	void RecordMovementSample(APlayerState* Player, const FValidatedMovement& Sample);

	/**
	 * Get the movement history for a player.
	 * Returns empty array if player is not tracked.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Movement")
	TArray<FValidatedMovement> GetMovementHistory(APlayerState* Player) const;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Maximum number of history samples per player (120 = 2s at 60Hz). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Movement")
	int32 MaxHistorySamples = 120;

	/** Speed tolerance multiplier for validation (1.2 = 20% buffer). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Movement")
	float SpeedTolerance = 1.2f;

	/** Minimum samples required before detection kicks in. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Movement")
	int32 MinSamplesForDetection = 10;

	/** Ground Z height for fly hack detection. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Movement")
	float DefaultGroundZ = 0.0f;

	/** Maximum height above ground for fly hack detection. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Movement")
	float MaxHeightAboveGround = 500.0f;

private:

	/**
	 * Per-player circular buffer of movement samples.
	 * Uses TArray as ring buffer with manual index wrapping.
	 */
	struct FMovementBuffer
	{
		TArray<FValidatedMovement> Samples;
		int32 Head = 0;       // Next write position
		int32 Count = 0;      // Current number of samples
		int32 Capacity = 120; // Buffer capacity

		void Init(int32 InCapacity)
		{
			Capacity = InCapacity;
			Samples.SetNum(Capacity);
			Head = 0;
			Count = 0;
		}

		void Push(const FValidatedMovement& Sample)
		{
			Samples[Head] = Sample;
			Head = (Head + 1) % Capacity;
			Count = FMath::Min(Count + 1, Capacity);
		}

		TArray<FValidatedMovement> GetAll() const
		{
			TArray<FValidatedMovement> Result;
			Result.Reserve(Count);
			// Read from oldest to newest
			int32 Start = (Count < Capacity) ? 0 : Head;
			for (int32 i = 0; i < Count; i++)
			{
				int32 Index = (Start + i) % Capacity;
				Result.Add(Samples[Index]);
			}
			return Result;
		}
	};

	/** Movement history buffers per player. */
	TMap<APlayerState*, FMovementBuffer> PlayerBuffers;
};
