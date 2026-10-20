// ============================================================================
// Khaaos Run — W4/C4 Arukheea Map Data Asset (Fase 4)
// ============================================================================
// Desert canyon world: 10km x 10km
// 4 sectors: Dunes(3/10), Canyon(3/10), Oasis(2/10), Arena(2/10)
// 80 spawn points, 100 loot spawn points, 22 ZEX
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KhaaosArukheeaMapData.generated.h"

USTRUCT(BlueprintType)
struct FArukheeaSector
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MapFraction = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector BoundsMin = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector BoundsMax = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float HeatIntensity = 0.5f;
};

USTRUCT(BlueprintType)
struct FArukheeaSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FRotator Rotation = FRotator::ZeroRotator;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Priority = 0;
};

USTRUCT(BlueprintType)
struct FArukheeaLootSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<float> RarityWeights = { 0.35f, 0.25f, 0.20f, 0.12f, 0.08f };
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MinPhase = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bInCanyon = false;
};

UENUM(BlueprintType)
enum class EArukheeaEnvironmentType : uint8
{
    Oasis       UMETA(DisplayName = "Oasis (Healing)"),
    Bunker      UMETA(DisplayName = "Bunker (Shade)"),
    VehicleSpawn UMETA(DisplayName = "Vehicle Spawn"),
    MedKit      UMETA(DisplayName = "Med Kit"),
    SandDune    UMETA(DisplayName = "Sand Dune (Cover)"),
    Sandstorm   UMETA(DisplayName = "Sandstorm Zone"),
    HeatVent    UMETA(DisplayName = "Heat Vent"),
    Quicksand   UMETA(DisplayName = "Quicksand"),
};

USTRUCT(BlueprintType)
struct FArukheeaEnvironmentMarker
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EArukheeaEnvironmentType Type = EArukheeaEnvironmentType::Oasis;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float EffectRadius = 500.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Intensity = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) uint8 ActivePhaseMask = 0xFF;
};

UCLASS(BlueprintType)
class KHAAOSRUN_API UKhaaosArukheeaMapData : public UPrimaryDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Meta") FString MapName = TEXT("W4/C4 Arukheea");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Meta") FString MapDescription = TEXT("Mundo desértico de cânions — Heat, sandstorms, oasis healing");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Meta") FVector MapSize = FVector(10000.0f, 10000.0f, 600.0f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Meta") int32 TargetPlayerCount = 80;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Sectors") TArray<FArukheeaSector> Sectors;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Spawns") TArray<FArukheeaSpawnPoint> PlayerSpawnPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Loot") TArray<FArukheeaLootSpawnPoint> LootSpawnPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Arukheea|Environment") TArray<FArukheeaEnvironmentMarker> EnvironmentMarkers;

    UFUNCTION(BlueprintCallable, Category = "Arukheea|Utility") TArray<FVector> GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const;
    UFUNCTION(BlueprintCallable, Category = "Arukheea|Utility") FVector GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const;
    UFUNCTION(BlueprintCallable, Category = "Arukheea|Utility") void InitializeDefaults();
};
