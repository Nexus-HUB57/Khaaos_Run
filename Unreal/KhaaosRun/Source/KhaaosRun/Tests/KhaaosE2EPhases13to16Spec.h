// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/WorldGen/KhaaosWorldGenerator.h"
#include "Game/WorldGen/KhaaosProceduralLoot.h"
#include "Game/WorldGen/KhaaosWorldTransition.h"
#include "Game/WorldGen/KhaaosEnvironmentalHazard.h"
#include "Game/Accessibility/KhaaosAccessibilitySystem.h"
#include "Game/Localization/KhaaosLocalizationManager.h"
#include "Game/Replay/KhaaosReplaySystem.h"
#include "Game/Polish/KhaaosLaunchReadiness.h"

/**
 * TKhaaosE2EPhases13to16Spec
 * E2E spec tests for Phases 13-16 — complete coverage.
 */
class TKhaaosE2EPhases13to16Spec
{
public:
	// Phase 13: World Generation & PCG
	static void TestWorldPresets();
	static void TestBiomeConfigs();
	static void TestLootDensityMap();
	static void TestPOIPlacement();
	static void TestProceduralLootGeneration();
	static void TestLootSpawnProbability();
	static void TestLootTierDistribution();
	static void TestLootSeedDeterminism();
	static void TestWorldTransitionPipeline();
	static void TestTransitionRequest();
	static void TestTransitionCancel();
	static void TestMultiWorldSequence();
	static void TestEnvironmentalHazardSpawn();
	static void TestHazardLifecycle();
	static void TestHazardDamageArea();
	static void TestPeriodicHazard();

	// Phase 14: Accessibility & i18n
	static void TestColorblindModes();
	static void TestAimAssistConfig();
	static void TestLocalization();
	static void TestRTLLanguage();
	static void TestLocalizationManagerInit();
	static void TestLanguageSwitch();
	static void TestLocalizedTextLookup();
	static void TestGenderedText();
	static void TestNumberFormatting();
	static void TestCurrencyFormatting();
	static void TestCulturalAdaptations();

	// Phase 15: Replay & Spectator
	static void TestReplayRecording();
	static void TestReplayPlayback();
	static void TestSpectatorModes();
	static void TestHighlightMarkers();

	// Phase 16: Launch Readiness
	static void TestLaunchReadinessChecks();
	static void TestReadinessReport();
	static void TestBlockingChecks();

	static int32 RunAll();
};
