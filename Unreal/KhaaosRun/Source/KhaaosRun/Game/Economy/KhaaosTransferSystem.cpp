// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Economy/KhaaosTransferSystem.h"
#include "Game/Economy/KhaaosBankhaoosComponent.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerState.h"

UKhaaosTransferSystem::UKhaaosTransferSystem()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UKhaaosTransferSystem::RegisterZEXKRC(int32 Amount)
{
	if (Amount <= 0) return;
	ZEXCollectedKRC += Amount;
	UE_LOG(LogTemp, Log, TEXT("[Transfer] ZEX +%d KRC (total ZEX %d)"), Amount, ZEXCollectedKRC);
}

void UKhaaosTransferSystem::RegisterZEXItem(FName ItemId, int32 Quantity, float Quality)
{
	if (ItemId.IsNone() || Quantity <= 0) return;

	// Acumula se já existir o mesmo item
	for (FTransferableItem& Existing : ZEXCollectedItems)
	{
		if (Existing.ItemId == ItemId)
		{
			Existing.Quantity += Quantity;
			Existing.Quality = FMath::Max(Existing.Quality, Quality);
			return;
		}
	}

	FTransferableItem NewItem;
	NewItem.ItemId = ItemId;
	NewItem.Quantity = Quantity;
	NewItem.Quality = Quality;
	ZEXCollectedItems.Add(NewItem);
}

void UKhaaosTransferSystem::SetCIGKVRank(int32 NewRank)
{
	CurrentCIGKVRank = FMath::Max(0, NewRank);
}

FTransferPayload UKhaaosTransferSystem::ExecuteTransfer()
{
	FTransferPayload Payload;
	Payload.CIGKVRank = CurrentCIGKVRank;

	// ----------------------------------------------------------
	// 1. Transferência de 20 % dos KRC dos ZEX
	// ----------------------------------------------------------
	Payload.TransferredKRC = FMath::FloorToInt(ZEXCollectedKRC * TransferPercent);

	if (Payload.TransferredKRC > 0)
	{
		if (UKhaaosBankhaoosComponent* Bank = GetBankhaoos())
		{
			// Os KRC transferidos já estão na conta; aqui apenas registramos
			// o valor que será “oficializado” no W1/C1.
			// Em produção: POST /api/transfer { accountId, krc, items, rank }
			UE_LOG(LogTemp, Log, TEXT("[Transfer] %d KRC (20%% de %d) prontos para W1/C1"),
				Payload.TransferredKRC, ZEXCollectedKRC);
		}
	}

	// ----------------------------------------------------------
	// 2. Transferência de 20 % dos itens
	// ----------------------------------------------------------
	for (const FTransferableItem& Item : ZEXCollectedItems)
	{
		const int32 QtyToTransfer = FMath::Max(1, FMath::FloorToInt(Item.Quantity * TransferPercent));
		if (QtyToTransfer > 0)
		{
			FTransferableItem Transferred;
			Transferred.ItemId = Item.ItemId;
			Transferred.Quantity = QtyToTransfer;
			Transferred.Quality = Item.Quality;
			Payload.TransferredItems.Add(Transferred);
		}
	}

	// ----------------------------------------------------------
	// 3. Token de Veterano + Pack UE5 (Top 50)
	// ----------------------------------------------------------
	if (CurrentCIGKVRank > 0 && CurrentCIGKVRank <= VeteranTokenRankLimit)
	{
		Payload.bHasVeteranToken = true;
		Payload.bHasUE5Pack = true;
		OnVeteranTokenGranted.Broadcast(CurrentCIGKVRank);

		UE_LOG(LogTemp, Log, TEXT("[Transfer] Token de Veterano + Pack UE5 concedidos (Rank #%d)"), CurrentCIGKVRank);
	}

	// ----------------------------------------------------------
	// 4. Persistência parcial (Top 1000) – já coberta pelo 20 %
	// ----------------------------------------------------------
	if (CurrentCIGKVRank > 0 && CurrentCIGKVRank <= PartialPersistRankLimit)
	{
		UE_LOG(LogTemp, Log, TEXT("[Transfer] Persistência parcial ativa (Rank #%d ≤ %d)"),
			CurrentCIGKVRank, PartialPersistRankLimit);
	}

	OnTransferCompleted.Broadcast(Payload);

	UE_LOG(LogTemp, Log, TEXT("[Transfer] Concluído → %d KRC + %d tipos de item | Veterano=%s"),
		Payload.TransferredKRC,
		Payload.TransferredItems.Num(),
		Payload.bHasVeteranToken ? TEXT("SIM") : TEXT("NÃO"));

	return Payload;
}

UKhaaosBankhaoosComponent* UKhaaosTransferSystem::GetBankhaoos() const
{
	AActor* Owner = GetOwner();
	if (!Owner) return nullptr;

	if (UKhaaosBankhaoosComponent* Bank = Owner->FindComponentByClass<UKhaaosBankhaoosComponent>())
	{
		return Bank;
	}

	// Tenta no Pawn se o componente estiver no Character
	if (APlayerState* PS = Cast<APlayerState>(Owner))
	{
		if (APawn* Pawn = PS->GetPawn())
		{
			return Pawn->FindComponentByClass<UKhaaosBankhaoosComponent>();
		}
	}

	return nullptr;
}
