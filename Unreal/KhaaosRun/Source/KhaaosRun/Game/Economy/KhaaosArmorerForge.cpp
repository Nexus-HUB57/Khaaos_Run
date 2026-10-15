// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Economy/KhaaosArmorerForge.h"
#include "Game/Economy/KhaaosBankhaoosComponent.h"
#include "Game/Economy/KhaaosForgeItem.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "Blueprint/UserWidget.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Engine/DataTable.h"
#include "Engine/World.h"

AKhaaosArmorerForge::AKhaaosArmorerForge()
{
	PrimaryActorTick.bCanEverTick = false;

	ForgeMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ForgeMesh"));
	RootComponent = ForgeMesh;
	ForgeMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	ForgeMesh->SetCollisionResponseToAllChannels(ECR_Block);

	InteractionVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("InteractionVolume"));
	InteractionVolume->SetupAttachment(RootComponent);
	InteractionVolume->SetBoxExtent(FVector(150.f, 150.f, 180.f));
	InteractionVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	InteractionVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	InteractionVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	InteractionVolume->SetGenerateOverlapEvents(true);

	ForgeLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("ForgeLight"));
	ForgeLight->SetupAttachment(RootComponent);
	ForgeLight->SetRelativeLocation(FVector(0.f, 0.f, 100.f));
	ForgeLight->SetLightColor(FLinearColor(1.0f, 0.45f, 0.1f)); // laranja de forja
	ForgeLight->SetIntensity(2500.f);
	ForgeLight->SetAttenuationRadius(500.f);
	ForgeLight->SetCastShadows(false);
}

void AKhaaosArmorerForge::BeginPlay()
{
	Super::BeginPlay();

	if (InteractionVolume)
	{
		InteractionVolume->OnComponentBeginOverlap.AddDynamic(this, &AKhaaosArmorerForge::OnOverlapBegin);
	}

	if (IdleFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAttached(
			IdleFX, RootComponent, NAME_None,
			FVector(0.f, 0.f, 40.f), FRotator::ZeroRotator,
			EAttachLocation::KeepRelativeOffset, true
		);
	}
}

void AKhaaosArmorerForge::OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled()) return;

	OpenShop(Pawn);
}

void AKhaaosArmorerForge::OpenShop(APawn* Player)
{
	if (!Player || !ShopWidgetClass) return;

	// Fecha UI anterior se houver
	CloseShop();

	APlayerController* PC = Cast<APlayerController>(Player->GetController());
	if (!PC) return;

	ActiveShopWidget = CreateWidget<UUserWidget>(PC, ShopWidgetClass);
	if (ActiveShopWidget)
	{
		ActiveShopWidget->AddToViewport(50);
		CurrentCustomer = Player;
		OnShopOpened.Broadcast(Player);

		// Input mode UI (opcional – o Widget pode gerenciar)
		// FInputModeUIOnly Mode;
		// Mode.SetWidgetToFocus(ActiveShopWidget->TakeWidget());
		// PC->SetInputMode(Mode);
		// PC->bShowMouseCursor = true;

		UE_LOG(LogTemp, Log, TEXT("[Forja] Loja aberta para %s"), *Player->GetName());
	}
}

void AKhaaosArmorerForge::CloseShop()
{
	if (ActiveShopWidget)
	{
		ActiveShopWidget->RemoveFromParent();
		ActiveShopWidget = nullptr;
	}

	if (CurrentCustomer.IsValid())
	{
		OnShopClosed.Broadcast(CurrentCustomer.Get());

		// Restaura input
		// if (APlayerController* PC = Cast<APlayerController>(CurrentCustomer->GetController()))
		// {
		//     PC->SetInputMode(FInputModeGameOnly());
		//     PC->bShowMouseCursor = false;
		// }
	}

	CurrentCustomer = nullptr;
}

bool AKhaaosArmorerForge::TryPurchase(APawn* Player, FName ItemId)
{
	if (!Player || ItemId.IsNone()) return false;

	FKhaaosForgeItemRow Item;
	if (!GetItemById(ItemId, Item))
	{
		OnPurchaseFailed.Broadcast(ItemId, TEXT("Item não encontrado no catálogo"));
		PlayErrorFeedback();
		return false;
	}

	// Restrição de patente (ignorada no CIGKV)
	if (!bIgnoreRankRestriction && Item.MinRankLevel > 0)
	{
		// Em produção: ler patente do PlayerState / RankingService
		// if (PlayerRank < Item.MinRankLevel) { fail... }
	}

	UKhaaosBankhaoosComponent* Bank = Player->FindComponentByClass<UKhaaosBankhaoosComponent>();
	if (!Bank)
	{
		OnPurchaseFailed.Broadcast(ItemId, TEXT("Bankhaoos não encontrado"));
		PlayErrorFeedback();
		return false;
	}

	if (!Bank->HasAccount())
	{
		OnPurchaseFailed.Broadcast(ItemId, TEXT("Conta Bankhaoos não criada – entre no Zu 1 primeiro"));
		PlayErrorFeedback();
		return false;
	}

	if (Bank->GetBalance() < Item.PriceKRC)
	{
		OnPurchaseFailed.Broadcast(ItemId, FString::Printf(TEXT("Saldo insuficiente (%d KRC necessários)"), Item.PriceKRC));
		PlayErrorFeedback();
		UE_LOG(LogTemp, Warning, TEXT("[Forja] Saldo insuficiente: tem %d, precisa %d"), Bank->GetBalance(), Item.PriceKRC);
		return false;
	}

	// Debita KRC
	if (!Bank->DebitKRC(Item.PriceKRC, FString::Printf(TEXT("Forja – %s"), *Item.ItemId.ToString())))
	{
		OnPurchaseFailed.Broadcast(ItemId, TEXT("Falha ao debitar KRC"));
		PlayErrorFeedback();
		return false;
	}

	// Entrega o item
	GiveItemToPlayer(Player, Item);
	PlayPurchaseFeedback();
	OnPurchaseSuccess.Broadcast(ItemId, Item.PriceKRC);

	UE_LOG(LogTemp, Log, TEXT("[Forja] Compra OK | %s por %d KRC | Saldo restante %d"),
		*Item.ItemId.ToString(), Item.PriceKRC, Bank->GetBalance());

	return true;
}

void AKhaaosArmorerForge::GiveItemToPlayer(APawn* Player, const FKhaaosForgeItemRow& Item)
{
	if (!Player) return;

	// 1) Se tiver classe de Actor, spawna perto do player
	if (Item.ItemActorClass)
	{
		const FVector SpawnLoc = Player->GetActorLocation() + Player->GetActorForwardVector() * 80.f + FVector(0, 0, 30.f);
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		GetWorld()->SpawnActor<AActor>(Item.ItemActorClass, SpawnLoc, FRotator::ZeroRotator, Params);
	}

	// 2) Em produção: chamar o InventoryComponent do projeto
	// if (UKhaaosInventoryComponent* Inv = Player->FindComponentByClass<UKhaaosInventoryComponent>())
	// {
	//     Inv->AddItem(Item.ItemId, Item.QuantityPerPurchase);
	// }

	UE_LOG(LogTemp, Log, TEXT("[Forja] Item entregue: %s x%d"), *Item.ItemId.ToString(), Item.QuantityPerPurchase);
}

TArray<FKhaaosForgeItemRow> AKhaaosArmorerForge::GetCatalogItems() const
{
	TArray<FKhaaosForgeItemRow> Result;
	if (!CatalogDataTable) return Result;

	CatalogDataTable->ForeachRow<FKhaaosForgeItemRow>(TEXT("GetCatalogItems"),
		[&Result](const FName& Key, const FKhaaosForgeItemRow& Value)
		{
			Result.Add(Value);
		});

	return Result;
}

bool AKhaaosArmorerForge::GetItemById(FName ItemId, FKhaaosForgeItemRow& OutRow) const
{
	if (!CatalogDataTable || ItemId.IsNone()) return false;

	const FString Context = TEXT("GetItemById");
	FKhaaosForgeItemRow* Found = CatalogDataTable->FindRow<FKhaaosForgeItemRow>(ItemId, Context, false);
	if (Found)
	{
		OutRow = *Found;
		return true;
	}

	// Fallback: procura por ItemId dentro das rows (caso a row key seja diferente)
	bool bFound = false;
	CatalogDataTable->ForeachRow<FKhaaosForgeItemRow>(Context,
		[&](const FName& Key, const FKhaaosForgeItemRow& Value)
		{
			if (!bFound && Value.ItemId == ItemId)
			{
				OutRow = Value;
				bFound = true;
			}
		});

	return bFound;
}

void AKhaaosArmorerForge::PlayPurchaseFeedback()
{
	const FVector Loc = GetActorLocation() + FVector(0.f, 0.f, 50.f);

	if (PurchaseFX)
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(
			GetWorld(), PurchaseFX, Loc, FRotator::ZeroRotator,
			FVector(1.0f), true, true, ENCPoolMethod::AutoRelease
		);
	}

	if (PurchaseSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, PurchaseSound, Loc);
	}
}

void AKhaaosArmorerForge::PlayErrorFeedback()
{
	if (ErrorSound)
	{
		UGameplayStatics::PlaySound2D(this, ErrorSound);
	}
}
