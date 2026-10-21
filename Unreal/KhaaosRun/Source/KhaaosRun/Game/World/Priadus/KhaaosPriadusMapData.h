// ============================================================================
// Khaaos Run — W2/C2 Priadus Map Data Asset (Fase 4)
// ============================================================================
// Water-world archipelago: 8km x 8km
// 4 sectors: Archipelago(4/10), Reef(2/10), DeepOcean(3/10), VolcanoIsland(1/10)
// 75 spawn points, 90 loot spawn points, 20 ZEX (island-based)
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KhaaosPriadusMapData.generated.h"

USTRUCT(BlueprintType)
struct FPriadusSector
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MapFraction = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector BoundsMin = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector BoundsMax = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsIsland = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WaterLevel = 0.0f;
};

USTRUCT(BlueprintType)
struct FPriadusSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FRotator Rotation = FRotator::ZeroRotator;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TeamIndex = -1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Priority = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsOnIsland = true;
};

USTRUCT(BlueprintType)
struct FPriadusLootSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FRotator Rotation = FRotator::ZeroRotator;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SectorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<float> RarityWeights = { 0.35f, 0.25f, 0.20f, 0.12f, 0.08f };
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MinPhase = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bUnderwater = false;
};

UENUM(BlueprintType)
enum class EPriadusEnvironmentType : uint8
{
    Island     UMETA(DisplayName = "Island (Plus+)"),
    BoatSpawn  UMETA(DisplayName = "Boat Spawn (Plus+)"),
    CoralReef  UMETA(DisplayName = "Coral Reef (Plus+)"),
    MedKit     UMETA(DisplayName = "Med Kit Station (Plus+)"),
    SharkZone  UMETA(DisplayName = "Shark Zone (Plus-)"),
    Whirlpool  UMETA(DisplayName = "Whirlpool (Plus-)"),
    Tsunami    UMETA(DisplayName = "Tsunami Warning (Plus-)"),
    Undertow   UMETA(DisplayName = "Undertow (Plus-)"),
};

USTRUCT(BlueprintType)
struct FPriadusEnvironmentMarker
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EPriadusEnvironmentType Type = EPriadusEnvironmentType::Island;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float EffectRadius = 500.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Intensity = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) uint8 ActivePhaseMask = 0xFF;
};

UCLASS(BlueprintType)
class KHAAOSRUN_API UKhaaosPriadusMapData : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Meta")
    FString MapName = TEXT("W2/C2 Priadus");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Meta")
    FString MapDescription = TEXT("Mundo arquipélago aquático — Water combat, islands, and depths");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Meta")
    FVector MapSize = FVector(8000.0f, 8000.0f, 500.0f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Meta")
    int32 TargetPlayerCount = 75;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Sectors")
    TArray<FPriadusSector> Sectors;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Spawns")
    TArray<FPriadusSpawnPoint> PlayerSpawnPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Loot")
    TArray<FPriadusLootSpawnPoint> LootSpawnPoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Priadus|Environment")
    TArray<FPriadusEnvironmentMarker> EnvironmentMarkers;

    UFUNCTION(BlueprintCallable, Category = "Priadus|Utility")
    TArray<FVector> GetRandomLootSpawnPoints(int32 Count, FVector ZoneCenter, float ZoneRadius) const;
    UFUNCTION(BlueprintCallable, Category = "Priadus|Utility")
    FVector GetRandomPointInZone(FVector ZoneCenter, float ZoneRadius) const;
    UFUNCTION(BlueprintCallable, Category = "Priadus|Utility")
    TArray<FPriadusSpawnPoint> GetSpawnsInSector(const FString& SectorName) const;
    UFUNCTION(BlueprintCallable, Category = "Priadus|Utility")
    TArray<FPriadusEnvironmentMarker> GetMarkersByType(EPriadusEnvironmentType Type) const;
    UFUNCTION(BlueprintCallable, Category = "Priadus|Utility")
    void InitializeDefaults();
};
