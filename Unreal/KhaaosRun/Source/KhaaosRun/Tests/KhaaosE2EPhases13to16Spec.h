// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/WorldGen/KhaaosWorldGenerator.h"
#include "Game/Accessibility/KhaaosAccessibilitySystem.h"
#include "Game/Replay/KhaaosReplaySystem.h"
#include "Game/Polish/KhaaosLaunchReadiness.h"

/**
 * TKhaaosE2EPhases13to16Spec
 * E2E spec tests for Phases 13-16.
 */
class TKhaaosE2EPhases13to16Spec
{
public:
        // Phase 13
        static void TestWorldPresets();
        static void TestBiomeConfigs();
        static void TestLootDensityMap();
        static void TestPOIPlacement();

        // Phase 14
        static void TestColorblindModes();
        static void TestAimAssistConfig();
        static void TestLocalization();
        static void TestRTLLanguage();

        // Phase 15
        static void TestReplayRecording();
        static void TestReplayPlayback();
        static void TestSpectatorModes();
        static void TestHighlightMarkers();

        // Phase 16
        static void TestLaunchReadinessChecks();
        static void TestReadinessReport();
        static void TestBlockingChecks();

        static int32 RunAll();
};
