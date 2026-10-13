// KhaaosCIGKVLevelData.h — Runtime level data loader for CIGKV map
// Reads spawn4 CIGKV_level_data.json and populates spawn points, ZEX, loot, zones
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosCIGKVLevelData.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosSpawnPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Id = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Rotation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Sector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Team;
};

USTRUCT(BlueprintType)
struct FKhaaosZEXZone
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Id = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Center = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Radius = 50.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Sector;
};

USTRUCT(BlueprintType)
struct FKhaaosLootPoint
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Id = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Location = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Rarity;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
};

USTRUCT(BlueprintType)
struct FKhaaosZonePhase
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Phase = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DamagePerSecond = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float VisibilityPercent = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float DurationSeconds = 300.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RadiusPercent = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Center = FVector(1024.f, 1024.f, 0.f);
};

UCLASS(BlueprintType, Blueprintable)
class KHAAOSRUN_API AKhaaosCIGKVLevelData : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosCIGKVLevelData();

    // ─── Data Access ───
    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    const TArray<FKhaaosSpawnPoint>& GetSpawnPoints() const { return SpawnPoints; }

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    const TArray<FKhaaosZEXZone>& GetZEXZones() const { return ZEXZones; }

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    const TArray<FKhaaosLootPoint>& GetLootPoints() const { return LootPoints; }

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    const TArray<FKhaaosZonePhase>& GetZonePhases() const { return ZonePhases; }

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    FKhaaosSpawnPoint GetRandomSpawnPoint() const;

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    TArray<FKhaaosLootPoint> GetLootByRarity(const FString& Rarity) const;

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    TArray<FKhaaosLootPoint> GetLootBySector(const FString& SectorName) const;

    // ─── Configuration ───
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Khaaos|Level")
    int32 MaxPlayers = 50;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Khaaos|Level")
    float RingDurationMinutes = 180.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Khaaos|Level")
    float PulsoKhaaosIntervalSeconds = 600.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Khaaos|Level")
    int32 EXCOTarget = 1000000;

    // ─── Loading ───
    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    bool LoadFromJSON(const FString& JsonPath);

    UFUNCTION(BlueprintCallable, Category="Khaaos|Level")
    bool LoadDefaultData();

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY() TArray<FKhaaosSpawnPoint> SpawnPoints;
    UPROPERTY() TArray<FKhaaosZEXZone> ZEXZones;
    UPROPERTY() TArray<FKhaaosLootPoint> LootPoints;
    UPROPERTY() TArray<FKhaaosZonePhase> ZonePhases;

    bool ParseJSON(const FString& JsonString);
    FString GetDefaultJsonPath() const;
};
