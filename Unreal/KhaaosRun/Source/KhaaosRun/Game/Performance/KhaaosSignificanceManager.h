// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameFramework/Actor.h"
#include "Game/Performance/KhaaosLODStrategy.h" // EKhaaosWorldType
#include "KhaaosSignificanceManager.generated.h"

// ─── Significance Enum ───────────────────────────────────────────────────────

/**
 * Significance levels for battle royale actor prioritization.
 * Determines tick rate, replication priority, and update frequency.
 * Battle royale specific:
 *   - Critical: Player actors (always update)
 *   - High: Nearby combat actors, vehicles in use
 *   - Medium: Distant actors, downed players
 *   - Low: Far actors, parked vehicles
 *   - Invisible: Culled actors (no tick, minimal replication)
 */
UENUM(BlueprintType)
enum class EKhaaosSignificance : uint8
{
        Critical   UMETA(DisplayName = "Critical"),    // Always update: player pawns, active combat
        High       UMETA(DisplayName = "High"),        // Nearby combat, vehicles in use
        Medium     UMETA(DisplayName = "Medium"),      // Distant actors, downed players
        Low        UMETA(DisplayName = "Low"),         // Far actors, parked vehicles
        Invisible  UMETA(DisplayName = "Invisible")    // Culled: no tick, minimal replication
};

// ─── Significance Config Struct ──────────────────────────────────────────────

/**
 * Configuration for the significance manager.
 * Defines distance thresholds and battle royale-specific rules.
 */
USTRUCT(BlueprintType)
struct FKhaaosSignificanceConfig
{
        GENERATED_BODY()

        /** Distance threshold for Critical -> High transition. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float CriticalDistance = 500.0f;

        /** Distance threshold for High -> Medium transition. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float HighDistance = 1500.0f;

        /** Distance threshold for Medium -> Low transition. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float MediumDistance = 3000.0f;

        /** Distance threshold for Low -> Invisible transition. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float LowDistance = 5000.0f;

        /** Tick rate for Critical significance. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float CriticalTickRate = 1.0f;

        /** Tick rate for High significance. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float HighTickRate = 0.5f;

        /** Tick rate for Medium significance. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float MediumTickRate = 0.25f;

        /** Tick rate for Low significance. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float LowTickRate = 0.1f;

        /** Tick rate for Invisible (0.0 = no tick). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance")
        float InvisibleTickRate = 0.0f;

        /** Significance cache refresh interval in seconds. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance", meta = (ClampMin = "0.1", ClampMax = "5.0"))
        float CacheRefreshInterval = 1.0f;

        /** Density multiplier for distance thresholds (Ckesalth = 0.6). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Significance", meta = (ClampMin = "0.1", ClampMax = "2.0"))
        float DensityMultiplier = 1.0f;
};

// ─── Actor Significance Entry ────────────────────────────────────────────────

/** Per-actor significance tracking data. */
USTRUCT(BlueprintType)
struct FKhaaosActorSignificanceEntry
{
        GENERATED_BODY()

        /** The tracked actor. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        TObjectPtr<AActor> Actor = nullptr;

        /** Current significance level. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        EKhaaosSignificance Significance = EKhaaosSignificance::Medium;

        /** Override significance (if manually set, takes priority over distance-based). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        EKhaaosSignificance OverrideSignificance = EKhaaosSignificance::Medium;

        /** Whether an override is active. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        bool bHasOverride = false;

        /** Cached distance to nearest player. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        float CachedDistance = 0.0f;

        /** Last time significance was updated. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        float LastUpdateTime = 0.0f;

        /** Whether this actor is a downed player. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        bool bIsDownedPlayer = false;

        /** Whether this actor is a vehicle in active use. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Significance")
        bool bIsVehicleInUse = false;
};

// ─── Significance Changed Delegate ───────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnSignificanceChangedBR, AActor*, Actor, EKhaaosSignificance, OldSignificance, EKhaaosSignificance, NewSignificance);

// ─── Significance Config Subsystem ───────────────────────────────────────────

/**
 * UKhaaosSignificanceConfigSubsystem
 *
 * GameInstanceSubsystem for battle royale significance management.
 * Extends the basic Pool/KhaaosSignificanceManager with:
 *   - Battle royale-specific actor categorization (downed players, vehicles)
 *   - Per-world configuration (Ckesalth dense = closer thresholds)
 *   - Significance caching with 1s refresh interval
 *   - Distance-based automatic significance calculation
 *   - Manual override support for special cases
 *
 * Tick Rate Mapping:
 *   - Critical:   1.0  (every frame)
 *   - High:       0.5  (30Hz on 60fps)
 *   - Medium:     0.25 (15Hz on 60fps)
 *   - Low:        0.1  (6Hz on 60fps)
 *   - Invisible:  0.0  (no tick)
 *
 * Usage:
 *   UKhaaosSignificanceConfigSubsystem* SigSys = GetGameInstance()->GetSubsystem<UKhaaosSignificanceConfigSubsystem>();
 *   SigSys->RegisterActorSignificance(Vehicle, EKhaaosSignificance::High);
 *   SigSys->UpdateSignificance(Actor, DistanceToPlayer);
 */
UCLASS(BlueprintType)
class UKhaaosSignificanceConfigSubsystem : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:

        // ─── Subsystem Lifecycle ───────────────────────────────────────────────────

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Registration ──────────────────────────────────────────────────────────

        /**
         * Register an actor for significance tracking with an initial level.
         * @param Actor        Actor to track
         * @param Significance Initial significance level
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
        void RegisterActorSignificance(AActor* Actor, EKhaaosSignificance Significance);

        /** Unregister an actor from significance tracking. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
        void UnregisterActorSignificance(AActor* Actor);

        // ─── Significance Update ──────────────────────────────────────────────────

        /**
         * Update significance for an actor based on distance to nearest player.
         * Respects cache refresh interval — may skip if not enough time has elapsed.
         * @param Actor                The actor to update
         * @param DistanceToNearestPlayer  Distance from actor to closest player
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
        void UpdateSignificance(AActor* Actor, float DistanceToNearestPlayer);

        // ─── Queries ───────────────────────────────────────────────────────────────

        /** Get the tick rate for a significance level. */
        UFUNCTION(BlueprintPure, Category = "Khaaos|Significance")
        float GetTickRateForSignificance(EKhaaosSignificance Significance) const;

        /** Get the significance level of a specific actor. */
        UFUNCTION(BlueprintPure, Category = "Khaaos|Significance")
        EKhaaosSignificance GetActorSignificance(AActor* Actor) const;

        /** Get the number of registered actors. */
        UFUNCTION(BlueprintPure, Category = "Khaaos|Significance")
        int32 GetRegisteredActorCount() const;

        // ─── Battle Royale Specific ────────────────────────────────────────────────

        /** Mark an actor as a downed player (significance capped at Medium). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
        void SetActorAsDownedPlayer(AActor* Actor, bool bIsDowned);

        /** Mark an actor as a vehicle in use (boosts to High when nearby). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
        void SetActorAsVehicleInUse(AActor* Actor, bool bInUse);

        // ─── World Configuration ──────────────────────────────────────────────────

        /**
         * Configure significance thresholds for a specific world.
         * Dense worlds (Ckesalth) use closer thresholds.
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Significance")
        void ConfigureSignificanceForWorld(EKhaaosWorldType WorldType);

        /** Get the current significance configuration. */
        UFUNCTION(BlueprintPure, Category = "Khaaos|Significance")
        const FKhaaosSignificanceConfig& GetSignificanceConfig() const { return SignificanceConfig; }

        // ─── Delegate ─────────────────────────────────────────────────────────────

        /** Broadcast when an actor's significance level changes. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Significance")
        FOnSignificanceChangedBR OnSignificanceChanged;

private:

        /** Map of registered actors to their significance entries. */
        TMap<TObjectPtr<AActor>, FKhaaosActorSignificanceEntry> RegisteredActors;

        /** Current significance configuration. */
        FKhaaosSignificanceConfig SignificanceConfig;

        /** Current world time for cache management. */
        float CurrentWorldTime = 0.0f;

        /** Calculate significance from distance, respecting battle royale rules. */
        EKhaaosSignificance CalculateSignificanceFromDistance(float Distance, const FKhaaosActorSignificanceEntry& Entry) const;

        /** Apply significance-based optimizations (tick interval, net update freq). */
        void ApplySignificanceOptimizations(AActor* Actor, EKhaaosSignificance NewSignificance, EKhaaosSignificance OldSignificance);
};
