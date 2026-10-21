// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

using UnrealBuildTool;
using System;

public class KhaaosRunEditor : ModuleRules
{
        public KhaaosRunEditor(ReadOnlyTargetRules Target) : base(Target)
        {
                PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

                PublicDependencyModuleNames.AddRange(new string[]
                {
                        "Core",
                        "CoreUObject",
                        "Engine",
                        "Slate",
                        "SlateCore",
                        "UnrealEd",
                        "EditorFramework",
                        "ToolMenus",
                        "KhaaosRun",
                });

                PrivateDependencyModuleNames.AddRange(new string[]
                {
                        "GameplayAbilities",
                        "GameplayTags",
                        "AIModule",
                        "Niagara",
                        "DetailCustomizations",
                });

                // C++20 matching game module
                CppStandard = CppStandardVersion.Cpp20;

                bUseUnity = false;
                bEnforceIWYU = true;
        }
}
