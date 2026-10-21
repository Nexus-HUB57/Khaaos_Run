// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Coach/KhaaosCoachSystem.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosCoachSystem::UKhaaosCoachSystem()
{
        CoachMode = EKhaaosCoachMode::Inactive;
        MaxStudentsPerCoach = 3;
        CoachXPBonus = 10.0f;
        CurrentMatchTime = 0.0f;
}

// ─── Coaching ───────────────────────────────────────────────────────────────────

bool UKhaaosCoachSystem::StartCoaching(const FString& CoachEosId, const FString& StudentEosId)
{
        if (CoachMode != EKhaaosCoachMode::Inactive)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosCoachSystem: Already in a coaching session"));
                return false;
        }

        CoachId = CoachEosId;
        StudentId = StudentEosId;
        Annotations.Empty();

        const EKhaaosCoachMode OldMode = CoachMode;
        CoachMode = EKhaaosCoachMode::LiveCoach;
        OnCoachModeChanged.Broadcast(CoachMode, OldMode);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCoachSystem: %s started coaching %s"), *CoachEosId, *StudentEosId);
        return true;
}

void UKhaaosCoachSystem::StopCoaching()
{
        if (CoachMode == EKhaaosCoachMode::Inactive) return;

        const EKhaaosCoachMode OldMode = CoachMode;
        CoachMode = EKhaaosCoachMode::Inactive;

        CoachId.Empty();
        StudentId.Empty();

        OnCoachModeChanged.Broadcast(CoachMode, OldMode);
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCoachSystem: Coaching session ended (%d annotations)"), Annotations.Num());
}

void UKhaaosCoachSystem::AddAnnotation(const FVector& WorldPosition, const FString& Description, const FString& Type)
{
        FKhaaosCoachAnnotation Annotation;
        Annotation.Timestamp = CurrentMatchTime;
        Annotation.WorldPosition = WorldPosition;
        Annotation.Description = Description;
        Annotation.Type = Type;

        Annotations.Add(Annotation);
        OnAnnotationAdded.Broadcast(Annotation);

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCoachSystem: Annotation at %.1fs - %s [%s]"),
                Annotation.Timestamp, *Description, *Type);
}

// ─── Stats Analysis ────────────────────────────────────────────────────────────

void UKhaaosCoachSystem::CaptureStatsSnapshot(const FString& PlayerEosId)
{
        FKhaaosPlayerStatsSnapshot Snapshot;
        Snapshot.PlayerEosId = PlayerEosId;

        PlayerStatsMap.Add(PlayerEosId, Snapshot);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCoachSystem: Stats captured for %s"), *PlayerEosId);
}

void UKhaaosCoachSystem::CompareStats(const FString& PlayerA, const FString& PlayerB,
        FKhaaosPlayerStatsSnapshot& OutA, FKhaaosPlayerStatsSnapshot& OutB) const
{
        const FKhaaosPlayerStatsSnapshot* FoundA = PlayerStatsMap.Find(PlayerA);
        const FKhaaosPlayerStatsSnapshot* FoundB = PlayerStatsMap.Find(PlayerB);

        OutA = FoundA ? *FoundA : FKhaaosPlayerStatsSnapshot();
        OutB = FoundB ? *FoundB : FKhaaosPlayerStatsSnapshot();
}

TArray<FString> UKhaaosCoachSystem::GenerateSuggestions(const FString& PlayerEosId) const
{
        TArray<FString> Suggestions;

        const FKhaaosPlayerStatsSnapshot* Found = PlayerStatsMap.Find(PlayerEosId);
        if (!Found) return Suggestions;

        if (Found->HeadshotPercent < 15.0f)
        {
                Suggestions.Add(TEXT("Practice aiming for the head - your headshot rate is below 15%"));
        }
        if (Found->AccuracyPercent < 20.0f)
        {
                Suggestions.Add(TEXT("Control your fire rate - accuracy is below 20%, try burst firing"));
        }
        if (Found->SurvivalTime < 300.0f)
        {
                Suggestions.Add(TEXT("Focus on positioning - you are surviving less than 5 minutes on average"));
        }
        if (Found->LootCollected < 5)
        {
                Suggestions.Add(TEXT("Loot more aggressively early - you are entering fights undergeared"));
        }
        if (Found->DamageTaken > Found->DamageDealt * 2.0f)
        {
                Suggestions.Add(TEXT("Take cover more often - you are taking twice the damage you deal"));
        }

        if (Found->Kills >= 5)
        {
                Suggestions.Add(TEXT("Good kill count! Focus on surviving longer to convert kills into wins"));
        }

        if (Suggestions.Num() == 0)
        {
                Suggestions.Add(TEXT("Your stats look balanced - keep practicing to climb the ranked ladder!"));
        }

        return Suggestions;
}

FKhaaosPlayerStatsSnapshot UKhaaosCoachSystem::GetPlayerStats(const FString& PlayerEosId) const
{
        const FKhaaosPlayerStatsSnapshot* Found = PlayerStatsMap.Find(PlayerEosId);
        return Found ? *Found : FKhaaosPlayerStatsSnapshot();
}
