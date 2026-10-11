// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameplayDebuggerCategory.h"
#include "Game/Debugger/KhaaosGameplayDebugger.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosAbilityComponent;
class UKhaaosActorPool;
class AKhaaosSafeZone;

// ─── Data Structures for Debugger Categories ──────────────────────────────────

/** Collected ability debug data. */
USTRUCT()
struct FKhaaosAbilityDebugData
{
	GENERATED_BODY()

	/** Ability tag name. */
	UPROPERTY()
	FString AbilityName;

	/** Cooldown time remaining. */
	UPROPERTY()
	float CooldownRemaining = 0.0f;

	/** Cooldown total duration. */
	UPROPERTY()
	float CooldownTotal = 0.0f;

	/** Energy cost. */
	UPROPERTY()
	float EnergyCost = 0.0f;

	/** Blocked tag names. */
	UPROPERTY()
	TArray<FString> BlockedTagNames;

	/** Whether the ability is currently active. */
	UPROPERTY()
	uint8 bIsActive : 1;
};

/** Collected relevancy debug data per actor. */
USTRUCT()
struct FKhaaosRelevancyDebugData
{
	GENERATED_BODY()

	/** Actor class name. */
	UPROPERTY()
	FString ActorType;

	/** Distance to local viewer. */
	UPROPERTY()
	float DistanceToViewer = 0.0f;

	/** Significance level (0=Critical, 1=High, 2=Medium, 3=Low). */
	UPROPERTY()
	int32 SignificanceLevel = 0;

	/** Net update frequency. */
	UPROPERTY()
	float NetUpdateFrequency = 0.0f;

	/** Whether actor is currently relevant. */
	UPROPERTY()
	uint8 bIsRelevant : 1;
};

/** Collected pool debug data. */
USTRUCT()
struct FKhaaosPoolDebugData
{
	GENERATED_BODY()

	/** Pool actor class name. */
	UPROPERTY()
	FString PoolType;

	/** Available (pooled) count. */
	UPROPERTY()
	int32 AvailableCount = 0;

	/** Active (checked out) count. */
	UPROPERTY()
	int32 ActiveCount = 0;

	/** Peak active count. */
	UPROPERTY()
	int32 PeakCount = 0;

	/** Cache hit rate percentage. */
	UPROPERTY()
	float HitRatePct = 0.0f;
};

/** Collected zone debug data. */
USTRUCT()
struct FKhaaosZoneDebugData
{
	GENERATED_BODY()

	/** Current zone phase (1-5). */
	UPROPERTY()
	int32 Phase = 0;

	/** Zone center (normalized). */
	UPROPERTY()
	FVector2D Center;

	/** Zone radius (percentage). */
	UPROPERTY()
	float Radius = 0.0f;

	/** Time remaining for current shrink/wait. */
	UPROPERTY()
	float ShrinkTimer = 0.0f;

	/** Damage per tick. */
	UPROPERTY()
	float DamagePerTick = 0.0f;

	/** Number of players inside zone. */
	UPROPERTY()
	int32 PlayersInside = 0;

	/** Whether zone is shrinking. */
	UPROPERTY()
	uint8 bIsShrinking : 1;
};

/** Collected network metrics debug data. */
USTRUCT()
struct FKhaaosNetworkDebugData
{
	GENERATED_BODY()

	/** Round-trip time (ms). */
	UPROPERTY()
	float RTT = 0.0f;

	/** Packet loss percentage. */
	UPROPERTY()
	float PacketLossPct = 0.0f;

	/** Inbound bandwidth (bytes/sec). */
	UPROPERTY()
	float InBytesPerSec = 0.0f;

	/** Outbound bandwidth (bytes/sec). */
	UPROPERTY()
	float OutBytesPerSec = 0.0f;

	/** Number of replicated actors. */
	UPROPERTY()
	int32 ReplicatedActors = 0;

	/** High-latency alert threshold (ms). */
	UPROPERTY()
	float HighLatencyThreshold = 150.0f;

	/** Whether RTT exceeds high-latency threshold. */
	UPROPERTY()
	uint8 bHighLatencyAlert : 1;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Debugger Category: Abilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FKhaaosDebuggerCategory_Abilities
 *
 * Gameplay Debugger category that displays active abilities, cooldowns,
 * blocked tags, and energy costs from UKhaaosAbilityComponent.
 *
 * Usage: In-game press Apostrophe key, select "Khaaos.Abilities"
 */
class FKhaaosDebuggerCategory_Abilities : public FGameplayDebuggerCategory
{
	GENERATED_BODY()

public:
	FKhaaosDebuggerCategory_Abilities();

	/** Collect data from the ability component of the selected actor. */
	virtual void CollectData(APlayerController* OwnerPC, AActor* DebugActor) override;

	/** Render collected data on the gameplay debugger canvas. */
	virtual void DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext) override;

protected:
	/** Collected ability data for rendering. */
	TArray<FKhaaosAbilityDebugData> AbilityData;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Debugger Category: Relevancy
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FKhaaosDebuggerCategory_Relevancy
 *
 * Displays network relevancy information per actor — distance to viewer,
 * significance level, and NetUpdateFrequency.
 *
 * Usage: In-game press Apostrophe key, select "Khaaos.Relevancy"
 */
class FKhaaosDebuggerCategory_Relevancy : public FGameplayDebuggerCategory
{
	GENERATED_BODY()

public:
	FKhaaosDebuggerCategory_Relevancy();

	virtual void CollectData(APlayerController* OwnerPC, AActor* DebugActor) override;
	virtual void DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext) override;

protected:
	TArray<FKhaaosRelevancyDebugData> RelevancyData;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Debugger Category: Pool
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FKhaaosDebuggerCategory_Pool
 *
 * Displays pool statistics — available/active/peak counts and hit rate.
 *
 * Usage: In-game press Apostrophe key, select "Khaaos.Pool"
 */
class FKhaaosDebuggerCategory_Pool : public FGameplayDebuggerCategory
{
	GENERATED_BODY()

public:
	FKhaaosDebuggerCategory_Pool();

	virtual void CollectData(APlayerController* OwnerPC, AActor* DebugActor) override;
	virtual void DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext) override;

protected:
	TArray<FKhaaosPoolDebugData> PoolData;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Debugger Category: Zone
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FKhaaosDebuggerCategory_Zone
 *
 * Displays zone state — phase, center, radius, shrink timer, damage/s,
 * players inside.
 *
 * Usage: In-game press Apostrophe key, select "Khaaos.Zone"
 */
class FKhaaosDebuggerCategory_Zone : public FGameplayDebuggerCategory
{
	GENERATED_BODY()

public:
	FKhaaosDebuggerCategory_Zone();

	virtual void CollectData(APlayerController* OwnerPC, AActor* DebugActor) override;
	virtual void DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext) override;

protected:
	FKhaaosZoneDebugData ZoneData;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Debugger Category: Network
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FKhaaosDebuggerCategory_Network
 *
 * Displays network metrics — RTT, packet loss, bandwidth,
 * replicated actors, high-latency alerts.
 *
 * Usage: In-game press Apostrophe key, select "Khaaos.Network"
 */
class FKhaaosDebuggerCategory_Network : public FGameplayDebuggerCategory
{
	GENERATED_BODY()

public:
	FKhaaosDebuggerCategory_Network();

	virtual void CollectData(APlayerController* OwnerPC, AActor* DebugActor) override;
	virtual void DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext) override;

protected:
	FKhaaosNetworkDebugData NetData;
};
