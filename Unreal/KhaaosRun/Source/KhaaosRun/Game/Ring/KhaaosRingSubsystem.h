#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Ring/KhaaosRingManager.h"
#include "Ring/KhaaosRingSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FRingWorldConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosWorld WorldId;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FString WorldName;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 Capacity = 100;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 RingPhases = 6;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<FRingPhase> Phases;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<FWaterZone> WaterZones;
};

UCLASS()
class UKhaaosRingSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionInitializeParams& DeinitParams) override;
    virtual void Deinitialize() override;

    /** Get ring configuration for a specific world. */
    FRingWorldConfig GetRingConfig(EKhaaosWorld WorldId) const;

    /** Get ring phases array for a world. */
    TArray<FRingPhase> GetPhasesForWorld(EKhaaosWorld WorldId) const;

    /** Get next world in the multi-world pipeline. Returns first world if at end. */
    EKhaaosWorld GetNextWorldInPipeline(EKhaaosWorld CurrentWorld) const;

    /** Called when a world transition completes. Cleans up old world state. */
    void OnWorldTransitionComplete(EKhaaosWorld FromWorld, EKhaaosWorld ToWorld);

private:
    /** Load all world configs from ring_config.json data. */
    UFUNCTION()
    void LoadWorldConfigs_Implementation();

    UPROPERTY()
    TMap<EKhaaosWorld, FRingWorldConfig> WorldConfigs;

    UPROPERTY()
    TArray<EKhaaosWorld> PipelineOrder;
};
