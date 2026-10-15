// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosDeploySystem.generated.h"

// ─── Forward Declarations ────────────────────────────────────────────────────

class APlayerState;

// ─── Deploy Configuration ─────────────────────────────────────────────────────

/** Per-world deploy/parachute configuration.
 *  Different worlds in the multi-world pipeline have different map sizes
 *  and terrain, so deploy parameters are configurable per-world.
 *  CIGKV (50p, small) vs Barburhen (100p, large) need different heights. */
USTRUCT(BlueprintType)
struct FKhaaosDeployConfig
{
    GENERATED_BODY()

    /** Altitude at which players are deployed from the aircraft (world units). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float DeployHeight = 1500.0f;

    /** Free-fall speed when dropping without parachute (world units/sec). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float FreeFallSpeed = 800.0f;

    /** Altitude at which parachute auto-deploys (world units). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float ParachuteOpenHeight = 200.0f;

    /** Descent speed with parachute open (world units/sec). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float ParachuteDescendSpeed = 300.0f;

    /** Horizontal movement speed while parachuting (world units/sec). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float ParachuteHorizontalSpeed = 600.0f;

    /** Map bounds center for deploy zone calculation. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    FVector2D MapBoundsCenter = FVector2D::ZeroVector;

    /** Map bounds radius for deploy zone calculation. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float MapBoundsRadius = 10000.0f;

    /** Minimum altitude for landing detection (world units). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    float LandingThreshold = 10.0f;

    FKhaaosDeployConfig()
        : DeployHeight(1500.0f)
        , FreeFallSpeed(800.0f)
        , ParachuteOpenHeight(200.0f)
        , ParachuteDescendSpeed(300.0f)
        , ParachuteHorizontalSpeed(600.0f)
        , MapBoundsCenter(FVector2D::ZeroVector)
        , MapBoundsRadius(10000.0f)
        , LandingThreshold(10.0f)
    {}
};

// ─── Deploy State (internal) ───────────────────────────────────────────────────

/** Per-player deploy state tracked by the server. */
USTRUCT(BlueprintType)
struct FKhaaosDeployState
{
    GENERATED_BODY()

    /** Current position of the deploying player. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    FVector CurrentPosition = FVector::ZeroVector;

    /** Target landing position (where player is aiming). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    FVector TargetLandingPosition = FVector::ZeroVector;

    /** Player ID for tracking. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    FString PlayerId;

    /** Whether the player has opened their parachute. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    uint8 bParachuteOpen : 1;

    /** Whether the player has landed. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    uint8 bHasLanded : 1;

    /** Horizontal direction vector for parachute steering. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    FVector2D SteeringDirection = FVector2D::ZeroVector;

    FKhaaosDeployState()
        : CurrentPosition(FVector::ZeroVector)
        , TargetLandingPosition(FVector::ZeroVector)
        , bParachuteOpen(false)
        , bHasLanded(false)
        , SteeringDirection(FVector2D::ZeroVector)
    {}
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDeployStarted, const FString&, PlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnParachuteOpened, const FString&, PlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPlayerLanded, const FString&, PlayerId, const FVector&, LandingPosition);

/**
 * UKhaaosDeploySystemComponent
 *
 * Free Fire-style deploy/parachute system for Khaaos Run.
 *
 * Architecture:
 *   - StartDeploy(): player enters deploy mode at aircraft altitude
 *   - OpenParachute(): player (or auto-system) opens parachute
 *   - LandPlayer(): player touches ground, exits deploy mode
 *   - Per-world configuration: CIGKV (smaller, 50p) has different deploy
 *     parameters than Barburhen (large, 100p)
 *   - Server-authoritative: server tracks all deploying players in TMap,
 *     updates positions, auto-opens chutes, auto-lands
 *   - TickComponent: updates all deploying player positions each frame
 *   - Auto-open parachute at configured altitude (200m default)
 *   - Auto-land when altitude below threshold (10m default)
 *
 * Integration:
 *   - GameMode calls StartDeploy() when match enters Deploy phase
 *   - PlayerInput calls OpenParachute() on user action
 *   - MatchFlowStateMachine listens to OnPlayerLanded for "AllPlayersLanded"
 *   - Client receives replicated position for parachute rendering
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosDeploySystemComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosDeploySystemComponent();

    // ─── Deploy Control ─────────────────────────────────────────────────────

    /** Start deploy for a player (server-only). Places them at aircraft altitude. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Deploy")
    void StartDeploy(APlayerState* PlayerState);

    /** Player manually opens parachute (server-only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Deploy")
    void OpenParachute(APlayerState* PlayerState);

    /** Force-land a player at their current position (debug/testing). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Deploy", meta=(DevelopmentOnly))
    void LandPlayer(APlayerState* PlayerState);

    /** Set player's horizontal steering direction while parachuting. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Deploy")
    void SetSteeringDirection(APlayerState* PlayerState, const FVector2D& Direction);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Check if a player is currently in deploy mode. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    bool IsDeploying(APlayerState* PlayerState) const;

    /** Check if a player's parachute is open. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    bool IsParachuteOpen(APlayerState* PlayerState) const;

    /** Check if a player has landed. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    bool HasLanded(APlayerState* PlayerState) const;

    /** Get current deploy position for a player. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    FVector GetDeployPosition(APlayerState* PlayerState) const;

    /** Get number of players still deploying. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    int32 GetDeployingCount() const;

    /** Get number of players who have landed. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    int32 GetLandedCount() const;

    /** Check if all players have landed. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Deploy")
    bool AllPlayersLanded() const;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Deploy configuration (per-world settings). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Deploy")
    FKhaaosDeployConfig DeployConfig;

    /** Set deploy configuration for current world. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Deploy")
    void SetDeployConfig(const FKhaaosDeployConfig& InConfig);

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Deploy")
    FOnDeployStarted OnDeployStarted;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Deploy")
    FOnParachuteOpened OnParachuteOpened;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Deploy")
    FOnPlayerLanded OnPlayerLanded;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Internal State ─────────────────────────────────────────────────────

    /** Map of player ID → deploy state for all deploying players. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    TMap<FString, FKhaaosDeployState> DeployingPlayers;

    /** Total number of players that entered deploy this match. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    int32 TotalDeployed = 0;

    /** Number of players that have landed. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Deploy")
    int32 LandedCount = 0;

    // ─── Internal Methods ───────────────────────────────────────────────────

    /** Get a string key for a PlayerState. */
    static FString GetPlayerKey(APlayerState* PS);

    /** Compute initial deploy position for a player. */
    FVector ComputeInitialDeployPosition() const;
};
