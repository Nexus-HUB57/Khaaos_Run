// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosRateLimiter.generated.h"

// ─── Rate Limit Configuration ──────────────────────────────────────────────────

/**
 * FRateLimitConfig
 *
 * Configurable rate limit parameters.
 */
USTRUCT(BlueprintType)
struct FRateLimitConfig
{
	GENERATED_BODY()

	/** Maximum requests per minute. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	int32 MaxRequestsPerMinute = 60;

	/** Maximum requests per second. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	int32 MaxRequestsPerSecond = 10;

	/** Burst allowance above the per-second rate. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	int32 BurstAllowance = 5;

	/** Cooldown seconds after throttle before requests resume. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	float CooldownSeconds = 30.0f;
};

// ─── Client Rate State ─────────────────────────────────────────────────────────

/**
 * FClientRateState
 *
 * Per-client tracking of request counts and throttle state.
 */
USTRUCT(BlueprintType)
struct FClientRateState
{
	GENERATED_BODY()

	/** Request count in the current window. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	int32 RequestCount = 0;

	/** Timestamp of last rate window reset. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	double LastResetTime = 0.0;

	/** Whether this client is currently throttled. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	uint8 bIsThrottled : 1 = false;

	/** Timestamp when throttle expires. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	double ThrottledUntil = 0.0;

	/** Burst count used in current second. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	int32 BurstUsed = 0;

	/** Timestamp of last second-level reset. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	double LastSecondResetTime = 0.0;
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

/** Broadcast when a client exceeds rate limit. */
DECLARE_DELEGATE_OneParam(FOnRateLimitExceeded, const FString& /*ClientId*/);

// ── Rate Limiter Subsystem ─────────────────────────────────────────────────────

/**
 * UKhaaosRateLimiter
 *
 * Per-IP and per-PlayerId rate limiting subsystem.
 *
 * Uses a sliding window approach with per-minute and per-second
 * rate limits, plus burst allowance for legitimate traffic spikes.
 *
 * When a client exceeds the rate limit, they are throttled
 * (all requests rejected) for the configured cooldown period.
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos Rate Limiter"))
class UKhaaosRateLimiter : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosRateLimiter();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Rate Limiting ──────────────────────────────────────────────────────

	/**
	 * Check if a request from the given client is allowed.
	 * Returns true if the request is within rate limits.
	 * Automatically registers the request if allowed.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|RateLimit")
	bool CheckRateLimit(const FString& ClientId, const FRateLimitConfig& Config);

	/**
	 * Register a request from a client (increment counter).
	 * Called automatically by CheckRateLimit, but can be called
	 * manually for custom tracking.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|RateLimit")
	void RegisterRequest(const FString& ClientId);

	/**
	 * Check if a client is currently throttled.
	 * Throttled clients have all requests rejected until cooldown expires.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RateLimit")
	bool IsThrottled(const FString& ClientId) const;

	/**
	 * Get the remaining time (seconds) before a throttled client
	 * can make requests again. Returns 0 if not throttled.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RateLimit")
	float GetThrottleRemaining(const FString& ClientId) const;

	/** Remove a client from tracking (on disconnect). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|RateLimit")
	void RemoveClient(const FString& ClientId);

	/** Get the number of currently tracked clients. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|RateLimit")
	int32 GetTrackedClientCount() const;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when a client exceeds the rate limit. */
	FOnRateLimitExceeded OnRateLimitExceeded;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Whether to automatically throttle clients that exceed limits. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|RateLimit")
	uint8 bAutoThrottle : 1 = true;

private:

	/** Per-client rate state tracking. */
	UPROPERTY()
	TMap<FString, FClientRateState> ClientStates;

	/** Current time for rate window calculations. */
	double GetCurrentTime() const;
};
