// Copyright Nexus-HUB57. All Rights Reserved.
// Tipos e setores oficiais de Barburhen (W1/C1)

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "BarburhenTypes.generated.h"

UENUM(BlueprintType)
enum class EBarburhenSector : uint8
{
	UrbanCommercial		UMETA(DisplayName = "Área Urbana e Comercial"),		// 2/8
	Industrial			UMETA(DisplayName = "Setor Industrial"),			// 3/8 – desembarque
	AbandonedPark		UMETA(DisplayName = "Parque Abandonado"),			// 3/8 – centro
	ExtractionStation	UMETA(DisplayName = "Zona de Extração – Estação")	// extração
};

UENUM(BlueprintType)
enum class EBarburhenPointType : uint8
{
	PlayerSpawn,
	SniperPoint,
	Bunker,
	Hospital,
	PoliceStation,
	TankSpawn,
	ZEXTerminal,
	LootCache,
	RingCenter
};

/**
 * Definição de um ponto de interesse no mapa Barburhen.
 * Use em DataTable para popular o nível sem hardcode.
 */
USTRUCT(BlueprintType)
struct FBarburhenMapPoint : public FTableRowBase
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FName PointId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	EBarburhenPointType Type = EBarburhenPointType::LootCache;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	EBarburhenSector Sector = EBarburhenSector::UrbanCommercial;

	/** Posição no mapa (cm, origem = centro do Parque) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FVector Location = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FRotator Rotation = FRotator::ZeroRotator;

	/** Raio de influência (spawns, volume de perigo, etc.) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float Radius = 200.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FText DisplayName;
};

/**
 * Configuração global do mundo Barburhen (1 row no DataTable).
 */
USTRUCT(BlueprintType)
struct FBarburhenWorldConfig : public FTableRowBase
{
	GENERATED_BODY()

	/** Duração do anel de conflito até fechar no Parque (oficial = 10 min) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float RingCloseDurationSeconds = 600.0f;

	/** Raio inicial do anel (cm) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float RingStartRadius = 25000.0f;

	/** Raio final (Parque) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float RingEndRadius = 4000.0f;

	/** Dano da chuva ácida por segundo (% de vitalidade) fora de colete */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float AcidRainDamagePerSecond = 0.01f; // −1 % / 10 s ≈ 0.1 %/s → ajustável

	/** Intervalo em que a chuva aplica tick de dano */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float AcidRainTickInterval = 10.0f;

	/** Capacidade de players (oficial W1 = 100) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	int32 MaxPlayers = 100;

	/** Centro do Parque Abandonado (anel fecha aqui) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FVector ParkCenter = FVector::ZeroVector;
};
