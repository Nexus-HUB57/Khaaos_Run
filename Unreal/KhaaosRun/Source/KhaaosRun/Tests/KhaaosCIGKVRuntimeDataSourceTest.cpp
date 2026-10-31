// Khaaos Run - UE5.8 | Runtime CIGKV data-source audit
#if WITH_DEV_AUTOMATION_TESTS

#include "Tests/KhaaosCIGKVRuntimeDataSourceTest.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerStart.h"
#include "Game/KhaaosGameMode.h"
#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Game/Level/KhaaosCIGKVLevelData.h"
#include "Game/World/CIGKV/KhaaosCIGKVMapData.h"
#include "HAL/PlatformFileManager.h"
#include "Kismet/GameplayStatics.h"
#include "KhaaosRun.h"
#include "Misc/Paths.h"
#include "UObject/Package.h"
#include "UObject/UnrealType.h"
#include "UObject/UObjectGlobals.h"

namespace
{
UWorld* FindKhaaosRuntimeWorld()
{
    if (!GEngine)
    {
        return nullptr;
    }

    for (const FWorldContext& Context : GEngine->GetWorldContexts())
    {
        if (Context.WorldType != EWorldType::Game && Context.WorldType != EWorldType::PIE)
        {
            continue;
        }

        UWorld* World = Context.ThisCurrentWorld;
        if (World && Cast<AKhaaosGameMode>(UGameplayStatics::GetGameMode(World)))
        {
            return World;
        }
    }

    return nullptr;
}

FString DescribeMapDataSource(const AKhaaosCIGKVLevel& Level, const UKhaaosCIGKVMapData& MapData)
{
    if (Level.WasMapDataGeneratedAtRuntime())
    {
        return TEXT("C++ InitializeDefaults() gerado pelo AKhaaosCIGKVLevel");
    }

    if (MapData.IsAsset())
    {
        return TEXT("IsAsset=true; objeto reporta ser asset, mas origem de carregamento não foi provada");
    }

    return TEXT("não gerado por InitializeDefaults e IsAsset=false; origem não determinada");
}
}

bool FKhaaosCIGKVRuntimeDataSourceTest::RunTest(const FString& Parameters)
{
    UWorld* World = FindKhaaosRuntimeWorld();
    if (!World)
    {
        AddError(TEXT("Nenhum mundo Game/PIE com AKhaaosGameMode ativo. Abra o mapa CIGKV, inicie PIE/servidor e execute Khaaos.CIGKV.Runtime.DataSource."));
        return false;
    }

    AKhaaosGameMode* GameMode = Cast<AKhaaosGameMode>(UGameplayStatics::GetGameMode(World));
    TestNotNull(TEXT("O mundo ativo deve usar AKhaaosGameMode"), GameMode);
    if (!GameMode)
    {
        return false;
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[CIGKV-DATA-SOURCE] world=%s map=%s gameMode=%s"),
        *World->GetName(), *World->GetMapName(), *GameMode->GetClass()->GetPathName());

    TArray<AActor*> PlayerStartActors;
    UGameplayStatics::GetAllActorsOfClass(World, APlayerStart::StaticClass(), PlayerStartActors);
    TestTrue(TEXT("O mapa em execução deve conter ao menos um APlayerStart para o spawn padrão do engine"),
        PlayerStartActors.Num() > 0);
    for (int32 Index = 0; Index < PlayerStartActors.Num(); ++Index)
    {
        const AActor* PlayerStart = PlayerStartActors[Index];
        UE_LOG(LogKhaaosRun, Display, TEXT("[CIGKV-DATA-SOURCE] PlayerStart[%d] actor=%s location=%s rotation=%s"),
            Index, *PlayerStart->GetPathName(), *PlayerStart->GetActorLocation().ToString(),
            *PlayerStart->GetActorRotation().ToString());
    }

    TArray<AActor*> CIGKVLevelActors;
    UGameplayStatics::GetAllActorsOfClass(World, AKhaaosCIGKVLevel::StaticClass(), CIGKVLevelActors);
    UE_LOG(LogKhaaosRun, Display, TEXT("[CIGKV-DATA-SOURCE] CIGKVLevelActorCount=%d"), CIGKVLevelActors.Num());
    TestTrue(TEXT("O mapa em execução deve conter AKhaaosCIGKVLevel para auditar as fontes específicas de CIGKV"),
        CIGKVLevelActors.Num() > 0);
    if (CIGKVLevelActors.Num() == 0)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[CIGKV-DATA-SOURCE] Level Actor ausente; a partida está usando o spawn padrão do GameMode/mapa, sem os dados CIGKV específicos deste actor."));
        return false;
    }
    if (CIGKVLevelActors.Num() > 1)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[CIGKV-DATA-SOURCE] Mais de um AKhaaosCIGKVLevel encontrado; o GameMode pode selecionar o primeiro enumerado para ZuEntry."));
    }

    TArray<AActor*> LevelDataActors;
    UGameplayStatics::GetAllActorsOfClass(World, AKhaaosCIGKVLevelData::StaticClass(), LevelDataActors);
    UE_LOG(LogKhaaosRun, Display, TEXT("[CIGKV-DATA-SOURCE] CIGKVLevelDataActorCount=%d expectedJsonPath=%s expectedJsonExists=%s"),
        LevelDataActors.Num(),
        *(FPaths::ProjectConfigDir() / TEXT("levels/CIGKV_level_data.json")),
        IFileManager::Get().FileExists(*(FPaths::ProjectConfigDir() / TEXT("levels/CIGKV_level_data.json"))) ? TEXT("true") : TEXT("false"));

    if (LevelDataActors.Num() == 0)
    {
        UE_LOG(LogKhaaosRun, Display, TEXT("[CIGKV-DATA-SOURCE] AKhaaosCIGKVLevelData não está instanciado; o JSON loader não fornece dados neste mundo."));
    }
    else if (LevelDataActors.Num() > 1)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[CIGKV-DATA-SOURCE] Mais de um JSON loader encontrado; fontes de level-data potencialmente ambíguas."));
    }

    const UEnum* DataSourceEnum = StaticEnum<ECIGKVLevelDataSource>();
    for (int32 Index = 0; Index < LevelDataActors.Num(); ++Index)
    {
        const AKhaaosCIGKVLevelData* LevelData = Cast<AKhaaosCIGKVLevelData>(LevelDataActors[Index]);
        if (!LevelData)
        {
            continue;
        }

        const FString SourceName = DataSourceEnum
            ? DataSourceEnum->GetNameStringByValue(static_cast<int64>(LevelData->ActiveDataSource))
            : TEXT("Unknown");
        const bool bLoadedPathExists = !LevelData->ActiveDataPath.IsEmpty() &&
            IFileManager::Get().FileExists(*LevelData->ActiveDataPath);

        UE_LOG(LogKhaaosRun, Display,
            TEXT("[CIGKV-DATA-SOURCE] LevelData[%d] actor=%s source=%s activePath=%s lastAttempt=%s activePathExists=%s spawns=%d zex=%d loot=%d phases=%d"),
            Index, *LevelData->GetPathName(), *SourceName, *LevelData->ActiveDataPath,
            *LevelData->LastDataPathAttempt,
            bLoadedPathExists ? TEXT("true") : TEXT("false"),
            LevelData->GetSpawnPoints().Num(), LevelData->GetZEXZones().Num(),
            LevelData->GetLootPoints().Num(), LevelData->GetZonePhases().Num());

        TestTrue(TEXT("Se o JSON loader estiver instanciado, BeginPlay deve ter resolvido uma fonte de dados"),
            LevelData->ActiveDataSource != ECIGKVLevelDataSource::NotLoaded);
        TestTrue(TEXT("A fonte ativa do JSON loader deve fornecer ao menos um spawn"),
            LevelData->GetSpawnPoints().Num() > 0);
        TestTrue(TEXT("A fonte ativa do JSON loader deve fornecer ao menos uma zona ZEX"),
            LevelData->GetZEXZones().Num() > 0);
        TestTrue(TEXT("A fonte ativa do JSON loader deve fornecer ao menos uma fase"),
            LevelData->GetZonePhases().Num() > 0);
        if (LevelData->ActiveDataSource == ECIGKVLevelDataSource::JsonFile)
        {
            TestTrue(TEXT("A fonte marcada como JsonFile deve existir no caminho registrado"), bLoadedPathExists);
        }
    }

    for (int32 LevelIndex = 0; LevelIndex < CIGKVLevelActors.Num(); ++LevelIndex)
    {
        const AKhaaosCIGKVLevel* CIGKVLevel = Cast<AKhaaosCIGKVLevel>(CIGKVLevelActors[LevelIndex]);
        if (!CIGKVLevel)
        {
            continue;
        }

        UE_LOG(LogKhaaosRun, Display,
            TEXT("[CIGKV-DATA-SOURCE] Level[%d] actor=%s class=%s ZuVariants=%d ZonePhases=%d ZEX=%d"),
            LevelIndex, *CIGKVLevel->GetPathName(), *CIGKVLevel->GetClass()->GetPathName(),
            CIGKVLevel->ZuVariants.Num(), CIGKVLevel->GetZonePhases().Num(), CIGKVLevel->ZEXPoints.Num());
        TestTrue(TEXT("AKhaaosCIGKVLevel ativo deve ter ao menos uma variante Zu"), CIGKVLevel->ZuVariants.Num() > 0);
        TestTrue(TEXT("AKhaaosCIGKVLevel ativo deve ter ao menos uma fase de zona"), CIGKVLevel->GetZonePhases().Num() > 0);

        for (int32 VariantIndex = 0; VariantIndex < CIGKVLevel->ZuVariants.Num(); ++VariantIndex)
        {
            const FCIGKVZuEntry& Variant = CIGKVLevel->ZuVariants[VariantIndex];
            UE_LOG(LogKhaaosRun, Display,
                TEXT("[CIGKV-DATA-SOURCE] ZuVariant[%d] id=%d point=%s rotation=%s"),
                VariantIndex, static_cast<int32>(Variant.Variant), *Variant.SpawnPoint.ToString(),
                *Variant.SpawnRotation.ToString());
        }

        const UKhaaosCIGKVMapData* MapData = CIGKVLevel->GetMapData();
        TestNotNull(TEXT("AKhaaosCIGKVLevel deve ter MapData após BeginPlay"), MapData);
        if (MapData)
        {
            const FString MapDataSource = DescribeMapDataSource(*CIGKVLevel, *MapData);
            const FString PackageName = MapData->GetOutermost() ? MapData->GetOutermost()->GetName() : TEXT("<no-package>");
            UE_LOG(LogKhaaosRun, Display,
                TEXT("[CIGKV-DATA-SOURCE] MapData source=%s object=%s package=%s isAsset=%s mapSize=%s playerSpawns=%d lootPoints=%d sectors={%s,%s,%s}"),
                *MapDataSource, *MapData->GetPathName(), *PackageName, MapData->IsAsset() ? TEXT("true") : TEXT("false"),
                *MapData->MapSize.ToString(), MapData->PlayerSpawnPoints.Num(),
                MapData->LootSpawnPoints.Num(), *MapData->ArmoryHub.SectorName,
                *MapData->ProvingGrounds.SectorName, *MapData->AbandonedPark.SectorName);
            TestTrue(TEXT("MapData deve disponibilizar pontos de loot no runtime"), MapData->LootSpawnPoints.Num() > 0);

            for (int32 SpawnIndex = 0; SpawnIndex < FMath::Min(3, MapData->PlayerSpawnPoints.Num()); ++SpawnIndex)
            {
                const FCIGKVSpawnPoint& Spawn = MapData->PlayerSpawnPoints[SpawnIndex];
                UE_LOG(LogKhaaosRun, Display,
                    TEXT("[CIGKV-DATA-SOURCE] MapDataPlayerSpawn[%d] sector=%s location=%s team=%d priority=%d"),
                    SpawnIndex, *Spawn.SectorName, *Spawn.Location.ToString(), Spawn.TeamIndex, Spawn.Priority);
            }
        }
    }

    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        const APlayerController* PlayerController = It->Get();
        const APawn* Pawn = PlayerController ? PlayerController->GetPawn() : nullptr;
        if (!Pawn)
        {
            continue;
        }

        int32 NearestZuVariant = INDEX_NONE;
        float NearestZuDistance = TNumericLimits<float>::Max();
        for (const AActor* Actor : CIGKVLevelActors)
        {
            const AKhaaosCIGKVLevel* CIGKVLevel = Cast<AKhaaosCIGKVLevel>(Actor);
            if (!CIGKVLevel)
            {
                continue;
            }
            for (int32 VariantIndex = 0; VariantIndex < CIGKVLevel->ZuVariants.Num(); ++VariantIndex)
            {
                const float Distance = FVector::Dist(Pawn->GetActorLocation(), CIGKVLevel->ZuVariants[VariantIndex].SpawnPoint);
                if (Distance < NearestZuDistance)
                {
                    NearestZuDistance = Distance;
                    NearestZuVariant = VariantIndex;
                }
            }
        }

        UE_LOG(LogKhaaosRun, Display,
            TEXT("[CIGKV-DATA-SOURCE] ActivePawn controller=%s location=%s nearestZuVariant=%d distanceCm=%.1f"),
            *PlayerController->GetPathName(), *Pawn->GetActorLocation().ToString(),
            NearestZuVariant, NearestZuDistance);
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[CIGKV-DATA-SOURCE] End of runtime source report. Search Output Log for [CIGKV-DATA-SOURCE]."));
    return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
