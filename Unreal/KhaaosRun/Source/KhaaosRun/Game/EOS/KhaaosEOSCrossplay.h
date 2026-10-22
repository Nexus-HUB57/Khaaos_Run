// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/EOS/KhaaosEOSCrossplay.generated.h"

// ─── Platform Types ────────────────────────────────────────────────────────────

/**
 * EKhaaosPlatform
 * Target platforms for cross-play support.
 */
UENUM(BlueprintType)
enum class EKhaaosPlatform : uint8
{
	PS5       UMETA(DisplayName = "PS5"),
	XSX       UMETA(DisplayName = "XSX"),
	Switch2   UMETA(DisplayName = "SWITCH2"),
	PC        UMETA(DisplayName = "PC"),
	Mobile    UMETA(DisplayName = "MOBILE"),
	Unknown   UMETA(DisplayName = "UNKNOWN")
};

/**
 * FKhaaosCrossplayConfig
 * Per-platform cross-play configuration.
 */
USTRUCT(BlueprintType)
struct FKhaaosCrossplayConfig
{
	GENERATED_BODY()

	/** Whether cross-play is enabled for this platform. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Crossplay")
	uint8 bCrossplayEnabled : 1;

	/** Allowed platforms for matching (bitmask). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Crossplay")
	TArray<EKhaaosPlatform> AllowedPlatforms;

	/** Input method constraints. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Crossplay")
	uint8 bRequiresController : 1;

	/** Maximum aim assist angle (console-only, degrees). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Crossplay")
	float MaxAimAssistAngle;

	/** Whether text chat is enabled. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Crossplay")
	uint8 bTextChatEnabled : 1;

	/** Whether voice chat is enabled. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Crossplay")
	uint8 bVoiceChatEnabled : 1;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnCrossplayChanged, bool, bEnabled, EKhaaosPlatform, Platform);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnPlatformDetected, EKhaaosPlatform, Platform, const FString&, PlatformStr);

/**
 * UKhaaosEOSCrossplay
 *
 * Cross-platform session management for Khaaos Run.
 * Handles platform detection, cross-play toggling, input constraints,
 * and platform-specific matchmaking rules.
 *
 * Console Parity:
 *   - PS5: Cross-play with XSX/PC, aim assist 3.5°, voice+text chat
 *   - XSX: Cross-play with PS5/PC, aim assist 3.0°, voice+text chat
 *   - Switch2: Cross-play opt-in, aim assist 5.0°, voice chat only
 *   - PC: No aim assist, full cross-play, text+voice chat
 *   - Mobile: Separate matchmaking pool, touch controls
 *
 * Platform Detection:
 *   - Uses EOS SDK platform identifiers
 *   - Falls back to UE5 target platform macros
 *   - Stored in session attributes for matchmaking filtering
 */
UCLASS(BlueprintType)
class UKhaaosEOSCrossplay : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Platform Detection ─────────────────────────────────────────────────

	/** Detect the current platform. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Crossplay")
	EKhaaosPlatform DetectPlatform();

	/** Get the detected platform. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	EKhaaosPlatform GetCurrentPlatform() const { return CurrentPlatform; }

	/** Get platform display string. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	static FString GetPlatformName(EKhaaosPlatform Platform);

	// ─── Cross-play Control ────────────────────────────────────────────────

	/** Enable or disable cross-play. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Crossplay")
	void SetCrossplayEnabled(bool bEnabled);

	/** Is cross-play currently enabled? */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	bool IsCrossplayEnabled() const { return bCrossplayEnabled; }

	/** Get allowed platforms for current configuration. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Crossplay")
	TArray<EKhaaosPlatform> GetAllowedPlatforms() const;

	/** Check if a platform is allowed for matching. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Crossplay")
	bool IsPlatformAllowed(EKhaaosPlatform Platform) const;

	// ─── Input Constraints ─────────────────────────────────────────────────

	/** Get aim assist angle for current platform. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	float GetAimAssistAngle() const;

	/** Does current platform require controller? */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	bool RequiresController() const;

	/** Is text chat available? */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	bool IsTextChatAvailable() const;

	/** Is voice chat available? */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Crossplay")
	bool IsVoiceChatAvailable() const;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Crossplay")
	FOnCrossplayChanged OnCrossplayChanged;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Crossplay")
	FOnPlatformDetected OnPlatformDetected;

private:

	/** Current platform. */
	EKhaaosPlatform CurrentPlatform;

	/** Whether cross-play is enabled. */
	bool bCrossplayEnabled;

	/** Per-platform configurations. */
	TMap<EKhaaosPlatform, FKhaaosCrossplayConfig> PlatformConfigs;

	/** Initialize platform configs. */
	void InitPlatformConfigs();
};
