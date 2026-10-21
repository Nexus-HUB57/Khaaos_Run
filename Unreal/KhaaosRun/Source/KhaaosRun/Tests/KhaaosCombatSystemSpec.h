// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/Combat/KhaaosDamageManager.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "Game/Revive/KhaaosReviveSystem.h"
#include "Game/Combat/KhaaosADSComponent.h"
#include "Game/UI/KhaaosKillFeedComponent.h"
#include "Game/AntiCheat/KhaaosAntiCheatComponent.h"


// ─── DamageManager Tests ─────────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosDamageManager_ValidHit_Applied,
    "Khaaos.Combat.DamageManager.ValidHit.Applied",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosDamageManager_InvalidHit_Rejected,
    "Khaaos.Combat.DamageManager.InvalidHit.Rejected",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosDamageManager_Headshot_Multiplied,
    "Khaaos.Combat.DamageManager.Headshot.Multiplied",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosDamageManager_RateLimit_Enforced,
    "Khaaos.Combat.DamageManager.RateLimit.Enforced",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

// ─── InventoryComponent Tests ────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosInventoryComponent_AddItem_FillsSlot,
    "Khaaos.Combat.Inventory.AddItem.FillsSlot",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosInventoryComponent_SwapSlots_ContentsSwapped,
    "Khaaos.Combat.Inventory.SwapSlots.ContentsSwapped",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosInventoryComponent_CycleWeapon_Cycles,
    "Khaaos.Combat.Inventory.CycleWeapon.Cycles",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

// ─── ReviveSystem Tests ──────────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosReviveSystem_DownPlayer_EntersDownedState,
    "Khaaos.Combat.Revive.DownPlayer.EntersDownedState",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosReviveSystem_RevivePlayer_EntersAliveState,
    "Khaaos.Combat.Revive.RevivePlayer.EntersAliveState",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

// ─── ADSComponent Tests ──────────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosADSComponent_EnterADS_SetsAiming,
    "Khaaos.Combat.ADS.EnterADS.SetsAiming",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

// ─── KillFeed Tests ──────────────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosKillFeed_AddEntry_Appended,
    "Khaaos.Combat.KillFeed.AddEntry.Appended",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

// ─── AntiCheat Tests ─────────────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosAntiCheat_ValidateHit_ImpossibleDistance,
    "Khaaos.Combat.AntiCheat.ValidateHit.ImpossibleDistance",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)
