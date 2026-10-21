// ============================================================================
// Khaaos Run — Streaming/YouTube Integration (Fase 5)
// ============================================================================
// Integration with streaming platforms: spectator mode, OBS WebSocket,
// kill feed overlay, tournament brackets, stream delay, streamer HUD,
// clip/screenshot system, feature-flag gated.
// ============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosStreamingIntegration.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosFeatureFlags;

// ─── Streaming Platform ───────────────────────────────────────────────────────

/**
 * EKhaaosStreamingPlatform
 *
 * Supported streaming platforms.
 */
UENUM(BlueprintType)
enum class EKhaaosStreamingPlatform : uint8
{
	Twitch   UMETA(DisplayName = "Twitch"),
	YouTube  UMETA(DisplayName = "YouTube"),
	Kick     UMETA(DisplayName = "Kick"),
	Unknown  UMETA(DisplayName = "Unknown"),
};

// ─── Spectator Camera Mode ────────────────────────────────────────────────────

/**
 * EKhaaosSpectatorCameraMode
 *
 * Camera modes for spectator/streamer viewing.
 */
UENUM(BlueprintType)
enum class EKhaaosSpectatorCameraMode : uint8
{
	/** Follow a specific player. */
	FollowPlayer     UMETA(DisplayName = "Follow Player"),

	/** Free camera (streamer controls). */
	FreeCamera       UMETA(DisplayName = "Free Camera"),

	/** Auto-follow the action (most eliminations, zone edge). */
	AutoFollow       UMETA(DisplayName = "Auto Follow"),

	/** Overview camera (top-down map view). */
	Overview         UMETA(DisplayName = "Overview"),

	/** Cinematic camera (dramatic angles). */
	Cinematic        UMETA(DisplayName = "Cinematic"),
};

// ─── Kill Feed Entry ──────────────────────────────────────────────────────────

/**
 * FKhaaosKillFeedEntry
 *
 * Entry for the stream kill feed overlay.
 */
USTRUCT(BlueprintType)
struct FKhaaosKillFeedEntry
{
	GENERATED_BODY()

	/** Killer player name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	FString KillerName;

	/** Victim player name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	FString VictimName;

	/** Weapon/ability used. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	FString WeaponName;

	/** Timestamp of the kill (game time). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	float Timestamp = 0.0f;

	/** Whether this was a multi-kill (double, triple, etc.). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	int32 MultiKillCount = 1;

	/** Whether this is a headshot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	uint8 bHeadshot : 1 = false;

	/** Region text (e.g., "Zona 3"). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|KillFeed")
	FString ZoneLabel;

	/** Convert to OBS overlay format (JSON). */
	FString ToOverlayJson() const
	{
		return FString::Printf(TEXT(
			"{\"killer\":\"%s\",\"victim\":\"%s\",\"weapon\":\"%s\","
			"\"time\":%.2f,\"multi\":%d,\"headshot\":%s,\"zone\":\"%s\"}"),
			*KillerName, *VictimName, *WeaponName,
			Timestamp, MultiKillCount,
			bHeadshot ? TEXT("true") : TEXT("false"), *ZoneLabel);
	}
};

// ─── Tournament Bracket ───────────────────────────────────────────────────────

/**
 * FKhaaosTournamentMatch
 *
 * A single match in a tournament bracket.
 */
USTRUCT(BlueprintType)
struct FKhaaosTournamentMatch
{
	GENERATED_BODY()

	/** Match ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	int32 MatchId = 0;

	/** Round number. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	int32 Round = 0;

	/** Team/player A name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	FString TeamA;

	/** Team/player B name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	FString TeamB;

	/** Score for team A. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	int32 ScoreA = 0;

	/** Score for team B. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	int32 ScoreB = 0;

	/** Whether the match is complete. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	uint8 bComplete : 1 = false;

	/** Winner (A or B, empty if not complete). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Tournament")
	FString Winner;
};

// ─── Stream Delay Config ──────────────────────────────────────────────────────

/**
 * FKhaaosStreamDelayConfig
 *
 * Stream delay configuration for competitive integrity.
 * Prevents stream sniping by adding delay to spectator views.
 */
USTRUCT(BlueprintType)
struct FKhaaosStreamDelayConfig
{
	GENERATED_BODY()

	/** Stream delay in seconds (0 = no delay). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Delay")
	float DelaySeconds = 0.0f;

	/** Minimum delay for competitive matches. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Delay")
	float MinCompetitiveDelay = 30.0f;

	/** Whether to enforce delay in competitive modes. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Delay")
	uint8 bEnforceCompetitiveDelay : 1 = true;

	/** Whether to show delay notification to spectators. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Delay")
	uint8 bShowDelayNotification : 1 = true;

	/** Get effective delay for a given competitive mode. */
	float GetEffectiveDelay(bool bIsCompetitive) const
	{
		if (bIsCompetitive && bEnforceCompetitiveDelay)
		{
			return FMath::Max(DelaySeconds, MinCompetitiveDelay);
		}
		return DelaySeconds;
	}
};

// ─── Auto-Highlight Config ────────────────────────────────────────────────────

/**
 * FKhaaosAutoHighlightConfig
 *
 * Configuration for automatic highlight/clip generation.
 * Triggers on multi-kills, clutch plays, etc.
 */
USTRUCT(BlueprintType)
struct FKhaaosAutoHighlightConfig
{
	GENERATED_BODY()

	/** Minimum multi-kill count to trigger highlight (e.g., 3 = triple kill). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Highlight")
	int32 MultiKill4Trigger = 4;

	/** Whether to clip on clutch plays (last player standing wins). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Highlight")
	uint8 bClipOnClutch : 1 = true;

	/** Whether to clip on zone-close escapes. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Highlight")
	uint8 bClipOnZoneEscape : 1 = true;

	/** Clip duration in seconds (before + after the event). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Highlight")
	float ClipDurationSeconds = 15.0f;

	/** Pre-event buffer (seconds before the event to include). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Highlight")
	float PreEventBufferSeconds = 5.0f;

	/** Maximum clips per match. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Highlight")
	int32 MaxClipsPerMatch = 10;
};

// ─── OBS WebSocket Message ────────────────────────────────────────────────────

/**
 * FKhaaosOBSMessage
 *
 * Message structure for OBS WebSocket communication.
 */
USTRUCT(BlueprintType)
struct FKhaaosOBSMessage
{
	GENERATED_BODY()

	/** Message type (event name). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|OBS")
	FString MessageType;

	/** JSON payload. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|OBS")
	FString Payload;

	/** Convert to full OBS WebSocket message format. */
	FString ToOBSJson() const
	{
		return FString::Printf(TEXT(
			"{\"op\":6,\"d\":{\"requestType\":\"%s\",\"requestId\":\"khaaos_%s\",\"requestData\":%s}}"),
			*MessageType, *MessageType, *Payload);
	}
};

// ─── Streamer HUD Config ──────────────────────────────────────────────────────

/**
 * FKhaaosStreamerHUDConfig
 *
 * Configuration for the streamer-friendly HUD overlay.
 * Clean, minimal design that looks good on stream.
 */
USTRUCT(BlueprintType)
struct FKhaaosStreamerHUDConfig
{
	GENERATED_BODY()

	/** Whether to show player count. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bShowPlayerCount : 1 = true;

	/** Whether to show kill feed. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bShowKillFeed : 1 = true;

	/** Whether to show zone timer. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bShowZoneTimer : 1 = true;

	/** Whether to show minimap. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bShowMinimap : 1 = true;

	/** Whether to show player stats (K/D, health). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bShowPlayerStats : 1 = true;

	/** Whether to show tournament bracket. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bShowTournamentBracket : 1 = false;

	/** HUD opacity (0.0 - 1.0). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	float Opacity = 0.85f;

	/** HUD position (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	int32 Position = 0;

	/** Whether to use stream-safe colors (high contrast). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|HUD")
	uint8 bStreamSafeColors : 1 = true;
};

// ─── Clip/Screenshot Record ───────────────────────────────────────────────────

/**
 * FKhaaosClipRecord
 *
 * Record of an auto-generated clip or screenshot.
 */
USTRUCT(BlueprintType)
struct FKhaaosClipRecord
{
	GENERATED_BODY()

	/** Clip ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Clip")
	FString ClipId;

	/** Player who made the play+ play. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Clip")
	FString PlayerId;

	/** Event type (multi_kill, clutch, zone_escape). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Clip")
	FString EventType;

	/** Game time when the event occurred. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Clip")
	float GameTime = 0.0f;

	/** Clip duration in seconds. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Clip")
	float DurationSeconds = 0.0f;

	/** Timestamp when the clip was created. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming|Clip")
	FString CreatedAt;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a kill feed entry is added. */
DECLARE_DELEGATE_OneParam(FOnKillFeedEntry, const FKhaaosKillFeedEntry&);

/** Broadcast when an auto-highlight clip is created. */
DECLARE_DELEGATE_OneParam(FOnAutoHighlight, const FKhaaosClipRecord&);

/** Broadcast when spectator camera mode changes. */
DECLARE_DELEGATE_OneParam(FOnSpectatorCameraChanged, EKhaaosSpectatorCameraMode);

// ── Streaming Integration Subsystem ───────────────────────────────────────────

/**
 * UKhaaosStreamingIntegration
 *
 * Integration with streaming platforms for Khaaos Run: Twitch, YouTube, Kick.
 *
 * Features (all gated by KhaaosFeatureFlags):
 *   - Spectator mode with streamer-specific camera
 *   - OBS integration (game state broadcast via WebSocket)
 *   - Kill feed overlay for streams
 *   - Tournament bracket display
 *   - Stream delay configuration (competitive integrity)
 *   - Streamer HUD (clean, minimal, stream-friendly)
 *   - Clip/screenshot system (auto-highlight on multi-kill)
 *
 * Feature Flags:
 *   - Streaming.SpectatorMode
 *   - Streaming.OBSIntegration
 *   - Streaming.KillFeedOverlay
 *   - Streaming.TournamentBrackets
 *   - Streaming.StreamDelay
 *   - Streaming.StreamerHUD
 *   - Streaming.AutoHighlight
 *
 * Usage:
 *   auto* Stream = GetGameInstance()->GetSubsystem<UKhaaosStreamingIntegration>();
 *   Stream->SetSpectatorCameraMode(EKhaaosSpectatorCameraMode::AutoFollow);
 *   Stream->BroadcastKillFeed(KillEntry);
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(meta=(DisplayName="Khaaos Streaming Integration"))
class KHAAOSRUN_API UKhaaosStreamingIntegration : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	UKhaaosStreamingIntegration();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Spectator Mode ─────────────────────────────────────────────────────

	/** Set the spectator camera mode. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void SetSpectatorCameraMode(EKhaaosSpectatorCameraMode Mode);

	/** Get the current spectator camera mode. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	EKhaaosSpectatorCameraMode GetSpectatorCameraMode() const;

	/** Follow a specific player by ID. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void FollowPlayer(const FString& PlayerId);

	/** Set the auto-follow criteria (most kills, zone edge, etc.). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void SetAutoFollowCriteria(bool bPrioritizeKills, bool bPrioritizeZoneEdge);

	// ─── OBS Integration ────────────────────────────────────────────────────

	/** Connect to OBS WebSocket server. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	bool ConnectToOBS(const FString& Host, int32 Port, const FString& Password = TEXT(""));

	/** Disconnect from OBS WebSocket. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void DisconnectFromOBS();

	/** Whether connected to OBS. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	bool IsOBSConnected() const;

	/**
	 * Broadcast current game state to OBS via WebSocket.
	 * Called periodically to update overlay data.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void BroadcastGameState();

	/**
	 * Send a custom message to OBS WebSocket.
	 * For advanced OBS source control (scene switching, etc.).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void SendOBSMessage(const FString& MessageType, const FString& Payload);

	// ─── Kill Feed ──────────────────────────────────────────────────────────

	/**
	 * Add an entry to the kill feed and broadcast to OBS overlay.
	 * Triggers auto-highlight if multi-kill threshold is met.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void AddKillFeedEntry(const FKhaaosKillFeedEntry& Entry);

	/** Get recent kill feed entries (for HUD display). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	TArray<FKhaaosKillFeedEntry> GetRecentKillFeed(int32 Count = 10) const;

	/** Clear the kill feed (new match). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void ClearKillFeed();

	// ─── Tournament Brackets ────────────────────────────────────────────────

	/** Set the tournament bracket matches. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void SetTournamentBracket(const TArray<FKhaaosTournamentMatch>& Matches);

	/** Update a match result in the bracket. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void UpdateMatchResult(int32 MatchId, int32 ScoreA, int32 ScoreB);

	/** Get the current tournament bracket. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	TArray<FKhaaosTournamentMatch> GetTournamentBracket() const;

	/** Broadcast bracket update to OBS overlay. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void BroadcastBracketUpdate();

	// ─── Stream Delay ───────────────────────────────────────────────────────

	/** Set the stream delay in seconds. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void SetStreamDelay(float DelaySeconds);

	/** Get the effective stream delay for the current match type. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	float GetEffectiveStreamDelay(bool bIsCompetitive) const;

	/** Get stream delay configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	FKhaaosStreamDelayConfig GetStreamDelayConfig() const;

	// ─── Streamer HUD ───────────────────────────────────────────────────────

	/** Get streamer HUD configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	FKhaaosStreamerHUDConfig GetStreamerHUDConfig() const;

	/** Update streamer HUD configuration. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void SetStreamerHUDConfig(const FKhaaosStreamerHUDConfig& Config);

	/** Generate HUD data as JSON for OBS browser source. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	FString GenerateHUDJson() const;

	// ─── Auto-Highlight / Clips ─────────────────────────────────────────────

	/**
	 * Trigger an auto-highlight clip.
	 * Called when a multi-kill, clutch, or notable event occurs.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void TriggerAutoHighlight(const FString& PlayerId, const FString& EventType);

	/** Get clips generated this match. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Streaming")
	TArray<FKhaaosClipRecord> GetMatchClips() const;

	/** Take a screenshot (manual or triggered). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Streaming")
	void TakeScreenshot(const FString& Label = TEXT(""));

	// ─── State ──────────────────────────────────────────────────────────────

	/** Current spectator camera mode. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	EKhaaosSpectatorCameraMode CurrentCameraMode = EKhaaosSpectatorCameraMode::AutoFollow;

	/** Whether OBS is connected. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	uint8 bOBSConnected : 1 = false;

	/** Current streaming platform (detected or set). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	EKhaaosStreamingPlatform ActivePlatform = EKhaaosStreamingPlatform::Unknown;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Stream delay configuration. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	FKhaaosStreamDelayConfig StreamDelayConfig;

	/** Streamer HUD configuration. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	FKhaaosStreamerHUDConfig HUDConfig;

	/** Auto-highlight configuration. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	FKhaaosAutoHighlightConfig HighlightConfig;

	/** OBS WebSocket host. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	FString OBSHost = TEXT("localhost");

	/** OBS WebSocket port. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	int32 OBSPort = 4455;

	/** Kill feed maximum entries to keep. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Streaming")
	int32 KillFeedMaxEntries = 50;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when a kill feed entry is added. */
	FOnKillFeedEntry OnKillFeedEntry;

	/** Broadcast when an auto-highlight is triggered. */
	FOnAutoHighlight OnAutoHighlight;

	/** Broadcast when spectator camera mode changes. */
	FOnSpectatorCameraChanged OnSpectatorCameraChanged;

private:

	/** Kill feed entries (ring buffer). */
	UPROPERTY()
	TArray<FKhaaosKillFeedEntry> KillFeedEntries;

	/** Tournament bracket matches. */
	UPROPERTY()
	TArray<FKhaaosTournamentMatch> TournamentMatches;

	/** Clips generated this match. */
	UPROPERTY()
	TArray<FKhaaosClipRecord> MatchClips;

	/** Player being followed (for FollowPlayer mode). */
	UPROPERTY()
	FString FollowedPlayerId;

	/** Auto-follow criteria. */
	uint8 bAutoFollowPrioritizeKills : 1 = true;
	uint8 bAutoFollowPrioritizeZoneEdge : 1 = false;

	/** Multi-kill tracking per player (PlayerId → recent kill count). */
	TMap<FString, int32> PlayerMultiKillTracker;

	/** Multi-kill reset timer handles per player. */
	TMap<FString, FTimerHandle> MultiKillResetTimers;

	/** Timer for periodic OBS state broadcast. */
	FTimerHandle OBSBroadcastTimer;

	/** Clip counter for unique IDs. */
	int32 ClipCounter = 0;

	// ─── Internal Methods ───────────────────────────────────────────────────

	/** Check if a streaming feature is enabled via feature flags. */
	bool IsStreamingFeatureEnabled(const FString& FlagName) const;

	/** Check multi-kill conditions and trigger highlight if met. */
	void CheckMultiKillHighlight(const FKhaaosKillFeedEntry& Entry);

	/** Build the game state JSON for OBS broadcast. */
	FString BuildGameStateJson() const;

	/** Build the kill feed JSON for OBS overlay. */
	FString BuildKillFeedJson(int32 MaxEntries = 10) const;

	/** Build tournament bracket JSON for OBS overlay. */
	FString BuildBracketJson() const;

	/** Reset multi-kill counter for a player (called after timeout). */
	void ResetMultiKillCounter(const FString& PlayerId);

	/** Get current ISO 8601 timestamp. */
	FString GetIsoTimestamp() const;
};
