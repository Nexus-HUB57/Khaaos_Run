// ============================================================================
// Khaaos Run — W3/C3 Ckesalth Map Data Asset (Fase 4)
// ============================================================================
// Vertical mountain world: 6km x 6km, 2000m vertical extent
// 4 sectors: BaseCamp(2/8), MidMountain(3/8), PeakZone(2/8), SummitArena(1/8)
// 60 spawn points, 80 loot spawn points, 25 ZEX (altitude-based)
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KhaaosCkesalthMapData.generated.h"

USTRUCT(BlueprintType)
struct FCkesalthSector
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MapFraction = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector BoundsMin = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector BoundsMax = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MinAltitude = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxAltitude = 2000.0f;
};

USTRUCT(BlueprintType)
struct FCkesalthSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FRotator Rotation = FRotator::ZeroRotator;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Priority = 0;
};

USTRUCT(BlueprintType)
struct FCkesalthLootSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<float> RarityWeights = { 0.35f, 0.25f, 0.20f, 0.12f, 0.08f };
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MinPhase = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bRequiresClimbing = false;
};

UENUM(BlueprintType)
enum class ECkesalthEnvironmentType : uint8
{
    ClimbWall UMETA(DisplayName = "Climb Wall"),
    Zipline   UMETA(DisplayName = "Zipline"),
    Cave      UMETA(DisplayName = "Cave"),
    Bunker    UMETA(DisplayName = "Bunker"),
    MedKit    UMETA(DisplayName = "Med Kit"),
    Avalanche UMETA(DisplayName = "Avalanche Zone"),
    Rockslide UMETA(DisplayName = "Rockslide Zone"),
    ThinAir   UMETA(DisplayName = "Thin Air Zone"),
};

USTRUCT(BlueprintType)
struct FCkesalthEnvironmentMarker
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) ECkesalthEnvironmentType Type = ECkesalthEnvironmentType::Bunker;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float EffectRadius = 500.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Intensity = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) uint8 ActivePhaseMask = 0xFF;
};

UCLASS(BlueprintType)
class KHAAOSRUN_API UKhaaosCkesalthMapData : public UPrimaryDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Meta") FString MapName = TEXT("W3/C3 Ckesalth");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Meta") FString MapDescription = TEXT("Mundo vertical montanhoso — Climbing, ziplines, elevation advantage");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Meta") FVector MapSize = FVector(6000.0f, 6000.0f, 2000.0f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Meta") int32 TargetPlayerCount = 60;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Sectors") TArray<FCkesalthSector> Sectors;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Spawns") TArray<FCkesalthSpawnPoint> PlayerSpawnPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Loot") TArray<FCkesalthLootSpawnPoint> LootSpawnPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ckesalth|Environment") TArray<FCkesalthEnvironmentMarker> EnvironmentMarkers;

    UFUNCTION(BlueprintCallable, Category = "Ckesalth|Utility") TArray<FVector> GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const;
    UFUNCTION(BlueprintCallable, Category = "Ckesalth|Utility") FVector GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const;
    UFUNCTION(BlueprintCallable, Category = "Ckesalth|Utility") void InitializeDefaults();
};
