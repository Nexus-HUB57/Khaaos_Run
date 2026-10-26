// KhaaosCIGKVLevelData.cpp — Runtime level data loader implementation
#include "Game/Level/KhaaosCIGKVLevelData.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "HAL/PlatformFileManager.h"
#include "Kismet/GameplayStatics.h"

AKhaaosCIGKVLevelData::AKhaaosCIGKVLevelData()
{
    PrimaryActorTick.bCanEverTick = false;
    bReplicates = true;
}

void AKhaaosCIGKVLevelData::BeginPlay()
{
    Super::BeginPlay();

    // Try loading from JSON; fall back to hardcoded defaults
    FString JsonPath = GetDefaultJsonPath();
    if (!LoadFromJSON(JsonPath))
    {
        UE_LOG(LogTemp, Warning, TEXT("CIGKV: JSON load failed, using default data"));
        LoadDefaultData();
    }

    UE_LOG(LogTemp, Log, TEXT("CIGKV: Loaded %d spawns, %d ZEX, %d loot, %d zones"),
        SpawnPoints.Num(), ZEXZones.Num(), LootPoints.Num(), ZonePhases.Num());
}

FString AKhaaosCIGKVLevelData::GetDefaultJsonPath() const
{
    return FPaths::ProjectConfigDir() / TEXT("levels/CIGKV_level_data.json");
}

bool AKhaaosCIGKVLevelData::LoadFromJSON(const FString& JsonPath)
{
    IFileManager& FileManager = IFileManager::Get();
    if (!FileManager.FileExists(*JsonPath))
    {
        UE_LOG(LogTemp, Error, TEXT("CIGKV: JSON file not found: %s"), *JsonPath);
        return false;
    }

    FString JsonString;
    if (!FFileHelper::LoadFileToString(JsonString, *JsonPath))
    {
        UE_LOG(LogTemp, Error, TEXT("CIGKV: Failed to read JSON: %s"), *JsonPath);
        return false;
    }

    return ParseJSON(JsonString);
}

bool AKhaaosCIGKVLevelData::ParseJSON(const FString& JsonString)
{
    TSharedPtr<FJsonObject> RootObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);

    if (!FJsonSerializer::Deserialize(Reader, RootObject) || !RootObject.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("CIGKV: JSON parse failed"));
        return false;
    }

    // Parse spawn_points
    SpawnPoints.Empty();
    const TArray<TSharedPtr<FJsonValue>>* SpawnsArray;
    if (RootObject->TryGetArrayField(TEXT("spawn_points"), SpawnsArray))
    {
        for (const auto& Val : *SpawnsArray)
        {
            const TSharedPtr<FJsonObject> Obj = Val->AsObject();
            FKhaaosSpawnPoint SP;
            SP.Id = Obj->GetIntegerField(TEXT("id"));
            SP.Location = FVector(
                (float)Obj->GetNumberField(TEXT("x")),
                (float)Obj->GetNumberField(TEXT("y")),
                (float)Obj->GetNumberField(TEXT("z"))
            );
            SP.Rotation = (float)Obj->GetNumberField(TEXT("rotation"));
            SP.Sector = Obj->GetStringField(TEXT("sector"));
            SP.Team = Obj->GetStringField(TEXT("team"));
            SpawnPoints.Add(SP);
        }
    }

    // Parse zex_zones
    ZEXZones.Empty();
    const TArray<TSharedPtr<FJsonValue>>* ZEXArray;
    if (RootObject->TryGetArrayField(TEXT("zex_zones"), ZEXArray))
    {
        for (const auto& Val : *ZEXArray)
        {
            const TSharedPtr<FJsonObject> Obj = Val->AsObject();
            FKhaaosZEXZone ZEX;
            ZEX.Id = Obj->GetIntegerField(TEXT("id"));
            ZEX.Center = FVector(
                (float)Obj->GetNumberField(TEXT("x")),
                (float)Obj->GetNumberField(TEXT("y")),
                0.f
            );
            ZEX.Radius = (float)Obj->GetNumberField(TEXT("radius"));
            ZEX.Sector = Obj->GetStringField(TEXT("sector"));
            ZEXZones.Add(ZEX);
        }
    }

    // Parse loot_spawn_points
    LootPoints.Empty();
    const TArray<TSharedPtr<FJsonValue>>* LootArray;
    if (RootObject->TryGetArrayField(TEXT("loot_spawn_points"), LootArray))
    {
        for (const auto& Val : *LootArray)
        {
            const TSharedPtr<FJsonObject> Obj = Val->AsObject();
            FKhaaosLootPoint LP;
            LP.Id = Obj->GetIntegerField(TEXT("id"));
            LP.Location = FVector(
                (float)Obj->GetNumberField(TEXT("x")),
                (float)Obj->GetNumberField(TEXT("y")),
                (float)Obj->GetNumberField(TEXT("z"))
            );
            LP.Rarity = Obj->GetStringField(TEXT("rarity"));
            LP.Type = Obj->GetStringField(TEXT("type"));
            LP.ItemId = Obj->GetStringField(TEXT("item"));
            LootPoints.Add(LP);
        }
    }

    // Parse zone_phases
    ZonePhases.Empty();
    const TArray<TSharedPtr<FJsonValue>>* ZoneArray;
    if (RootObject->TryGetArrayField(TEXT("zone_phases"), ZoneArray))
    {
        for (const auto& Val : *ZoneArray)
        {
            const TSharedPtr<FJsonObject> Obj = Val->AsObject();
            FKhaaosZonePhase ZP;
            ZP.Phase = Obj->GetIntegerField(TEXT("phase"));
            ZP.Name = Obj->GetStringField(TEXT("name"));
            ZP.DamagePerSecond = (float)Obj->GetNumberField(TEXT("damage_per_second"));
            ZP.VisibilityPercent = (float)Obj->GetNumberField(TEXT("visibility_percent"));
            ZP.DurationSeconds = (float)Obj->GetNumberField(TEXT("duration_seconds"));
            ZP.RadiusPercent = (float)Obj->GetNumberField(TEXT("radius_percent"));

            const auto& CenterObj = Obj->GetObjectField(TEXT("center"));
            ZP.Center = FVector(
                (float)CenterObj->GetNumberField(TEXT("x")),
                (float)CenterObj->GetNumberField(TEXT("y")),
                0.f
            );
            ZonePhases.Add(ZP);
        }
    }

    // Parse top-level config
    MaxPlayers = RootObject->GetIntegerField(TEXT("capacity"));
    RingDurationMinutes = (float)RootObject->GetNumberField(TEXT("ring_duration_minutes"));

    const auto& PulsoObj = RootObject->GetObjectField(TEXT("pulso_khaaos"));
    PulsoKhaaosIntervalSeconds = (float)PulsoObj->GetNumberField(TEXT("interval_seconds"));

    EXCOTarget = RootObject->GetIntegerField(TEXT("exco_target"));

    return SpawnPoints.Num() > 0 && ZEXZones.Num() > 0;
}

bool AKhaaosCIGKVLevelData::LoadDefaultData()
{
    // Hardcoded fallback: 5 spawns per sector (minimum for testing)
    SpawnPoints = {
        {1,  FVector(256,256,0),   0,   TEXT("ArmoryHub"),      TEXT("neutral")},
        {2,  FVector(384,128,0),   180, TEXT("ArmoryHub"),      TEXT("neutral")},
        {3,  FVector(128,384,0),   90,  TEXT("ArmoryHub"),      TEXT("neutral")},
        {4,  FVector(600,200,0),   0,   TEXT("ProvingGrounds"), TEXT("alpha")},
        {5,  FVector(800,300,0),   90,  TEXT("ProvingGrounds"), TEXT("alpha")},
        {6,  FVector(1000,150,0),  180, TEXT("ProvingGrounds"), TEXT("bravo")},
        {7,  FVector(1200,250,0),  270, TEXT("ProvingGrounds"), TEXT("bravo")},
        {8,  FVector(800,1100,0),  0,   TEXT("Park"),           TEXT("delta")},
        {9,  FVector(1200,1300,0), 180, TEXT("Park"),           TEXT("echo")},
        {10, FVector(1800,1800,0), 90,  TEXT("Park"),           TEXT("foxtrot")}
    };

    ZEXZones = {
        {1,  FVector(300,300,0),   50, TEXT("ArmoryHub")},
        {2,  FVector(680,480,0),   40, TEXT("ProvingGrounds")},
        {3,  FVector(920,360,0),   45, TEXT("ProvingGrounds")},
        {4,  FVector(1200,1400,0), 45, TEXT("Park")},
        {5,  FVector(1850,1750,0), 45, TEXT("Park")}
    };

    ZonePhases = {
        {1, TEXT("Clear"),  1.f,  100.f, 300.f, 100.f, FVector(1024,1024,0)},
        {2, TEXT("Rain"),   3.f,   70.f, 240.f,  60.f, FVector(1024,1024,0)},
        {3, TEXT("Fog"),    5.f,   40.f, 180.f,  30.f, FVector(1024,1024,0)},
        {4, TEXT("Storm"), 10.f,   15.f, 120.f,  10.f, FVector(1024,1024,0)}
    };

    MaxPlayers = 50;
    RingDurationMinutes = 180.f;
    PulsoKhaaosIntervalSeconds = 600.f;
    EXCOTarget = 1000000;

    return true;
}

FKhaaosSpawnPoint AKhaaosCIGKVLevelData::GetRandomSpawnPoint() const
{
    if (SpawnPoints.Num() == 0) return FKhaaosSpawnPoint();
    return SpawnPoints[FMath::RandRange(0, SpawnPoints.Num() - 1)];
}

TArray<FKhaaosLootPoint> AKhaaosCIGKVLevelData::GetLootByRarity(const FString& Rarity) const
{
    TArray<FKhaaosLootPoint> Result;
    for (const auto& LP : LootPoints)
    {
        if (LP.Rarity == Rarity) Result.Add(LP);
    }
    return Result;
}

TArray<FKhaaosLootPoint> AKhaaosCIGKVLevelData::GetLootBySector(const FString& SectorName) const
{
    // Map loot position to sector bounds
    TArray<FKhaaosLootPoint> Result;
    for (const auto& LP : LootPoints)
    {
        // Determine sector from position
        float X = LP.Location.X, Y = LP.Location.Y;
        FString Sector;
        if (X < 512 && Y < 512) Sector = TEXT("ArmoryHub");
        else if (Y < 1024 && X >= 512 && X < 1536) Sector = TEXT("ProvingGrounds");
        else Sector = TEXT("Park");

        if (Sector == SectorName) Result.Add(LP);
    }
    return Result;
}
