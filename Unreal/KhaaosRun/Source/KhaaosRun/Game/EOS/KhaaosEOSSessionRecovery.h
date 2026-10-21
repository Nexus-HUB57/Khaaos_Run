// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/EOS/KhaaosEOSSessionRecovery.generated.h"

// ─── Recovery Types ────────────────────────────────────────────────────────────

/**
 * EKhaaosRecoveryState
 * Session recovery state machine.
 */
UENUM(BlueprintType)
enum class EKhaaosRecoveryState : uint8
{
	Normal        UMETA(DisplayName = "NORMAL"),
	Disconnected  UMETA(DisplayName = "DISCONNECTED"),
	Reconnecting  UMETA(DisplayName = "RECONNECTING"),
	Rejoined      UMETA(DisplayName = "REJOINED"),
	Expired       UMETA(DisplayName = "EXPIRED")
};

/**
 * FKhaaosSessionSnapshot
 * Serialized session state for recovery.
 */
USTRUCT(BlueprintType)
struct FKhaaosSessionSnapshot
{
	GENERATED_BODY()

	/** Session ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	FString SessionId;

	/** Player EOS ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	FString PlayerEosId;

	/** Player position at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	FVector Position = FVector::ZeroVector;

	/** Player rotation at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	FRotator Rotation = FRotator::ZeroRotator;

	/** Health at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	float Health = 100.0f;

	/** Shield at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	float Shield = 0.0f;

	/** Inventory items at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	TArray<FString> InventoryItems;

	/** Match timestamp at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	int64 DisconnectTimestamp = 0;

	/** Number of kills at disconnect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	int32 Kills = 0;

	/** World index at disconnect (for multi-world). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	int32 WorldIndex = 0;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnRecoveryComplete, bool, bSuccess, const FString&, PlayerEosId);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnRecoveryStateChanged, EKhaaosRecoveryState, NewState);

/**
 * UKhaaosEOSSessionRecovery
 *
 * Session recovery system for handling player disconnects during match.
 * Provides a grace period for reconnection with full state restoration.
 *
 * Flow:
 *   1. Player disconnects → Snapshot serialized, grace period starts
 *   2. Player reconnects within grace period → State restored
 *   3. Grace period expires → Player eliminated, loot dropped
 *
 * Grace Periods (Free Fire parity):
 *   - Normal disconnect: 60s grace period
 *   - Server migration: 120s grace period
 *   - Crash recovery: 90s grace period
 *
 * State Serialization:
 *   - Position, rotation, health, shield
 *   - Inventory (weapon slots + items)
 *   - Match stats (kills, damage dealt)
 *   - World index (for multi-world transitions)
 *   - Snapshot stored in EOS session attributes + local cache
 *
 * Anti-Exploit:
 *   - Max 3 recoveries per match per player
 *   - Combat logger: if player was taking damage, no recovery
 *   - Position verified against last known + max movement delta
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosEOSSessionRecovery : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosEOSSessionRecovery();

	virtual void InitializeComponent() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// ─── Recovery API ───────────────────────────────────────────────────────

	/** Handle player disconnect (start grace period). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Recovery")
	void OnPlayerDisconnect(const FString& PlayerEosId, const FKhaaosSessionSnapshot& Snapshot);

	/** Handle player reconnect (attempt state restoration). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Recovery")
	void OnPlayerReconnect(const FString& PlayerEosId, const FOnRecoveryComplete& Callback);

	/** Cancel recovery (e.g., player eliminated by zone). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Recovery")
	void CancelRecovery(const FString& PlayerEosId);

	/** Check if a player is in grace period. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Recovery")
	bool IsInGracePeriod(const FString& PlayerEosId) const;

	/** Get remaining grace period for a player. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Recovery")
	float GetRemainingGracePeriod(const FString& PlayerEosId) const;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Normal disconnect grace period (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	float NormalGracePeriod;

	/** Server migration grace period (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	float MigrationGracePeriod;

	/** Max recoveries per match per player. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	int32 MaxRecoveriesPerMatch;

	/** Max position delta on reconnect (for anti-teleport). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|EOS|Recovery")
	float MaxPositionDelta;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Recovery")
	FOnRecoveryStateChanged OnRecoveryStateChanged;

private:

	/** Active recovery entries (PlayerEosId → Snapshot + remaining time). */
	struct FRecoveryEntry
	{
		FKhaaosSessionSnapshot Snapshot;
		float RemainingTime;
		int32 RecoveryCount;
		bool bInCombat;
	};
	TMap<FString, FRecoveryEntry> ActiveRecoveries;

	/** Current state. */
	EKhaaosRecoveryState RecoveryState;

	/** Expire grace periods. */
	void ExpireGracePeriods();
};
