// Copyright Nexus-HUB57. All Rights Reserved.
// Zu 2 CIGKV – Capotamento

#include "CIGKV/Zu2CigkvImpact.h"
#include "Player/KhaaosVitalityComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"
#include "Engine/World.h"

AZu2CigkvImpact::AZu2CigkvImpact()
{
	PrimaryActorTick.bCanEverTick = false;

	VehicleMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("VehicleMesh"));
	RootComponent = VehicleMesh;
	VehicleMesh->SetSimulatePhysics(false);
	VehicleMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	VehicleMesh->SetCollisionResponseToAllChannels(ECR_Block);

	TriggerVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("TriggerVolume"));
	TriggerVolume->SetupAttachment(RootComponent);
	TriggerVolume->SetBoxExtent(FVector(450.f, 220.f, 160.f));
	TriggerVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	TriggerVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	TriggerVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	TriggerVolume->SetGenerateOverlapEvents(true);
}

void AZu2CigkvImpact::BeginPlay()
{
	Super::BeginPlay();
	if (TriggerVolume)
	{
		TriggerVolume->OnComponentBeginOverlap.AddDynamic(this, &AZu2CigkvImpact::OnTriggerBeginOverlap);
	}
}

void AZu2CigkvImpact::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	GetWorldTimerManager().ClearAllTimersForObject(this);
	ClearStun();

	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->RemoveFromParent();
		ActiveChoiceWidget = nullptr;
	}
	Super::EndPlay(EndPlayReason);
}

void AZu2CigkvImpact::OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	if (bCrashTriggered) return;

	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled()) return;

	ImpactPoint = OtherActor->GetActorLocation();
	TriggerCrash();
}

void AZu2CigkvImpact::TriggerCrash()
{
	if (bCrashTriggered) return;
	bCrashTriggered = true;

	ApplyImpactPhysics();
	PlayCrashEffects();
	PlayMarechalVoice();

	GetWorldTimerManager().SetTimer(PopUpTimerHandle, this, &AZu2CigkvImpact::ShowChoiceWidget, PopUpDelay, false);
}

void AZu2CigkvImpact::ApplyImpactPhysics()
{
	if (!VehicleMesh) return;

	VehicleMesh->SetSimulatePhysics(true);
	VehicleMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	// Impulso mais forte + rotação de capotamento
	const FVector ImpulseDirection = GetActorForwardVector() * -1.0f + FVector(0.f, 0.f, 0.6f);
	const FVector Impulse = ImpulseDirection.GetSafeNormal() * ImpactForce;
	VehicleMesh->AddImpulseAtLocation(Impulse, ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint);

	// Torque forte para simular capotamento
	const FVector Torque = FVector(
		FMath::RandRange(-12000.f, 12000.f),
		FMath::RandRange(15000.f, 28000.f),
		FMath::RandRange(-5000.f, 5000.f)
	);
	VehicleMesh->AddTorqueInRadians(Torque);
}

void AZu2CigkvImpact::PlayCrashEffects()
{
	const FVector FXLocation = ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint;

	if (CrashFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(
			GetWorld(), CrashFX, FXLocation, GetActorRotation(),
			FVector(1.8f), true, true, ENCPoolMethod::AutoRelease
		);
	}

	if (CrashSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, CrashSound, FXLocation, 1.1f, 0.95f);
	}
}

void AZu2CigkvImpact::PlayMarechalVoice()
{
	if (MarechalVoiceCue)
	{
		UGameplayStatics::PlaySound2D(this, MarechalVoiceCue, 1.2f);
	}
}

void AZu2CigkvImpact::ShowChoiceWidget()
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	if (!PC || !ChoiceWidgetClass) return;

	ActiveChoiceWidget = CreateWidget<UUserWidget>(PC, ChoiceWidgetClass);
	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->AddToViewport(100);
	}
}

void AZu2CigkvImpact::OnPlayerChoice(bool bJumped)
{
	if (bChoiceMade) return;
	bChoiceMade = true;

	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->RemoveFromParent();
		ActiveChoiceWidget = nullptr;
	}

	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	APawn* PlayerPawn = PC ? PC->GetPawn() : nullptr;

	if (bJumped)
	{
		UE_LOG(LogTemp, Log, TEXT("[Zu2] Saltou do caminhão – imune!"));
	}
	else
	{
		const float DamagePercent = 0.30f * CriticalDamageMultiplier;
		ApplyVitalityDamage(PlayerPawn, DamagePercent);
		ApplyStun(PlayerPawn);
		UE_LOG(LogTemp, Warning, TEXT("[Zu2] Permanecer – %.0f%% dano + atordoamento %.1fs"), DamagePercent * 100.f, StunDuration);
	}

	OnChoiceMade.Broadcast(bJumped);
	GetWorldTimerManager().SetTimer(LootTimerHandle, this, &AZu2CigkvImpact::SpawnLootCrates, LootSpawnDelay, false);
}

void AZu2CigkvImpact::ApplyVitalityDamage(APawn* PlayerPawn, float DamagePercent)
{
	if (!PlayerPawn) return;

	if (UKhaaosVitalityComponent* Vitality = PlayerPawn->FindComponentByClass<UKhaaosVitalityComponent>())
	{
		Vitality->ApplyPercentageDamage(DamagePercent, this);
		return;
	}

	UGameplayStatics::ApplyDamage(
		PlayerPawn,
		DamagePercent * 100.0f,
		PlayerPawn->GetController(),
		this,
		UDamageType::StaticClass()
	);
}

void AZu2CigkvImpact::ApplyStun(APawn* PlayerPawn)
{
	if (!PlayerPawn) return;

	// Preferência: delegar ao componente de Vitalidade
	if (UKhaaosVitalityComponent* Vitality = PlayerPawn->FindComponentByClass<UKhaaosVitalityComponent>())
	{
		Vitality->ApplyStun(StunDuration);
		return;
	}

	// Fallback local
	StunnedPawn = PlayerPawn;
	if (ACharacter* Char = Cast<ACharacter>(PlayerPawn))
	{
		if (UCharacterMovementComponent* Move = Char->GetCharacterMovement())
		{
			Move->DisableMovement();
		}
	}
	GetWorldTimerManager().SetTimer(StunTimerHandle, this, &AZu2CigkvImpact::ClearStun, StunDuration, false);
}

void AZu2CigkvImpact::ClearStun()
{
	if (ACharacter* Char = Cast<ACharacter>(StunnedPawn))
	{
		if (UCharacterMovementComponent* Move = Char->GetCharacterMovement())
		{
			Move->SetMovementMode(MOVE_Walking);
		}
	}
	StunnedPawn = nullptr;
	UE_LOG(LogTemp, Log, TEXT("[Zu2] Atordoamento finalizado (fallback)."));
}

void AZu2CigkvImpact::SpawnLootCrates()
{
	if (!LootCrateClass || !GetWorld()) return;

	const FVector Center = ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint;

	for (int32 i = 0; i < LootCrateCount; ++i)
	{
		const float Angle = FMath::RandRange(0.f, 360.f);
		const float Dist = FMath::RandRange(90.f, LootSpawnRadius);

		FVector SpawnLoc = Center + FVector(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Dist,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Dist,
			80.f
		);

		FHitResult Hit;
		FCollisionQueryParams Params;
		Params.AddIgnoredActor(this);
		if (GetWorld()->LineTraceSingleByChannel(Hit, SpawnLoc + FVector(0, 0, 300), SpawnLoc - FVector(0, 0, 600), ECC_WorldStatic, Params))
		{
			SpawnLoc = Hit.ImpactPoint + FVector(0, 0, 25.f);
		}

		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		GetWorld()->SpawnActor<AActor>(LootCrateClass, SpawnLoc, FRotator::ZeroRotator, SpawnParams);
	}

	UE_LOG(LogTemp, Log, TEXT("[Zu2] %d caixotes de loot spawnados."), LootCrateCount);
}
