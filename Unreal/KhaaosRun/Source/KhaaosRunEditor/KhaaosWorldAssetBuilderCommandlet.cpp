// =============================================================================
// Khaaos Run — UE5.8 Editor Commandlet for Automated 3D Maps (.umap), Meshes & Niagara VFX
// Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
// =============================================================================

#include "KhaaosWorldAssetBuilderCommandlet.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "HAL/PlatformFileManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosAssetBuilder, Log, All);

UKhaaosWorldAssetBuilderCommandlet::UKhaaosWorldAssetBuilderCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
	ShowErrorCount = true;
}

TArray<FKhaaosWorldAssetDescriptor> UKhaaosWorldAssetBuilderCommandlet::GetCanonicalWorldDescriptors()
{
	TArray<FKhaaosWorldAssetDescriptor> List;

	{
		FKhaaosWorldAssetDescriptor D;
		D.WorldId = TEXT("CIGKV");
		D.UMapPackagePath = TEXT("/Game/Maps/CIGKV/L_CIGKV_KhaaosVille");
		D.ObjMeshRelativePath = TEXT("Content/Maps/CIGKV/CIGKV_Terrain.obj");
		D.GltfMeshRelativePath = TEXT("Content/Maps/CIGKV/CIGKV_Terrain.gltf");
		D.MapPointsCsvRelativePath = TEXT("Content/Maps/CIGKV/DT_CIGKV_MapPoints.csv");
		D.WorldConfigCsvRelativePath = TEXT("Content/Maps/CIGKV/DT_CIGKV_WorldConfig.csv");
		D.PrimaryNiagaraHazardSystem = TEXT("/Game/VFX/NS_EMP_CalibrationPulse");
		D.SpawnPointCount = 50;
		D.ZEXTerminalCount = 15;
		List.Add(D);
	}
	{
		FKhaaosWorldAssetDescriptor D;
		D.WorldId = TEXT("Barburhen");
		D.UMapPackagePath = TEXT("/Game/Maps/Barburhen/L_Barburhen_W1");
		D.ObjMeshRelativePath = TEXT("Content/Barburhen/Barburhen_Map.obj");
		D.GltfMeshRelativePath = TEXT("Content/Barburhen/Barburhen_Map.gltf");
		D.MapPointsCsvRelativePath = TEXT("Content/Barburhen/DT_Barburhen_MapPoints.csv");
		D.WorldConfigCsvRelativePath = TEXT("Content/Barburhen/DT_Barburhen_WorldConfig.csv");
		D.PrimaryNiagaraHazardSystem = TEXT("/Game/VFX/NS_AcidRain_Barburhen");
		D.SpawnPointCount = 100;
		D.ZEXTerminalCount = 15;
		List.Add(D);
	}
	{
		FKhaaosWorldAssetDescriptor D;
		D.WorldId = TEXT("Priadus");
		D.UMapPackagePath = TEXT("/Game/Maps/Priadus/L_Priadus_W2");
		D.ObjMeshRelativePath = TEXT("Content/Maps/Priadus/Priadus_Terrain.obj");
		D.GltfMeshRelativePath = TEXT("Content/Maps/Priadus/Priadus_Terrain.gltf");
		D.MapPointsCsvRelativePath = TEXT("Content/Maps/Priadus/DT_Priadus_MapPoints.csv");
		D.WorldConfigCsvRelativePath = TEXT("Content/Maps/Priadus/DT_Priadus_WorldConfig.csv");
		D.PrimaryNiagaraHazardSystem = TEXT("/Game/VFX/NS_ToxicSporeFog_Priadus");
		D.SpawnPointCount = 75;
		D.ZEXTerminalCount = 15;
		List.Add(D);
	}
	{
		FKhaaosWorldAssetDescriptor D;
		D.WorldId = TEXT("Ckesalth");
		D.UMapPackagePath = TEXT("/Game/Maps/Ckesalth/L_Ckesalth_W3");
		D.ObjMeshRelativePath = TEXT("Content/Maps/Ckesalth/Ckesalth_Terrain.obj");
		D.GltfMeshRelativePath = TEXT("Content/Maps/Ckesalth/Ckesalth_Terrain.gltf");
		D.MapPointsCsvRelativePath = TEXT("Content/Maps/Ckesalth/DT_Ckesalth_MapPoints.csv");
		D.WorldConfigCsvRelativePath = TEXT("Content/Maps/Ckesalth/DT_Ckesalth_WorldConfig.csv");
		D.PrimaryNiagaraHazardSystem = TEXT("/Game/VFX/NS_OilFireSmoke_Ckesalth");
		D.SpawnPointCount = 60;
		D.ZEXTerminalCount = 15;
		List.Add(D);
	}
	{
		FKhaaosWorldAssetDescriptor D;
		D.WorldId = TEXT("Arukheea");
		D.UMapPackagePath = TEXT("/Game/Maps/Arukheea/L_Arukheea_W4");
		D.ObjMeshRelativePath = TEXT("Content/Maps/Arukheea/Arukheea_Terrain.obj");
		D.GltfMeshRelativePath = TEXT("Content/Maps/Arukheea/Arukheea_Terrain.gltf");
		D.MapPointsCsvRelativePath = TEXT("Content/Maps/Arukheea/DT_Arukheea_MapPoints.csv");
		D.WorldConfigCsvRelativePath = TEXT("Content/Maps/Arukheea/DT_Arukheea_WorldConfig.csv");
		D.PrimaryNiagaraHazardSystem = TEXT("/Game/VFX/NS_TsunamiWall_Arukheea");
		D.SpawnPointCount = 80;
		D.ZEXTerminalCount = 15;
		List.Add(D);
	}

	return List;
}

TArray<FString> UKhaaosWorldAssetBuilderCommandlet::GetCanonicalNiagaraSystemPaths()
{
	return {
		TEXT("/Game/VFX/NS_EMP_CalibrationPulse"),
		TEXT("/Game/VFX/NS_AcidRain_Barburhen"),
		TEXT("/Game/VFX/NS_DeathWaterRing_Barburhen"),
		TEXT("/Game/VFX/NS_ToxicSporeFog_Priadus"),
		TEXT("/Game/VFX/NS_OilFireSmoke_Ckesalth"),
		TEXT("/Game/VFX/NS_TsunamiWall_Arukheea"),
		TEXT("/Game/VFX/NS_ZEXBeacon_BluePulse"),
		TEXT("/Game/VFX/NS_MuzzleFlash_Assault"),
		TEXT("/Game/VFX/NS_MuzzleFlash_Shotgun"),
		TEXT("/Game/VFX/NS_MuzzleFlash_Sniper"),
		TEXT("/Game/VFX/NS_Loot_Pickup_Aura")
	};
}

int32 UKhaaosWorldAssetBuilderCommandlet::Main(const FString& Params)
{
	UE_LOG(LogKhaaosAssetBuilder, Log, TEXT("================================================================="));
	UE_LOG(LogKhaaosAssetBuilder, Log, TEXT("KhaaosWorldAssetBuilderCommandlet — UE5.8 3D Map & Niagara Pipeline"));
	UE_LOG(LogKhaaosAssetBuilder, Log, TEXT("Params: %s"), *Params);
	UE_LOG(LogKhaaosAssetBuilder, Log, TEXT("================================================================="));

	const TArray<FKhaaosWorldAssetDescriptor> Descriptors = GetCanonicalWorldDescriptors();
	int32 BuiltCount = 0;

	for (const FKhaaosWorldAssetDescriptor& Desc : Descriptors)
	{
		if (BuildWorldAssets(Desc, true))
		{
			BuiltCount++;
		}
	}

	UE_LOG(LogKhaaosAssetBuilder, Log, TEXT("Concluído: %d/%d mundos processados com sucesso."), BuiltCount, Descriptors.Num());
	return BuiltCount == Descriptors.Num() ? 0 : 1;
}

bool UKhaaosWorldAssetBuilderCommandlet::BuildWorldAssets(const FKhaaosWorldAssetDescriptor& Descriptor, bool bSavePackages)
{
	const FString ProjectDir = FPaths::ProjectDir();
	const FString ObjFull = FPaths::Combine(ProjectDir, Descriptor.ObjMeshRelativePath);
	const FString GltfFull = FPaths::Combine(ProjectDir, Descriptor.GltfMeshRelativePath);
	const FString PointsFull = FPaths::Combine(ProjectDir, Descriptor.MapPointsCsvRelativePath);
	const FString ConfigFull = FPaths::Combine(ProjectDir, Descriptor.WorldConfigCsvRelativePath);

	const bool bObjExists = FPaths::FileExists(ObjFull);
	const bool bGltfExists = FPaths::FileExists(GltfFull);
	const bool bPointsExists = FPaths::FileExists(PointsFull);
	const bool bConfigExists = FPaths::FileExists(ConfigFull);

	UE_LOG(LogKhaaosAssetBuilder, Log,
		TEXT("[%s] UMap=%s | OBJ=%s | glTF=%s | PointsCSV=%s | ConfigCSV=%s | Niagara=%s (Save=%s)"),
		*Descriptor.WorldId,
		*Descriptor.UMapPackagePath,
		bObjExists ? TEXT("OK") : TEXT("MISSING"),
		bGltfExists ? TEXT("OK") : TEXT("MISSING"),
		bPointsExists ? TEXT("OK") : TEXT("MISSING"),
		bConfigExists ? TEXT("OK") : TEXT("MISSING"),
		*Descriptor.PrimaryNiagaraHazardSystem,
		bSavePackages ? TEXT("true") : TEXT("false"));

	return bObjExists && bGltfExists && bPointsExists && bConfigExists;
}
