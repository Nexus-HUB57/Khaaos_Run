// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

using UnrealBuildTool;
using System;

public class KhaaosRun : ModuleRules
{
        public KhaaosRun(ReadOnlyTargetRules Target) : base(Target)
        {
                PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

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
