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
	if (!GetOwner() || !GetOwner()->HasAuthority())
	{
		UE_LOG(LogTemp, Warning, TEXT("[Bankhaoos] Criação de conta negada fora da autoridade do servidor"));
		return false;
	}

	if (bAccountCreated)
	{
		UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] Conta já existe: %s"), *AccountId);
		return false;
	}

	AccountId = GenerateAccountId();
	KRCBalance = InitialKRC;
	bAccountCreated = true;

	UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] Conta local de teste criada | ID=%s | KRC=%d"),
		*AccountId, KRCBalance);

	OnAccountCreated.Broadcast(AccountId, InitialKRC);
	OnKRCChanged.Broadcast(KRCBalance, InitialKRC);

	return true;
}

void UKhaaosBankhaoosComponent::CreditKRC(int32 Amount, const FString& Reason)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || Amount <= 0 || KRCBalance > MAX_int32 - Amount)
	{
		UE_LOG(LogTemp, Warning, TEXT("[Bankhaoos] Crédito local negado: requer autoridade do servidor e valor válido"));
		return;
	}

	KRCBalance += Amount;
	OnKRCChanged.Broadcast(KRCBalance, Amount);

	UE_LOG(LogTemp, Log, TEXT("[Bankhaoos] +%d KRC (%s) → Saldo %d"), Amount, *Reason, KRCBalance);
}

bool UKhaaosBankhaoosComponent::DebitKRC(int32 Amount, const FString& Reason)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || Amount <= 0 || Amount > KRCBalance) return false;

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
