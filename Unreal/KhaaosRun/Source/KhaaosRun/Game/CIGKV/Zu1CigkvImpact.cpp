// Copyright Nexus-HUB57. All Rights Reserved.
// Zu 1 CIGKV – Caminhão Atropelando Bois

#include "CIGKV/Zu1CigkvImpact.h"
#include "Player/KhaaosVitalityComponent.h"
#include "Economy/KhaaosBankhaoosComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"
#include "Engine/World.h"

AZu1CigkvImpact::AZu1CigkvImpact()
{
	PrimaryActorTick.bCanEverTick = false;

	// Mesh do caminhão
	VehicleMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("VehicleMesh"));
	RootComponent = VehicleMesh;
	VehicleMesh->SetSimulatePhysics(false); // Física ativada apenas no impacto
	VehicleMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	VehicleMesh->SetCollisionResponseToAllChannels(ECR_Block);

	// Volume de trigger (jogador entra → inicia sequência)
	TriggerVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("TriggerVolume"));
	TriggerVolume->SetupAttachment(RootComponent);
	TriggerVolume->SetBoxExtent(FVector(400.f, 200.f, 150.f));
	TriggerVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	TriggerVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	TriggerVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	TriggerVolume->SetGenerateOverlapEvents(true);
}

void AZu1CigkvImpact::BeginPlay()
{
	Super::BeginPlay();

	if (TriggerVolume)
	{
		TriggerVolume->OnComponentBeginOverlap.AddDynamic(this, &AZu1CigkvImpact::OnTriggerBeginOverlap);
	}
}

void AZu1CigkvImpact::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	GetWorldTimerManager().ClearAllTimersForObject(this);

	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->RemoveFromParent();
		ActiveChoiceWidget = nullptr;
	}

	Super::EndPlay(EndPlayReason);
}

void AZu1CigkvImpact::OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	if (bCrashTriggered) return;

	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled()) return;

	// Guarda o ponto de impacto aproximado
	ImpactPoint = OtherActor->GetActorLocation();
	TriggerCrash();
}

void AZu1CigkvImpact::TriggerCrash()
{
	if (bCrashTriggered) return;
	bCrashTriggered = true;

	ApplyImpactPhysics();
	PlayCrashEffects();
	PlayMarechalVoice();

	// Bankhaoos: cria conta + 1000 KRC no primeiro ingresso (Zu 1)
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0))
	{
		if (APawn* Pawn = PC->GetPawn())
		{
			if (UKhaaosBankhaoosComponent* Bank = Pawn->FindComponentByClass<UKhaaosBankhaoosComponent>())
			{
				if (Bank->CreateAccount())
				{
					UE_LOG(LogTemp, Log, TEXT("[Zu1] Bankhaoos criada – 1000 KRC creditados."));
				}
			}
		}
	}

	// Delay curto antes do pop-up (dá tempo do impacto ser sentido)
	GetWorldTimerManager().SetTimer(PopUpTimerHandle, this, &AZu1CigkvImpact::ShowChoiceWidget, PopUpDelay, false);
}

void AZu1CigkvImpact::ApplyImpactPhysics()
{
	if (!VehicleMesh) return;

	// Ativa física e aplica impulso forte na direção do impacto
	VehicleMesh->SetSimulatePhysics(true);
	VehicleMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	const FVector ImpulseDirection = GetActorForwardVector() * -1.0f + FVector(0.f, 0.f, 0.3f);
	const FVector Impulse = ImpulseDirection.GetSafeNormal() * ImpactForce;

	VehicleMesh->AddImpulseAtLocation(Impulse, ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint);

	// Rotação extra para sensação de capotamento parcial
	const FVector Torque = FVector(FMath::RandRange(-5000.f, 5000.f), FMath::RandRange(8000.f, 15000.f), 0.f);
	VehicleMesh->AddTorqueInRadians(Torque);
}

void AZu1CigkvImpact::PlayCrashEffects()
{
	const FVector FXLocation = ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint;

	// Niagara
	if (CrashFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(
			GetWorld(),
			CrashFX,
			FXLocation,
			GetActorRotation(),
			FVector(1.5f), // Scale um pouco maior para impacto épico
			true,
			true,
			ENCPoolMethod::AutoRelease
		);
	}

	// Som 3D
	if (CrashSound)
	{
		UGameplayStatics::PlaySoundAtLocation(
			this,
			CrashSound,
			FXLocation,
			1.0f,  // Volume
			1.0f,  // Pitch
			0.0f,  // StartTime
			nullptr,
			nullptr,
			true   // bAutoDestroy
		);
	}
}

void AZu1CigkvImpact::PlayMarechalVoice()
{
	if (MarechalVoiceCue)
	{
		UGameplayStatics::PlaySound2D(this, MarechalVoiceCue, 1.2f);
	}
}

void AZu1CigkvImpact::ShowChoiceWidget()
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	if (!PC || !ChoiceWidgetClass) return;

	ActiveChoiceWidget = CreateWidget<UUserWidget>(PC, ChoiceWidgetClass);
	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->AddToViewport(100); // Alta prioridade

		// O Widget deve chamar OnPlayerChoice via Blueprint ou Interface
		// (ver BP_PopUp_Zu1_Choice)
	}
}

void AZu1CigkvImpact::OnPlayerChoice(bool bSeatbeltFastened)
{
	if (bChoiceMade) return;
	bChoiceMade = true;

	// Remove o widget
	if (ActiveChoiceWidget)
	{
		ActiveChoiceWidget->RemoveFromParent();
		ActiveChoiceWidget = nullptr;
	}

	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	APawn* PlayerPawn = PC ? PC->GetPawn() : nullptr;

	if (bSeatbeltFastened)
	{
		// Cinto apertado → imune
		UE_LOG(LogTemp, Log, TEXT("[Zu1] Cinto apertado – imune ao impacto."));
		// Opcional: pequeno feedback visual de "seguro"
	}
	else
	{
		// Sem cinto → −30 % Vitalidade
		const float DamagePercent = 0.30f * CriticalDamageMultiplier;
		ApplyVitalityDamage(PlayerPawn, DamagePercent);
		UE_LOG(LogTemp, Warning, TEXT("[Zu1] Sem cinto – aplicando %.0f%% de dano de Vitalidade."), DamagePercent * 100.f);
	}

	OnChoiceMade.Broadcast(bSeatbeltFastened);

	// Spawn de loot após delay curto
	GetWorldTimerManager().SetTimer(LootTimerHandle, this, &AZu1CigkvImpact::SpawnLootCrates, LootSpawnDelay, false);
}

void AZu1CigkvImpact::ApplyVitalityDamage(APawn* PlayerPawn, float DamagePercent)
{
	if (!PlayerPawn) return;

	// Integração real com UKhaaosVitalityComponent
	if (UKhaaosVitalityComponent* Vitality = PlayerPawn->FindComponentByClass<UKhaaosVitalityComponent>())
	{
		Vitality->ApplyPercentageDamage(DamagePercent, this);
		return;
	}

	// Fallback seguro (caso o componente ainda não esteja no Character)
	UGameplayStatics::ApplyDamage(
		PlayerPawn,
		DamagePercent * 100.0f,
		PlayerPawn->GetController(),
		this,
		UDamageType::StaticClass()
	);
}

void AZu1CigkvImpact::SpawnLootCrates()
{
	if (!LootCrateClass || !GetWorld()) return;

	const FVector Center = ImpactPoint.IsZero() ? GetActorLocation() : ImpactPoint;

	for (int32 i = 0; i < LootCrateCount; ++i)
	{
		const float Angle = FMath::RandRange(0.f, 360.f);
		const float Dist = FMath::RandRange(80.f, LootSpawnRadius);

		FVector SpawnLoc = Center + FVector(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Dist,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Dist,
			50.f
		);

		// Trace no chão para evitar spawn no ar
		FHitResult Hit;
		FCollisionQueryParams Params;
		Params.AddIgnoredActor(this);
		if (GetWorld()->LineTraceSingleByChannel(Hit, SpawnLoc + FVector(0, 0, 200), SpawnLoc - FVector(0, 0, 500), ECC_WorldStatic, Params))
		{
			SpawnLoc = Hit.ImpactPoint + FVector(0, 0, 20.f);
		}

		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

		GetWorld()->SpawnActor<AActor>(LootCrateClass, SpawnLoc, FRotator::ZeroRotator, SpawnParams);
	}

	UE_LOG(LogTemp, Log, TEXT("[Zu1] %d caixotes de loot spawnados."), LootCrateCount);
}
