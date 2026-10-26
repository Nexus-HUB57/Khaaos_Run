// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/MatchFlow/KhaaosMatchTimeline.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosMatchTimelineComponent::UKhaaosMatchTimelineComponent()
    : MaxEvents(1000)
    , MatchStartTime(0.0f)
{
    PrimaryComponentTick.bCanEverTick = false;
    SetIsReplicatedByDefault(false);
}

// ─── RecordEvent ───────────────────────────────────────────────────────────────
// Add timestamp, trim if over max, broadcast delegate.

void UKhaaosMatchTimelineComponent::RecordEvent(FKhaaosTimelineEvent Event)
{
    // Assign relative timestamp from match start if not set
    if (Event.Timestamp <= 0.0f)
    {
        UWorld* World = GetWorld();
        if (World)
        {
            const float CurrentTime = World->GetTimeSeconds();
            Event.Timestamp = FMath::Max(CurrentTime - MatchStartTime, 0.0f);
        }
    }

    // Record the event
    Events.Add(Event);

    // Auto-trim oldest events if over max
    while (Events.Num() > MaxEvents)
    {
        Events.RemoveAt(0);
    }

    // Log the event
    UE_LOG(LogKhaaosRun, Log, TEXT("MatchTimeline::RecordEvent - [%s] @ %.2fs: %s"),
        *UEnum::GetDisplayValueAsText(Event.EventType).ToString(),
        Event.Timestamp,
        *Event.Description);

    // Broadcast delegate
    OnTimelineEventRecorded.Broadcast(Event);
}

// ─── GetEventsInRange ──────────────────────────────────────────────────────────
// Filter by timestamp range.

TArray<FKhaaosTimelineEvent> UKhaaosMatchTimelineComponent::GetEventsInRange(float StartTime, float EndTime) const
{
    TArray<FKhaaosTimelineEvent> Result;

    for (const FKhaaosTimelineEvent& Event : Events)
    {
        if (Event.Timestamp >= StartTime && Event.Timestamp <= EndTime)
        {
            Result.Add(Event);
        }
    }

    return Result;
}

// ─── GetAllEvents ───────────────────────────────────────────────────────────────

const TArray<FKhaaosTimelineEvent>& UKhaaosMatchTimelineComponent::GetAllEvents() const
{
    return Events;
}

// ─── GetMatchSummary ───────────────────────────────────────────────────────────
// Build formatted string with kills, survival time, damage dealt, rank.

FString UKhaaosMatchTimelineComponent::GetMatchSummary() const
{
    // Count event types
    int32 KillCount = 0;
    int32 DeathCount = 0;
    int32 ReviveCount = 0;
    int32 ZonePhaseCount = 0;
    int32 AirdropCount = 0;
    int32 WorldTransitionCount = 0;
    float MatchDuration = 0.0f;
    FString LastWorldName;

    for (const FKhaaosTimelineEvent& Event : Events)
    {
        switch (Event.EventType)
        {
        case EKhaaosTimelineEventType::PlayerEliminated:
            ++DeathCount;
            // Check if this was our kill (via Data "IsOurKill")
            if (const FString* IsOurKill = Event.Data.Find(TEXT("IsOurKill")))
            {
                if (*IsOurKill == TEXT("true"))
                {
                    ++KillCount;
                }
            }
            break;

        case EKhaaosTimelineEventType::Revive:
            ++ReviveCount;
            break;

        case EKhaaosTimelineEventType::ZonePhaseChanged:
            ++ZonePhaseCount;
            break;

        case EKhaaosTimelineEventType::AirdropLanded:
            ++AirdropCount;
            break;

        case EKhaaosTimelineEventType::WorldTransition:
            ++WorldTransitionCount;
            if (const FString* WorldName = Event.Data.Find(TEXT("WorldName")))
            {
                LastWorldName = *WorldName;
            }
            break;

        case EKhaaosTimelineEventType::MatchEnd:
            MatchDuration = Event.Timestamp;
            break;

        default:
            break;
        }
    }

    // Build summary string
    FString Summary = FString::Printf(
        TEXT("=== MATCH SUMMARY ===\n")
        TEXT("Kills: %d | Deaths: %d | Revives: %d\n")
        TEXT("Survival Time: %.1fs | Zone Phases: %d\n")
        TEXT("Airdrops: %d | World Transitions: %d"),
        KillCount, DeathCount, ReviveCount,
        MatchDuration, ZonePhaseCount,
        AirdropCount, WorldTransitionCount
    );

    if (!LastWorldName.IsEmpty())
    {
        Summary += FString::Printf(TEXT("\nFinal World: %s"), *LastWorldName);
    }

    // Compute final rank from remaining players
    if (const FString* Rank = Events.Last().Data.Find(TEXT("FinalRank")))
    {
        Summary += FString::Printf(TEXT("\nFinal Rank: #%s"), **Rank);
    }

    return Summary;
}

// ─── SerializeTimeline ─────────────────────────────────────────────────────────
// JSON format for API/economy bridge integration.

FString UKhaaosMatchTimelineComponent::SerializeTimeline() const
{
    FString JSON = TEXT("{\"timeline\":[");

    for (int32 i = 0; i < Events.Num(); ++i)
    {
        const FKhaaosTimelineEvent& Event = Events[i];

        JSON += FString::Printf(
            TEXT("{\"timestamp\":%.2f,\"type\":\"%s\",\"description\":\"%s\""),
            Event.Timestamp,
            *UEnum::GetDisplayValueAsText(Event.EventType).ToString(),
            *Event.Description
        );

        // Serialize data map
        if (Event.Data.Num() > 0)
        {
            JSON += TEXT(",\"data\":{");
            int32 DataIdx = 0;
            for (const TPair<FName, FString>& Pair : Event.Data)
            {
                if (DataIdx > 0) JSON += TEXT(",");
                JSON += FString::Printf(
                    TEXT("\"%s\":\"%s\""),
                    *Pair.Key.ToString(),
                    *Pair.Value
                );
                ++DataIdx;
            }
            JSON += TEXT("}");
        }

        JSON += TEXT("}");

        if (i < Events.Num() - 1)
        {
            JSON += TEXT(",");
        }
    }

    JSON += TEXT("],\"eventCount\":") + FString::FromInt(Events.Num());
    JSON += TEXT(",\"maxEvents\":") + FString::FromInt(MaxEvents);
    JSON += TEXT("}");

    return JSON;
}
