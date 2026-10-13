// ════════════════════════════════════════════════════════════════════════════
// Khaaos Run — Editor Target (KhaaosRunEditor)
// Devs Ph.D | UE5.8 Battle Royale | Copyright Nexus-HUB57. All Rights Reserved.
// ════════════════════════════════════════════════════════════════════════════

using UnrealBuildTool;
using System;

public class KhaaosRunEditorTarget : TargetRules
{
    public KhaaosRunEditorTarget(TargetInfo Target) : base(Target)
    {
        // ── Target Identity ────────────────────────────────────────────────
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.AddRange(new string[] { "KhaaosRun", "KhaaosRunEditor" });

        // ── Editor Configuration ───────────────────────────────────────────
        bBuildEditor = true;
        bBuildClient = true;
        bBuildServer = false;
        bUsesSteam = false;       // Using EOS instead of Steam
        bUsesSlate = true;        // Full Slate UI for Editor
        bCompilePhysX = true;     // Physics for PIE

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
        bLinkWithEditorOnly = true;
        bDeveloperModuleEnabledByDefault = true;

        // ── Development Aids ───────────────────────────────────────────────
        bWithLiveCoding = true;    // Live coding for rapid iteration
    }
}
