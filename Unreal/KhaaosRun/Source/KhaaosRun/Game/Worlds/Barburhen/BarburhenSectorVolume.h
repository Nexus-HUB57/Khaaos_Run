// Copyright Nexus-HUB57. All Rights Reserved.
// Volume de setor de Barburhen (Urbano / Industrial / Parque / Estação)

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/BoxComponent.h"
#include "Game/Worlds/Barburhen/BarburhenTypes.h"
#include "BarburhenSectorVolume.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPlayerEnterSector, APawn*, Player, EBarburhenSector, Sector);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPlayerExitSector, APawn*, Player, EBarburhenSector, Sector);

/**
 * Volume que marca um setor do mapa.
 * Use 4 actors no level (um por EBarburhenSector) para minimapa, áudio e regras locais.
 */
UCLASS(Blueprintable, BlueprintType)
class KHAAOSRUN_API ABarburhenSectorVolume : public AActor
{
	GENERATED_BODY()

public:
	ABarburhenSectorVolume();

protected:
	virtual void BeginPlay() override;

public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sector")
	EBarburhenSector Sector = EBarburhenSector::UrbanCommercial;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sector")
	FText SectorDisplayName;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UBoxComponent* SectorBounds;

	UPROPERTY(BlueprintAssignable, Category = "Sector|Events")
	FOnPlayerEnterSector OnPlayerEnter;

	UPROPERTY(BlueprintAssignable, Category = "Sector|Events")
	FOnPlayerExitSector OnPlayerExit;

protected:
	UFUNCTION()
	void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void OnOverlapEnd(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);
};
