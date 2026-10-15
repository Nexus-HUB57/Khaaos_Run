// Copyright Nexus-HUB57. All Rights Reserved.

#include "Worlds/Barburhen/BarburhenRingController.h"
#include "Player/KhaaosVitalityComponent.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "TimerManager.h"
#include "Engine/World.h"

ABarburhenRingController::ABarburhenRingController()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;
}

void ABarburhenRingController::BeginPlay()
{
	Super::BeginPlay();
	CurrentRadius = StartRadius;
}

void ABarburhenRingController::StartRing()
{
	bRingActive = true;
	bClosing = false;
	Elapsed = 0.f;
	CurrentRadius = StartRadius;
	SetActorTickEnabled(true);

	GetWorldTimerManager().SetTimer(StartDelayHandle, [this]()
	{
		bClosing = true;
		UE_LOG(LogTemp, Log, TEXT("[Barburhen] Anel Água da Morte começou a fechar."));
		OnPhaseChanged.Broadcast(1);
	}, StartDelay, false);

	OnPhaseChanged.Broadcast(0);
	UE_LOG(LogTemp, Log, TEXT("[Barburhen] Ring iniciado. Fecha em %.0fs após delay de %.0fs."), CloseDuration, StartDelay);
}

void ABarburhenRingController::StopRing()
{
	bRingActive = false;
	bClosing = false;
	SetActorTickEnabled(false);
	GetWorldTimerManager().ClearTimer(StartDelayHandle);
}

void ABarburhenRingController::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	if (!bRingActive) return;

	if (bClosing)
	{
		Elapsed += DeltaTime;
		const float Alpha = FMath::Clamp(Elapsed / CloseDuration, 0.f, 1.f);
		CurrentRadius = FMath::Lerp(StartRadius, EndRadius, Alpha);

		OnRadiusChanged.Broadcast(CurrentRadius, Alpha);

		if (Alpha >= 1.f)
		{
			OnPhaseChanged.Broadcast(2); // anel fechado
			UE_LOG(LogTemp, Log, TEXT("[Barburhen] Anel fechou no Parque."));
		}
	}

	ApplyOutsideDamage(DeltaTime);
}

bool ABarburhenRingController::IsLocationSafe(FVector WorldLocation) const
{
	const float DistSq = FVector::DistSquared2D(WorldLocation, RingCenter);
	return DistSq <= (CurrentRadius * CurrentRadius);
}

void ABarburhenRingController::ApplyOutsideDamage(float DeltaTime)
{
	TArray<AActor*> Players;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), ACharacter::StaticClass(), Players);

	for (AActor* Actor : Players)
	{
		ACharacter* Char = Cast<ACharacter>(Actor);
		if (!Char || !Char->IsPlayerControlled()) continue;

		if (!IsLocationSafe(Char->GetActorLocation()))
		{
			if (UKhaaosVitalityComponent* Vitality = Char->FindComponentByClass<UKhaaosVitalityComponent>())
			{
				Vitality->ApplyPercentageDamage(OutsideDamagePerSecond * DeltaTime, this);
				Vitality->Fear = FMath::Min(100.f, Vitality->Fear + 5.f * DeltaTime);
			}
		}
	}
}
