// KhaaosCIGKVWorldPartition Implementation

#include "Game/World/Partition/KhaaosCIGKVWorldPartition.h"
#include "Math/UnrealMathUtility.h"

UKhaaosCIGKVWorldPartition::UKhaaosCIGKVWorldPartition()
{
    InitializeDefaults();
}

void UKhaaosCIGKVWorldPartition::InitializeDefaults()
{
    // ─── Map Grid: 10km x 10km, 5x5 cells of 2km each ─────────────────────
    MapSize = FVector2D(10000.0f, 10000.0f);
    CellSize = 2000.0f;
    CellsX = 5;
    CellsY = 5;

    // ─── Loading ─────────────────────────────────────────────────────────────
    DefaultLoadingRadius = 3000.0f;   // 3km around player
    DefaultUnloadingRadius = 4500.0f; // 4.5km before unloading (hysteresis)
    SpawnCellPriority = -100;         // High priority
    ZEXCellPriority = -50;            // Medium-high priority

    // ─── HLOD: 4 levels ──────────────────────────────────────────────────────
    HLODLevels.Empty();

    // Level 0: Close range — full detail
    FKhaaosHLODConfig HLOD0;
    HLOD0.HLODLevel = 0;
    HLOD0.MergeDistance = 2000.0f;
    HLOD0.ScreenSize = 1.0f;
    HLOD0.MaxMeshesPerCluster = 1;
    HLOD0.bUseImpostor = false;
    HLODLevels.Add(HLOD0);

    // Level 1: Mid range — small clusters
    FKhaaosHLODConfig HLOD1;
    HLOD1.HLODLevel = 1;
    HLOD1.MergeDistance = 5000.0f;
    HLOD1.ScreenSize = 0.5f;
    HLOD1.MaxMeshesPerCluster = 16;
    HLOD1.bUseImpostor = false;
    HLODLevels.Add(HLOD1);

    // Level 2: Far range — large clusters
    FKhaaosHLODConfig HLOD2;
    HLOD2.HLODLevel = 2;
    HLOD2.MergeDistance = 10000.0f;
    HLOD2.ScreenSize = 0.25f;
    HLOD2.MaxMeshesPerCluster = 64;
    HLOD2.bUseImpostor = false;
    HLODLevels.Add(HLOD2);

    // Level 3: Very far — impostor billboards
    FKhaaosHLODConfig HLOD3;
    HLOD3.HLODLevel = 3;
    HLOD3.MergeDistance = 20000.0f;
    HLOD3.ScreenSize = 0.1f;
    HLOD3.MaxMeshesPerCluster = 256;
    HLOD3.bUseImpostor = true;
    HLODLevels.Add(HLOD3);

    // ─── Data Layers ─────────────────────────────────────────────────────────
    ActiveDataLayers = {
        ECIGKVDataLayer::ArmoryHub,
        ECIGKVDataLayer::ProvingGrounds,
        ECIGKVDataLayer::AbandonedPark,
        ECIGKVDataLayer::Underground,
        ECIGKVDataLayer::ZEX_Network,
        ECIGKVDataLayer::EnvironmentEffects,
        ECIGKVDataLayer::CinematicZu,
    };

    // Always-loaded layers (even if player is far)
    InitiallyLoadedLayers = {
        ECIGKVDataLayer::ZEX_Network,
        ECIGKVDataLayer::EnvironmentEffects,
    };

    // ─── Performance ─────────────────────────────────────────────────────────
    MaxConcurrentLoads = 4;
    bAsyncLoading = true;
    StreamingMemoryBudgetMB = 512;
}

TArray<FName> UKhaaosCIGKVWorldPartition::GetCellsToLoad(const FVector& PlayerPosition, float LoadingRadius) const
{
    TArray<FName> CellsToLoad;

    // Calculate which cells overlap with the loading sphere
    int32 MinCellX = FMath::FloorToInt((PlayerPosition.X - LoadingRadius) / CellSize);
    int32 MaxCellX = FMath::FloorToInt((PlayerPosition.X + LoadingRadius) / CellSize);
    int32 MinCellY = FMath::FloorToInt((PlayerPosition.Y - LoadingRadius) / CellSize);
    int32 MaxCellY = FMath::FloorToInt((PlayerPosition.Y + LoadingRadius) / CellSize);

    MinCellX = FMath::Clamp(MinCellX, 0, CellsX - 1);
    MaxCellX = FMath::Clamp(MaxCellX, 0, CellsX - 1);
    MinCellY = FMath::Clamp(MinCellY, 0, CellsY - 1);
    MaxCellY = FMath::Clamp(MaxCellY, 0, CellsY - 1);

    for (int32 X = MinCellX; X <= MaxCellX; X++)
    {
        for (int32 Y = MinCellY; Y <= MaxCellY; Y++)
        {
            FString CellName = FString::Printf(TEXT("CIGKV_Cell_%d_%d"), X, Y);
            CellsToLoad.Add(FName(*CellName));
        }
    }

    return CellsToLoad;
}

TArray<ECIGKVDataLayer> UKhaaosCIGKVWorldPartition::GetActiveDataLayersForPosition(const FVector& Position) const
{
    TArray<ECIGKVDataLayer> Layers = InitiallyLoadedLayers;

    // Add sector-specific layers based on position
    if (Position.X < -1875.0f)
    {
        Layers.Add(ECIGKVDataLayer::ArmoryHub);
    }
    else if (Position.X < 3750.0f)
    {
        Layers.Add(ECIGKVDataLayer::ProvingGrounds);
        // Underground only if near tunnel entrances
        if (Position.Z < -50.0f)
        {
            Layers.Add(ECIGKVDataLayer::Underground);
        }
    }
    else
    {
        Layers.Add(ECIGKVDataLayer::AbandonedPark);
    }

    // Zu cinematic only near spawn points (entry zones)
    if (Position.X < -3500.0f || Position.Y < -3500.0f || Position.X > 3500.0f)
    {
        Layers.Add(ECIGKVDataLayer::CinematicZu);
    }

    return Layers;
}
