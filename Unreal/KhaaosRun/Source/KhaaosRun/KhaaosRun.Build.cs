// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

using UnrealBuildTool;
using System;

public class KhaaosRun : ModuleRules
{
        public KhaaosRun(ReadOnlyTargetRules Target) : base(Target)
        {
                PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

                // M4 — raiz do módulo no include path: includes "Game/..." (convenção
                // do projeto) resolvem no UBT inclusive cross-módulo (commandlets do
                // KhaaosRunEditor/KhaaosRunServer), alinhando build real e preflight.
                PublicIncludePaths.Add(ModuleDirectory);

                PublicDependencyModuleNames.AddRange(new string[]
                {
                        "Core",
                        "CoreUObject",
                        "Engine",
                        "InputCore",
                        "EnhancedInput",
                        "GameplayAbilities",
                        "GameplayTags",
                        "GameplayTasks",
                        "Niagara",
                        "NavigationSystem",
                        "AIModule",
                        "StateTreeModule",
                        "SignificanceManager",
                        "Iris",
                        "DeveloperSettings",
                        "NetCore",
                        "OnlineSubsystem",
                        "OnlineSubsystemUtils",
                        "EOSOverlayUI",
                        "EOSSDK",
                        "KhaaosEAC",
                        "ModularGameplay",
                        "ModularGameplayActors",
                        "CommonUI",
                        "UIExtension",
                });

                PrivateDependencyModuleNames.AddRange(new string[]
                {
                        "GameFeatures",
                        "LyraGame",
                        "PCG",
                        "Metasound",
                        "AudioMixer",
                        "Chaos",
                        "PhysicsCore",
                        "Http",
                        "Json",
                        "JsonUtilities",
                        "DataValidation",
                        // ─── Added for CIGKV Level + Map Data ──────────────────
                        "DeveloperSettings",
                });

                if (Target.bBuildEditor)
                {
                        PrivateDependencyModuleNames.AddRange(new string[]
                        {
                                "UnrealEd",
                                "EditorFramework",
                                "KhaaosRunEditor",
                        });
                }

                // Iris replication support
                bIrisSupport = true;

                // C++20 for concepts, ranges, constexpr
                CppStandard = CppStandardVersion.Cpp20;

                // Enforce strict type safety
                bUseUnity = false;
                bEnforceIWYU = true;
        }
}
