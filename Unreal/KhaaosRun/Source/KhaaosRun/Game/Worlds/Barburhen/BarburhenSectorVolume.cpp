// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Worlds/Barburhen/BarburhenSectorVolume.h"
#include "GameFramework/Pawn.h"

ABarburhenSectorVolume::ABarburhenSectorVolume()
{
	PrimaryActorTick.bCanEverTick = false;

	SectorBounds = CreateDefaultSubobject<UBoxComponent>(TEXT("SectorBounds"));
	RootComponent = SectorBounds;
	SectorBounds->SetBoxExtent(FVector(8000.f, 8000.f, 3000.f));
	SectorBounds->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	SectorBounds->SetCollisionResponseToAllChannels(ECR_Ignore);
	SectorBounds->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	SectorBounds->SetGenerateOverlapEvents(true);
}

void ABarburhenSectorVolume::BeginPlay()
{
	Super::BeginPlay();
	SectorBounds->OnComponentBeginOverlap.AddDynamic(this, &ABarburhenSectorVolume::OnOverlapBegin);
	SectorBounds->OnComponentEndOverlap.AddDynamic(this, &ABarburhenSectorVolume::OnOverlapEnd);
}

void ABarburhenSectorVolume::OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (Pawn && Pawn->IsPlayerControlled())
	{
		OnPlayerEnter.Broadcast(Pawn, Sector);
		UE_LOG(LogTemp, Log, TEXT("[Barburhen] Player entrou no setor %d"), (int32)Sector);
	}
}

void ABarburhenSectorVolume::OnOverlapEnd(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (Pawn && Pawn->IsPlayerControlled())
	{
		OnPlayerExit.Broadcast(Pawn, Sector);
	}
}
