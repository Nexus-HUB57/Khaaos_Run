// ════════════════════════════════════════════════════════════════════════════
// Khaaos Run — Server Target (KhaaosRunServer)
// Devs Ph.D | UE5.8 Battle Royale | Copyright Nexus-HUB57. All Rights Reserved.
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
        CppStandard = CppStandardVersion.Cpp20;

        // ── Linking ────────────────────────────────────────────────────────
        bLinkWithEditorOnly = false;
        bDeveloperModuleEnabledByDefault = true;

        // ── Network Optimization ───────────────────────────────────────────
        bWithLiveCoding = false;   // No live coding in production server
    }
}
