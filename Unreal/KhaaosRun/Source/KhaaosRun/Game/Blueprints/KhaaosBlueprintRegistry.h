// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/AssetManager.h"
#include "KhaaosBlueprintRegistry.generated.h"

/**
 * UKhaaosBlueprintRegistry — Central registry of all blueprint classes used in Khaaos Run.
 * Uses TSoftClassPtr for async-safe references that don't force-load blueprint assets.
 * Call LoadAll() at match start to async-load all blueprints, then use GetBP<T>() to access.
 *
 * Naming convention follows ue5-style-guide: BP_ prefix for all Blueprint classes.
 */
UCLASS(Abstract, BlueprintType, Config = Game, defaultconfig)
class UKhaaosBlueprintRegistry : public UObject
{
	GENERATED_BODY()

public:
	// ─── Core Game Blueprints ────────────────────────────────────────────

	/** Player character blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AActor> BP_KhaaosCharacter;

	/** Player controller blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AController> BP_KhaaosPlayerController;

	/** AI controller blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AController> BP_KhaaosAIController;

	/** HUD blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AActor> BP_KhaaosHUD;

	/** Game mode blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AActor> BP_KhaaosGameMode;

	/** Game state blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AActor> BP_KhaaosGameState;

	/** Player state blueprint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Core")
	TSoftClassPtr<AActor> BP_KhaaosPlayerState;

	// ─── Weapon Blueprints ───────────────────────────────────────────────

	/** Assault Rifle weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_AR;

	/** Shotgun weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_Shotgun;

	/** Sniper weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_Sniper;

	/** Pistol weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_Pistol;

	/** Melee weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_Melee;

	/** SMG weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_SMG;

	/** Throwable weapon. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Weapons")
	TSoftClassPtr<AActor> BP_Throwable;

	// ─── Loot Blueprints ─────────────────────────────────────────────────

	/** Common loot pickup. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Loot")
	TSoftClassPtr<AActor> BP_LootPickup_Common;

	/** Uncommon loot pickup. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Loot")
	TSoftClassPtr<AActor> BP_LootPickup_Uncommon;

	/** Rare loot pickup. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Loot")
	TSoftClassPtr<AActor> BP_LootPickup_Rare;

	/** Epic loot pickup. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Loot")
	TSoftClassPtr<AActor> BP_LootPickup_Epic;

	/** Legendary loot pickup. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Loot")
	TSoftClassPtr<AActor> BP_LootPickup_Legendary;

	// ─── AI Blueprints ───────────────────────────────────────────────────

	/** Standard AI pawn. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|AI")
	TSoftClassPtr<AActor> BP_KhaaosAI;

	/** Elite AI pawn. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|AI")
	TSoftClassPtr<AActor> BP_KhaaosAIElite;

	/** Boss AI pawn. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|AI")
	TSoftClassPtr<AActor> BP_KhaaosAIBoss;

	// ─── Zone Blueprints ─────────────────────────────────────────────────

	/** Safe zone visual effect. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Zone")
	TSoftClassPtr<AActor> BP_SafeZoneVisual;

	/** Zone warning indicator. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Zone")
	TSoftClassPtr<AActor> BP_ZoneWarning;

	/** Zone damage volume. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|Zone")
	TSoftClassPtr<AActor> BP_ZoneDamageVolume;

	// ─── UI Blueprints ───────────────────────────────────────────────────

	/** Main menu UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_MainMenu;

	/** HUD overlay UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_HUD;

	/** Inventory UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_Inventory;

	/** Scoreboard UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_Scoreboard;

	/** Loadout selection UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_LoadoutScreen;

	/** Death screen UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_DeathScreen;

	/** Victory screen UI. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Blueprints|UI")
	TSoftClassPtr<UUserWidget> BP_VictoryScreen;

	// ─── Loading & Access ────────────────────────────────────────────────

	/** Async load all registered blueprint classes. Calls OnComplete when finished. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Blueprints")
	void LoadAll(FOnAssetLoadComplete OnComplete = FOnAssetLoadComplete());

	/** Check if all blueprints are loaded. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Blueprints")
	bool AreAllLoaded() const;

	/**
	 * Template accessor — get the resolved UClass for a TSoftClassPtr.
	 * Returns nullptr if not yet loaded.
	 * Usage: UClass* CharClass = Registry->GetBP<AActor>(Registry->BP_KhaaosCharacter);
	 */
	template<typename T>
	TSubclassOf<T> GetBP(const TSoftClassPtr<T>& SoftClassPtr) const
	{
		if (SoftClassPtr.IsValid())
		{
			return SoftClassPtr.Get();
		}
		return nullptr;
	}

private:
	/** Gather all soft class pointers for batch loading. */
	TArray<FSoftObjectPath> GatherAllSoftClassPaths() const;

	/** Number of pending async loads. */
	int32 PendingLoadCount = 0;

	/** Callback to invoke when all loads complete. */
	FOnAssetLoadComplete PendingCompleteCallback;
};
