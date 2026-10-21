// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Cinematic/KhaaosCinematicSystem.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosCinematicSystem::UKhaaosCinematicSystem()
{
        bIsPlaying = false;
        bCanSkip = true;
        CurrentCinematicType = EKhaaosCinematicType::MatchIntro;
        ElapsedTime = 0.0f;
        CurrentShotIndex = 0;
        bTrailerModeActive = false;
}

// ─── Playback ───────────────────────────────────────────────────────────────────

void UKhaaosCinematicSystem::PlayCinematic(EKhaaosCinematicType Type, const FString& TargetPlayerEosId)
{
        if (bIsPlaying) return;

        bIsPlaying = true;
        bCanSkip = true;
        CurrentCinematicType = Type;
        TargetPlayerId = TargetPlayerEosId;
        ElapsedTime = 0.0f;
        CurrentShotIndex = 0;

        // Get total duration
        float TotalDuration = IntroDuration;
        switch (Type)
        {
        case EKhaaosCinematicType::MatchIntro:    TotalDuration = IntroDuration; break;
        case EKhaaosCinematicType::Victory:        TotalDuration = VictoryDuration; break;
        case EKhaaosCinematicType::Top5:           TotalDuration = 4.0f; break;
        case EKhaaosCinematicType::WorldTransition: TotalDuration = TransitionDuration; break;
        case EKhaaosCinematicType::PulsoEvent:     TotalDuration = 2.5f; break;
        case EKhaaosCinematicType::Airdrop:        TotalDuration = 2.0f; break;
        case EKhaaosCinematicType::SeasonEnd:      TotalDuration = 5.0f; break;
        case EKhaaosCinematicType::Trailer:        TotalDuration = 0.0f; break; // Infinite
        default: break;
        }

        OnCinematicStarted.Broadcast(Type, TotalDuration);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Playing cinematic type=%d for %s (%.1fs)"),
                (int32)Type, *TargetPlayerEosId, TotalDuration);
}

void UKhaaosCinematicSystem::SkipCinematic()
{
        if (!bIsPlaying || !bCanSkip) return;

        const EKhaaosCinematicType Type = CurrentCinematicType;

        bIsPlaying = false;
        bCanSkip = false;
        ElapsedTime = 0.0f;

        OnCinematicComplete.Broadcast(Type);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Skipped cinematic type=%d"), (int32)Type);
}

// ─── Victory Poses ──────────────────────────────────────────────────────────────

void UKhaaosCinematicSystem::PlayVictorySequence(const FString& WinnerEosId, EKhaaosVictoryPose Pose)
{
        PlayCinematic(EKhaaosCinematicType::Victory, WinnerEosId);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Victory sequence - %s, pose=%d"),
                *WinnerEosId, (int32)Pose);
}

void UKhaaosCinematicSystem::PlayTop5Highlight(const TArray<FString>& Top5PlayerIds)
{
        PlayCinematic(EKhaaosCinematicType::Top5, Top5PlayerIds.Num() > 0 ? Top5PlayerIds[0] : TEXT(""));

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Top 5 highlight - %d players"), Top5PlayerIds.Num());
}

// ─── Trailer Mode ───────────────────────────────────────────────────────────────

void UKhaaosCinematicSystem::EnableTrailerMode()
{
        if (bTrailerModeActive) return;

        bTrailerModeActive = true;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Trailer mode enabled (free camera, DOF, color grading)"));
}

void UKhaaosCinematicSystem::DisableTrailerMode()
{
        bTrailerModeActive = false;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Trailer mode disabled"));
}

void UKhaaosCinematicSystem::SetTimeOfDay(float Hour)
{
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCinematicSystem: Time of day = %.1fh"), Hour);
}

void UKhaaosCinematicSystem::SetSlowMotion(float Factor)
{
        const float ClampedFactor = FMath::Clamp(Factor, 0.1f, 1.0f);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCinematicSystem: Slow motion = %.2fx"), ClampedFactor);
}

// ─── Shot Sequences ─────────────────────────────────────────────────────────────

TArray<FKhaaosCinematicShot> UKhaaosCinematicSystem::GetCinematicShots(EKhaaosCinematicType Type) const
{
        const TArray<FKhaaosCinematicShot>* Found = ShotLibrary.Find(Type);
        return Found ? *Found : TArray<FKhaaosCinematicShot>();
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UKhaaosCinematicSystem::BuildShotLibrary()
{
        // Match Intro: 3 shots (wide → medium → close-up)
        {
                TArray<FKhaaosCinematicShot> Shots;

                FKhaaosCinematicShot Shot1;
                Shot1.Duration = 1.5f;
                Shot1.FOV = 60.0f;
                Shot1.DOFAperture = 2.8f;
                Shots.Add(Shot1);

                FKhaaosCinematicShot Shot2;
                Shot2.Duration = 1.5f;
                Shot2.FOV = 45.0f;
                Shot2.DOFAperture = 1.4f;
                Shots.Add(Shot2);

                FKhaaosCinematicShot Shot3;
                Shot3.Duration = 1.0f;
                Shot3.FOV = 35.0f;
                Shot3.DOFAperture = 1.0f;
                Shots.Add(Shot3);

                ShotLibrary.Add(EKhaaosCinematicType::MatchIntro, Shots);
        }

        // Victory: 4 shots (close-up → orbit → pull back → final wide)
        {
                TArray<FKhaaosCinematicShot> Shots;

                FKhaaosCinematicShot Shot1;
                Shot1.Duration = 2.0f;
                Shot1.FOV = 35.0f;
                Shot1.DOFAperture = 1.0f;
                Shots.Add(Shot1);

                FKhaaosCinematicShot Shot2;
                Shot2.Duration = 2.0f;
                Shot2.FOV = 50.0f;
                Shot2.DOFAperture = 2.0f;
                Shots.Add(Shot2);

                FKhaaosCinematicShot Shot3;
                Shot3.Duration = 1.5f;
                Shot3.FOV = 70.0f;
                Shot3.DOFAperture = 4.0f;
                Shots.Add(Shot3);

                FKhaaosCinematicShot Shot4;
                Shot4.Duration = 0.5f;
                Shot4.FOV = 90.0f;
                Shot4.DOFAperture = 8.0f;
                Shots.Add(Shot4);

                ShotLibrary.Add(EKhaaosCinematicType::Victory, Shots);
        }
}
