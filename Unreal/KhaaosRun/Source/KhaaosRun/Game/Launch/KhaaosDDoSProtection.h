// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosDDoSProtection.generated.h"

// ─── DDoS Configuration ────────────────────────────────────────────────────────

/**
 * FDDoSConfig
 *
 * Configuration for DDoS connection rate protection.
 */
USTRUCT(BlueprintType)
struct FDDoSConfig
{
	GENERATED_BODY()

	/** Maximum new connections per second across all IPs. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int32 MaxConnectionsPerSecond = 50;

	/** Maximum concurrent connections from a single IP. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int32 MaxConnectionsPerIP = 5;

	/** Time window for connection rate measurement (seconds). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	float ConnectionWindowSeconds = 10.0f;

	/** Whether to automatically block IPs that exceed limits. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	uint8 bAutoBlockIPs : 1 = true;

	/** Duration to block an IP (minutes). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	float BlockDurationMinutes = 30.0f;
};

// ─── IP Connection Record ──────────────────────────────────────────────────────

/**
 * FIPConnectionRecord
 *
 * Per-IP tracking of connection counts and block state.
 */
USTRUCT(BlueprintType)
struct FIPConnectionRecord
{
	GENERATED_BODY()

	/** IP address string. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	FString IP;

	/** Number of connections in the current window. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int32 ConnectionCount = 0;

	/** Timestamp of the most recent connection. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	double LastConnectionTime = 0.0;

	/** Whether this IP is currently blocked. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	uint8 bIsBlocked : 1 = false;

	/** Timestamp when the block expires. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	double BlockedUntil = 0.0;

	/** Total lifetime connections from this IP. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int64 TotalConnections = 0;
};

// ─── DDoS Metrics ──────────────────────────────────────────────────────────────

/**
 * FDDoSMetrics
 *
 * Current DDoS protection metrics for monitoring.
 */
USTRUCT(BlueprintType)
struct FDDoSMetrics
{
	GENERATED_BODY()

	/** Current number of active connections. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int32 ActiveConnections = 0;

	/** Number of currently blocked IPs. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int32 BlockedIPs = 0;

	/** Peak connections observed. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int32 PeakConnections = 0;

	/** Total connections rejected since server start. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|DDoS")
	int64 TotalRejected = 0;
};

// ── DDoS Protection Subsystem ──────────────────────────────────────────────────

/**
 * UKhaaosDDoSProtection
 *
 * DDoS protection subsystem for the dedicated server.
 *
 * Monitors incoming connection rates per-IP and globally,
 * automatically blocking IPs that exceed configured thresholds.
 * Blocked IPs are unblocked after the configured duration.
 *
 * All validation is server-authoritative.
 * Thread safety: All state is game-thread only.
 */
UCLASS(Config=Game, defaultconfig, meta=(DisplayName="Khaaos DDoS Protection"))
class UKhaaosDDoSProtection : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosDDoSProtection();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Connection Handling ────────────────────────────────────────────────

	/**
	 * Called when a new connection is attempted from an IP.
	 * Returns true if the connection is allowed, false if blocked.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|DDoS")
	bool OnNewConnection(const FString& IP);

	/**
	 * Called when a connection from an IP is closed.
	 * Decrements the active connection count.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|DDoS")
	void OnConnectionClosed(const FString& IP);

	// ─── IP Blocking ────────────────────────────────────────────────────────

	/** Check if an IP is currently blocked. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|DDoS")
	bool IsIPBlocked(const FString& IP) const;

	/**
	 * Manually block an IP for a specified duration.
	 * Duration 0 = use default from config.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|DDoS")
	void BlockIP(const FString& IP, float DurationMinutes = 0.0f);

	/** Manually unblock an IP. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|DDoS")
	void UnblockIP(const FString& IP);

	// ─── Metrics ────────────────────────────────────────────────────────────

	/** Get current DDoS protection metrics. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|DDoS")
	FDDoSMetrics GetConnectionStats() const;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** DDoS protection configuration. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|DDoS")
	FDDoSConfig Config;

	/** Whether DDoS protection is enabled. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|DDoS")
	uint8 bProtectionEnabled : 1 = true;

private:

	/** Per-IP connection records. */
	UPROPERTY()
	TMap<FString, FIPConnectionRecord> IPRecords;

	/** Current DDoS metrics. */
	UPROPERTY()
	FDDoSMetrics Metrics;

	/** Global connections in the current window. */
	int32 GlobalConnectionCount = 0;

	/** Window start time for global rate tracking. */
	double WindowStartTime = 0.0;

	/** Current time helper. */
	double GetCurrentTime() const;

	/** Check and expire blocks/records. */
	void MaintainRecords();

	/** Count currently blocked IPs. */
	int32 CountBlockedIPs() const;
};
