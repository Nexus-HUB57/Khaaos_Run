// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Replay/KhaaosReplaySystem.generated.h"

// ─── Replay Types ───────────────────────────────────────────────────────────────

/**
 * EKhaaosReplayState
 * Replay recording/playback state.
 */
UENUM(BlueprintType)
enum class EKhaaosReplayState : uint8
{
        Inactive    UMETA(DisplayName = "INACTIVE"),
        Recording   UMETA(DisplayName = "RECORDING"),
        Playing     UMETA(DisplayName = "PLAYING"),
        Paused      UMETA(DisplayName = "PAUSED")
};

/**
 * EKhaaosSpectatorMode
 * Spectator camera mode.
 */
UENUM(BlueprintType)
enum class EKhaaosSpectatorMode : uint8
{
        FreeCam     UMETA(DisplayName = "FREE_CAM"),    // Free flight camera
        FollowPlayer UMETA(DisplayName = "FOLLOW"),     // Follow specific player
        Overview    UMETA(DisplayName = "OVERVIEW"),     // Top-down tactical view
        KillCam     UMETA(DisplayName = "KILLCAM"),      // Death replay (3s)
        Directed    UMETA(DisplayName = "DIRECTED")      // Auto-directed (like watching TV)
};

/**
 * FKhaaosReplayHighlight
 * A highlight moment in the replay for easy seeking.
 */
USTRUCT(BlueprintType)
struct FKhaaosReplayHighlight
{
        GENERATED_BODY()

        /** Timestamp (seconds from match start). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay")
        float Timestamp = 0.0f;

        /** Description. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay")
        FString Description;

        /** Player involved. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay")
        FString PlayerEosId;

        /** Type (kill, zone, airdrop, revive, etc). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay")
        FString Type;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnReplayStateChanged, EKhaaosReplayState, NewState, EKhaaosReplayState, OldState);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnHighlightAdded, const FKhaaosReplayHighlight&, Highlight);

/**
 * UKhaaosReplaySystem
 *
 * Replay recording and spectator system for post-match analysis,
 * content creation, and directed spectating.
 *
 * Replay Recording:
 *   - Server-side: Full match recording (all players, all events)
 *   - Client-side: Local replay cache for immediate playback
 *   - Highlight markers: Auto-tag kills, zone kills, airdrops, revives
 *   - Storage: Cloud save replay to EOS (up to 10 replays per player)
 *   - Size limit: 50MB per replay (configurable)
 *   - Compression: Delta-compressed network replay data
 *
 * Spectator System:
 *   - Free Cam: No-clip flight camera with speed controls
 *   - Follow Player: Track specific player with smooth interpolation
 *   - Overview: Top-down tactical view (minimap-scale 3D)
 *   - Kill Cam: 3-second death replay from killer's perspective
 *   - Directed: Auto-directed spectating (Free Fire-like TV broadcast)
 *     - Auto-switch to: kills, zone damage, final circle
 *     - Camera: Smooth transitions, picture-in-picture
 *     - Director AI: Prioritize exciting moments
 *
 * Replay Playback:
 *   - Speed: 0.25x, 0.5x, 1x, 2x, 4x, 8x
 *   - Seek: Jump to any timestamp
 *   - Highlights: Quick-jump to marked moments
 *   - Camera: Switch between any player's perspective
 *
 * Console Budget:
 *   - Replay recording: <1ms overhead per tick
 *   - Spectator: No gameplay impact (observer-only replication)
 *   - Kill cam: 3s buffer, ~2MB per player
 *
 * Free Fire Parity:
 *   - Kill cam on death (from killer perspective)
 *   - Directed spectating after elimination (TV-like)
 *   - Replay sharing to social media
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosReplaySystem : public UActorComponent
{
        GENERATED_BODY()

public:

        UKhaaosReplaySystem();

        // ─── Recording ────────────────────────────────────────────────────────

        /** Start recording replay. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void StartRecording(const FString& MatchId);

        /** Stop recording and save. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void StopRecording();

        /** Add highlight marker. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void AddHighlight(const FString& Description, const FString& PlayerEosId, const FString& Type);

        /** Get all highlights. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Replay")
        const TArray<FKhaaosReplayHighlight>& GetHighlights() const { return Highlights; }

        // ─── Playback ─────────────────────────────────────────────────────────

        /** Start replay playback. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void StartPlayback(const FString& ReplayId);

        /** Pause playback. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void PausePlayback();

        /** Resume playback. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void ResumePlayback();

        /** Set playback speed. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void SetPlaybackSpeed(float Speed);

        /** Seek to timestamp. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay")
        void SeekToTime(float Timestamp);

        /** Get current replay state. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Replay")
        EKhaaosReplayState GetReplayState() const { return ReplayState; }

        /** Get current playback time. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay")
        float CurrentPlaybackTime;

        /** Playback speed. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay")
        float PlaybackSpeed;

        // ─── Spectator ────────────────────────────────────────────────────────

        /** Set spectator camera mode. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay|Spectator")
        void SetSpectatorMode(EKhaaosSpectatorMode Mode);

        /** Follow a specific player. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replay|Spectator")
        void FollowPlayer(const FString& PlayerEosId);

        /** Get current spectator mode. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Replay|Spectator")
        EKhaaosSpectatorMode SpectatorMode;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Max replay size (MB). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Replay")
        int32 MaxReplaySizeMB;

        /** Kill cam duration (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Replay")
        float KillCamDuration;

        /** Max saved replays per player. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Replay")
        int32 MaxSavedReplays;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Replay")
        FOnReplayStateChanged OnReplayStateChanged;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Replay")
        FOnHighlightAdded OnHighlightAdded;

private:

        /** Current replay state. */
        EKhaaosReplayState ReplayState;

        /** Recorded highlights. */
        TArray<FKhaaosReplayHighlight> Highlights;

        /** Match being recorded. */
        FString RecordingMatchId;

        /** Follow target EOS ID. */
        FString FollowTargetId;

        /** Set replay state and broadcast. */
        void SetReplayState(EKhaaosReplayState NewState);
};
