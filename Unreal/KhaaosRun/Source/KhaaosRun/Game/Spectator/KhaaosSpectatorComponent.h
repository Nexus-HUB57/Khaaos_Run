// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosSpectatorComponent.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class APlayerState;
class APlayerController;

// ─── Spectator Mode ────────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ESpectatorMode : uint8
{
    FollowPlayer UMETA(DisplayName = "FOLLOW_PLAYER"),
    FreeCam      UMETA(DisplayName = "FREE_CAM"),
    Overview     UMETA(DisplayName = "OVERVIEW")
};

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSpectatorModeChanged, ESpectatorMode, OldMode, ESpectatorMode, NewMode);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSpectateTargetChanged, const FString&, NewTargetId);

/**
 * UKhaaosSpectatorComponent
 *
 * PhD-Level spectator system for eliminated players.
 *
 * Modes:
 *   FollowPlayer — Camera follows an alive player (default on elimination)
 *   FreeCam      — Free-flying camera with WASD + speed control
 *   Overview     — Top-down map overview (like deploy screen)
 *
 * Navigation:
 *   Next/Prev — Cycle through alive players in FollowPlayer mode
 *   Free cam has configurable speed and vertical movement
 *
 * Free Fire / Fortnite Parity:
 *   - Auto-follow killer on elimination
 *   - Skip to next alive player with input
 *   - Free cam for content creators / replay viewers
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosSpectatorComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosSpectatorComponent();

    // ─── Mode Control ───────────────────────────────────────────────────────

    /** Set spectator mode (server authority). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Spectator")
    void SetSpectatorMode(ESpectatorMode NewMode);

    /** Get current spectator mode. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Spectator")
    ESpectatorMode GetSpectatorMode() const { return CurrentMode; }

    // ─── Target Control ─────────────────────────────────────────────────────

    /** Set the player to follow. Only valid in FollowPlayer mode. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Spectator")
    void SetSpectateTarget(APlayerState* Target);

    /** Follow the next alive player. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Spectator")
    void FollowNextAlive();

    /** Follow the previous alive player. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Spectator")
    void FollowPrevAlive();

    /** Auto-follow the player who eliminated this spectator. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Spectator")
    void FollowKiller(const FString& KillerId);

    /** Get current follow target. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Spectator")
    APlayerState* GetSpectateTarget() const { return SpectateTarget; }

    // ─── Free Cam ───────────────────────────────────────────────────────────

    /** Set free cam movement speed. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Spectator")
    void SetFreeCamSpeed(float Speed) { FreeCamSpeed = FMath::Max(100.0f, Speed); }

    /** Get free cam speed. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Spectator")
    float GetFreeCamSpeed() const { return FreeCamSpeed; }

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Default free cam speed (units/sec). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Spectator")
    float DefaultFreeCamSpeed = 1200.0f;

    /** Fast free cam speed multiplier (hold shift). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Spectator")
    float FastCamMultiplier = 3.0f;

    /** Overview camera height above terrain. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Spectator")
    float OverviewHeight = 5000.0f;

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Spectator")
    FOnSpectatorModeChanged OnSpectatorModeChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Spectator")
    FOnSpectateTargetChanged OnSpectateTargetChanged;

    // ─── Tick & Replication ────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Spectator")
    ESpectatorMode CurrentMode = ESpectatorMode::FollowPlayer;

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Spectator")
    APlayerState* SpectateTarget = nullptr;

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Spectator")
    float FreeCamSpeed = 1200.0f;

    /** Cached list of alive player states for cycling. */
    UPROPERTY()
    TArray<APlayerState*> AlivePlayersCache;

    /** Index into AlivePlayersCache for current follow target. */
    int32 FollowIndex = 0;

    /** Seconds since alive players cache was refreshed. */
    float CacheAge = 0.0f;

    /** Refresh interval for alive players cache. */
    static constexpr float CacheRefreshInterval = 1.0f;

    /** Refresh the alive players cache. */
    void RefreshAlivePlayersCache();

    /** Get the owning player controller. */
    APlayerController* GetOwnerPlayerController() const;
};
