// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Debugger/KhaaosDebugCommands.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosAbilityComponent;
class UKhaaosActorPool;

/**
 * UKhaaosDebugCommands
 *
 * Game instance subsystem that registers console commands and variables
 * for runtime debugging of Khaaos Run systems.
 *
 * Commands:
 *   khaaos.debug.abilities [0/1]  — Toggle ability debugger display
 *   khaaos.debug.pool             — Dump pool stats to log
 *   khaaos.debug.relevancy        — Dump relevancy info to log
 *   khaaos.debug.network          — Dump network metrics to log
 *   khaaos.debug.zone             — Dump zone state to log
 *   khaaos.debug.god [0/1]        — Toggle god mode (invulnerability)
 *   khaaos.debug.infiniteammo [0/1] — Toggle infinite ammo
 *   khaaos.debug.spawnlootzone [radius] — Spawn test loot in a radius
 *
 * Usage: Register via Initialize() on game instance startup.
 * Console: type any command above in the UE console (~).
 */
UCLASS(Config = Game, defaultconfig)
class UKhaaosDebugCommands : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosDebugCommands();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Console Command Registration ─────────────────────────────────────────

	/** Register all debug console commands and variables. */
	void RegisterCommands();

	/** Unregister all debug console commands. */
	void UnregisterCommands();

	// ─── Debug State ──────────────────────────────────────────────────────────

	/** Whether the abilities debugger is enabled. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Debug")
	uint8 bDebugAbilities : 1;

	/** Whether god mode is active. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Debug")
	uint8 bGodMode : 1;

	/** Whether infinite ammo is active. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Debug")
	uint8 bInfiniteAmmo : 1;

	// ─── Console Command Handlers ─────────────────────────────────────────────

	/** Handle: khaaos.debug.abilities [0/1] */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_DebugAbilities(int32 bEnable);

	/** Handle: khaaos.debug.pool — dump pool stats to log. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_DumpPoolStats();

	/** Handle: khaaos.debug.relevancy — dump relevancy info to log. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_DumpRelevancy();

	/** Handle: khaaos.debug.network — dump network metrics to log. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_DumpNetworkMetrics();

	/** Handle: khaaos.debug.zone — dump zone state to log. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_DumpZoneState();

	/** Handle: khaaos.debug.god [0/1] — toggle god mode. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_GodMode(int32 bEnable);

	/** Handle: khaaos.debug.infiniteammo [0/1] — toggle infinite ammo. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_InfiniteAmmo(int32 bEnable);

	/** Handle: khaaos.debug.spawnlootzone [radius] — spawn test loot. */
	UFUNCTION(Exec, Category = "Khaaos|Debug")
	void Cmd_SpawnLootZone(float Radius = 500.0f);

private:

	/** Stored IConsoleVariable pointers for cleanup. */
	TArray<IConsoleVariable*> RegisteredVars;

	/** Stored IConsoleCommand pointers for cleanup. */
	TArray<IConsoleCommand*> RegisteredCmds;
};
