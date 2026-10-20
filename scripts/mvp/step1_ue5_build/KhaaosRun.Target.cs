// ════════════════════════════════════════════════════════════════════════════
// Khaaos Run — Client Target (KhaaosRun)
// Devs Ph.D | UE5.8 Battle Royale | Copyright Nexus-HUB57. All Rights Reserved.
// ════════════════════════════════════════════════════════════════════════════
//
// Client game target for Khaaos Run.
// Compiles the full game client with rendering, UI, audio, and all
// gameplay modules. Includes Iris replication for networked gameplay.
//
// Build command:
//   UBT KhaaosRun Win64 Development \
//     -project=KhaaosRun.uproject -Progress -NoHotReloadFromIDE
// ════════════════════════════════════════════════════════════════════════════

using UnrealBuildTool;
using System;

public class KhaaosRunTarget : TargetRules
{
    public KhaaosRunTarget(TargetInfo Target) : base(Target)
    {
        // ── Target Identity ────────────────────────────────────────────────
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("KhaaosRun");

        // ── Client Configuration ───────────────────────────────────────────
        bBuildEditor = false;
        bBuildClient = true;
        bBuildServer = false;
        bUsesSteam = false;       // Using EOS instead of Steam
        bUsesSlate = true;        // Full UI with Slate/UMG
        bCompilePhysX = true;     // Client-side physics prediction

        // ── Iris Replication ───────────────────────────────────────────────
        // Client needs Iris for receiving replication data
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

        // ── Development Aids ───────────────────────────────────────────────
        bWithLiveCoding = true;    // Live coding enabled for dev iteration
    }
}
