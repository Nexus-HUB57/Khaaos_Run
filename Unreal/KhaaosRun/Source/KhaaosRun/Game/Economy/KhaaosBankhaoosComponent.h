// Copyright Nexus-HUB57. All Rights Reserved.
// Bankhaoos – Conta do jogador + KRC iniciais
// Criação automática no primeiro Zu do CIGKV

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosBankhaoosComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnBankhaoosCreated, const FString&, AccountId, int32, InitialKRC);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKRCChanged, int32, NewBalance, int32, Delta);

/**
 * Componente de conta Bankhaoos.
 * - Criação automática no primeiro ingresso (Zu 1)
 * - 1000 KRC iniciais (README oficial)
 * - Saldo local + bridge para a API de economia (Node.js)
 * - Endereço de depósito gerado
 */
UCLASS(ClassGroup = (Khaaos), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosBankhaoosComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosBankhaoosComponent();

	virtual void BeginPlay() override;

	// ============================================================
	// CONFIGURAÇÃO
	// ============================================================

	/** KRC creditados na criação da conta (padrão oficial = 1000) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bankhaoos")
	int32 InitialKRC = 1000;

	/** Já criou a conta nesta sessão / save? */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Bankhaoos")
	bool bAccountCreated = false;

	/** ID único da conta Bankhaoos */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Bankhaoos")
	FString AccountId;

	/** Endereço de depósito (simulado – em produção vem da API) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Bankhaoos")
	FString DepositAddress;

	/** Saldo atual de KRC */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Bankhaoos")
	int32 KRCBalance = 0;

	// ============================================================
	// EVENTOS
	// ============================================================

	UPROPERTY(BlueprintAssignable, Category = "Bankhaoos|Events")
	FOnBankhaoosCreated OnAccountCreated;

	UPROPERTY(BlueprintAssignable, Category = "Bankhaoos|Events")
	FOnKRCChanged OnKRCChanged;

	// ============================================================
	// API
	// ============================================================

	/** Cria a conta Bankhaoos (chamado automaticamente no Zu 1) */
	UFUNCTION(BlueprintCallable, Category = "Bankhaoos")
	bool CreateAccount();

	/** Credita KRC (loot, recompensas, ZEX) */
	UFUNCTION(BlueprintCallable, Category = "Bankhaoos")
	void CreditKRC(int32 Amount, const FString& Reason = TEXT(""));

	/** Debita KRC (Forja do Armeiro, upgrades) */
	UFUNCTION(BlueprintCallable, Category = "Bankhaoos")
	bool DebitKRC(int32 Amount, const FString& Reason = TEXT(""));

	/** Saldo atual */
	UFUNCTION(BlueprintPure, Category = "Bankhaoos")
	int32 GetBalance() const { return KRCBalance; }

	/** Conta já existe? */
	UFUNCTION(BlueprintPure, Category = "Bankhaoos")
	bool HasAccount() const { return bAccountCreated; }

protected:
	FString GenerateAccountId() const;
	FString GenerateDepositAddress() const;
};
