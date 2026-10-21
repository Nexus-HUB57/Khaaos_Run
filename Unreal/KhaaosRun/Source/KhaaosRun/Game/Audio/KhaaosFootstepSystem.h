// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Audio/KhaaosFootstepSystem.generated.h"

// ─── Surface Types ─────────────────────────────────────────────────────────────

/**
 * EKhaaosSurfaceType
 * Physical surface types for footstep audio/VFX.
 */
UENUM(BlueprintType)
enum class EKhaaosSurfaceType : uint8
{
	Default   UMETA(DisplayName = "DEFAULT"),
	Grass     UMETA(DisplayName = "GRASS"),
	Dirt      UMETA(DisplayName = "DIRT"),
	Sand      UMETA(DisplayName = "SAND"),
	Stone     UMETA(DisplayName = "STONE"),
	Metal     UMETA(DisplayName = "METAL"),
	Wood      UMETA(DisplayName = "WOOD"),
	Water     UMETA(DisplayName = "WATER"),
	Mud       UMETA(DisplayName = "MUD"),
	Snow      UMETA(DisplayName = "SNOW"),
	Lava      UMETA(DisplayName = "LAVA"),
	Crystal   UMETA(DisplayName = "CRYSTAL")
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_ThreeParams(FOnFootstep, EKhaaosSurfaceType, Surface, FVector, Location, float, Volume);

/**
 * UKhaaosFootstepSystem
 *
 * Surface-dependent footstep audio and VFX system.
 * Traces down from feet to detect physical surface, then plays
 * the appropriate footstep sound and spawns a decal/particle.
 *
 * Surface Audio Map (per-world):
 *   Barburhen: Grass, Dirt, Stone, Water
 *   Priadus:   Sand, Stone, Metal, Crystal
 *   Ckesalth:  Mud, Wood, Lava, Crystal
 *   Arukheea:  Snow, Ice, Stone, Metal
 *   CIGKV:     Metal, Crystal (arena world)
 *
 * Features:
 *   - Per-surface audio with random pitch variation (0.9-1.1)
 *   - Per-surface VFX (dust, splash, snow poof, crystal sparkle)
 *   - Foot decal system (footprint in snow/mud/sand)
 *   - Speed-dependent volume (walk quiet, run loud, sprint loudest)
 *   - Species-specific footstep weight (Zheers heavy, Onith light)
 *   - Console: 3D spatial audio with HRTF
 *   - Rate limited: max 4 footstep sounds/second
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosFootstepSystem : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosFootstepSystem();

	virtual void InitializeComponent() override;

	// ─── Footstep Trigger ───────────────────────────────────────────────────

	/** Trigger a footstep (called from AnimNotify_Footstep). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Footstep")
	void TriggerFootstep(bool bIsLeftFoot);

	/** Detect surface type at a world location. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Audio|Footstep")
	EKhaaosSurfaceType DetectSurface(const FVector& Location) const;

	/** Get surface type name for audio lookup. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Audio|Footstep")
	static FString GetSurfaceAudioName(EKhaaosSurfaceType Surface);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Foot trace distance (cm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Footstep")
	float FootTraceDistance;

	/** Walk volume. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Footstep")
	float WalkVolume;

	/** Run volume. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Footstep")
	float RunVolume;

	/** Sprint volume. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Footstep")
	float SprintVolume;

	/** Max footstep sounds per second. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Footstep")
	int32 MaxFootstepsPerSecond;

	/** Species weight multiplier (Zheers=1.5, Onith=0.7, etc). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Audio|Footstep")
	float SpeciesWeight;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Audio|Footstep")
	FOnFootstep OnFootstep;

private:

	/** Footstep rate limit timer. */
	float RateLimitTimer;

	/** Footsteps this second. */
	int32 FootstepsThisSecond;

	/** Left foot offset. */
	FVector LeftFootOffset;

	/** Right foot offset. */
	FVector RightFootOffset;

	/** Check rate limit. */
	bool CheckRateLimit(float DeltaSeconds);

	/** Compute volume based on movement speed. */
	float ComputeVolume() const;
};
