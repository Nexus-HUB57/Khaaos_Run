// Copyright Nexus-HUB57. All Rights Reserved.
// Anel de Conflito "Água da Morte" – fecha em 10 min no Parque

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "NiagaraSystem.h"
#include "BarburhenRingController.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRingPhaseChanged, int32, PhaseIndex);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRingRadiusChanged, float, CurrentRadius, float, NormalizedClose);

/**
 * Controla o anel de fechamento de Barburhen.
 * Dinâmica oficial: "Água da Morte" – anel fecha em 10 min em direção ao Parque.
 * Quem fica fora sofre chuva ácida intensificada / eliminação.
 */
UCLASS(Blueprintable, BlueprintType)
class KHAAOSRUN_API ABarburhenRingController : public AActor
{
	GENERATED_BODY()

public:
	ABarburhenRingController();

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

public:
	/** Centro final do anel (Parque Abandonado) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring")
	FVector RingCenter = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring")
	float StartRadius = 25000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring")
	float EndRadius = 4000.0f;

	/** Duração total até fechar (oficial = 600 s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring")
	float CloseDuration = 600.0f;

	/** Delay antes de começar a fechar (segundos após início da partida) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring")
	float StartDelay = 60.0f;

	/** Dano extra por segundo fora do anel (% vitalidade) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring")
	float OutsideDamagePerSecond = 0.05f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ring|FX")
	UNiagaraSystem* RingEdgeFX;

	UPROPERTY(BlueprintAssignable, Category = "Ring|Events")
	FOnRingPhaseChanged OnPhaseChanged;

	UPROPERTY(BlueprintAssignable, Category = "Ring|Events")
	FOnRingRadiusChanged OnRadiusChanged;

	UFUNCTION(BlueprintCallable, Category = "Ring")
	void StartRing();

	UFUNCTION(BlueprintCallable, Category = "Ring")
	void StopRing();

	UFUNCTION(BlueprintPure, Category = "Ring")
	float GetCurrentRadius() const { return CurrentRadius; }

	UFUNCTION(BlueprintPure, Category = "Ring")
	bool IsLocationSafe(FVector WorldLocation) const;

protected:
	void ApplyOutsideDamage(float DeltaTime);

	float CurrentRadius = 25000.0f;
	float Elapsed = 0.0f;
	bool bRingActive = false;
	bool bClosing = false;

	FTimerHandle StartDelayHandle;
};
