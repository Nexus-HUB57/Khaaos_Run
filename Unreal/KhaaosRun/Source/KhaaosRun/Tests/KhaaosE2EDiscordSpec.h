// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/Discord/KhaaosDiscordRichPresence.h"
#include "Game/Discord/KhaaosDiscordOAuth2.h"
#include "Game/Discord/KhaaosDiscordWebhooks.h"

/**
 * TKhaaosE2EDiscordSpec
 * E2E spec tests for Discord integration — Rich Presence, OAuth2, Webhooks, GameMode init.
 */
class TKhaaosE2EDiscordSpec
{
public:
        // Rich Presence
        static void TestInitializeSDK();
        static void TestSetActivity();
        static void TestSetWorldStatus();
        static void TestSetPlayerInfo();
        static void TestOnWorldTransition();
        static void TestGenerateJoinSecret();
        static void TestGenerateSpectateSecret();
        static void TestEncodeDecodeSecretRoundtrip();
        static void TestGetWorldImageKey();
        static void TestGetSpeciesImageKey();

        // OAuth2
        static void TestInitializeOAuth2();
        static void TestStartAuthFlow();
        static void TestCompleteAuthFlow();
        static void TestLinkDiscordToEOS();
        static void TestUnlinkDiscordFromEOS();
        static void TestGetDiscordLinkInfo();
        static void TestCheckBetaRole();
        static void TestIsBetaAccessAllowed();

        // Webhooks
        static void TestInitializeWebhooks();
        static void TestSendWebhookRateLimiting();
        static void TestSendAntiCheatAlert();
        static void TestSendEconomyAlert();
        static void TestSendMatchResult();
        static void TestSendRankedUpdate();
        static void TestSendTournamentEvent();
        static void TestSendDeployNotification();
        static void TestSendServerStatus();

        // GameMode
        static void TestInitializeDiscordSubsystems();

        static int32 RunAll();
};
