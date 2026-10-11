// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "KhaaosAntiCheat.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class APlayerState;
class AActor;

// ─── Cheat Type Enum ───────────────────────────────────────────────────────────

/** Types of detected cheats for categorization and logging. */
UENUM(BlueprintType)
enum class ECheatType : uint8
{
	SpeedHack      UMETA(DisplayName = "Speed Hack"),
	Teleport       UMETA(DisplayName = "Teleport"),
	FlyHack        UMETA(DisplayName = "Fly Hack"),
	FireRateHack   UMETA(DisplayName = "Fire Rate Hack"),
	Aimbot         UMETA(DisplayName = "Aimbot"),
	ShootThroughWalls UMETA(DisplayName = "Shoot Through Walls"),
	InvalidDamage  UMETA(DisplayName = "Invalid Damage"),
	ItemPickupHack UMETA(DisplayName = "Item Pickup Hack"),
	Unknown        UMETA(DisplayName = "Unknown")
};

// ─── Player Suspicion Score ────────────────────────────────────────────────────

/**
 * FPlayerSuspicionScore
 *
 * Per-player tracking of anti-cheat suspicion scores.
 * Individual scores accumulate; total score and strike count
 * determine enforcement actions (warning, kick, ban).
 */
USTRUCT(BlueprintType)
struct FPlayerSuspicionScore
{
	GENERATED_BODY()

	/** Player ID (from PlayerState). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	int32 PlayerId = -1;

	/** Accumulated speed hack suspicion (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float SpeedHackScore = 0.0f;

	/** Accumulated aimbot suspicion (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float AimbotScore = 0.0f;

	/** Accumulated teleport suspicion (0-100). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float TeleportScore = 0.0f;

	/** Total composite suspicion score (0-100+). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float TotalScore = 0.0f;

	/** Number of cheat strikes (violations). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	int32 StrikesCount = 0;

	/** Total shots fired (for aimbot tracking). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	int32 TotalShots = 0;

	/** Total hits landed (for accuracy tracking). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	int32 TotalHits = 0;

	/** Timestamp of last cheat detection. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	double LastDetectionTime = 0.0;

	/** Recompute total score from individual scores. */
	void RecomputeTotal()
	{
		TotalScore = SpeedHackScore + AimbotScore + TeleportScore;
	}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

/** Broadcast when a cheat is detected. Server-authoritative. */
DECLARE_DELEGATE_ThreeParams(FOnCheatDetected, int32 /*PlayerId*/, ECheatType /*CheatType*/, const FString& /*Evidence*/);

// ── Anti-Cheat Subsystem ───────────────────────────────────────────────────────

/**
 * UKhaaosAntiCheat
 *
 * Server-side anti-cheat validation subsystem.
 *
 * ALL validation is server-authoritative. The client is NEVER trusted.
 * Every movement update, shot, damage event, and item pickup is
 * validated against server-tracked state.
 *
 * Enforcement:
 *   - Accumulated suspicion score → strikes
 *   - Strikes >= CheatStrikeThreshold → automatic kick
 *   - OnCheatDetected delegate for external logging/banning
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos Anti-Cheat"))
class UKhaaosAntiCheat : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosAntiCheat();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Movement Validation ────────────────────────────────────────────────

	/**
	 * Validate a movement update from a player.
	 * Checks: speed hack, teleport, fly hack.
	 * Returns true if movement is valid.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	bool ValidateMovement(APlayerState* Player, FVector OldLocation, FVector NewLocation, float DeltaTime);

	// ─── Shot Validation ────────────────────────────────────────────────────

	/**
	 * Validate a shot from a player.
	 * Checks: fire rate hack, aimbot (accuracy), shoot through walls.
	 * Returns true if shot is valid.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	bool ValidateShot(APlayerState* Shooter, FVector ShotOrigin, FVector ShotDirection, float ShotTime);

	// ─── Damage Validation ──────────────────────────────────────────────────

	/**
	 * Validate incoming damage to a victim.
	 * Checks: damage amount within expected range, damage type valid for weapon.
	 * Returns true if damage is valid.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	bool ValidateDamage(APlayerState* Victim, float DamageAmount, FGameplayTag DamageType);

	// ─── Item Pickup Validation ─────────────────────────────────────────────

	/**
	 * Validate an item pickup attempt.
	 * Checks: distance to item, item not already picked up, item exists.
	 * Returns true if pickup is valid.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	bool ValidateItemPickup(APlayerState* Player, AActor* Item);

	// ─── Player Management ──────────────────────────────────────────────────

	/** Register a new player for anti-cheat tracking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	void RegisterPlayer(APlayerState* Player);

	/** Unregister a player (on disconnect). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	void UnregisterPlayer(APlayerState* Player);

	/** Get the suspicion score for a player. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AntiCheat")
	FPlayerSuspicionScore GetPlayerScore(APlayerState* Player) const;

	// ─── Enforcement ────────────────────────────────────────────────────────

	/**
	 * Server-authoritative kick. Disconnects the player with reason.
	 * Called automatically when strikes exceed threshold, or manually.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AntiCheat")
	void KickPlayer(APlayerState* Player, const FString& Reason);

	/** Issue a cheat strike to a player. May trigger auto-kick. */
	void IssueStrike(APlayerState* Player, ECheatType CheatType, const FString& Evidence);

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when any cheat is detected. */
	FOnCheatDetected OnCheatDetected;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Whether to auto-kick players who exceed the strike threshold. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	uint8 bAutoKickOnCheat : 1 = true;

	/** Number of strikes before auto-kick. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	int32 CheatStrikeThreshold = 3;

	/** Maximum speed tolerance multiplier (1.2 = 20% above expected max). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float MaxSpeedTolerance = 1.2f;

	/** Maximum accuracy before flagged as suspicious (0-1). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float MaxAccuracyBeforeSuspicious = 0.85f;

	/** Minimum shots before aimbot analysis is applied. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	int32 MinShotsForAimbotAnalysis = 50;

	/** Maximum distance a player can move per second (units). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float MaxMovementPerSecond = 1200.0f;

	/** Maximum height above ground before fly hack flag (units). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float MaxHeightAboveGround = 500.0f;

	/** Maximum teleport distance before flag (units). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float MaxTeleportDistance = 5000.0f;

	/** Minimum time between shots (seconds, for fire rate check). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|AntiCheat")
	float MinTimeBetweenShots = 0.1f;

private:

	/** Per-player suspicion scores. */
	UPROPERTY()
	TMap<TObjectPtr<APlayerState>, FPlayerSuspicionScore> PlayerScores;

	/** Last shot time per player (for fire rate check). */
	TMap<APlayerState*, double> LastShotTime;

	/** Ground Z height for fly hack detection. */
	UPROPERTY(Config)
	float GroundZ = 0.0f;

	/** Internal: record a hit for aimbot tracking. */
	void RecordHit(APlayerState* Shooter, bool bHit);

	/** Internal: check aimbot suspicion from accuracy. */
	bool CheckAimbotSuspicion(APlayerState* Shooter);
};
