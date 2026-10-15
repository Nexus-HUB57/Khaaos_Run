// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Worlds/Barburhen/BarburhenAcidRainVolume.h"
#include "Game/Player/KhaaosVitalityComponent.h"
#include "Components/AudioComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "TimerManager.h"
#include "Engine/World.h"

ABarburhenAcidRainVolume::ABarburhenAcidRainVolume()
{
	PrimaryActorTick.bCanEverTick = false;

	RainVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("RainVolume"));
	RootComponent = RainVolume;
	RainVolume->SetBoxExtent(FVector(15000.f, 15000.f, 5000.f)); // cobre grande parte do mapa
	RainVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	RainVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	RainVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	RainVolume->SetGenerateOverlapEvents(true);
}

void ABarburhenAcidRainVolume::BeginPlay()
{
	Super::BeginPlay();

	if (RainFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAttached(
			RainFX, RootComponent, NAME_None,
			FVector::ZeroVector, FRotator(-90.f, 0.f, 0.f),
			EAttachLocation::KeepRelativeOffset, true
		);
	}

	if (RainAmbientLoop)
	{
		AmbientAudio = UGameplayStatics::SpawnSoundAttached(
			RainAmbientLoop, RootComponent, NAME_None,
			FVector::ZeroVector, EAttachLocation::KeepRelativeOffset,
			true, 0.7f, 1.0f, 0.f, nullptr, nullptr, true
		);
	}

	SetRainActive(true);
}

void ABarburhenAcidRainVolume::SetRainActive(bool bActive)
{
	bRainActive = bActive;
	GetWorldTimerManager().ClearTimer(RainTimerHandle);

	if (bRainActive)
	{
		GetWorldTimerManager().SetTimer(RainTimerHandle, this, &ABarburhenAcidRainVolume::ApplyRainTick, TickInterval, true);
	}

	if (AmbientAudio)
	{
		if (bRainActive) AmbientAudio->Play();
		else AmbientAudio->Stop();
	}
}

void ABarburhenAcidRainVolume::ApplyRainTick()
{
	if (!bRainActive || !GetWorld()) return;

	TArray<AActor*> Overlapping;
	RainVolume->GetOverlappingActors(Overlapping, ACharacter::StaticClass());

	for (AActor* Actor : Overlapping)
	{
		ACharacter* Char = Cast<ACharacter>(Actor);
		if (!Char || !Char->IsPlayerControlled()) continue;

		// Proteção: colete / máscara (tag ou componente – expandir com inventário)
		// if (bRequireNoProtection && Char->ActorHasTag(FName("HasAcidProtection"))) continue;

		if (UKhaaosVitalityComponent* Vitality = Char->FindComponentByClass<UKhaaosVitalityComponent>())
		{
			Vitality->ApplyPercentageDamage(DamagePercentPerTick, this);
			// Aumenta medo levemente sob chuva ácida
			Vitality->Fear = FMath::Min(100.f, Vitality->Fear + 2.f);
		}
	}
}
