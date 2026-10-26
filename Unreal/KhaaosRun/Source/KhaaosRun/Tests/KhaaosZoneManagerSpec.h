// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/Zone/KhaaosZoneManager.h"


// ─── Zone Manager Automation Spec Tests ────────────────────────────────────
//
// FKhaaosZoneManagerTest
// Automation spec test for UKhaaosZoneManagerComponent.
// Validates zone initialization, phase progression, shrink interpolation,
// damage escalation, cubic easing, and zone completion logic.
// UE5 AutomationTool SPEC_TEST macro style.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosZoneManager_Initialize_SetsDefaultPhases,
    "Khaaos.ZoneManager.Initialize.SetsDefaultPhases",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosZoneManager_AdvancePhase_IncrementsPhase,
    "Khaaos.ZoneManager.AdvancePhase.IncrementsPhase",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosZoneManager_Shrink_Interpolates,
    "Khaaos.ZoneManager.Shrink.Interpolates",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosZoneManager_Damage_Escalates,
    "Khaaos.ZoneManager.Damage.Escalates",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosZoneManager_CubicEase_BoundaryValues,
    "Khaaos.ZoneManager.CubicEase.BoundaryValues",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosZoneManager_IsZoneComplete_ReturnsTrue,
    "Khaaos.ZoneManager.IsZoneComplete.ReturnsTrue",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)
