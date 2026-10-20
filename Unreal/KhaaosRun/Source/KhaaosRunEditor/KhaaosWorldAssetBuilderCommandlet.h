// =============================================================================
// Khaaos Run — UE5.8 Editor Commandlet for Automated 3D Maps (.umap), Meshes & Niagara VFX
// Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
// =============================================================================
// Executes headless or in-Editor via:
//   UnrealEditor-Cmd KhaaosRun.uproject -run=KhaaosWorldAssetBuilder -world=All
//
// Automates creation of:
//   1. .umap Level Packages for CIGKV, Barburhen (W1), Priadus (W2), Ckesalth (W3), Arukheea (W4)
//   2. StaticMesh imports from Content/Maps/<World>/<World>_Terrain.obj / .gltf
//   3. DataTable assets (DT_<World>_MapPoints, DT_<World>_WorldConfig)
//   4. Niagara System assets (NS_AcidRain, NS_DeathWaterRing, NS_ToxicSporeFog,
//      NS_OilFireSmoke, NS_TsunamiWall, NS_ZEXBeacon, NS_MuzzleFlash_*, NS_LootAura)
//   5. Level Actor population via AKhaaosBarburhenLevel / Priadus / Ckesalth / Arukheea
// =============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "KhaaosWorldAssetBuilderCommandlet.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosWorldAssetDescriptor
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString WorldId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString UMapPackagePath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString ObjMeshRelativePath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString GltfMeshRelativePath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString MapPointsCsvRelativePath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString WorldConfigCsvRelativePath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	FString PrimaryNiagaraHazardSystem;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	int32 SpawnPointCount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Assets")
	int32 ZEXTerminalCount = 0;
};

UCLASS()
class UKhaaosWorldAssetBuilderCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UKhaaosWorldAssetBuilderCommandlet();

	virtual int32 Main(const FString& Params) override;

	/** Returns the canonical asset descriptors for all 5 Khaaos Run worlds (CIGKV + W1-W4). */
	static TArray<FKhaaosWorldAssetDescriptor> GetCanonicalWorldDescriptors();

	/** Returns the canonical Niagara VFX system asset paths required by UKhaaosVFXManager. */
	static TArray<FString> GetCanonicalNiagaraSystemPaths();

	/** Builds/validates a single world package (.umap + meshes + DataTables + Niagara bindings). */
	bool BuildWorldAssets(const FKhaaosWorldAssetDescriptor& Descriptor, bool bSavePackages);
};
