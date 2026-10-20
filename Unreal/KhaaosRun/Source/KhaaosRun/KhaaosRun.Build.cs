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
			"EOSOverlayUI",
			"EOSSDK",
                        "ModularGameplay",
                        "ModularGameplayActors",
                        "CommonUI",
                        "UIExtension",
                        "UMG",
                        "Slate",
                        "SlateCore",
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

                // Easy Anti-Cheat (EAC) ThirdParty SDK headers & runtime binary bridge
                string EACThirdPartyInclude = System.IO.Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "EasyAntiCheat", "include");
                if (System.IO.Directory.Exists(EACThirdPartyInclude))
                {
                        PublicIncludePaths.Add(EACThirdPartyInclude);
                        PublicDefinitions.Add("WITH_KHAAOS_EAC_BRIDGE=1");
                }
                else
                {
                        PublicDefinitions.Add("WITH_KHAAOS_EAC_BRIDGE=0");
                }

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
