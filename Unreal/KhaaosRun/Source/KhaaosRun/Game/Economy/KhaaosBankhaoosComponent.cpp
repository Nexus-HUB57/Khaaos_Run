// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Economy/KhaaosBankhaoosComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

UKhaaosBankhaoosComponent::UKhaaosBankhaoosComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UKhaaosBankhaoosComponent::BeginPlay()
{
	Super::BeginPlay();
	// A conta só é criada explicitamente no Zu 1 (CreateAccount)
}

bool UKhaaosBankhaoosComponent::CreateAccount()
{
	if (bAccountCreated)
	{
		UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] Conta já existe: %s"), *AccountId);
		return false;
	}

	AccountId = GenerateAccountId();
	DepositAddress = GenerateDepositAddress();
	KRCBalance = InitialKRC;
	bAccountCreated = true;

	UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] Conta criada | ID=%s | Depósito=%s | KRC=%d"),
		*AccountId, *DepositAddress, KRCBalance);

	OnAccountCreated.Broadcast(AccountId, InitialKRC);
	OnKRCChanged.Broadcast(KRCBalance, InitialKRC);

	// Em produção: HTTP POST para a API Node.js (EconomyBridge)
	// Ex: POST /api/bankhaoos/create { playerId, initialKRC }

	return true;
}

void UKhaaosBankhaoosComponent::CreditKRC(int32 Amount, const FString& Reason)
{
	if (Amount <= 0) return;

	KRCBalance += Amount;
	OnKRCChanged.Broadcast(KRCBalance, Amount);

	UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] +%d KRC (%s) → Saldo %d"), Amount, *Reason, KRCBalance);
}

bool UKhaaosBankhaoosComponent::DebitKRC(int32 Amount, const FString& Reason)
{
	if (Amount <= 0 || Amount > KRCBalance) return false;

	KRCBalance -= Amount;
	OnKRCChanged.Broadcast(KRCBalance, -Amount);

	UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] -%d KRC (%s) → Saldo %d"), Amount, *Reason, KRCBalance);
	return true;
}

FString UKhaaosBankhaoosComponent::GenerateAccountId() const
{
	// Formato simples: KR-XXXXXXXX
	const int32 Rand = FMath::RandRange(10000000, 99999999);
	return FString::Printf(TEXT("KR-%08d"), Rand);
}

FString UKhaaosBankhaoosComponent::GenerateDepositAddress() const
{
	// Simulação de endereço (em produção vem da API / wallet)
	FString Addr = TEXT("krc1");
	for (int32 i = 0; i < 32; ++i)
	{
		Addr.AppendChar(TEXT("0123456789abcdef")[FMath::RandRange(0, 15)]);
	}
	return Addr;
}
