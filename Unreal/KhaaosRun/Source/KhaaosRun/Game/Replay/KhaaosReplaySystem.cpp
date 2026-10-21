// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Replay/KhaaosReplaySystem.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosReplaySystem::UKhaaosReplaySystem()
{
        ReplayState = EKhaaosReplayState::Inactive;
        CurrentPlaybackTime = 0.0f;
        PlaybackSpeed = 1.0f;
        SpectatorMode = EKhaaosSpectatorMode::Directed;

        MaxReplaySizeMB = 50;
        KillCamDuration = 3.0f;
        MaxSavedReplays = 10;
}

// ─── Recording ──────────────────────────────────────────────────────────────────

void UKhaaosReplaySystem::StartRecording(const FString& MatchId)
{
        if (ReplayState == EKhaaosReplayState::Recording) return;

        RecordingMatchId = MatchId;
        Highlights.Empty();

        SetReplayState(EKhaaosReplayState::Recording);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplaySystem::StartRecording - Match: %s"), *MatchId);
}

void UKhaaosReplaySystem::StopRecording()
{
        if (ReplayState != EKhaaosReplayState::Recording) return;

        SetReplayState(EKhaaosReplayState::Inactive);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplaySystem::StopRecording - %d highlights saved"), Highlights.Num());
}

void UKhaaosReplaySystem::AddHighlight(const FString& Description, const FString& PlayerEosId, const FString& Type)
{
        FKhaaosReplayHighlight Highlight;
        Highlight.Timestamp = CurrentPlaybackTime;
        Highlight.Description = Description;
        Highlight.PlayerEosId = PlayerEosId;
        Highlight.Type = Type;

        Highlights.Add(Highlight);
        OnHighlightAdded.Broadcast(Highlight);

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosReplaySystem: Highlight at %.1fs - %s [%s]"),
                Highlight.Timestamp, *Description, *Type);
}

// ─── Playback ───────────────────────────────────────────────────────────────────

void UKhaaosReplaySystem::StartPlayback(const FString& ReplayId)
{
        SetReplayState(EKhaaosReplayState::Playing);
        CurrentPlaybackTime = 0.0f;
        PlaybackSpeed = 1.0f;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplaySystem::StartPlayback - Replay: %s"), *ReplayId);
}

void UKhaaosReplaySystem::PausePlayback()
{
        if (ReplayState == EKhaaosReplayState::Playing)
        {
                SetReplayState(EKhaaosReplayState::Paused);
        }
}

void UKhaaosReplaySystem::ResumePlayback()
{
        if (ReplayState == EKhaaosReplayState::Paused)
        {
                SetReplayState(EKhaaosReplayState::Playing);
        }
}

void UKhaaosReplaySystem::SetPlaybackSpeed(float Speed)
{
        // Clamp to valid speeds: 0.25, 0.5, 1, 2, 4, 8
        const TArray<float> ValidSpeeds = { 0.25f, 0.5f, 1.0f, 2.0f, 4.0f, 8.0f };
        float ClosestSpeed = 1.0f;
        float MinDiff = MAX_FLT;

        for (float S : ValidSpeeds)
        {
                const float Diff = FMath::Abs(Speed - S);
                if (Diff < MinDiff)
                {
                        MinDiff = Diff;
                        ClosestSpeed = S;
                }
        }

        PlaybackSpeed = ClosestSpeed;
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplaySystem: Playback speed = %.2fx"), PlaybackSpeed);
}

void UKhaaosReplaySystem::SeekToTime(float Timestamp)
{
        CurrentPlaybackTime = FMath::Max(0.0f, Timestamp);
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosReplaySystem: Seek to %.1fs"), CurrentPlaybackTime);
}

// ─── Spectator ──────────────────────────────────────────────────────────────────

void UKhaaosReplaySystem::SetSpectatorMode(EKhaaosSpectatorMode Mode)
{
        SpectatorMode = Mode;
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplaySystem: Spectator mode = %d"), (int32)Mode);
}

void UKhaaosReplaySystem::FollowPlayer(const FString& PlayerEosId)
{
        FollowTargetId = PlayerEosId;
        SpectatorMode = EKhaaosSpectatorMode::FollowPlayer;
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosReplaySystem: Following player %s"), *PlayerEosId);
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UKhaaosReplaySystem::SetReplayState(EKhaaosReplayState NewState)
{
        const EKhaaosReplayState OldState = ReplayState;
        ReplayState = NewState;

        if (NewState != OldState)
        {
                OnReplayStateChanged.Broadcast(NewState, OldState);
        }
}
