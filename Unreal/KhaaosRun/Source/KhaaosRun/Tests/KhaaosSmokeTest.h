// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/KhaaosGameMode.h"


// ─── Dedicated Server Smoke Tests (Integration) ─────────────────────────────
//
// These are integration tests that run on dedicated server context.
// They verify full system interactions through the GameMode.
// Marked with EAutomationTestFlags::ApplicationContext for server context.

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosSmoke_MatchLifecycle_StartFinish,
    "Khaaos.Smoke.MatchLifecycle.StartFinish",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosSmoke_PlayerJoinLeave_Counts,
    "Khaaos.Smoke.PlayerJoinLeave.Counts",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosSmoke_ZoneDamage_AppliesToOutside,
    "Khaaos.Smoke.ZoneDamage.AppliesToOutside",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosSmoke_LootSpawns_ItemsCreated,
    "Khaaos.Smoke.LootSpawns.ItemsCreated",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosSmoke_EconomyBridge_Connected,
    "Khaaos.Smoke.EconomyBridge.Connected",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosSmoke_WorldTransition_Completes,
    "Khaaos.Smoke.WorldTransition.Completes",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)
