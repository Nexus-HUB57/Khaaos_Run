// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosMatchTimeline.generated.h"

// ─── Timeline Event Type Enum ──────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosTimelineEventType : uint8
{
    PlayerJoined       UMETA(DisplayName = "PLAYER_JOINED"),
    PlayerEliminated   UMETA(DisplayName = "PLAYER_ELIMINATED"),
    ZonePhaseChanged   UMETA(DisplayName = "ZONE_PHASE_CHANGED"),
    AirdropLanded      UMETA(DisplayName = "AIRDROP_LANDED"),
    PulsoTriggered     UMETA(DisplayName = "PULSO_TRIGGERED"),
    WorldTransition    UMETA(DisplayName = "WORLD_TRANSITION"),
    MatchStart         UMETA(DisplayName = "MATCH_START"),
    MatchEnd           UMETA(DisplayName = "MATCH_END"),
    Revive             UMETA(DisplayName = "REVIVE"),
    SpeciesSelected    UMETA(DisplayName = "SPECIES_SELECTED")
};

// ─── Timeline Event Struct ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosTimelineEvent
{
    GENERATED_BODY()

    /** Time since match start when this event occurred. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Timeline")
    float Timestamp = 0.0f;

    /** Type of event. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Timeline")
    EKhaaosTimelineEventType EventType = EKhaaosTimelineEventType::PlayerJoined;

    /** Human-readable description. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Timeline")
    FString Description;

    /** Arbitrary key-value data attached to this event
     *  (e.g. PlayerId, Weapon, Damage, WorldName, ZonePhase). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Timeline")
    TMap<FName, FString> Data;
};

// ─── Match Timeline Component ─────────────────────────────────────────────────
// Records match events for replay, results screen, and API integration.
// Auto-trims oldest events when exceeding MaxEvents (default 1000).
// Provides JSON serialization for EconomyBridge/API bridge integration.
// ═══════════════════════════════════════════════════════════════════════════════

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnTimelineEventRecorded, const FKhaaosTimelineEvent&, Event);

UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosMatchTimelineComponent : public UActorComponent
{
    GENERATED_BODY()

public:

    UKhaaosMatchTimelineComponent();

    // ─── Event Recording ────────────────────────────────────────────────────

    /** Record a new event to the timeline. Assigns current match time as
     *  Timestamp if not already set. Auto-trims oldest events over MaxEvents. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Timeline")
    void RecordEvent(FKhaaosTimelineEvent Event);

    /** Get all events within a time range [StartTime, EndTime]. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Timeline")
    TArray<FKhaaosTimelineEvent> GetEventsInRange(float StartTime, float EndTime) const;

    /** Get all recorded events (read-only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Timeline")
    const TArray<FKhaaosTimelineEvent>& GetAllEvents() const;

    /** Build a formatted match summary string for the results screen.
     *  Includes: kills, survival time, damage dealt, final rank, species. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Timeline")
    FString GetMatchSummary() const;

    /** Serialize the entire timeline to JSON for replay/match history API.
     *  Used by EconomyBridge for post-match stats and cloud save. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Timeline")
    FString SerializeTimeline() const;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Maximum number of events to keep. Oldest events are auto-trimmed. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Timeline")
    int32 MaxEvents = 1000;

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast when a new event is recorded. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Timeline")
    FOnTimelineEventRecorded OnTimelineEventRecorded;

private:

    /** Ordered list of recorded events. */
    UPROPERTY()
    TArray<FKhaaosTimelineEvent> Events;

    /** Match start time for computing relative timestamps. */
    float MatchStartTime = 0.0f;
};
