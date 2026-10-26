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
	RainVolume->SetBoxExtent(FVector(15000.f, 15000.f, 5000.f));
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

void ABarburhenAcidRainVolume::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	GetWorldTimerManager().ClearTimer(RainTimerHandle);
	Super::EndPlay(EndPlayReason);
}

void ABarburhenAcidRainVolume::SetRainActive(bool bActive)
{
	bRainActive = bActive;
	GetWorldTimerManager().ClearTimer(RainTimerHandle);

	if (bRainActive && TickInterval > 0.f)
	{
		GetWorldTimerManager().SetTimer(
			RainTimerHandle, this, &ABarburhenAcidRainVolume::ApplyRainTick,
			TickInterval, true
		);
	}

	if (AmbientAudio)
	{
		if (bRainActive)
		{
			AmbientAudio->Play();
		}
		else
		{
			AmbientAudio->Stop();
		}
	}
}

bool ABarburhenAcidRainVolume::HasAcidProtection(AActor* Actor) const
{
	if (!Actor || ProtectionTag.IsNone())
	{
		return false;
	}
	return Actor->ActorHasTag(ProtectionTag);
}

void ABarburhenAcidRainVolume::ApplyRainTick()
{
	if (!bRainActive || !GetWorld() || DamagePercentPerTick <= 0.f)
	{
		return;
	}

	TArray<AActor*> Overlapping;
	RainVolume->GetOverlappingActors(Overlapping, ACharacter::StaticClass());

	int32 HitCount = 0;
	for (AActor* Actor : Overlapping)
	{
		ACharacter* Char = Cast<ACharacter>(Actor);
		if (!Char || !Char->IsPlayerControlled())
		{
			continue;
		}

		if (bRequireNoProtection && HasAcidProtection(Char))
		{
			continue;
		}

		UKhaaosVitalityComponent* Vitality = Char->FindComponentByClass<UKhaaosVitalityComponent>();
		if (!Vitality)
		{
			continue;
		}

		// −DamagePercentPerTick da MaxVitality (ex.: 0.01 = 1 %)
		Vitality->ApplyPercentageDamage(DamagePercentPerTick, this);
		Vitality->Fear = FMath::Min(100.f, Vitality->Fear + FearPerTick);
		OnAcidRainTick.Broadcast(Char, DamagePercentPerTick);
		++HitCount;
	}

	if (HitCount > 0)
	{
		UE_LOG(LogTemp, Verbose, TEXT("[AcidRain] Tick −%.1f%% em %d jogador(es) | DPS eq=%.4f"),
			DamagePercentPerTick * 100.f, HitCount, GetEquivalentDamagePerSecond());
	}
}
