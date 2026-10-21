// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/Ranked/KhaaosRankedSystem.h"
#include "Game/MapVoting/KhaaosMapVotingSystem.h"
#include "Game/Coach/KhaaosCoachSystem.h"
#include "Game/Cinematic/KhaaosCinematicSystem.h"

/**
 * TKhaaosE2EPhases17to20Spec
 * E2E spec tests for Phases 17-20.
 */
class TKhaaosE2EPhases17to20Spec
{
public:
        // Phase 17: Ranked & Tournament
        static void TestELOCalculation();
        static void TestTierSystem();
        static void TestRankedQueue();
        static void TestTournamentRegistration();
        static void TestSeasonalReset();

        // Phase 18: Map Voting
        static void TestVotingPhase();
        static void TestCustomRooms();
        static void TestMatchVariants();

        // Phase 19: Coach & Analysis
        static void TestCoachingSession();
        static void TestStatsComparison();
        static void TestImprovementSuggestions();

        // Phase 20: Cinematic
        static void TestCinematicPlayback();
        static void TestVictorySequence();
        static void TestTrailerMode();

        static int32 RunAll();
};
