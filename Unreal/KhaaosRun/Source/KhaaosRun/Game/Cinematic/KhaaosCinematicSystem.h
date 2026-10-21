// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Cinematic/KhaaosCinematicSystem.generated.h"

// ─── Cinematic Types ────────────────────────────────────────────────────────────

/**
 * EKhaaosCinematicType
 * Types of in-game cinematics.
 */
UENUM(BlueprintType)
enum class EKhaaosCinematicType : uint8
{
        MatchIntro     UMETA(DisplayName = "MATCH_INTRO"),     // Species drop-in intro
        Victory        UMETA(DisplayName = "VICTORY"),         // Winner celebration
        Top5           UMETA(DisplayName = "TOP_5"),           // Top 5 highlight
        WorldTransition UMETA(DisplayName = "WORLD_TRANSITION"), // World switch cinematic
        PulsoEvent     UMETA(DisplayName = "PULSO_EVENT"),     // Pulso Khaaos activation
        Airdrop        UMETA(DisplayName = "AIRDROP"),         // Supply drop incoming
        SeasonEnd      UMETA(DisplayName = "SEASON_END"),      // Season wrap-up
        Trailer        UMETA(DisplayName = "TRAILER")          // Trailer recording mode
};

/**
 * EKhaaosVictoryPose
 * Victory celebration animations per species.
 */
UENUM(BlueprintType)
enum class EKhaaosVictoryPose : uint8
{
        Default        UMETA(DisplayName = "DEFAULT"),
        ZheersDominion UMETA(DisplayName = "ZHEERS_DOMINION"),
        OnithAscend    UMETA(DisplayName = "ONITH_ASCEND"),
        SkeetwStrike   UMETA(DisplayName = "SKEETW_STRIKE"),
        HuranFury      UMETA(DisplayName = "HURAN_FURY"),
        VenexShadow    UMETA(DisplayName = "VENEX_SHADOW"),
        KhaelAwaken    UMETA(DisplayName = "KHAEL_AWAKEN")
};

/**
 * FKhaaosCinematicShot
 * A single shot in a cinematic sequence.
 */
USTRUCT(BlueprintType)
struct FKhaaosCinematicShot
{
        GENERATED_BODY()

        /** Shot duration (seconds). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float Duration = 2.0f;

        /** Camera start position. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        FVector CameraStart = FVector::ZeroVector;

        /** Camera end position. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        FVector CameraEnd = FVector::ZeroVector;

        /** Look-at target (player EOS ID or empty for world point). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        FString LookAtTarget;

        /** FOV. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float FOV = 90.0f;

        /** Depth of field aperture. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float DOFAperture = 2.8f;

        /** Post-process material override. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        FString PostProcessMaterial;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnCinematicStarted, EKhaaosCinematicType, Type, float, Duration);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnCinematicComplete, EKhaaosCinematicType, Type);

/**
 * UKhaaosCinematicSystem
 *
 * In-game cinematics, victory sequences, and trailer recording.
 *
 * Match Intro:
 *   - Species-specific drop-in sequence (3-5s)
 *   - Camera: Orbit + zoom on player's character
 *   - VFX: Species aura, particle burst, screen flash
 *   - Audio: Species theme sting (1s)
 *   - Skip: Press any button to skip (console requirement)
 *
 * Victory Sequence:
 *   - Winner celebration (5-8s)
 *   - Species-specific victory poses (7 unique)
 *   - Camera: Slow orbit, depth of field, bloom
 *   - VFX: Confetti, species particles, sky flare
 *   - UI: Placement overlay, stats summary, KRC earned
 *   - Top 5: Separate highlight for top 5 players
 *
 */ World Transition:
 *   - Cinematic between worlds (3-4s)
 *   - Camera: Pull back → show portal → enter portal → emerge new world
 *   - VFX: Portal vortex, world-specific atmosphere
 *   - Audio: Transition music sting
 *
 * Trailer Mode:
 *   - Free camera for content creation
 *   - Depth of field, color grading, time of day control
 *   - Record to video (console share button)
 *   - Director mode: Auto-switch cameras based on action
 *   - Slow motion: 0.1x for dramatic moments
 *   - Camera paths: Bezier spline camera movement
 *
 * Free Fire Parity:
 *   - Match intro with character showcase
 *   - Victory pose/emote on win
 *   - Cinematic camera transitions
 *   - Replay clip sharing
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosCinematicSystem : public UActorComponent
{
        GENERATED_BODY()

public:

        UKhaaosCinematicSystem();

        // ─── Playback ─────────────────────────────────────────────────────────

        /** Play a cinematic of the given type. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic")
        void PlayCinematic(EKhaaosCinematicType Type, const FString& TargetPlayerEosId);

        /** Skip current cinematic. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic")
        void SkipCinematic();

        /** Is a cinematic currently playing? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        uint8 bIsPlaying : 1;

        /** Can the current cinematic be skipped? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        uint8 bCanSkip : 1;

        /** Current cinematic type. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        EKhaaosCinematicType CurrentCinematicType;

        /** Elapsed time in current cinematic. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float ElapsedTime;

        // ─── Victory Poses ────────────────────────────────────────────────────

        /** Play victory sequence for a species. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic")
        void PlayVictorySequence(const FString& WinnerEosId, EKhaaosVictoryPose Pose);

        /** Play top-5 highlight. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic")
        void PlayTop5Highlight(const TArray<FString>& Top5PlayerIds);

        // ─── Trailer Mode ─────────────────────────────────────────────────────

        /** Enable trailer/recording mode. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic|Trailer")
        void EnableTrailerMode();

        /** Disable trailer mode. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic|Trailer")
        void DisableTrailerMode();

        /** Is trailer mode active? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Cinematic|Trailer")
        uint8 bTrailerModeActive : 1;

        /** Set time of day for trailer. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic|Trailer")
        void SetTimeOfDay(float Hour);

        /** Set slow motion factor. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Cinematic|Trailer")
        void SetSlowMotion(float Factor);

        // ─── Shot Sequences ───────────────────────────────────────────────────

        /** Get shots for a cinematic type. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Cinematic")
        TArray<FKhaaosCinematicShot> GetCinematicShots(EKhaaosCinematicType Type) const;

        // ─── Configuration ────────────────────────────────────────────────────

        /** Default intro duration (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float IntroDuration = 4.0f;

        /** Victory sequence duration (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float VictoryDuration = 6.0f;

        /** World transition duration (seconds). */
        UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Cinematic")
        float TransitionDuration = 3.5f;

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Cinematic")
        FOnCinematicStarted OnCinematicStarted;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Cinematic")
        FOnCinematicComplete OnCinematicComplete;

private:

        /** Target player for current cinematic. */
        FString TargetPlayerId;

        /** Current shot index. */
        int32 CurrentShotIndex;

        /** Pre-built shot sequences per type. */
        TMap<EKhaaosCinematicType, TArray<FKhaaosCinematicShot>> ShotLibrary;

        /** Build default shot sequences. */
        void BuildShotLibrary();
};
