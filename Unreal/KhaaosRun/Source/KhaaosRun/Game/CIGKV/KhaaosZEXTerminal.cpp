// Copyright Nexus-HUB57. All Rights Reserved.

#include "CIGKV/KhaaosZEXTerminal.h"
#include "Economy/KhaaosTransferSystem.h"
#include "Economy/KhaaosBankhaoosComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"
#include "Engine/World.h"

AKhaaosZEXTerminal::AKhaaosZEXTerminal()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.05f; // luz suave

	TerminalMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("TerminalMesh"));
	RootComponent = TerminalMesh;
	TerminalMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	TerminalMesh->SetCollisionResponseToAllChannels(ECR_Block);

	InteractionVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("InteractionVolume"));
	InteractionVolume->SetupAttachment(RootComponent);
	InteractionVolume->SetBoxExtent(FVector(120.f, 120.f, 150.f));
	InteractionVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	InteractionVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	InteractionVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	InteractionVolume->SetGenerateOverlapEvents(true);

	BlueLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("BlueLight"));
	BlueLight->SetupAttachment(RootComponent);
	BlueLight->SetRelativeLocation(FVector(0.f, 0.f, 80.f));
	BlueLight->SetLightColor(FLinearColor(0.1f, 0.4f, 1.0f));
	BlueLight->SetIntensity(MinLightIntensity);
	BlueLight->SetAttenuationRadius(600.f);
	BlueLight->SetCastShadows(false);
}

void AKhaaosZEXTerminal::BeginPlay()
{
	Super::BeginPlay();

	if (InteractionVolume)
	{
		InteractionVolume->OnComponentBeginOverlap.AddDynamic(this, &AKhaaosZEXTerminal::OnOverlapBegin);
	}

	if (BlueLight)
	{
		BlueLight->SetLightColor(LightColor);
		BlueLight->SetIntensity(MinLightIntensity);
		CurrentLightIntensity = MinLightIntensity;
		TargetLightIntensity = MinLightIntensity;
	}

	// Idle FX
	if (IdleFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAttached(
			IdleFX, RootComponent, NAME_None,
			FVector(0.f, 0.f, 60.f), FRotator::ZeroRotator,
			EAttachLocation::KeepRelativeOffset, true
		);
	}
}

void AKhaaosZEXTerminal::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Atualiza cooldowns
	TArray<TWeakObjectPtr<APawn>> ToRemove;
	for (auto& Pair : PlayerCooldowns)
	{
		Pair.Value -= DeltaTime;
		if (Pair.Value <= 0.f)
		{
			ToRemove.Add(Pair.Key);
		}
	}
	for (const auto& Key : ToRemove)
	{
		PlayerCooldowns.Remove(Key);
	}

	UpdateLightIntensity(DeltaTime);
}

void AKhaaosZEXTerminal::OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled()) return;

	// Extração automática ao entrar no volume (pode ser trocado por input Interact)
	TryExtract(Pawn);
}

bool AKhaaosZEXTerminal::TryExtract(APawn* Player)
{
	if (!Player) return false;

	// Cooldown
	if (PlayerCooldowns.Contains(Player) && PlayerCooldowns[Player] > 0.f)
	{
		UE_LOG(LogTemp, Verbose, TEXT("[ZEX] Cooldown ativo para %s (%.1fs)"), *Player->GetName(), PlayerCooldowns[Player]);
		return false;
	}

	const int32 KRC = CalculateKRCReward(Player);
	if (KRC <= 0) return false;

	// Registra no TransferSystem + credita no Bankhaoos (parte imediata)
	TArray<FName> ItemsToRegister = AcceptedItemIds;
	RegisterWithTransferSystem(Player, KRC, ItemsToRegister);

	// Credita KRC imediatamente na conta (o jogador sente o ganho)
	if (UKhaaosBankhaoosComponent* Bank = Player->FindComponentByClass<UKhaaosBankhaoosComponent>())
	{
		Bank->CreditKRC(KRC, TEXT("ZEX Terminal"));
	}

	TotalExtractedKRC += KRC;
	ExtractCount++;
	PlayerCooldowns.Add(Player, ExtractCooldown);

	// Luz brilha mais forte
	TargetLightIntensity = FMath::Min(MaxLightIntensity, MinLightIntensity + ExtractCount * 350.f);

	PlayExtractFeedback();
	OnExtracted.Broadcast(Player, KRC, ItemsToRegister.Num());

	UE_LOG(LogTemp, Log, TEXT("[ZEX] Extração | +%d KRC | Total terminal %d | Luz alvo %.0f"),
		KRC, TotalExtractedKRC, TargetLightIntensity);

	return true;
}

int32 AKhaaosZEXTerminal::CalculateKRCReward(APawn* Player) const
{
	// Base + multiplicador do terminal
	// Em produção: pode ler inventário do player e dar bônus por itens raros
	return FMath::Max(1, FMath::RoundToInt(BaseKRCReward * RewardMultiplier));
}

void AKhaaosZEXTerminal::RegisterWithTransferSystem(APawn* Player, int32 KRCAmount, const TArray<FName>& ItemIds)
{
	if (!Player) return;

	UKhaaosTransferSystem* Transfer = Player->FindComponentByClass<UKhaaosTransferSystem>();
	if (!Transfer)
	{
		// Tenta no PlayerState
		if (APlayerState* PS = Player->GetPlayerState())
		{
			Transfer = PS->FindComponentByClass<UKhaaosTransferSystem>();
		}
	}

	if (!Transfer)
	{
		UE_LOG(LogTemp, Warning, TEXT("[ZEX] TransferSystem não encontrado no player – registro ignorado."));
		return;
	}

	Transfer->RegisterZEXKRC(KRCAmount);

	for (const FName& ItemId : ItemIds)
	{
		if (!ItemId.IsNone())
		{
			Transfer->RegisterZEXItem(ItemId, 1);
		}
	}
}

void AKhaaosZEXTerminal::UpdateLightIntensity(float DeltaTime)
{
	if (!BlueLight) return;

	CurrentLightIntensity = FMath::FInterpTo(CurrentLightIntensity, TargetLightIntensity, DeltaTime, 3.0f);
	BlueLight->SetIntensity(CurrentLightIntensity);

	// Pulso sutil quando idle
	if (ExtractCount == 0)
	{
		const float Pulse = 1.0f + 0.15f * FMath::Sin(GetWorld()->GetTimeSeconds() * 2.0f);
		BlueLight->SetIntensity(MinLightIntensity * Pulse);
	}
}

void AKhaaosZEXTerminal::PlayExtractFeedback()
{
	const FVector Loc = GetActorLocation() + FVector(0.f, 0.f, 60.f);

	if (ExtractFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(
			GetWorld(), ExtractFX, Loc, FRotator::ZeroRotator,
			FVector(1.2f), true, true, ENCPoolMethod::AutoRelease
		);
	}

	if (ExtractSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, ExtractSound, Loc, 1.0f, 1.0f);
	}
}
