// Copyright Nexus-HUB57. All Rights Reserved.
// Volume de Chuva Ácida – Plus − de Barburhen

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/BoxComponent.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "BarburhenAcidRainVolume.generated.h"

class UKhaaosVitalityComponent;

/**
 * Volume que aplica dano de chuva ácida periodicamente.
 * Corpos sob a chuva sofrem −1 % Vitalidade a cada AcidRainTickInterval
 * se não estiverem com colete/máscara adequada.
 */
UCLASS(Blueprintable, BlueprintType)
class KHAOSRUN_API ABarburhenAcidRainVolume : public AActor
{
	GENERATED_BODY()

public:
	ABarburhenAcidRainVolume();

protected:
	virtual void BeginPlay() override;

public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
	float DamagePercentPerTick = 0.01f; // 1 %

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
	float TickInterval = 10.0f;

	/** Se true, só aplica dano a players sem tag de proteção (colete/máscara) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
	bool bRequireNoProtection = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain|FX")
	UNiagaraSystem* RainFX;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain|Audio")
	USoundCue* RainAmbientLoop;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UBoxComponent* RainVolume;

	UFUNCTION(BlueprintCallable, Category = "AcidRain")
	void SetRainActive(bool bActive);

protected:
	void ApplyRainTick();

	FTimerHandle RainTimerHandle;
	bool bRainActive = true;

	UPROPERTY()
	UAudioComponent* AmbientAudio = nullptr;
};
