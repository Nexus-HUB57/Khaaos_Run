// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "KhaaosDataTables.generated.h"

/**
 * FKhaaosWeaponStats — Row struct for DT_WeaponStats data table.
 * Defines all weapon statistics used in combat and UI.
 */
USTRUCT(BlueprintType)
struct FKhaaosWeaponStats : public FTableRowBase
{
	GENERATED_BODY()

	/** Base damage per hit. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	float Damage = 25.0f;

	/** Fire rate (rounds per minute). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "1.0", ClampMax = "1200.0"))
	float FireRate = 600.0f;

	/** Magazine capacity. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "1"))
	int32 MagazineSize = 30;

	/** Reload time in seconds. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "0.1", ClampMax = "10.0"))
	float ReloadTime = 2.0f;

	/** Effective range in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "100.0"))
	float Range = 5000.0f;

	/** Spread angle in degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "0.0", ClampMax = "30.0"))
	float Spread = 1.0f;

	/** Recoil magnitude (0 = none, 1 = extreme). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Recoil = 0.3f;

	/** Headshot multiplier. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "1.0", ClampMax = "5.0"))
	float HeadshotMultiplier = 2.0f;

	/** Projectile velocity (0 = hitscan). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon", meta = (ClampMin = "0.0"))
	float ProjectileVelocity = 0.0f;

	/** Gameplay tag for damage type. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	FGameplayTag DamageTypeTag;
};

/**
 * FKhaaosLootTableEntry — Row struct for DT_LootTable data table.
 * Defines loot spawn rules for procedural distribution.
 */
USTRUCT(BlueprintType)
struct FKhaaosLootTableEntry : public FTableRowBase
{
	GENERATED_BODY()

	/** Unique item identifier. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot")
	FName ItemID;

	/** Rarity gameplay tag. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot")
	FGameplayTag Rarity;

	/** Loot type gameplay tag. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot")
	FGameplayTag Type;

	/** Spawn weight for loot distribution. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot", meta = (ClampMin = "0.0"))
	float SpawnWeight = 1.0f;

	/** Minimum spawn amount per stack. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot", meta = (ClampMin = "1"))
	int32 MinAmount = 1;

	/** Maximum spawn amount per stack. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot", meta = (ClampMin = "1"))
	int32 MaxAmount = 1;

	/** Soft reference to the pickup blueprint class. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Loot")
	TSoftClassPtr<AActor> PickupClass;
};

/**
 * FKhaaosZonePhaseConfig — Row struct for DT_ZonePhases data table.
 * Defines each phase of the safe zone shrink sequence.
 */
USTRUCT(BlueprintType)
struct FKhaaosZonePhaseConfig : public FTableRowBase
{
	GENERATED_BODY()

	/** Phase index (0-based). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zone", meta = (ClampMin = "0"))
	int32 Phase = 0;

	/** Delay in seconds before shrink starts. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zone", meta = (ClampMin = "0.0"))
	float StartDelay = 30.0f;

	/** Duration in seconds for the shrink transition. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zone", meta = (ClampMin = "0.1"))
	float ShrinkDuration = 15.0f;

	/** Damage per second inside the zone. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zone", meta = (ClampMin = "0.0"))
	float DamagePerSecond = 5.0f;

	/** Target radius as percentage of initial zone radius. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zone", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float RadiusPercent = 0.75f;
};

/**
 * FKhaaosAIDifficultyConfig — Row struct for DT_AIDifficulty data table.
 * Defines AI behavior parameters per difficulty level.
 */
USTRUCT(BlueprintType)
struct FKhaaosAIDifficultyConfig : public FTableRowBase
{
	GENERATED_BODY()

	/** Difficulty gameplay tag. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	FGameplayTag Difficulty;

	/** Reaction time in seconds (lower = faster). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI", meta = (ClampMin = "0.05", ClampMax = "5.0"))
	float ReactionTime = 0.5f;

	/** Aim accuracy (0 = always miss, 1 = perfect). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Accuracy = 0.7f;

	/** Aggression factor (0 = passive, 1 = hyper-aggressive). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Aggression = 0.5f;

	/** Health percentage below which AI retreats. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float RetreatThreshold = 0.25f;

	/** Maximum engagement distance. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI", meta = (ClampMin = "100.0"))
	float MaxEngageDistance = 5000.0f;

	/** Field of view in degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI", meta = (ClampMin = "10.0", ClampMax = "360.0"))
	float FieldOfView = 120.0f;
};

/**
 * FKhaaosEconomyItem — Row struct for DT_Economy data table.
 * Defines economy parameters for each tradeable item.
 */
USTRUCT(BlueprintType)
struct FKhaaosEconomyItem : public FTableRowBase
{
	GENERATED_BODY()

	/** Unique item identifier. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Economy")
	FName ItemID;

	/** Base price before supply/demand adjustment. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Economy", meta = (ClampMin = "0.0"))
	float BasePrice = 100.0f;

	/** Supply elasticity (how much supply affects price). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Economy", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float SupplyElasticity = 1.0f;

	/** Demand elasticity (how much demand affects price). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Economy", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float DemandElasticity = 1.0f;

	/** Current supply level. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Economy", meta = (ClampMin = "0.0"))
	float CurrentSupply = 100.0f;

	/** Current demand level. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Economy", meta = (ClampMin = "0.0"))
	float CurrentDemand = 100.0f;
};

/**
 * UKhaaosDataTablesSubsystem — GameInstanceSubsystem providing access to all
 * game data tables. Uses TSoftObjectPtr for lazy loading and caches resolved
 * data for fast repeated access.
 */
UCLASS(Abstract, BlueprintType, Config = Game, defaultconfig)
class UKhaaosDataTablesSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// ─── Subsystem Lifecycle ──────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Data Table Accessors ────────────────────────────────────────────

	/** Get weapon stats for a specific weapon row. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	bool GetWeaponStats(FName WeaponID, FKhaaosWeaponStats& OutStats) const;

	/** Get all rows from the weapon stats table. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	TMap<FName, FKhaaosWeaponStats> GetAllWeaponStats() const;

	/** Get loot table entry for a specific item. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	bool GetLootTableEntry(FName ItemID, FKhaaosLootTableEntry& OutEntry) const;

	/** Get all rows from the loot table. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	TMap<FName, FKhaaosLootTableEntry> GetAllLootTableEntries() const;

	/** Get zone phase config for a specific phase. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	bool GetZonePhaseConfig(int32 Phase, FKhaaosZonePhaseConfig& OutConfig) const;

	/** Get all zone phase configs. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	TArray<FKhaaosZonePhaseConfig> GetAllZonePhaseConfigs() const;

	/** Get AI difficulty config for a specific difficulty tag. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	bool GetAIDifficultyConfig(FGameplayTag Difficulty, FKhaaosAIDifficultyConfig& OutConfig) const;

	/** Get economy item data for a specific item. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	bool GetEconomyItem(FName ItemID, FKhaaosEconomyItem& OutItem) const;

	// ─── Data Table Loading ──────────────────────────────────────────────

	/** Load all data tables synchronously. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Data")
	bool LoadAllTables();

	/** Check if a specific data table is loaded. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Data")
	bool IsTableLoaded(FName TableName) const;

private:
	/** Weapon stats data table. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Data")
	TSoftObjectPtr<UDataTable> DT_WeaponStats;

	/** Loot table. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Data")
	TSoftObjectPtr<UDataTable> DT_LootTable;

	/** Zone phases data table. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Data")
	TSoftObjectPtr<UDataTable> DT_ZonePhases;

	/** AI difficulty data table. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Data")
	TSoftObjectPtr<UDataTable> DT_AIDifficulty;

	/** Economy data table. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Data")
	TSoftObjectPtr<UDataTable> DT_Economy;

	/** Cached resolved data tables. */
	UPROPERTY(Transient)
	TMap<FName, TObjectPtr<UDataTable>> CachedTables;

	/** Resolve a soft reference to a data table. */
	UDataTable* ResolveDataTable(TSoftObjectPtr<UDataTable>& SoftRef, FName TableName);
};
