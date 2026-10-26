#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Ring/KhaaosRingManager.h"
#include "Ring/KhaaosAirdropManager.generated.h"

UENUM(BlueprintType)
enum class EAirdropType : uint8
{
    STANDARD   UMETA(DisplayName = "Standard Airdrop"),
    FLARE_GUN  UMETA(DisplayName = "Flare Gun Airdrop"),
    WATER_DROP UMETA(DisplayName = "Water Drop")
};

USTRUCT(BlueprintType)
struct FAirdropSpawnPoint
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector Location = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EAirdropType Type = EAirdropType::STANDARD;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 LootCount = 4;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bIsWaterDrop = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float FallTimeSeconds = 8.f;
};

UCLASS()
class AKhaaosAirdropManager : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosAirdropManager();

    /** Called when ring phase changes — roll for airdrop spawn. */
    void OnRingPhaseChanged(int32 NewPhase);

    /** Spawn an airdrop crate at location with given type. */
    void SpawnAirdrop(const FVector& Location, EAirdropType Type);

    /** Spawn a water drop in a water zone (submarine insertion). */
    void SpawnWaterDrop(const FWaterZone& WaterZone);

    /** Get airdrop probability for a given ring phase. */
    float GetAirdropProbability(int32 Phase) const;

    /** Handle player-activated flare gun airdrop. */
    void OnFlareGunActivated(const FVector& FlareLocation);

private:
    /** Calculate random airdrop location within current ring. */
    UFUNCTION()
    FVector CalculateAirdropLocation_Implementation() const;

    UPROPERTY()
    int32 CurrentPhase = 0;

    UPROPERTY()
    EAirdropType PendingDropType = EAirdropType::STANDARD;

    UPROPERTY()
    TArray<FAirdropSpawnPoint> ActiveDrops;

    FTimerHandle AirdropSpawnTimer;
};
