// ============================================================================
// Khaaos Run — EOS Region Manager (Fase 2)
// ============================================================================
// Multi-region deployment management for EOS production.
// Handles region selection, ping-based routing, and cross-region awareness.
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosEOSRegionManager.generated.h"

// ─── Region Definition ───────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosEOSRegion
{
    GENERATED_BODY()

    /** Region identifier (sa1, na1, eu1) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RegionId;

    /** Human-readable name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RegionName;

    /** EOS endpoint for this region */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Endpoint;

    /** Data center latitude */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double Latitude = 0.0;

    /** Data center longitude */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    double Longitude = 0.0;

    /** Max lobby size in this region */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxLobbySize = 100;

    /** Max players per dedicated server */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxPlayersPerServer = 50;

    /** Matchmaking pool name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString MatchmakingPool;

    /** Is this region currently enabled? */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bEnabled = true;

    /** Max acceptable ping in ms */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PingThreshold = 150;

    /** Current ping to this region (measured) */
    UPROPERTY(BlueprintReadOnly)
    int32 CurrentPingMs = 999;

    /** Current player count in region */
    UPROPERTY(BlueprintReadOnly)
    int32 CurrentPlayers = 0;
};

// ─── Region Selection Strategy ───────────────────────────────────────────────

UENUM(BlueprintType)
enum class ERegionSelectionStrategy : uint8
{
    LowestPing       UMETA(DisplayName = "Lowest Ping (default)"),
    ClosestGeo       UMETA(DisplayName = "Closest Geographic"),
    PlayerCount      UMETA(DisplayName = "Most Players"),
    Manual           UMETA(DisplayName = "Manual Selection"),
};

// ─── Region Manager ──────────────────────────────────────────────────────────

/**
 * UKhaaosEOSRegionManager
 * Manages multi-region EOS deployment for Khaaos Run.
 *
 * Responsibilities:
 *   - Measure ping to all regions
 *   - Select best region for player
 *   - Route matchmaking to regional pools
 *   - Track player counts per region
 *   - Handle region failover
 *
 * Regions (Fase 2 Go Live):
 *   - sa1: South America (São Paulo) — primary for BR players
 *   - na1: North America (Virginia) — NA players
 *   - eu1: Europe (Frankfurt) — EU players
 */
UCLASS()
class KHAAOSRUN_API UKhaaosEOSRegionManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:

    // ─── Initialization ──────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionInitializationContext& Context) override;

    // ─── Region Management ───────────────────────────────────────────────────

    /** Get all configured regions */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Region")
    const TArray<FKhaaosEOSRegion>& GetRegions() const { return Regions; }

    /** Get best region for current player */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Region")
    FKhaaosEOSRegion GetBestRegion(ERegionSelectionStrategy Strategy = ERegionSelectionStrategy::LowestPing) const;

    /** Get region by ID */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Region")
    FKhaaosEOSRegion GetRegion(const FString& RegionId) const;

    /** Manually override region selection */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Region")
    void SetManualRegion(const FString& RegionId);

    // ─── Ping Measurement ────────────────────────────────────────────────────

    /** Measure ping to all regions */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Region")
    void MeasureAllRegionPings();

    /** Measure ping to a specific region */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Region")
    int32 MeasureRegionPing(const FString& RegionId) const;

    // ─── Player Count ────────────────────────────────────────────────────────

    /** Update player count for a region (from EOS) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Region")
    void UpdateRegionPlayerCount(const FString& RegionId, int32 PlayerCount);

    /** Get total players across all regions */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Region")
    int32 GetTotalPlayers() const;

    // ─── Configuration ───────────────────────────────────────────────────────

    /** Region selection strategy */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    ERegionSelectionStrategy SelectionStrategy = ERegionSelectionStrategy::LowestPing;

    /** Enable cross-region play (higher ping, more players) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    bool bEnableCrossRegionPlay = false;

    /** Cross-region ping threshold (only if enabled) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Config)
    int32 CrossRegionPingThreshold = 200;

private:

    /** All configured regions */
    UPROPERTY()
    TArray<FKhaaosEOSRegion> Regions;

    /** Manually selected region (if strategy = Manual) */
    UPROPERTY()
    FString ManualRegionId;

    /** Load regions from INI config */
    void LoadRegionConfig();
};
