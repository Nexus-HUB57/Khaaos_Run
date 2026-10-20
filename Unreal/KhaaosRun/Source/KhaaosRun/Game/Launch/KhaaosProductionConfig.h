// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosProductionConfig.generated.h"

// ─── Production Configuration Struct ───────────────────────────────────────────

/**
 * FProductionConfig
 *
 * Production environment configuration for Khaaos Run.
 * Controls security, rate limiting, DDoS protection, monitoring,
 * and feature flags for production deployment.
 */
USTRUCT(BlueprintType)
struct FProductionConfig
{
	GENERATED_BODY()

	/** Whether running in production mode (vs development). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bIsProduction : 1 = false;

	/** Require EOS authentication for all connections. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bRequireAuthentication : 1 = true;

	/** Require anti-cheat validation for all players. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bRequireAntiCheat : 1 = true;

	/** Enable per-IP and per-player rate limiting. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bEnableRateLimiting : 1 = true;

	/** Enable DDoS connection rate protection. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bEnableDDoSProtection : 1 = true;

	/** Maximum concurrent player connections. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	int32 MaxConcurrentConnections = 1000;

	/** Maximum connections allowed from a single IP. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	int32 MaxConnectionsPerIP = 5;

	/** Maximum API requests per minute per client. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	int32 RequestRateLimitPerMinute = 60;

	/** Enable Prometheus/Grafana metrics collection. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bEnableMetricsCollection : 1 = true;

	/** Enable crash reporting to external service. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bEnableCrashReporting : 1 = true;

	/** Enable profiling (development only — MUST be false in production). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	uint8 bEnableProfiling : 1 = false;

	/** URL for maintenance mode notification (empty = no maintenance). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Production")
	FString MaintenanceModeURL;
};

// ── Production Config Subsystem ────────────────────────────────────────────────

/**
 * UKhaaosProductionConfig
 *
 * Production configuration subsystem that controls security,
 * performance, and feature flags for the dedicated server.
 *
 * In production mode, all development shortcuts are disabled:
 *   - No profiling
 *   - No cheats
 *   - Authentication required
 *   - Anti-cheat enforced
 *   - Rate limiting active
 *   - DDoS protection active
 *
 * Feature flags allow granular toggle of systems without redeployment.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos Production Config"))
class UKhaaosProductionConfig : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosProductionConfig();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Configuration Access ───────────────────────────────────────────────

	/** Get the current production configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Production")
	const FProductionConfig& GetConfig() const;

	/**
	 * Check if a named feature is enabled.
	 * Feature flags: "EAC", "EOS", "CLOUD_SAVE", "ADAPTIVE_MUSIC", "LIVE_OPS"
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Production")
	bool IsFeatureEnabled(FName Feature) const;

	/**
	 * Enable or disable a feature flag at runtime.
	 * Only works if not in production locked mode.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Production")
	void SetFeatureEnabled(FName Feature, bool bEnabled);

	// ─── Production Enforcement ─────────────────────────────────────────────

	/**
	 * Apply production overrides — lock down all settings for production.
	 * Called at server startup when bIsProduction=true.
	 * Disables profiling, enforces auth, etc.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Production")
	void ApplyProductionOverrides();

	/** Whether the server is in production mode. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Production")
	bool IsProduction() const;

private:

	/** Cached production config. */
	UPROPERTY(Config)
	FProductionConfig Config;

	/** Feature flags map (feature name → enabled). */
	TMap<FName, bool> FeatureFlags;

	/** Initialize default feature flags. */
	void InitFeatureFlags();

	/** Validate configuration consistency (log warnings for issues). */
	void ValidateConfig();
};
