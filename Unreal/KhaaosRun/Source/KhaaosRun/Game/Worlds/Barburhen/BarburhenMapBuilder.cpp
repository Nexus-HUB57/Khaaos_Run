// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Worlds/Barburhen/BarburhenMapBuilder.h"
#include "Game/Worlds/Barburhen/BarburhenRingController.h"
#include "Game/Worlds/Barburhen/BarburhenAcidRainVolume.h"
#include "Engine/DataTable.h"
#include "Engine/World.h"

ABarburhenMapBuilder::ABarburhenMapBuilder()
{
	PrimaryActorTick.bCanEverTick = false;
}

void ABarburhenMapBuilder::BeginPlay()
{
	Super::BeginPlay();
	if (bAutoBuildOnBeginPlay)
	{
		BuildMapFromData();
	}
}

FBarburhenWorldConfig ABarburhenMapBuilder::GetWorldConfig() const
{
	FBarburhenWorldConfig Config;
	if (!WorldConfigTable) return Config;

	TArray<FBarburhenWorldConfig*> Rows;
	WorldConfigTable->GetAllRows(TEXT("GetWorldConfig"), Rows);
	if (Rows.Num() > 0 && Rows[0])
	{
		return *Rows[0];
	}
	return Config;
}

void ABarburhenMapBuilder::BuildMapFromData()
{
	const FBarburhenWorldConfig Config = GetWorldConfig();
	SpawnSystems(Config);
	SpawnPointActors();

	UE_LOG(LogTemp, Log, TEXT("[Barburhen] MapBuilder concluído. RingStart=%.0f End=%.0f Duration=%.0fs Players=%d"),
		Config.RingStartRadius, Config.RingEndRadius, Config.RingCloseDurationSeconds, Config.MaxPlayers);
}

void ABarburhenMapBuilder::SpawnSystems(const FBarburhenWorldConfig& Config)
{
	if (!GetWorld()) return;

	// Ring Controller
	if (RingControllerClass)
	{
		FActorSpawnParameters Params;
		AActor* RingActor = GetWorld()->SpawnActor<AActor>(RingControllerClass, Config.ParkCenter, FRotator::ZeroRotator, Params);
		if (ABarburhenRingController* Ring = Cast<ABarburhenRingController>(RingActor))
		{
			Ring->RingCenter = Config.ParkCenter;
			Ring->StartRadius = Config.RingStartRadius;
			Ring->EndRadius = Config.RingEndRadius;
			Ring->CloseDuration = Config.RingCloseDurationSeconds;
			Ring->StartRing();
		}
	}

	// Acid Rain (cobre o mapa)
	if (AcidRainVolumeClass)
	{
		FActorSpawnParameters Params;
		AActor* RainActor = GetWorld()->SpawnActor<AActor>(AcidRainVolumeClass, Config.ParkCenter, FRotator::ZeroRotator, Params);
		if (ABarburhenAcidRainVolume* Rain = Cast<ABarburhenAcidRainVolume>(RainActor))
		{
			// Sincroniza fórmula: %/tick = DPS × intervalo (oficial −1 % / 10 s)
			Rain->DamagePercentPerTick = Config.AcidRainDamagePerSecond > 0.f
				? Config.AcidRainDamagePerSecond * Config.AcidRainTickInterval
				: 0.01f;
			Rain->TickInterval = Config.AcidRainTickInterval > 0.f
				? Config.AcidRainTickInterval
				: 10.f;
			Rain->SetRainActive(true);
			UE_LOG(LogTemp, Log, TEXT("[Barburhen] AcidRain sync: %.1f%% / %.0fs (eq DPS %.4f)"),
				Rain->DamagePercentPerTick * 100.f,
				Rain->TickInterval,
				Rain->GetEquivalentDamagePerSecond());
		}
	}
}

void ABarburhenMapBuilder::SpawnPointActors()
{
	if (!MapPointsTable || !GetWorld()) return;

	MapPointsTable->ForeachRow<FBarburhenMapPoint>(TEXT("SpawnPointActors"),
		[this](const FName& Key, const FBarburhenMapPoint& Point)
		{
			if (Point.Type == EBarburhenPointType::ZEXTerminal && ZEXTerminalClass)
			{
				FActorSpawnParameters Params;
				GetWorld()->SpawnActor<AActor>(ZEXTerminalClass, Point.Location, Point.Rotation, Params);
			}
			// Sniper / Bunker / Hospital / etc. podem ser marcadores ou BPs específicos
			// Por enquanto logamos para validação de layout
			UE_LOG(LogTemp, Verbose, TEXT("[Barburhen] Point %s Type=%d Sector=%d Loc=%s"),
				*Point.PointId.ToString(),
				(int32)Point.Type,
				(int32)Point.Sector,
				*Point.Location.ToString());
		});
}
