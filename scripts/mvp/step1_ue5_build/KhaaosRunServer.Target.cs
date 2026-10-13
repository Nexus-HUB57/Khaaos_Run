// ════════════════════════════════════════════════════════════════════════════
// Khaaos Run — Server Target (KhaaosRunServer)
// Devs Ph.D | UE5.8 Battle Royale | Copyright Nexus-HUB57. All Rights Reserved.
// ════════════════════════════════════════════════════════════════════════════
//
// Dedicated server build target for Khaaos Run.
// Compiles headless Linux server with Iris replication, EOS, and all
// gameplay modules. No rendering, no editor, no client-only code.
//
// Build command:
//   UBT KhaaosRunServer Linux Development \
//     -project=KhaaosRun.uproject -Progress -NoHotReloadFromIDE
//
// UAT packaging:
//   RunUAT BuildCookRun -target=KhaaosRunServer \
//     -platform=Linux -serverconfig -cook -build -stage -pak -archive
// ════════════════════════════════════════════════════════════════════════════

using UnrealBuildTool;
using System;

public class KhaaosRunServerTarget : TargetRules
{
    public KhaaosRunServerTarget(TargetInfo Target) : base(Target)
    {
        // ── Target Identity ────────────────────────────────────────────────
        Type = TargetType.Server;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("KhaaosRun");

        // ── Dedicated Server Configuration ─────────────────────────────────
        bBuildEditor = false;
        bBuildClient = false;
        bBuildServer = true;
        bUsesSteam = false;       // Using EOS instead of Steam
        bUsesSlate = false;       // No UI in dedicated server
        bCompilePhysX = true;     // Physics for gameplay
        bCustomPlatforms = false;

        // ── Iris Replication ───────────────────────────────────────────────
        // Iris is the UE5.8 high-performance replication system
        // Required for 100-player battle royale with spatial relevancy
        bEnableIrisSupport = true;

        // ── Build Optimization ─────────────────────────────────────────────
        bUseUnityBuild = true;
        bUnitySortFilesByTags = true;
        bAdaptiveUnityDisabling = true;
        bAdaptiveUnityEnabling = true;
        MinGameModuleSourceFilesForUnityBuild = 2;

        // ── Security & Hardening ───────────────────────────────────────────
        bEnableExceptions = true;
        bForceEnableExceptions = false;
        bCheckLicenseForModule = false;

        // ── C++ Standard ───────────────────────────────────────────────────
        // C++20 for concepts, ranges, constexpr algorithms
        CppStandard = CppStandardVersion.Cpp20;

        // ── Linking ────────────────────────────────────────────────────────
        bLinkWithEditorOnly = false;
        bDeveloperModuleEnabledByDefault = true;

        // ── Network Optimization ───────────────────────────────────────────
        // These are build-time flags; runtime tuning is in DefaultEngine.ini
        bWithLiveCoding = false;   // No live coding in production server
    }
}
