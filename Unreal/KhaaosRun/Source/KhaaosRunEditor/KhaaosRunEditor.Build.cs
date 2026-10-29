// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

using UnrealBuildTool;
using System;
using System.IO;

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
                        // KhaaosLUTMaterialBuilderCommandlet: registro e save de assets LUT + material
                        "AssetRegistry",
                        "AssetTools",
                });

                // C++20 matching game module
                CppStandard = CppStandardVersion.Cpp20;

                // Os commandlets do editor incluem headers do módulo de jogo na
                // forma canônica do repo ("Game/<SubDir>/Header.h") — o root do
                // módulo KhaaosRun entra no caminho de includes PRIVADO deste
                // módulo (caminho relativo ao repositório; nada de absoluto,
                // contrato UE1013). Sem isto o UBT não resolve os includes
                // cross-módulo dos commandlets.
                PrivateIncludePaths.Add(Path.Combine(ModuleDirectory, "..", "KhaaosRun"));

                bUseUnity = false;
                bEnforceIWYU = true;
        }
}
