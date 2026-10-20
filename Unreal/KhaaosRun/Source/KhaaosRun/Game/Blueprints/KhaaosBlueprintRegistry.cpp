// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Blueprints/KhaaosBlueprintRegistry.h"
#include "Engine/AssetManager.h"
#include "UObject/SoftObjectPtr.h"

void UKhaaosBlueprintRegistry::LoadAll(FOnAssetLoadComplete OnComplete)
{
	TArray<FSoftObjectPath> AllPaths = GatherAllSoftClassPaths();

	if (AllPaths.Num() == 0)
	{
		if (OnComplete.IsBound())
		{
			OnComplete.Execute();
		}
		return;
	}

	PendingLoadCount = AllPaths.Num();
	PendingCompleteCallback = MoveTemp(OnComplete);

	UAssetManager& AssetManager = UAssetManager::Get();

	for (const FSoftObjectPath& Path : AllPaths)
	{
		TArray<FName> Bundles;
		AssetManager.LoadAssetByPath(Path, FStreamableDelegate::CreateWeakLambda(this,
			[this]()
			{
				--PendingLoadCount;
				if (PendingLoadCount <= 0)
				{
					PendingLoadCount = 0;
					if (PendingCompleteCallback.IsBound())
					{
						PendingCompleteCallback.Execute();
						PendingCompleteCallback.Unbind();
					}
				}
			}),
			Bundles,
			FStreamableManager::AsyncLoadHighPriority
		);
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosBlueprintRegistry: Started async load of %d blueprint classes"), AllPaths.Num());
}

bool UKhaaosBlueprintRegistry::AreAllLoaded() const
{
	// Check all soft class pointers — valid means resolved
	auto CheckPtr = [](const FSoftObjectPath& Path) -> bool
	{
		return !Path.IsValid() || Path.IsAssetLoaded();
	};

	TArray<FSoftObjectPath> AllPaths = GatherAllSoftClassPaths();
	for (const FSoftObjectPath& Path : AllPaths)
	{
		if (Path.IsValid() && !Path.IsAssetLoaded())
		{
			return false;
		}
	}

	return true;
}

TArray<FSoftObjectPath> UKhaaosBlueprintRegistry::GatherAllSoftClassPaths() const
{
	TArray<FSoftObjectPath> Paths;

	// Helper lambda to add valid paths
	auto AddIfValid = [&Paths](const FSoftObjectPath& Path)
	{
		if (Path.IsValid())
		{
			Paths.Add(Path);
		}
	};

	// ─── Core ────────────────────────────────────────────────────────────
	AddIfValid(BP_KhaaosCharacter.ToSoftObjectPath());
	AddIfValid(BP_KhaaosPlayerController.ToSoftObjectPath());
	AddIfValid(BP_KhaaosAIController.ToSoftObjectPath());
	AddIfValid(BP_KhaaosHUD.ToSoftObjectPath());
	AddIfValid(BP_KhaaosGameMode.ToSoftObjectPath());
	AddIfValid(BP_KhaaosGameState.ToSoftObjectPath());
	AddIfValid(BP_KhaaosPlayerState.ToSoftObjectPath());

	// ─── Weapons ─────────────────────────────────────────────────────────
	AddIfValid(BP_AR.ToSoftObjectPath());
	AddIfValid(BP_Shotgun.ToSoftObjectPath());
	AddIfValid(BP_Sniper.ToSoftObjectPath());
	AddIfValid(BP_Pistol.ToSoftObjectPath());
	AddIfValid(BP_Melee.ToSoftObjectPath());
	AddIfValid(BP_SMG.ToSoftObjectPath());
	AddIfValid(BP_Throwable.ToSoftObjectPath());

	// ─── Loot ────────────────────────────────────────────────────────────
	AddIfValid(BP_LootPickup_Common.ToSoftObjectPath());
	AddIfValid(BP_LootPickup_Uncommon.ToSoftObjectPath());
	AddIfValid(BP_LootPickup_Rare.ToSoftObjectPath());
	AddIfValid(BP_LootPickup_Epic.ToSoftObjectPath());
	AddIfValid(BP_LootPickup_Legendary.ToSoftObjectPath());

	// ─── AI ──────────────────────────────────────────────────────────────
	AddIfValid(BP_KhaaosAI.ToSoftObjectPath());
	AddIfValid(BP_KhaaosAIElite.ToSoftObjectPath());
	AddIfValid(BP_KhaaosAIBoss.ToSoftObjectPath());

	// ─── Zone ────────────────────────────────────────────────────────────
	AddIfValid(BP_SafeZoneVisual.ToSoftObjectPath());
	AddIfValid(BP_ZoneWarning.ToSoftObjectPath());
	AddIfValid(BP_ZoneDamageVolume.ToSoftObjectPath());

	// ─── UI ──────────────────────────────────────────────────────────────
	AddIfValid(BP_MainMenu.ToSoftObjectPath());
	AddIfValid(BP_HUD.ToSoftObjectPath());
	AddIfValid(BP_Inventory.ToSoftObjectPath());
	AddIfValid(BP_Scoreboard.ToSoftObjectPath());
	AddIfValid(BP_LoadoutScreen.ToSoftObjectPath());
	AddIfValid(BP_DeathScreen.ToSoftObjectPath());
	AddIfValid(BP_VictoryScreen.ToSoftObjectPath());

	return Paths;
}
