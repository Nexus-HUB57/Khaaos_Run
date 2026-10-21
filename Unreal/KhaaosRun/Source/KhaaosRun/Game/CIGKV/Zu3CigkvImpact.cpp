// Copyright Nexus-HUB57. All Rights Reserved.
// Zu 3 CIGKV – Queda na Ponte

#include "Game/CIGKV/Zu3CigkvImpact.h"
#include "Game/Player/KhaaosVitalityComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "TimerManager.h"
#include "Engine/World.h"

AZu3CigkvImpact::AZu3CigkvImpact()
{
	PrimaryActorTick.bCanEverTick = false;

	VehicleMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("VehicleMesh"));
	RootComponent = VehicleMesh;
	VehicleMesh->SetSimulatePhysics(false);
	VehicleMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	VehicleMesh->SetCollisionResponseToAllChannels(ECR_Block);

	TriggerVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("TriggerVolume"));
	TriggerVolume->SetupAttachment(RootComponent);
	TriggerVolume->SetBoxExtent(FVector(400.f, 200.f, 180.f));
	TriggerVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	TriggerVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	TriggerVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	TriggerVolume->SetGenerateOverlapEvents(true);
}

void AZu3CigkvImpact::BeginPlay()
{
	Super::BeginPlay();
	if (TriggerVolume)
	{
		TriggerVolume->OnComponentBeginOverlap.AddDynamic(this, &AZu3CigkvImpact::OnTriggerBeginOverlap);
	}
}

void AZu3CigkvImpact::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	GetWorldTimerManager().ClearAllTimersForObject(this);
	ClearVisionBlur();

	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->RemoveFromParent();
		ActiveChoiceWidget = nullptr;
	}
	Super::EndPlay(EndPlayReason);
}

void AZu3CigkvImpact::OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	if (bCrashTriggered) return;

	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled()) return;

	ImpactPoint = OtherActor->GetActorLocation();
	TriggerCrash();
}

void AZu3CigkvImpact::TriggerCrash()
{
	if (bCrashTriggered) return;
	bCrashTriggered = true;

	ApplyImpactPhysics();
	PlayCrashEffects();
	PlayMarechalVoice();

	GetWorldTimerManager().SetTimer(PopUpTimerHandle, this, &AZu3CigkvImpact::ShowChoiceWidget, PopUpDelay, false);
}

void AZu3CigkvImpact::ApplyImpactPhysics()
{
	if (!VehicleMesh) return;

	VehicleMesh->SetSimulatePhysics(true);
	VehicleMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	// Impulso forte para baixo (queda da ponte)
	const FVector ImpulseDirection = GetActorForwardVector() * -0.4f + FVector(0.f, 0.f, -1.0f);
	const FVector Impulse = ImpulseDirection.GetSafeNormal() * ImpactForce;
	VehicleMesh->AddImpulseAtLocation(Impulse, ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint);

	const FVector Torque = FVector(
		FMath::RandRange(-8000.f, 8000.f),
		FMath::RandRange(10000.f, 20000.f),
		FMath::RandRange(-3000.f, 3000.f)
	);
	VehicleMesh->AddTorqueInRadians(Torque);
}

void AZu3CigkvImpact::PlayCrashEffects()
{
	const FVector FXLocation = ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint;

	if (CrashFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(
			GetWorld(), CrashFX, FXLocation, GetActorRotation(),
			FVector(2.0f), true, true, ENCPoolMethod::AutoRelease
		);
	}

	// Splash de água extra
	if (WaterSplashFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(
			GetWorld(), WaterSplashFX, FXLocation - FVector(0, 0, 50.f), FRotator::ZeroRotator,
			FVector(2.5f), true, true, ENCPoolMethod::AutoRelease
		);
	}

	if (CrashSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, CrashSound, FXLocation, 1.2f, 0.9f);
	}

	if (WaterSplashSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, WaterSplashSound, FXLocation, 1.0f, 1.0f);
	}
}

void AZu3CigkvImpact::PlayMarechalVoice()
{
	if (MarechalVoiceCue)
	{
		UGameplayStatics::PlaySound2D(this, MarechalVoiceCue, 1.3f);
	}
}

void AZu3CigkvImpact::ShowChoiceWidget()
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	if (!PC || !ChoiceWidgetClass) return;

	ActiveChoiceWidget = CreateWidget<UUserWidget>(PC, ChoiceWidgetClass);
	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->AddToViewport(100);
	}
}

void AZu3CigkvImpact::OnPlayerChoice(bool bUsedMask)
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

	if (bUsedMask)
	{
		UE_LOG(LogTemp, Log, TEXT("[Zu3] Máscara usada – imune ao impacto e à água!"));
	}
	else
	{
		const float DamagePercent = 0.30f * CriticalDamageMultiplier;
		ApplyVitalityDamage(PlayerPawn, DamagePercent);
		ApplyVisionBlur(PlayerPawn);
		UE_LOG(LogTemp, Warning, TEXT("[Zu3] Sem máscara – %.0f%% dano + visão embaçada %.1fs"), DamagePercent * 100.f, BlurDuration);
	}

	OnChoiceMade.Broadcast(bUsedMask);
	GetWorldTimerManager().SetTimer(LootTimerHandle, this, &AZu3CigkvImpact::SpawnLootCrates, LootSpawnDelay, false);
}

void AZu3CigkvImpact::ApplyVitalityDamage(APawn* PlayerPawn, float DamagePercent)
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

void AZu3CigkvImpact::ApplyVisionBlur(APawn* PlayerPawn)
{
	if (!PlayerPawn) return;

	// Preferência: delegar ao componente de Vitalidade
	if (UKhaaosVitalityComponent* Vitality = PlayerPawn->FindComponentByClass<UKhaaosVitalityComponent>())
	{
		Vitality->ApplyVisionBlur(BlurDuration);
		return;
	}

	// Fallback local
	APlayerController* PC = Cast<APlayerController>(PlayerPawn->GetController());
	if (!PC) return;

	BlurredController = PC;
	if (APlayerCameraManager* CamMgr = PC->PlayerCameraManager)
	{
		CamMgr->SetFOV(CamMgr->GetFOVAngle() * 0.75f);
	}
	GetWorldTimerManager().SetTimer(BlurTimerHandle, this, &AZu3CigkvImpact::ClearVisionBlur, BlurDuration, false);
}

void AZu3CigkvImpact::ClearVisionBlur()
{
	if (BlurredController && BlurredController->PlayerCameraManager)
	{
		BlurredController->PlayerCameraManager->SetFOV(90.0f);
	}
	BlurredController = nullptr;
	UE_LOG(LogTemp, Log, TEXT("[Zu3] Visão embaçada finalizada (fallback)."));
}

void AZu3CigkvImpact::SpawnLootCrates()
{
	if (!LootCrateClass || !GetWorld()) return;

	const FVector Center = ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint;

	for (int32 i = 0; i < LootCrateCount; ++i)
	{
		const float Angle = FMath::RandRange(0.f, 360.f);
		const float Dist = FMath::RandRange(70.f, LootSpawnRadius);

		FVector SpawnLoc = Center + FVector(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Dist,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Dist,
			60.f
		);

		FHitResult Hit;
		FCollisionQueryParams Params;
		Params.AddIgnoredActor(this);
		if (GetWorld()->LineTraceSingleByChannel(Hit, SpawnLoc + FVector(0, 0, 250), SpawnLoc - FVector(0, 0, 500), ECC_WorldStatic, Params))
		{
			SpawnLoc = Hit.ImpactPoint + FVector(0, 0, 20.f);
		}

		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		GetWorld()->SpawnActor<AActor>(LootCrateClass, SpawnLoc, FRotator::ZeroRotator, SpawnParams);
	}

	UE_LOG(LogTemp, Log, TEXT("[Zu3] %d caixotes de loot (armadilhas) spawnados."), LootCrateCount);
}
