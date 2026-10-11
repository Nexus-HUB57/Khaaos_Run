// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosReplicationConfig.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AActor;
class APlayerState;
class AGameStateBase;

/**
 * FIrisPrioritySettings
 *
 * Iris replication priority settings for actor types.
 * Lower value = higher priority (1 = High, 2 = Medium, 3 = Low, 4 = VeryLow).
 * Maps to IrisNetDriver's replication prioritization system.
 */
USTRUCT(BlueprintType)
struct FIrisPrioritySettings
{
        GENERATED_BODY()

        /** PlayerState replication priority (1 = High). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 PlayerStatePriority = 1;

        /** GameState replication priority (1 = High). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 GameStatePriority = 1;

        /** GameMode replication priority (2 = Medium). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 GameModePriority = 2;

        /** Projectile replication priority (3 = Low). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 ProjectilePriority = 3;

        /** Loot replication priority (3 = Low). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 LootPriority = 3;

        /** AI replication priority (2 = Medium). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 AIPriority = 2;

        /** VFX replication priority (4 = VeryLow). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Priority")
        int32 VFXPriority = 4;

        /** Spatial relevancy radius (world units). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Spatial")
        float SpatialRelevancyRadius = 3000.0f;

        /** Spatial relevancy hysteresis (world units). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Iris|Spatial")
        float SpatialRelevancyHysteresis = 500.0f;
};

/**
 * FNetUpdateFrequencyConfig
 *
 * Per-actor-type net update frequency configuration.
 * Controls how often each actor type replicates to clients.
 * Higher frequency = more bandwidth but smoother replication.
 */
USTRUCT(BlueprintType)
struct FNetUpdateFrequencyConfig
{
        GENERATED_BODY()

        /** PlayerState net update frequency (Hz). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Net|Frequency")
        float PlayerStateNetUpdate = 30.0f;

        /** GameState net update frequency (Hz). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Net|Frequency")
        float GameStateNetUpdate = 10.0f;

        /** Projectile net update frequency (Hz). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Net|Frequency")
        float ProjectileNetUpdate = 60.0f;

        /** AI net update frequency (Hz). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Net|Frequency")
        float AINetUpdate = 15.0f;

        /** Loot net update frequency (Hz). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Net|Frequency")
        float LootNetUpdate = 5.0f;

        /** Zone net update frequency (Hz). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Net|Frequency")
        float ZoneNetUpdate = 2.0f;
};

/**
 * UKhaaosReplicationConfigSubsystem
 *
 * GameInstanceSubsystem for Iris replication configuration and
 * network update frequency management.
 *
 * Design:
 *   - ApplyReplicationSettings(): sets priority and frequency on spawned actors
 *   - InitIrisReplication(): configure Iris settings per .uproject plugins
 *   - ConfigureNetDriver(): MaxClientUpdateRate, ServerMaxTickRate, NetServerMaxTickRate
 *   - Runs once at game instance initialization
 *   - All settings are data-driven (editable defaults)
 *
 * Iris is enabled in KhaaosRun.uproject via the "Iris" plugin.
 * This subsystem configures the IrisNetDriver parameters at runtime.
 */
UCLASS(Abstract, Config=Engine, defaultconfig)
class UKhaaosReplicationConfigSubsystem : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:
        UKhaaosReplicationConfigSubsystem();

        // ─── Lifecycle ──────────────────────────────────────────────────────────

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Configuration ──────────────────────────────────────────────────────

        /** Apply replication priority and frequency settings to a spawned actor. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replication")
        void ApplyReplicationSettings(AActor* Actor) const;

        /** Initialize Iris replication driver settings. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replication")
        void InitIrisReplication();

        /** Configure net driver tick rates and update rates. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Replication")
        void ConfigureNetDriver();

        // ─── Settings ──────────────────────────────────────────────────────────

        /** Iris priority settings per actor type. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Iris")
        FIrisPrioritySettings IrisPrioritySettings;

        /** Net update frequency settings per actor type. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Frequency")
        FNetUpdateFrequencyConfig NetUpdateFrequencyConfig;

        /** Maximum client update rate (Hz). */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Driver")
        int32 MaxClientUpdateRate = 60;

        /** Server max tick rate (Hz). */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Driver")
        int32 ServerMaxTickRate = 60;

        /** NetServerMaxTickRate (Hz) - engine cvar. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Driver")
        int32 NetServerMaxTickRate = 60;

        /** Whether Iris replication is enabled. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Iris")
        uint8 bEnableIris : 1;

        /** Whether spatial relevancy is enabled. */
        UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Replication|Iris")
        uint8 bUseSpatialRelevancy : 1;
};
