// Copyright Nexus-HUB57. All Rights Reserved.
// Helper para popular o nível Barburhen a partir de DataTables

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Worlds/Barburhen/BarburhenTypes.h"
#include "BarburhenMapBuilder.generated.h"

class UDataTable;

/**
 * Coloque um Actor deste tipo no level Barburhen.
 * No BeginPlay (ou botão Editor), instancia marcadores / volumes
 * a partir dos DataTables de pontos e config.
 *
 * Não substitui o Landscape/meshes – organiza a lógica espacial.
 */
UCLASS(Blueprintable, BlueprintType)
class KHAOSRUN_API ABarburhenMapBuilder : public AActor
{
	GENERATED_BODY()

public:
	ABarburhenMapBuilder();

protected:
	virtual void BeginPlay() override;

public:
	/** DataTable de FBarburhenMapPoint */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen")
	UDataTable* MapPointsTable;

	/** DataTable de FBarburhenWorldConfig (1 row) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen")
	UDataTable* WorldConfigTable;

	/** Classe do terminal ZEX a spawnar nos pontos ZEX */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen")
	TSubclassOf<AActor> ZEXTerminalClass;

	/** Classe do volume de chuva ácida */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen")
	TSubclassOf<AActor> AcidRainVolumeClass;

	/** Classe do ring controller */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen")
	TSubclassOf<AActor> RingControllerClass;

	/** Se true, spawna actors automaticamente no BeginPlay */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Barburhen")
	bool bAutoBuildOnBeginPlay = true;

	UFUNCTION(BlueprintCallable, Category = "Barburhen")
	void BuildMapFromData();

	UFUNCTION(BlueprintCallable, Category = "Barburhen")
	FBarburhenWorldConfig GetWorldConfig() const;

protected:
	void SpawnPointActors();
	void SpawnSystems(const FBarburhenWorldConfig& Config);
};
