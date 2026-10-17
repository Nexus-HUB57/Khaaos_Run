// Copyright Nexus-HUB57. All Rights Reserved.
// Sistema de Transferência Parcial CIGKV → W1/C1 (Barburhen)
// 20 % dos itens/KRC dos ZEX + Token de Veterano (top 50)

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosTransferSystem.generated.h"

class UKhaaosBankhaoosComponent;

USTRUCT(BlueprintType)
struct FTransferableItem
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FName ItemId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	int32 Quantity = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float Quality = 1.0f;
};

USTRUCT(BlueprintType)
struct FTransferPayload
{
	GENERATED_BODY()

	/** KRC que serão transferidos (20 % do coletado nos ZEX) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	int32 TransferredKRC = 0;

	/** Itens que serão transferidos (20 % do inventário ZEX) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	TArray<FTransferableItem> TransferredItems;

	/** Recebeu Token de Veterano? (top 50 do CIGKV) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	bool bHasVeteranToken = false;

	/** Pack UE5 (sombreador + animações) – top 50 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	bool bHasUE5Pack = false;

	/** Ranking final no CIGKV (1 = melhor) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	int32 CIGKVRank = 0;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnTransferCompleted, const FTransferPayload&, Payload);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnVeteranTokenGranted, int32, Rank);

/**
 * Sistema de transferência parcial CIGKV → Mundo Oficial W1/C1.
 *
 * Regras oficiais (README):
 * - 20 % dos itens/KRC coletados nos ZEX são salvos
 * - Top 50 do CIGKV recebem Token de Veterano + pack UE5
 * - Top 1000 recebem persistência parcial
 * - Transferência ocorre ao sair do ring / entrar em Barburhen
 */
UCLASS(ClassGroup = (Khaaos), meta = (BlueprintSpawnableComponent))
class KHAOSRUN_API UKhaaosTransferSystem : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosTransferSystem();

	// ============================================================
	// CONFIGURAÇÃO
	// ============================================================

	/** Percentual de KRC/itens transferidos (oficial = 0.20) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Transfer")
	float TransferPercent = 0.20f;

	/** Ranking máximo que recebe Token de Veterano (oficial = 50) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Transfer")
	int32 VeteranTokenRankLimit = 50;

	/** Ranking máximo que recebe persistência parcial (oficial = 1000) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Transfer")
	int32 PartialPersistRankLimit = 1000;

	// ============================================================
	// ESTADO (acumulado durante o CIGKV)
	// ============================================================

	/** KRC coletados nos ZEX (antes da transferência) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Transfer|ZEX")
	int32 ZEXCollectedKRC = 0;

	/** Itens coletados nos ZEX */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Transfer|ZEX")
	TArray<FTransferableItem> ZEXCollectedItems;

	/** Ranking atual do jogador no CIGKV (atualizado pelo ranking service) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Transfer")
	int32 CurrentCIGKVRank = 0;

	// ============================================================
	// EVENTOS
	// ============================================================

	UPROPERTY(BlueprintAssignable, Category = "Transfer|Events")
	FOnTransferCompleted OnTransferCompleted;

	UPROPERTY(BlueprintAssignable, Category = "Transfer|Events")
	FOnVeteranTokenGranted OnVeteranTokenGranted;

	// ============================================================
	// API
	// ============================================================

	/** Registra KRC coletado em um terminal ZEX */
	UFUNCTION(BlueprintCallable, Category = "Transfer|ZEX")
	void RegisterZEXKRC(int32 Amount);

	/** Registra item coletado em um terminal ZEX */
	UFUNCTION(BlueprintCallable, Category = "Transfer|ZEX")
	void RegisterZEXItem(FName ItemId, int32 Quantity = 1, float Quality = 1.0f);

	/**
	 * Executa a transferência parcial para W1/C1.
	 * Chamado ao sair do CIGKV / entrar em Barburhen.
	 */
	UFUNCTION(BlueprintCallable, Category = "Transfer")
	FTransferPayload ExecuteTransfer();

	/** Atualiza o ranking do jogador (vindo do RankingService) */
	UFUNCTION(BlueprintCallable, Category = "Transfer")
	void SetCIGKVRank(int32 NewRank);

protected:
	UKhaaosBankhaoosComponent* GetBankhaoos() const;
};
