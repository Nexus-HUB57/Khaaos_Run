// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosPerformanceBudget.generated.h"

// ─── Console Target Enum ─────────────────────────────────────────────────────

/**
 * Console target platforms for performance budgeting.
 * Each target has distinct performance profiles calibrated for
 * Free Fire/Garena quality parity on 60-100 player battle royale.
 */
UENUM(BlueprintType)
enum class EKhaaosConsoleTarget : uint8
{
	PC_High     UMETA(DisplayName = "PC High"),      // High-end PC: 120fps target
	PC_Medium   UMETA(DisplayName = "PC Medium"),    // Mid-range PC: 60fps target
	PS5         UMETA(DisplayName = "PS5"),           // PlayStation 5: 60fps
	XSX         UMETA(DisplayName = "XSX"),           // Xbox Series X: 60fps
	Switch2     UMETA(DisplayName = "Switch2"),       // Nintendo Switch 2: 30fps
	Mobile      UMETA(DisplayName = "Mobile")         // Mobile: 30fps reduced
};

// ─── Performance Mode Enum ───────────────────────────────────────────────────

/**
 * Performance quality modes. Dynamic quality scaling transitions
 * between these modes based on sustained FPS metrics.
 */
UENUM(BlueprintType)
enum class EKhaaosPerformanceMode : uint8
{
	FullQuality      UMETA(DisplayName = "Full Quality"),      // Maximum visual fidelity
	Balanced         UMETA(DisplayName = "Balanced"),          // Default for console
	Performance      UMETA(DisplayName = "Performance"),       // Prioritize framerate
	UltraPerformance UMETA(DisplayName = "Ultra Performance") // Minimal visuals, max fps
};

// ─── Anti-Aliasing Method Enum ───────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosAAMethod : uint8
{
	None    UMETA(DisplayName = "None"),
	FXAA    UMETA(DisplayName = "FXAA"),
	TAA     UMETA(DisplayName = "TAA"),
	MSAA2x  UMETA(DisplayName = "MSAA 2x"),
	MSAA4x  UMETA(DisplayName = "MSAA 4x")
};

// ─── Performance Profile Struct ──────────────────────────────────────────────

/**
 * Complete performance profile for a console target + quality mode.
 * All values are calibrated for 60-100 player battle royale with
 * Free Fire parity on each target platform.
 */
USTRUCT(BlueprintType)
struct FKhaaosPerformanceProfile
{
	GENERATED_BODY()

	/** Target framerate for this profile. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	int32 TargetFPS = 60;

	/** Maximum draw distance in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	float MaxDrawDistance = 10000.0f;

	/** Maximum simultaneously visible players (affects LOD & replication). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	int32 MaxVisiblePlayers = 60;

	/** Maximum active particle systems. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	int32 MaxParticleSystems = 100;

	/** Maximum visible decals. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	int32 MaxDecals = 500;

	/** Shadow quality: 0=Off, 1=Low, 2=Medium, 3=High. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance", meta = (ClampMin = "0", ClampMax = "3"))
	int32 ShadowQuality = 2;

	/** View distance scale (0.0 - 1.0). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float ViewDistanceScale = 1.0f;

	/** Whether motion blur is enabled. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	bool bMotionBlurEnabled = true;

	/** Anti-aliasing method. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance")
	EKhaaosAAMethod AntiAliasingMethod = EKhaaosAAMethod::TAA;

	/** Texture resolution scale (0.0 - 1.0). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float TextureResolution = 1.0f;
};

// ─── Performance Mode Changed Delegate ───────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPerformanceModeChanged, EKhaaosPerformanceMode, OldMode, EKhaaosPerformanceMode, NewMode);

// ─── Performance Budget Component ────────────────────────────────────────────

/**
 * UKhaaosPerformanceBudgetComponent
 *
 * PhD-level performance budget manager for console targets.
 * Auto-detects the current platform from FPlatformProperties and applies
 * the appropriate performance profile.
 *
 * Dynamic Quality Scaling:
 *   - Auto-downgrade when FPS drops below target for 3 seconds
 *   - Auto-upgrade when FPS stabilizes above target for 5 seconds
 *   - Applies via IConsoleManager (r.ViewDistanceScale, r.ShadowQuality, etc.)
 *
 * Free Fire Parity:
 *   - Switch2: 30fps with reduced visuals (closer thresholds, fewer particles)
 *   - PS5/XSX: 60fps balanced quality
 *   - PC High: 120fps full quality
 *
 * Usage:
 *   UKhaaosPerformanceBudgetComponent* Budget = AddDefaultSubobject<UKhaaosPerformanceBudgetComponent>();
 *   Budget->SetPerformanceMode(EKhaaosPerformanceMode::Balanced);
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosPerformanceBudgetComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	// ─── Constructor ────────────────────────────────────────────────────────────

	UKhaaosPerformanceBudgetComponent();

	// ─── Platform Detection ─────────────────────────────────────────────────────

	/** Auto-detect console target from FPlatformProperties. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Performance")
	EKhaaosConsoleTarget DetectConsoleTarget() const;

	/** Get the currently detected console target. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|Performance")
	EKhaaosConsoleTarget GetCurrentConsoleTarget() const { return CurrentTarget; }

	// ─── Performance Mode ──────────────────────────────────────────────────────

	/**
	 * Set the performance mode. Applies the profile for the current
	 * console target + mode combination via IConsoleManager.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Performance")
	void SetPerformanceMode(EKhaaosPerformanceMode NewMode);

	/** Get the current performance mode. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|Performance")
	EKhaaosPerformanceMode GetCurrentPerformanceMode() const { return CurrentMode; }

	// ─── Profile Queries ───────────────────────────────────────────────────────

	/** Get the full performance profile for a specific console target + mode. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|Performance")
	FKhaaosPerformanceProfile GetBudgetForTarget(EKhaaosConsoleTarget Target) const;

	/** Get the currently active performance profile. */
	UFUNCTION(BlueprintPure, Category = "Khaaos|Performance")
	const FKhaaosPerformanceProfile& GetCurrentProfile() const { return ActiveProfile; }

	// ─── Dynamic Quality Scaling ───────────────────────────────────────────────

	/** Enable/disable dynamic quality scaling. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance|Dynamic")
	bool bDynamicQualityScaling = true;

	/** Seconds of below-target FPS before auto-downgrade (default: 3.0). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance|Dynamic", meta = (ClampMin = "1.0", ClampMax = "10.0"))
	float DowngradeThresholdSeconds = 3.0f;

	/** Seconds of stable above-target FPS before auto-upgrade (default: 5.0). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance|Dynamic", meta = (ClampMin = "2.0", ClampMax = "15.0"))
	float UpgradeThresholdSeconds = 5.0f;

	/** FPS hysteresis to prevent oscillation (default: 5.0). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Performance|Dynamic", meta = (ClampMin = "1.0", ClampMax = "15.0"))
	float FPSHysteresis = 5.0f;

	// ─── Delegate ──────────────────────────────────────────────────────────────

	/** Broadcast when performance mode changes (including dynamic scaling). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Performance")
	FOnPerformanceModeChanged OnPerformanceModeChanged;

	// ─── UActorComponent Interface ─────────────────────────────────────────────

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

protected:

	// ─── Internal State ────────────────────────────────────────────────────────

	/** Currently detected console target. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Performance")
	EKhaaosConsoleTarget CurrentTarget = EKhaaosConsoleTarget::PC_Medium;

	/** Current performance mode. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Performance")
	EKhaaosPerformanceMode CurrentMode = EKhaaosPerformanceMode::Balanced;

	/** Currently active profile. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Performance")
	FKhaaosPerformanceProfile ActiveProfile;

private:

	// ─── Profile Database ──────────────────────────────────────────────────────

	/** Pre-built profiles for every Target x Mode combination. */
	TMap<EKhaaosConsoleTarget, TMap<EKhaaosPerformanceMode, FKhaaosPerformanceProfile>> ProfileDatabase;

	/** Build all default profiles for every target and mode. */
	void BuildDefaultProfiles();

	/** Build profiles for a specific console target. */
	void BuildProfilesForTarget(EKhaaosConsoleTarget Target);

	// ─── Console Variable Application ──────────────────────────────────────────

	/** Apply a performance profile via IConsoleManager cvars. */
	void ApplyProfileCvars(const FKhaaosPerformanceProfile& Profile);

	// ─── Dynamic Scaling State ─────────────────────────────────────────────────

	/** Accumulated time below target FPS. */
	float BelowTargetTime = 0.0f;

	/** Accumulated time at/above target FPS. */
	float AboveTargetTime = 0.0f;

	/** Whether we are currently in a downgraded state from dynamic scaling. */
	bool bIsDynamicallyDowngraded = false;

	/** Previous mode before dynamic downgrade (for restoration). */
	EKhaaosPerformanceMode PreDowngradeMode = EKhaaosPerformanceMode::Balanced;

	/** Handle dynamic quality scaling logic. */
	void ProcessDynamicQualityScaling(float DeltaTime);
};
