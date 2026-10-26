// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

using UnrealBuildTool;
using System;
using System.IO;

public class KhaaosEAC : ModuleRules
{
	public KhaaosEAC(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
		});

		CppStandard = CppStandardVersion.Cpp20;
		bUseUnity = false;
		bEnforceIWYU = true;

		// ─── Detecção do SDK do Easy Anti-Cheat ─────────────────────────────
		// Fontes válidas: env KHAAOS_EAC_SDK_DIR ou Source/KhaaosEAC/EACSDK/.
		// O build NUNCA quebra sem SDK — modo stub (KHAAOS_EAC_SDK=0).
		string sdkDir = ResolveSdkDir();
		bool hasSdk = !string.IsNullOrEmpty(sdkDir)
			&& File.Exists(Path.Combine(sdkDir, "Sdk", "anticheat", "sdkdefines.h"));

		if (hasSdk)
		{
			PublicDefinitions.Add("KHAAOS_EAC_SDK=1");
			PublicIncludePaths.Add(Path.Combine(sdkDir, "Sdk"));

			if (Target.Platform == UnrealTargetPlatform.Win64)
			{
				PublicAdditionalLibraries.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "eacserver.lib"));
				PublicAdditionalLibraries.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "eacclient.lib"));
				PublicDelayLoadDLLs.Add("eacserver.dll");
				PublicDelayLoadDLLs.Add("eacclient.dll");
				RuntimeDependencies.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "eacserver.dll"));
				RuntimeDependencies.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "eacclient.dll"));
			}
			else if (Target.Platform == UnrealTargetPlatform.Linux)
			{
				PublicAdditionalLibraries.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "libeacserver.so"));
				PublicAdditionalLibraries.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "libeacclient.so"));
				RuntimeDependencies.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "libeacserver.so"));
				RuntimeDependencies.Add(Path.Combine(sdkDir, "Sdk", "lib", "anticheat", "libeacclient.so"));
			}
		}
		else
		{
			PublicDefinitions.Add("KHAAOS_EAC_SDK=0");
		}
	}

	private static string ResolveSdkDir()
	{
		string env = Environment.GetEnvironmentVariable("KHAAOS_EAC_SDK_DIR");
		if (!string.IsNullOrEmpty(env) && Directory.Exists(env))
		{
			return env;
		}
		string local = Path.Combine(ModuleDirectory, "EACSDK");
		return Directory.Exists(local) ? local : null;
	}
}
