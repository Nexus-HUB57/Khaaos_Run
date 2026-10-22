// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/AI/KhaaosBotBehaviorTree.h"
#include "Game/AI/KhaaosBotSpawner.h"
#include "Game/LiveOps/KhaaosTelemetryPipeline.h"
#include "Game/LiveOps/KhaaosHotFixSystem.h"
#include "Game/Social/KhaaosSocialSystem.h"
#include "Game/Progression/KhaaosProgressionSystem.h"
#include "Game/Polish/KhaaosServerHealthMonitor.h"
#include "Game/Polish/KhaaosCrashHandler.h"

/**
 * TKhaaosE2EPhases9to12Spec
 *
 * End-to-end specification tests for Phases 9-12.
 * Validates AI/Bot, LiveOps, Social, Progression, and Production Hardening.
 */
class TKhaaosE2EPhases9to12Spec
{
public:

        // ─── Phase 9: AI/Bot System Tests ─────────────────────────────────────

        /** Test bot difficulty profiles have valid parameters. */
        static void TestBotDifficultyProfiles();

        /** Test adaptive difficulty scaling. */
        static void TestAdaptiveDifficulty();

        /** Test bot spawner population logic. */
        static void TestBotPopulationLogic();

        /** Test horde mode wave progression. */
        static void TestHordeMode();

        /** Test bot role distribution. */
        static void TestBotRoleDistribution();

        // ─── Phase 10: LiveOps & Analytics Tests ──────────────────────────────

        /** Test telemetry event recording. */
        static void TestTelemetryEventRecording();

        /** Test telemetry batch flushing. */
        static void TestTelemetryBatchFlush();

        /** Test telemetry rate limiting. */
        static void TestTelemetryRateLimit();

        /** Test hot-fix apply and remove. */
        static void TestHotFixApplyRemove();

        /** Test hot-fix expiry. */
        static void TestHotFixExpiry();

        /** Test feature flags. */
        static void TestFeatureFlags();

        /** Test A/B experiment variant assignment. */
        static void TestABExperimentVariant();

        // ─── Phase 11: Social & Progression Tests ─────────────────────────────

        /** Test friends list management. */
        static void TestFriendsList();

        /** Test clan create/join/leave. */
        static void TestClanLifecycle();

        /** Test battle pass XP and tier up. */
        static void TestBattlePassTierUp();

        /** Test achievement progress and completion. */
        static void TestAchievementCompletion();

        /** Test daily quest refresh and progress. */
        static void TestDailyQuests();

        // ─── Phase 12: Polish & Launch Tests ──────────────────────────────────

        /** Test health monitor metric recording. */
        static void TestHealthMetricRecording();

        /** Test health status computation. */
        static void TestHealthStatusComputation();

        /** Test Prometheus metrics export format. */
        static void TestPrometheusExport();

        /** Test crash handler deduplication. */
        static void TestCrashDeduplication();

        /** Test graceful shutdown sequence. */
        static void TestGracefulShutdown();

        // ─── Run All Tests ────────────────────────────────────────────────────

        /** Run all Phase 9-12 tests and return pass count. */
        static int32 RunAll();
};
