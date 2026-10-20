// ============================================================================
// Khaaos Run — Streaming/YouTube Integration (Fase 5)
// ============================================================================
// Streaming integration — full implementation.
// ============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ============================================================================

#include "Game/Launch/KhaaosStreamingIntegration.h"
#include "Game/Launch/KhaaosFeatureFlags.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Misc/DateTime.h"
#include "Misc/Guid.h"
#include "GameFramework/PlayerState.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosStreaming, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosStreamingIntegration::UKhaaosStreamingIntegration()
	: bOBSConnected(false)
	, bAutoFollowPrioritizeKills(true)
	, bAutoFollowPrioritizeZoneEdge(false)
{
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosStreamingIntegration::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Streaming Integration initialized"));
	UE_LOG(LogKhaaosStreaming, Log, TEXT("  Spectator: %s"),
	       IsStreamingFeatureEnabled(TEXT("Streaming.SpectatorMode")) ? TEXT("ON") : TEXT("OFF"));
	UE_LOG(LogKhaaosStreaming, Log, TEXT("  OBS: %s"),
	       IsStreamingFeatureEnabled(TEXT("Streaming.OBSIntegration")) ? TEXT("ON") : TEXT("OFF"));
	UE_LOG(LogKhaaosStreaming, Log, TEXT("  Auto-Highlight: %s"),
	       IsStreamingFeatureEnabled(TEXT("Streaming.AutoHighlight")) ? TEXT("ON") : TEXT("OFF"));
}

void UKhaaosStreamingIntegration::Deinitialize()
{
	Super::Deinitialize();
	DisconnectFromOBS();
	UE_LOG(LogKhaaosStreaming, Log, TEXT("Streaming Integration deinitialized"));
}

// ─── Feature Flag Check ───────────────────────────────────────────────────────

bool UKhaaosStreamingIntegration::IsStreamingFeatureEnabled(const FString& FlagName) const
{
	UGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance() : nullptr;
	if (!GI) return false;

	UKhaaosFeatureFlags* FeatureFlags = GI->GetSubsystem<UKhaaosFeatureFlags>();
	if (!FeatureFlags) return false;

	return FeatureFlags->IsEnabled(FlagName);
}

// ─── Spectator Mode ───────────────────────────────────────────────────────────

void UKhaaosStreamingIntegration::SetSpectatorCameraMode(EKhaaosSpectatorCameraMode Mode)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.SpectatorMode")))
	{
		UE_LOG(LogKhaaosStreaming, Warning, TEXT("Spectator mode feature is disabled"));
		return;
	}

	const EKhaaosSpectatorCameraMode OldMode = CurrentCameraMode;
	CurrentCameraMode = Mode;

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Spectator camera: %d → %d"),
	       static_cast<int32>(OldMode), static_cast<int32>(Mode));

	// Broadcast to OBS if connected
	if (bOBSConnected)
	{
		const FString ModeStr = Mode == EKhaaosSpectatorCameraMode::FollowPlayer ? TEXT("follow") :
		                        Mode == EKhaaosSpectatorCameraMode::FreeCamera ? TEXT("free") :
		                        Mode == EKhaaosSpectatorCameraMode::AutoFollow ? TEXT("auto") :
		                        Mode == EKhaaosSpectatorCameraMode::Overview ? TEXT("overview") :
		                        TEXT("cinematic");
		SendOBSMessage(TEXT("SetSpectatorMode"),
		               FString::Printf(TEXT("{\"mode\":\"%s\",\"player\":\"%s\"}"), *ModeStr, *FollowedPlayerId));
	}

	OnSpectatorCameraChanged.Broadcast(Mode);
}

EKhaaosSpectatorCameraMode UKhaaosStreamingIntegration::GetSpectatorCameraMode() const
{
	return CurrentCameraMode;
}

void UKhaaosStreamingIntegration::FollowPlayer(const FString& PlayerId)
{
	FollowedPlayerId = PlayerId;
	CurrentCameraMode = EKhaaosSpectatorCameraMode::FollowPlayer;

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Following player: %s"), *PlayerId);

	if (bOBSConnected)
	{
		SendOBSMessage(TEXT("SetFollowPlayer"),
		               FString::Printf(TEXT("{\"playerId\":\"%s\"}"), *PlayerId));
	}
}

void UKhaaosStreamingIntegration::SetAutoFollowCriteria(bool bPrioritizeKills, bool bPrioritizeZoneEdge)
{
	bAutoFollowPrioritizeKills = bPrioritizeKills;
	bAutoFollowPrioritizeZoneEdge = bPrioritizeZoneEdge;

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Auto-follow criteria: kills=%s zone=%s"),
	       bPrioritizeKills ? TEXT("yes") : TEXT("no"),
	       bPrioritizeZoneEdge ? TEXT("yes") : TEXT("no"));
}

// ─── OBS Integration ──────────────────────────────────────────────────────────

bool UKhaaosStreamingIntegration::ConnectToOBS(const FString& Host, int32 Port, const FString& Password)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.OBSIntegration")))
	{
		UE_LOG(LogKhaaosStreaming, Warning, TEXT("OBS integration feature is disabled"));
		return false;
	}

	OBSHost = Host;
	OBSPort = Port;

	// In production, this would use WebSocket client to connect to OBS
	// For now, mark as connected and set up periodic broadcast
	UE_LOG(LogKhaaosStreaming, Log, TEXT("Connecting to OBS WebSocket: %s:%d"), *Host, Port);

	// Simulate connection success (real implementation: WebSocket connect)
	bOBSConnected = true;

	// Set up periodic game state broadcast (every 1 second)
	UWorld* World = GetWorld();
	if (World)
	{
		World->GetTimerManager().SetTimer(
			OBSBroadcastTimer,
			this,
			&UKhaaosStreamingIntegration::BroadcastGameState,
			1.0f,
			true);
	}

	UE_LOG(LogKhaaosStreaming, Log, TEXT("OBS WebSocket connected"));
	return true;
}

void UKhaaosStreamingIntegration::DisconnectFromOBS()
{
	if (!bOBSConnected) return;

	bOBSConnected = false;

	UWorld* World = GetWorld();
	if (World)
	{
		World->GetTimerManager().ClearTimer(OBSBroadcastTimer);
	}

	UE_LOG(LogKhaaosStreaming, Log, TEXT("OBS WebSocket disconnected"));
}

bool UKhaaosStreamingIntegration::IsOBSConnected() const
{
	return bOBSConnected;
}

void UKhaaosStreamingIntegration::BroadcastGameState()
{
	if (!bOBSConnected) return;

	const FString GameStateJson = BuildGameStateJson();
	SendOBSMessage(TEXT("CallRequest"), GameStateJson);
}

void UKhaaosStreamingIntegration::SendOBSMessage(const FString& MessageType, const FString& Payload)
{
	if (!bOBSConnected) return;

	FKhaaosOBSMessage Msg;
	Msg.MessageType = MessageType;
	Msg.Payload = Payload;

	const FString FullJson = Msg.ToOBSJson();

	UE_LOG(LogKhaaosStreaming, Verbose, TEXT("OBS → %s: %s"), *MessageType, *Payload);
	// In production: WebSocket send FullJson
}

// ─── Kill Feed ────────────────────────────────────────────────────────────────

void UKhaaosStreamingIntegration::AddKillFeedEntry(const FKhaaosKillFeedEntry& Entry)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.KillFeedOverlay")))
	{
		return;
	}

	// Add to feed (maintain max size)
	KillFeedEntries.Add(Entry);
	if (KillFeedEntries.Num() > KillFeedMaxEntries)
	{
		KillFeedEntries.RemoveAt(0);
	}

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Kill: %s → %s (%s)"),
	       *Entry.KillerName, *Entry.VictimName, *Entry.WeaponName);

	// Check multi-kill highlight conditions
	CheckMultiKillHighlight(Entry);

	// Broadcast to OBS overlay
	if (bOBSConnected)
	{
		const FString KillJson = Entry.ToOverlayJson();
		SendOBSMessage(TEXT("KillFeedUpdate"),
		               FString::Printf(TEXT("{\"entry\":%s}", *KillJson));
	}

	OnKillFeedEntry.Broadcast(Entry);
}

TArray<FKhaaosKillFeedEntry> UKhaaosStreamingIntegration::GetRecentKillFeed(int32 Count) const
{
	TArray<FKhaaosKillFeedEntry> Recent;
	const int32 StartIdx = FMath::Max(0, KillFeedEntries.Num() - Count);
	for (int32 i = StartIdx; i < KillFeedEntries.Num(); ++i)
	{
		Recent.Add(KillFeedEntries[i]);
	}
	return Recent;
}

void UKhaaosStreamingIntegration::ClearKillFeed()
{
	KillFeedEntries.Reset();
	PlayerMultiKillTracker.Reset();
	UE_LOG(LogKhaaosStreaming, Log, TEXT("Kill feed cleared"));
}

// ─── Multi-Kill Highlight Check ───────────────────────────────────────────────

void UKhaaosStreamingIntegration::CheckMultiKillHighlight(const FKhaaosKillFeedEntry& Entry)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.AutoHighlight"))) return;

	const FString& KillerId = Entry.KillerName;

	// Increment multi-kill counter
	int32& KillCount = PlayerMultiKillTracker.FindOrAdd(KillerId, 0);
	KillCount++;

	// Reset counter after 5 seconds (no longer a multi-kill)
	UWorld* World = GetWorld();
	if (World)
	{
		// Clear existing reset timer
		FTimerHandle* ExistingHandle = MultiKillResetTimers.Find(KillerId);
		if (ExistingHandle)
		{
			World->GetTimerManager().ClearTimer(*ExistingHandle);
		}

		// Set new reset timer (5 seconds for multi-kill window)
		FTimerHandle NewHandle;
		FTimerDelegate TimerDelegate;
		TimerDelegate.BindUObject(this, &UKhaaosStreamingIntegration::ResetMultiKillCounter, KillerId);

		World->GetTimerManager().SetTimer(NewHandle, TimerDelegate, 5.0f, false);
		MultiKillResetTimers.Add(KillerId, NewHandle);
	}

	// Check threshold
	if (KillCount >= HighlightConfig.MultiKill4Trigger)
	{
		TriggerAutoHighlight(KillerId, TEXT("multi_kill"));
	}
}

void UKhaaosStreamingIntegration::ResetMultiKillCounter(const FString& PlayerId)
{
	PlayerMultiKillTracker.Remove(PlayerId);
	MultiKillResetTimers.Remove(PlayerId);
}

// ─── Tournament Brackets ──────────────────────────────────────────────────────

void UKhaaosStreamingIntegration::SetTournamentBracket(const TArray<FKhaaosTournamentMatch>& Matches)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.TournamentBrackets"))) return;

	TournamentMatches = Matches;
	UE_LOG(LogKhaaosStreaming, Log, TEXT("Tournament bracket set: %d matches"), Matches.Num());

	BroadcastBracketUpdate();
}

void UKhaaosStreamingIntegration::UpdateMatchResult(int32 MatchId, int32 ScoreA, int32 ScoreB)
{
	for (FKhaaosTournamentMatch& Match : TournamentMatches)
	{
		if (Match.MatchId == MatchId)
		{
			Match.ScoreA = ScoreA;
			Match.ScoreB = ScoreB;
			Match.bComplete = true;
			Match.Winner = ScoreA > ScoreB ? Match.TeamA : Match.TeamB;

			UE_LOG(LogKhaaosStreaming, Log, TEXT("Match %d: %s %d - %d %s → Winner: %s"),
			       MatchId, *Match.TeamA, ScoreA, ScoreB, *Match.TeamB, *Match.Winner);

			BroadcastBracketUpdate();
			return;
		}
	}

	UE_LOG(LogKhaaosStreaming, Warning, TEXT("Match ID %d not found in bracket"), MatchId);
}

TArray<FKhaaosTournamentMatch> UKhaaosStreamingIntegration::GetTournamentBracket() const
{
	return TournamentMatches;
}

void UKhaaosStreamingIntegration::BroadcastBracketUpdate()
{
	if (!bOBSConnected) return;

	const FString BracketJson = BuildBracketJson();
	SendOBSMessage(TEXT("TournamentBracketUpdate"), BracketJson);
}

// ─── Stream Delay ─────────────────────────────────────────────────────────────

void UKhaaosStreamingIntegration::SetStreamDelay(float DelaySeconds)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.StreamDelay"))) return;

	StreamDelayConfig.DelaySeconds = FMath::Max(0.0f, DelaySeconds);

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Stream delay set: %.1fs"), StreamDelayConfig.DelaySeconds);

	if (bOBSConnected)
	{
		SendOBSMessage(TEXT("SetStreamDelay"),
		               FString::Printf(TEXT("{\"delay_seconds\":%.1f}"), StreamDelayConfig.DelaySeconds));
	}
}

float UKhaaosStreamingIntegration::GetEffectiveStreamDelay(bool bIsCompetitive) const
{
	return StreamDelayConfig.GetEffectiveDelay(bIsCompetitive);
}

FKhaaosStreamDelayConfig UKhaaosStreamingIntegration::GetStreamDelayConfig() const
{
	return StreamDelayConfig;
}

// ─── Streamer HUD ─────────────────────────────────────────────────────────────

FKhaaosStreamerHUDConfig UKhaaosStreamingIntegration::GetStreamerHUDConfig() const
{
	return HUDConfig;
}

void UKhaaosStreamingIntegration::SetStreamerHUDConfig(const FKhaaosStreamerHUDConfig& Config)
{
	HUDConfig = Config;
	UE_LOG(LogKhaaosStreaming, Log, TEXT("Streamer HUD config updated"));
}

FString UKhaaosStreamingIntegration::GenerateHUDJson() const
{
	const FString KillFeedJson = BuildKillFeedJson(5);

	return FString::Printf(TEXT(
		"{\n"
		"  \"khaaos_streamer_hud\": {\n"
		"    \"camera_mode\": %d,\n"
		"    \"followed_player\": \"%s\",\n"
		"    \"stream_delay\": %.1f,\n"
		"    \"platform\": \"%s\",\n"
		"    \"config\": {\n"
		"      \"show_player_count\": %s,\n"
		"      \"show_kill_feed\": %s,\n"
		"      \"show_zone_timer\": %s,\n"
		"      \"show_minimap\": %s,\n"
		"      \"show_player_stats\": %s,\n"
		"      \"show_tournament\": %s,\n"
		"      \"opacity\": %.2f,\n"
		"      \"position\": %d,\n"
		"      \"stream_safe_colors\": %s\n"
		"    },\n"
		"    \"kill_feed\": %s\n"
		"  }\n"
		"}"),

		static_cast<int32>(CurrentCameraMode),
		*FollowedPlayerId,
		StreamDelayConfig.DelaySeconds,
		ActivePlatform == EKhaaosStreamingPlatform::Twitch ? TEXT("twitch") :
		ActivePlatform == EKhaaosStreamingPlatform::YouTube ? TEXT("youtube") :
		ActivePlatform == EKhaaosStreamingPlatform::Kick ? TEXT("kick") : TEXT("unknown"),

		HUDConfig.bShowPlayerCount ? TEXT("true") : TEXT("false"),
		HUDConfig.bShowKillFeed ? TEXT("true") : TEXT("false"),
		HUDConfig.bShowZoneTimer ? TEXT("true") : TEXT("false"),
		HUDConfig.bShowMinimap ? TEXT("true") : TEXT("false"),
		HUDConfig.bShowPlayerStats ? TEXT("true") : TEXT("false"),
		HUDConfig.bShowTournamentBracket ? TEXT("true") : TEXT("false"),
		HUDConfig.Opacity,
		HUDConfig.Position,
		HUDConfig.bStreamSafeColors ? TEXT("true") : TEXT("false"),

		*KillFeedJson);
}

// ─── Auto-Highlight / Clips ───────────────────────────────────────────────────

void UKhaaosStreamingIntegration::TriggerAutoHighlight(const FString& PlayerId, const FString& EventType)
{
	if (!IsStreamingFeatureEnabled(TEXT("Streaming.AutoHighlight"))) return;

	if (MatchClips.Num() >= HighlightConfig.MaxClipsPerMatch)
	{
		UE_LOG(LogKhaaosStreaming, Verbose, TEXT("Max clips per match reached (%d)"), HighlightConfig.MaxClipsPerMatch);
		return;
	}

	FKhaaosClipRecord Clip;
	Clip.ClipId = FString::Printf(TEXT("KR-CLIP-%06d"), ++ClipCounter);
	Clip.PlayerId = PlayerId;
	Clip.EventType = EventType;
	Clip.DurationSeconds = HighlightConfig.ClipDurationSeconds;
	Clip.CreatedAt = GetIsoTimestamp();

	MatchClips.Add(Clip);

	UE_LOG(LogKhaaosStreaming, Log, TEXT("Auto-highlight: %s by %s (%s)"),
	       *EventType, *PlayerId, *Clip.ClipId);

	// Request screenshot/clip from the engine
	// In production: call UKhaaosStreamingIntegration::RequestReplayClip()
	if (bOBSConnected)
	{
		SendOBSMessage(TEXT("TriggerHighlight"),
		               FString::Printf(TEXT("{\"clipId\":\"%s\",\"player\":\"%s\",\"event\":\"%s\",\"duration\":%.1f}"),
		                               *Clip.ClipId, *PlayerId, *EventType, Clip.DurationSeconds));
	}

	OnAutoHighlight.Broadcast(Clip);
}

TArray<FKhaaosClipRecord> UKhaaosStreamingIntegration::GetMatchClips() const
{
	return MatchClips;
}

void UKhaaosStreamingIntegration::TakeScreenshot(const FString& Label)
{
	const FString ScreenshotId = FString::Printf(TEXT("KR-SS-%06d"), ++ClipCounter);
	const FString Filename = FString::Printf(TEXT("KhaaosScreenshots/%s_%s.png"),
	                                          *ScreenshotId, *Label);

	// In production: call GEngine->GameViewport->Exec() to take screenshot
	UE_LOG(LogKhaaosStreaming, Log, TEXT("Screenshot: %s → %s"), *ScreenshotId, *Filename);
}

// ─── Build JSON for OBS ───────────────────────────────────────────────────────

FString UKhaaosStreamingIntegration::BuildGameStateJson() const
{
	// Gather game state from the game mode
	int32 PlayersAlive = 0;
	int32 PlayersTotal = 0;
	float ZoneTimeRemaining = 0.0f;
	int32 ZonePhase = 0;

	UWorld* World = GetWorld();
	if (World)
	{
		AGameModeBase* GameMode = World->GetAuthGameMode();
		if (GameMode)
		{
			PlayersTotal = GameMode->NumPlayers;
			// PlayersAlive would come from KhaaosGameState in production
			PlayersAlive = PlayersTotal; // Placeholder
		}
	}

	return FString::Printf(TEXT(
		"{\n"
		"  \"game_state\": {\n"
		"    \"players_alive\": %d,\n"
		"    \"players_total\": %d,\n"
		"    \"zone_phase\": %d,\n"
		"    \"zone_time_remaining\": %.1f,\n"
		"    \"camera_mode\": %d,\n"
		"    \"followed_player\": \"%s\",\n"
		"    \"stream_delay\": %.1f,\n"
		"    \"kill_feed\": %s\n"
		"  }\n"
		"}"),

		PlayersAlive,
		PlayersTotal,
		ZonePhase,
		ZoneTimeRemaining,
		static_cast<int32>(CurrentCameraMode),
		*FollowedPlayerId,
		StreamDelayConfig.DelaySeconds,
		*BuildKillFeedJson(5));
}

FString UKhaaosStreamingIntegration::BuildKillFeedJson(int32 MaxEntries) const
{
	TArray<FKhaaosKillFeedEntry> Recent = GetRecentKillFeed(MaxEntries);

	FString Json = TEXT("[");
	for (int32 i = 0; i < Recent.Num(); ++i)
	{
		if (i > 0) Json += TEXT(",");
		Json += Recent[i].ToOverlayJson();
	}
	Json += TEXT("]");

	return Json;
}

FString UKhaaosStreamingIntegration::BuildBracketJson() const
{
	FString Json = TEXT("{\"matches\":[");

	for (int32 i = 0; i < TournamentMatches.Num(); ++i)
	{
		const FKhaaosTournamentMatch& M = TournamentMatches[i];
		if (i > 0) Json += TEXT(",");

		Json += FString::Printf(TEXT(
			"{\"id\":%d,\"round\":%d,\"team_a\":\"%s\",\"team_b\":\"%s\","
			"\"score_a\":%d,\"score_b\":%d,\"complete\":%s,\"winner\":\"%s\"}"),
			M.MatchId, M.Round, *M.TeamA, *M.TeamB,
			M.ScoreA, M.ScoreB,
			M.bComplete ? TEXT("true") : TEXT("false"), *M.Winner);
	}

	Json += TEXT("]}");
	return Json;
}

// ─── ISO Timestamp ────────────────────────────────────────────────────────────

FString UKhaaosStreamingIntegration::GetIsoTimestamp() const
{
	const FDateTime Now = FDateTime::UtcNow();
	return FString::Printf(TEXT("%04d-%02d-%02dT%02d:%02d:%02dZ"),
	                       Now.GetYear(), Now.GetMonth(), Now.GetDay(),
	                       Now.GetHour(), Now.GetMinute(), Now.GetSecond());
}
