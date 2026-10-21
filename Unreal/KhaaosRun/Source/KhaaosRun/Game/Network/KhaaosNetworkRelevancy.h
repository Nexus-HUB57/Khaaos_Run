// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KhaaosNetworkRelevancy.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AActor;
class APlayerController;

/**
 * FRelevancyProfile
 *
 * Relevancy configuration for a specific actor type.
 * Controls distance-based relevancy, update frequency throttling,
 * and bandwidth priority allocation.
 */
USTRUCT(BlueprintType)
struct FRelevancyProfile
{
        GENERATED_BODY()

        /** View distance for this actor type (actors beyond this are not relevant). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float ViewDistance = 5000.0f;

        /** Net update frequency when distant (throttled). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float UpdateFrequency = 10.0f;

        /** Replication priority (for bandwidth allocation). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        int32 Priority = 2;

        /** Whether to use Iris spatial relevancy for this actor type. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        uint8 bUseSpatialRelevancy : 1;

        FRelevancyProfile()
                : ViewDistance(5000.0f)
                , UpdateFrequency(10.0f)
                , Priority(2)
                , bUseSpatialRelevancy(true)
        {}
};

/**
 * UKhaaosRelevancySubsystem
 *
 * TickableWorldSubsystem managing custom network relevancy and
 * spatial relevance for all replicated actors.
 *
 * Design:
 *   - Distance-based relevancy with configurable radius per actor type
 *   - Adjusts NetUpdateFrequency based on distance to viewers
 *   - TMap of actor class → FRelevancyProfile for per-type config
 *   - RegisterActorForRelevancy() / UnregisterActor() for lifecycle
 *   - UpdateRelevancy() tick: throttles distant actors
 *   - Custom IsNetRelevantFor() override logic
 *
 * Integration with Iris:
 *   - When bUseSpatialRelevancy is true, delegates to Iris spatial system
 *   - Falls back to distance-based relevancy when Iris is disabled
 *   - Hysteresis prevents flickering at relevancy boundaries
 */
UCLASS(Abstract)
class UKhaaosRelevancySubsystem : public UTickableWorldSubsystem
{
        GENERATED_BODY()

public:
        UKhaaosRelevancySubsystem();

        // ─── Lifecycle ──────────────────────────────────────────────────────────

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;
        virtual void Tick(float DeltaTime) override;
        virtual TStatId GetStatId() const override;

        // ─── Registration ───────────────────────────────────────────────────────

        /**
         * Register an actor for custom relevancy management.
         * Looks up the FRelevancyProfile by actor class.
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Relevancy")
        void RegisterActorForRelevancy(AActor* Actor);

        /**
         * Unregister an actor from relevancy management.
         * Call on EndPlay / Destroy.
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Relevancy")
        void UnregisterActor(AActor* Actor);

        // ─── Relevancy Queries ──────────────────────────────────────────────────

        /**
         * Check if an actor is relevant for a given viewer.
         * Distance-based check using the actor's relevancy profile.
         */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Relevancy")
        bool IsActorRelevantForViewer(AActor* Actor, APlayerController* Viewer) const;

        /**
         * Get the relevancy profile for a given actor class.
         * Returns nullptr if not registered.
         */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Relevancy")
        const FRelevancyProfile* GetRelevancyProfile(TSubclassOf<AActor> ActorClass) const;

        // ─── Configuration ──────────────────────────────────────────────────────

        /** Default relevancy view distance for unregistered actors. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float DefaultViewDistance;

        /** Hysteresis distance to prevent relevancy flickering. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float RelevancyHysteresis;

        /** Minimum net update frequency (never throttle below this). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float MinNetUpdateFrequency;

        /** Maximum net update frequency. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float MaxNetUpdateFrequency;

        /** Tick interval for relevancy updates (seconds). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        float RelevancyTickInterval;

        // ─── Relevancy Profile Map ──────────────────────────────────────────────

        /** Map from actor class to its relevancy profile. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Relevancy")
        TMap<TSubclassOf<AActor>, FRelevancyProfile> ActorRelevancyMap;

private:

        /** Set of actors registered for relevancy management. */
        UPROPERTY()
        TSet<TObjectPtr<AActor>> RegisteredActors;

        /** Time since last relevancy tick. */
        float TimeSinceLastTick;

        /** Whether the subsystem is enabled. */
        uint8 bEnabled : 1;
};
