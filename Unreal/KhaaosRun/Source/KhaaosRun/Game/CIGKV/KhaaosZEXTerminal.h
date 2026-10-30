// Copyright Nexus-HUB57. All Rights Reserved.
// Terminal ZEX – Zona de Extração de XP
// 15 terminais no CIGKV | Luz azul | 20 % persistidos via TransferSystem

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "KhaaosZEXTerminal.generated.h"

class UKhaaosTransferSystem;
class UKhaaosBankhaoosComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnZEXExtracted, APawn*, Player, int32, KRCExtracted, int32, ItemsExtracted);

/**
 * Terminal de Zona de Extração de XP (ZEX).
 *
 * - Interação por overlap ou tecla (Interact)
 * - Luz azul que intensifica conforme o volume extraído
 * - Registra KRC e itens no UKhaaosTransferSystem (20 % serão salvos)
 * - Feedback visual/sonoro imediato
 * - 15 instâncias no perímetro do CIGKV (README)
 */
UCLASS(Blueprintable, BlueprintType)
class KHAAOSRUN_API AKhaaosZEXTerminal : public AActor
{
	GENERATED_BODY()

public:
	AKhaaosZEXTerminal();

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

public:
	// ============================================================
	// CONFIGURAÇÃO
	// ============================================================

	/** KRC base extraído por interação (pode ser sobrescrito por loot do player) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX")
	int32 BaseKRCReward = 25;

	/** Multiplicador de recompensa por “carga” do terminal (1.0–3.0) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX", meta = (ClampMin = "0.5", ClampMax = "5.0"))
	float RewardMultiplier = 1.0f;

	/** Cooldown entre extrações do mesmo jogador (segundos) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX")
	float ExtractCooldown = 8.0f;

	/** Intensidade máxima da luz azul */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|Light")
	float MaxLightIntensity = 5000.0f;

	/** Intensidade mínima (idle) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|Light")
	float MinLightIntensity = 800.0f;

	/** Cor da luz (azul oficial) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|Light")
	FLinearColor LightColor = FLinearColor(0.1f, 0.4f, 1.0f);

	/** Niagara de idle (brilho azul constante) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|FX")
	UNiagaraSystem* IdleFX;

	/** Niagara de extração (pulso forte) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|FX")
	UNiagaraSystem* ExtractFX;

	/** Som de ativação / extração */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|Audio")
	USoundCue* ExtractSound;

	/** Itens que este terminal pode “validar” para transferência (opcional) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ZEX|Loot")
	TArray<FName> AcceptedItemIds;

	// ============================================================
	// COMPONENTES
	// ============================================================

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UStaticMeshComponent* TerminalMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UBoxComponent* InteractionVolume;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UPointLightComponent* BlueLight;

	// ============================================================
	// EVENTOS
	// ============================================================

	UPROPERTY(BlueprintAssignable, Category = "ZEX|Events")
	FOnZEXExtracted OnExtracted;

	// ============================================================
	// API
	// ============================================================

	/** Executa a extração (chamado por overlap ou input) */
	UFUNCTION(BlueprintCallable, Category = "ZEX")
	bool TryExtract(APawn* Player);

	/** Quantidade total de KRC já extraídos neste terminal (sessão) */
	UFUNCTION(BlueprintPure, Category = "ZEX")
	int32 GetTotalExtractedKRC() const { return TotalExtractedKRC; }

protected:
	UFUNCTION()
	void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	void UpdateLightIntensity(float DeltaTime);
	void PlayExtractFeedback();
	int32 CalculateKRCReward(APawn* Player) const;
	void RegisterWithTransferSystem(APawn* Player, int32 KRCAmount, const TArray<FName>& ItemIds);

	/** KRC acumulados neste terminal na sessão */
	int32 TotalExtractedKRC = 0;

	/** Número de extrações (para escalar a luz) */
	int32 ExtractCount = 0;

	/** Cooldown por jogador (Player → tempo restante) */
	TMap<TWeakObjectPtr<APawn>, float> PlayerCooldowns;

	/** Intensidade atual da luz (interpolada) */
	float CurrentLightIntensity = 800.0f;

	/** Alvo de intensidade */
	float TargetLightIntensity = 800.0f;
};
