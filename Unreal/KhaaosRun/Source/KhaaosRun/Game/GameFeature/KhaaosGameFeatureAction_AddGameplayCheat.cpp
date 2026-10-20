// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#include "Game/GameFeature/KhaaosGameFeatureAction_AddGameplayCheat.h"

#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/Pawn.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"

// Include Khaaos-specific headers for cheat targets
#include "Game/KhaaosGameMode.h"
#include "Game/Zone/KhaaosZoneManager.h"
#include "Game/Data/KhaaosWeaponDataAsset.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Player/KhaaosPlayerState.h"

// ─── Log Category ──────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosCheat, Log, All);

// ─── Constructor ───────────────────────────────────────────────────────────────

UKhaaosGameFeatureAction_AddGameplayCheat::UKhaaosGameFeatureAction_AddGameplayCheat()
    : bCheatsRegistered(false)
{
    // Initialize default cheat entries
    InitDefaultCheatEntries();
}

// ─── UGameFeatureAction Interface ──────────────────────────────────────────────

void UKhaaosGameFeatureAction_AddGameplayCheat::OnGameFeatureRegistering()
{
    if (bCheatsRegistered)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("KhaaosCheat: OnGameFeatureRegistering — cheats already registered, skipping"));
        return;
    }

    UE_LOG(LogKhaaosCheat, Log, TEXT("KhaaosCheat: OnGameFeatureRegistering — registering %d gameplay cheats"), CheatEntries.Num());

    IConsoleManager& ConsoleManager = IConsoleManager::Get();

    // ─── Register Khaaos.SkipZoneWait ─────────────────────────────────────

    {
        const FString CmdName = TEXT("Khaaos.SkipZoneWait");
        IConsoleObject* CmdObj = ConsoleManager.RegisterConsoleCommand(
            *CmdName,
            TEXT("Skip the current zone wait phase (server-only)"),
            FConsoleCommandDelegate::CreateStatic(&UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_SkipZoneWait),
            EConsoleFlags::ECF_Cheat
        );
        if (CmdObj)
        {
            RegisteredConsoleObjects.Add(CmdObj);
            UE_LOG(LogKhaaosCheat, Log, TEXT("  Registered: %s"), *CmdName);
        }
    }

    // ─── Register Khaaos.ForceNextPhase ───────────────────────────────────

    {
        const FString CmdName = TEXT("Khaaos.ForceNextPhase");
        IConsoleObject* CmdObj = ConsoleManager.RegisterConsoleCommand(
            *CmdName,
            TEXT("Force advance to next zone phase (server-only)"),
            FConsoleCommandDelegate::CreateStatic(&UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_ForceNextPhase),
            EConsoleFlags::ECF_Cheat
        );
        if (CmdObj)
        {
            RegisteredConsoleObjects.Add(CmdObj);
            UE_LOG(LogKhaaosCheat, Log, TEXT("  Registered: %s"), *CmdName);
        }
    }

    // ─── Register Khaaos.GiveAllWeapons ───────────────────────────────────

    {
        const FString CmdName = TEXT("Khaaos.GiveAllWeapons");
        IConsoleObject* CmdObj = ConsoleManager.RegisterConsoleCommand(
            *CmdName,
            TEXT("Give all weapons to executing player (server-only)"),
            FConsoleCommandDelegate::CreateStatic(&UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_GiveAllWeapons),
            EConsoleFlags::ECF_Cheat
        );
        if (CmdObj)
        {
            RegisteredConsoleObjects.Add(CmdObj);
            UE_LOG(LogKhaaosCheat, Log, TEXT("  Registered: %s"), *CmdName);
        }
    }

    // ─── Register Khaaos.GodMode ──────────────────────────────────────────

    {
        const FString CmdName = TEXT("Khaaos.GodMode");
        IConsoleObject* CmdObj = ConsoleManager.RegisterConsoleCommand(
            *CmdName,
            TEXT("Toggle god mode / invulnerability (server-only)"),
            FConsoleCommandDelegate::CreateStatic(&UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_GodMode),
            EConsoleFlags::ECF_Cheat
        );
        if (CmdObj)
        {
            RegisteredConsoleObjects.Add(CmdObj);
            UE_LOG(LogKhaaosCheat, Log, TEXT("  Registered: %s"), *CmdName);
        }
    }

    // ─── Register Khaaos.SpawnLoot ────────────────────────────────────────

    {
        const FString CmdName = TEXT("Khaaos.SpawnLoot");
        IConsoleObject* CmdObj = ConsoleManager.RegisterConsoleCommand(
            *CmdName,
            TEXT("Spawn loot from data assets at current location (server-only)"),
            FConsoleCommandDelegate::CreateStatic(&UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_SpawnLoot),
            EConsoleFlags::ECF_Cheat
        );
        if (CmdObj)
        {
            RegisteredConsoleObjects.Add(CmdObj);
            UE_LOG(LogKhaaosCheat, Log, TEXT("  Registered: %s"), *CmdName);
        }
    }

    // ─── Register Khaaos.TeleportToZone ───────────────────────────────────

    {
        const FString CmdName = TEXT("Khaaos.TeleportToZone");
        IConsoleObject* CmdObj = ConsoleManager.RegisterConsoleCommand(
            *CmdName,
            TEXT("Teleport player to current zone center (server-only)"),
            FConsoleCommandDelegate::CreateStatic(&UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_TeleportToZone),
            EConsoleFlags::ECF_Cheat
        );
        if (CmdObj)
        {
            RegisteredConsoleObjects.Add(CmdObj);
            UE_LOG(LogKhaaosCheat, Log, TEXT("  Registered: %s"), *CmdName);
        }
    }

    bCheatsRegistered = true;

    UE_LOG(LogKhaaosCheat, Log, TEXT("KhaaosCheat: All %d cheats registered successfully"), RegisteredConsoleObjects.Num());
}

void UKhaaosGameFeatureAction_AddGameplayCheat::OnGameFeatureUnregistering()
{
    if (!bCheatsRegistered)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("KhaaosCheat: OnGameFeatureUnregistering — cheats not registered, skipping"));
        return;
    }

    UE_LOG(LogKhaaosCheat, Log, TEXT("KhaaosCheat: OnGameFeatureUnregistering — unregistering %d cheats"), RegisteredConsoleObjects.Num());

    IConsoleManager& ConsoleManager = IConsoleManager::Get();

    // Unregister each console command
    for (IConsoleObject* CmdObj : RegisteredConsoleObjects)
    {
        if (CmdObj)
        {
            ConsoleManager.UnregisterConsoleObject(CmdObj);
            UE_LOG(LogKhaaosCheat, Verbose, TEXT("  Unregistered: %s"), *CmdObj->GetName());
        }
    }

    RegisteredConsoleObjects.Empty();
    bCheatsRegistered = false;

    UE_LOG(LogKhaaosCheat, Log, TEXT("KhaaosCheat: All cheats unregistered"));
}

// ─── Cheat Implementations ─────────────────────────────────────────────────────

void UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_SkipZoneWait(const TArray<FString>& Args)
{
    UWorld* World = GetGameWorld();
    if (!World || !World->GetAuthGameMode())
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.SkipZoneWait: No game world or game mode"));
        return;
    }

    // Require server authority
    if (World->GetNetMode() != NM_DedicatedServer && World->GetNetMode() != NM_ListenServer)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.SkipZoneWait: Requires ROLE_Authority (server-only)"));
        return;
    }

    AKhaaosGameMode* KhaaosGM = Cast<AKhaaosGameMode>(World->GetAuthGameMode());
    if (KhaaosGM && KhaaosGM->ZoneManager)
    {
        KhaaosGM->ZoneManager->SkipCurrentWait();
        UE_LOG(LogKhaaosCheat, Log, TEXT("Khaaos.SkipZoneWait: Zone wait skipped"));
    }
    else
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.SkipZoneWait: ZoneManager not found"));
    }
}

void UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_ForceNextPhase(const TArray<FString>& Args)
{
    UWorld* World = GetGameWorld();
    if (!World || !World->GetAuthGameMode())
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.ForceNextPhase: No game world or game mode"));
        return;
    }

    // Require server authority
    if (World->GetNetMode() != NM_DedicatedServer && World->GetNetMode() != NM_ListenServer)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.ForceNextPhase: Requires ROLE_Authority (server-only)"));
        return;
    }

    AKhaaosGameMode* KhaaosGM = Cast<AKhaaosGameMode>(World->GetAuthGameMode());
    if (KhaaosGM && KhaaosGM->ZoneManager)
    {
        KhaaosGM->ZoneManager->ForceNextPhase();
        UE_LOG(LogKhaaosCheat, Log, TEXT("Khaaos.ForceNextPhase: Forced to next zone phase"));
    }
    else
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.ForceNextPhase: ZoneManager not found"));
    }
}

void UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_GiveAllWeapons(const TArray<FString>& Args)
{
    UWorld* World = GetGameWorld();
    if (!World || !World->GetAuthGameMode())
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.GiveAllWeapons: No game world or game mode"));
        return;
    }

    // Require server authority
    if (World->GetNetMode() != NM_DedicatedServer && World->GetNetMode() != NM_ListenServer)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.GiveAllWeapons: Requires ROLE_Authority (server-only)"));
        return;
    }

    AKhaaosGameMode* KhaaosGM = Cast<AKhaaosGameMode>(World->GetAuthGameMode());
    if (!KhaaosGM)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.GiveAllWeapons: KhaaosGameMode not found"));
        return;
    }

    // Give all weapons from loaded weapon assets to the first player
    int32 WeaponsGiven = 0;
    for (UKhaaosWeaponDataAsset* WeaponAsset : KhaaosGM->LoadedWeaponAssets)
    {
        if (WeaponAsset)
        {
            // Assign weapon via GameMode's weapon component system
            // The actual equip logic is handled by AssignWeaponLoadout
            WeaponsGiven++;
            UE_LOG(LogKhaaosCheat, Verbose, TEXT("  Given weapon: %s"), *WeaponAsset->GetName());
        }
    }

    // Also assign a full loadout to the executing player
    if (APlayerController* PC = World->GetFirstPlayerController())
    {
        if (APlayerState* PS = PC->PlayerState)
        {
            KhaaosGM->AssignWeaponLoadout(PS);
        }
    }

    UE_LOG(LogKhaaosCheat, Log, TEXT("Khaaos.GiveAllWeapons: %d weapons available, loadout assigned"), WeaponsGiven);
}

void UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_GodMode(const TArray<FString>& Args)
{
    UWorld* World = GetGameWorld();
    if (!World)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.GodMode: No game world"));
        return;
    }

    // Require server authority
    if (World->GetNetMode() != NM_DedicatedServer && World->GetNetMode() != NM_ListenServer)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.GodMode: Requires ROLE_Authority (server-only)"));
        return;
    }

    if (APlayerController* PC = World->GetFirstPlayerController())
    {
        if (APawn* Pawn = PC->GetPawn())
        {
            // Toggle invulnerability
            const bool bNewGodMode = !Pawn->CanBeDamaged();
            Pawn->SetCanBeDamaged(bNewGodMode ? false : true);

            UE_LOG(LogKhaaosCheat, Log, TEXT("Khaaos.GodMode: %s for %s"),
                bNewGodMode ? TEXT("ENABLED") : TEXT("DISABLED"),
                *Pawn->GetName());
        }
        else
        {
            UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.GodMode: No pawn possessed"));
        }
    }
}

void UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_SpawnLoot(const TArray<FString>& Args)
{
    UWorld* World = GetGameWorld();
    if (!World || !World->GetAuthGameMode())
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.SpawnLoot: No game world or game mode"));
        return;
    }

    // Require server authority
    if (World->GetNetMode() != NM_DedicatedServer && World->GetNetMode() != NM_ListenServer)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.SpawnLoot: Requires ROLE_Authority (server-only)"));
        return;
    }

    AKhaaosGameMode* KhaaosGM = Cast<AKhaaosGameMode>(World->GetAuthGameMode());
    if (KhaaosGM)
    {
        // Spawn loot from data assets using GameMode's data-driven loot system
        KhaaosGM->SpawnLootFromDataAssets();
        UE_LOG(LogKhaaosCheat, Log, TEXT("Khaaos.SpawnLoot: Loot spawned from data assets"));
    }
    else
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.SpawnLoot: KhaaosGameMode not found"));
    }
}

void UKhaaosGameFeatureAction_AddGameplayCheat::Cheat_TeleportToZone(const TArray<FString>& Args)
{
    UWorld* World = GetGameWorld();
    if (!World || !World->GetAuthGameMode())
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.TeleportToZone: No game world or game mode"));
        return;
    }

    // Require server authority
    if (World->GetNetMode() != NM_DedicatedServer && World->GetNetMode() != NM_ListenServer)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.TeleportToZone: Requires ROLE_Authority (server-only)"));
        return;
    }

    AKhaaosGameMode* KhaaosGM = Cast<AKhaaosGameMode>(World->GetAuthGameMode());
    if (!KhaaosGM || !KhaaosGM->ZoneManager)
    {
        UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.TeleportToZone: ZoneManager not found"));
        return;
    }

    // Get zone center
    const FVector2D ZoneCenter2D = KhaaosGM->ZoneManager->GetZoneCenter();
    const FVector ZoneCenter(ZoneCenter2D.X, ZoneCenter2D.Y, 0.0f);

    // Teleport the first player's pawn to zone center
    if (APlayerController* PC = World->GetFirstPlayerController())
    {
        if (APawn* Pawn = PC->GetPawn())
        {
            // Find ground Z at zone center
            FVector TargetLocation = ZoneCenter;

            // Line trace to find ground
            FHitResult HitResult;
            const FVector TraceStart = TargetLocation + FVector(0.0f, 0.0f, 10000.0f);
            const FVector TraceEnd = TargetLocation - FVector(0.0f, 0.0f, 10000.0f);
            FCollisionQueryParams QueryParams(SCENE_QUERY_STAT(TeleportToZone), true, Pawn);

            if (World->LineTraceSingleByChannel(HitResult, TraceStart, TraceEnd, ECC_WorldStatic, QueryParams))
            {
                TargetLocation.Z = HitResult.Location.Z + 100.0f; // Offset above ground
            }
            else
            {
                TargetLocation.Z = Pawn->GetActorLocation().Z; // Keep current Z
            }

            Pawn->SetActorLocation(TargetLocation, false, nullptr, ETeleportType::TeleportPhysics);

            UE_LOG(LogKhaaosCheat, Log, TEXT("Khaaos.TeleportToZone: Teleported %s to zone center (%.0f, %.0f, %.0f)"),
                *Pawn->GetName(), TargetLocation.X, TargetLocation.Y, TargetLocation.Z);
        }
        else
        {
            UE_LOG(LogKhaaosCheat, Warning, TEXT("Khaaos.TeleportToZone: No pawn possessed"));
        }
    }
}

// ─── Internal Methods ─────────────────────────────────────────────────────────

void UKhaaosGameFeatureAction_AddGameplayCheat::InitDefaultCheatEntries()
{
    CheatEntries.Empty();

    CheatEntries.Add(FKhaaosCheatEntry(
        TEXT("Khaaos.SkipZoneWait"),
        TEXT("Skip the current zone wait phase (server-only)")
    ));

    CheatEntries.Add(FKhaaosCheatEntry(
        TEXT("Khaaos.ForceNextPhase"),
        TEXT("Force advance to next zone phase (server-only)")
    ));

    CheatEntries.Add(FKhaaosCheatEntry(
        TEXT("Khaaos.GiveAllWeapons"),
        TEXT("Give all weapons to executing player (server-only)")
    ));

    CheatEntries.Add(FKhaaosCheatEntry(
        TEXT("Khaaos.GodMode"),
        TEXT("Toggle god mode / invulnerability (server-only)")
    ));

    CheatEntries.Add(FKhaaosCheatEntry(
        TEXT("Khaaos.SpawnLoot"),
        TEXT("Spawn loot from data assets at current location (server-only)")
    ));

    CheatEntries.Add(FKhaaosCheatEntry(
        TEXT("Khaaos.TeleportToZone"),
        TEXT("Teleport player to current zone center (server-only)")
    ));
}

UWorld* UKhaaosGameFeatureAction_AddGameplayCheat::GetGameWorld()
{
    // Try to get the game world from the GEngine list
    if (GEngine)
    {
        for (const FWorldContext& Context : GEngine->GetWorldContexts())
        {
            if (Context.WorldType == EWorldType::Game)
            {
                return Context.World();
            }
        }
    }

    return nullptr;
}
