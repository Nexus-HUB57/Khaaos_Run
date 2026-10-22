// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Coach/KhaaosCoachSystem.generated.h"

// ─── Coach Types ─────────────────────────────────────────────────────────────────

/**
 * EKhaaosCoachMode
 * Coaching/spectator analysis mode.
 */
UENUM(BlueprintType)
enum class EKhaaosCoachMode : uint8
{
        Inactive     UMETA(DisplayName = "INACTIVE"),
        LiveCoach    UMETA(DisplayName = "LIVE_COACH"),    // Real-time coaching during match
        ReplayReview UMETA(DisplayName = "REPLAY_REVIEW"), // Post-match replay analysis
        StatsCompare UMETA(DisplayName = "STATS_COMPARE")  // Compare stats between players
};

/**
 * FKhaaosCoachAnnotation
 * A timestamped annotation/pointer from coach.
 */
USTRUCT(BlueprintType)
struct FKhaaosCoachAnnotation
{
        GENERATED_BODY()

        /** Timestamp in replay (seconds). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float Timestamp = 0.0f;

        /** 3D world position of the annotation. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        FVector WorldPosition = FVector::ZeroVector;

        /** Text description. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        FString Description;

        /** Annotation type (tactical, warning, praise, tip). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        FString Type;
};

/**
 * FKhaaosPlayerStatsSnapshot
 * Snapshot of player stats for analysis.
 */
USTRUCT(BlueprintType)
struct FKhaaosPlayerStatsSnapshot
{
        GENERATED_BODY()

        /** Player EOS ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        FString PlayerEosId;

        /** Total kills. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        int32 Kills = 0;

        /** Total damage dealt. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float DamageDealt = 0.0f;

        /** Damage taken. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float DamageTaken = 0.0f;

        /** Headshot percentage. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float HeadshotPercent = 0.0f;

        /** Accuracy percentage. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float AccuracyPercent = 0.0f;

        /** Survival time (seconds). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float SurvivalTime = 0.0f;

        /** Distance traveled (cm). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        float DistanceTraveled = 0.0f;

        /** Loot collected count. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        int32 LootCollected = 0;

        /** Final placement. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        int32 Placement = 0;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnCoachModeChanged, EKhaaosCoachMode, NewMode, EKhaaosCoachMode, OldMode);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnAnnotationAdded, const FKhaaosCoachAnnotation&, Annotation);

/**
 * UKhaaosCoachSystem
 *
 * Coaching and replay analysis system for competitive improvement.
 *
 * Live Coaching:
 *   - Veteran player spectates beginner in real-time
 *   - Coach can place 3D markers (arrows, circles, text)
 *   - Coach voice channel: Private 1:1 VOIP
 *   - Ping system: Coach pings locations on student's minimap
 *   - Max 1 coach per student, max 3 students per coach
 *   - Coach badge: Visible in kill feed ("Coached by X")
 *   - XP bonus: Both get +10% XP when in coaching session
 *
 * Replay Review:
 *   - Post-match analysis with timeline markers
 *   - Annotations: Coach places timestamped notes
 *   - Heat map overlay: Show player movement, damage taken, loot path
 *   - Side-by-side: Compare player's match with pro's match
 *   - Slow motion: Review key moments at 0.25x speed
 *   - Sharing: Export analysis as shareable link
 *
 * Stats Comparison:
 *   - Compare stats between two players or vs average
 *   - Radar chart: Kills, Accuracy, Survival, Headshots, Distance
 *   - Trend: Show improvement over last 10 matches
 *   - Percentile: Where player ranks among all players
 *   - Suggestions: Auto-generated tips based on weak areas
 *
 * Free Fire Parity:
 *   - Spectate friend's match
 *   - Post-match stats comparison
 *   - Improvement suggestions
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosCoachSystem : public UActorComponent
{
        GENERATED_BODY()

public:

        UKhaaosCoachSystem();

        // ─── Coaching ──────────────────────────────────────────────────────────

        /** Start coaching a player. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Coach")
        bool StartCoaching(const FString& CoachEosId, const FString& StudentEosId);

        /** Stop coaching. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Coach")
        void StopCoaching();

        /** Add annotation (3D marker + text). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Coach")
        void AddAnnotation(const FVector& WorldPosition, const FString& Description, const FString& Type);

        /** Get all annotations. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Coach")
        const TArray<FKhaaosCoachAnnotation>& GetAnnotations() const { return Annotations; }

        /** Get current coach mode. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Coach")
        EKhaaosCoachMode CoachMode;

        // ─── Stats Analysis ────────────────────────────────────────────────────

        /** Capture stats snapshot for a player. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Coach")
        void CaptureStatsSnapshot(const FString& PlayerEosId);

        /** Compare stats between two players. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Coach")
        void CompareStats(const FString& PlayerA, const FString& PlayerB,
                FKhaaosPlayerStatsSnapshot& OutA, FKhaaosPlayerStatsSnapshot& OutB) const;

        /** Generate improvement suggestions. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Coach")
        TArray<FString> GenerateSuggestions(const FString& PlayerEosId) const;

        /** Get stats for a player. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Coach")
        FKhaaosPlayerStatsSnapshot GetPlayerStats(const FString& PlayerEosId) const;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Max students per coach. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Coach")
        int32 MaxStudentsPerCoach;

        /** XP bonus percentage for coaching. */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Coach")
        float CoachXPBonus;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Coach")
        FOnCoachModeChanged OnCoachModeChanged;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Coach")
        FOnAnnotationAdded OnAnnotationAdded;

private:

        /** Coach EOS ID. */
        FString CoachId;

        /** Student EOS ID. */
        FString StudentId;

        /** Annotations for current session. */
        TArray<FKhaaosCoachAnnotation> Annotations;

        /** Player stats snapshots. */
        TMap<FString, FKhaaosPlayerStatsSnapshot> PlayerStatsMap;

        /** Match time for annotation timestamps. */
        float CurrentMatchTime;
};
