// Copyright Nexus-HUB57. All Rights Reserved.
// Zu 3 CIGKV – Queda na Ponte / Submersão
// Protocolo oficial: Cai da ponte → máscara O₂

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "Blueprint/UserWidget.h"
#include "Zu3CigkvImpact.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZu3ChoiceMade, bool, bUsedMask);

/**
 * Actor da entrada cinematográfica Zu 3 do CIGKV.
 * - Queda da ponte / submersão
 * - Pop-up: Usar Máscara de Oxigênio / Não usar
 * - Máscara → imune
 * - Sem máscara → −30 % Vitalidade + visão embaçada 5 s
 * - Loot: armadilhas de caça + munição
 */
UCLASS(Blueprintable, BlueprintType)
class KHAOSRUN_API AZu3CigkvImpact : public AActor
{
	GENERATED_BODY()

public:
	AZu3CigkvImpact();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:
	// ============================================================
	// CONFIGURAÇÃO
	// ============================================================

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Crash")
	float ImpactForce = 25000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Crash")
	float CriticalDamageMultiplier = 1.8f;

	/** Duração da visão embaçada (segundos) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Debuff")
	float BlurDuration = 5.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Loot")
	float LootSpawnRadius = 220.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Timing")
	float PopUpDelay = 2.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Timing")
	float LootSpawnDelay = 3.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Loot", meta = (ClampMin = "1", ClampMax = "15"))
	int32 LootCrateCount = 6;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|UI")
	TSubclassOf<UUserWidget> ChoiceWidgetClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Loot")
	TSubclassOf<AActor> LootCrateClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|FX")
	UNiagaraSystem* CrashFX;

	/** Niagara extra de splash de água (opcional) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|FX")
	UNiagaraSystem* WaterSplashFX;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Audio")
	USoundCue* CrashSound;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Audio")
	USoundCue* WaterSplashSound;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Audio")
	USoundCue* MarechalVoiceCue;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu3|Audio")
	FText MarechalVoiceText = FText::FromString(TEXT("Atenção, Zheers… a ponte acabou. O Khaaos não perdoa quem hesita!"));

	// ============================================================
	// COMPONENTES
	// ============================================================

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UStaticMeshComponent* VehicleMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	UBoxComponent* TriggerVolume;

	// ============================================================
	// EVENTOS
	// ============================================================

	UPROPERTY(BlueprintAssignable, Category = "Zu3|Events")
	FOnZu3ChoiceMade OnChoiceMade;

	// ============================================================
	// FUNÇÕES
	// ============================================================

	UFUNCTION(BlueprintCallable, Category = "Zu3")
	void TriggerCrash();

	UFUNCTION(BlueprintCallable, Category = "Zu3")
	void OnPlayerChoice(bool bUsedMask);

protected:
	UFUNCTION()
	void OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	void ApplyImpactPhysics();
	void PlayCrashEffects();
	void ShowChoiceWidget();
	void SpawnLootCrates();
	void ApplyVitalityDamage(APawn* PlayerPawn, float DamagePercent);
	void ApplyVisionBlur(APawn* PlayerPawn);
	void ClearVisionBlur();
	void PlayMarechalVoice();

	FTimerHandle PopUpTimerHandle;
	FTimerHandle LootTimerHandle;
	FTimerHandle BlurTimerHandle;

	bool bCrashTriggered = false;
	bool bChoiceMade = false;
	FVector ImpactPoint = FVector::ZeroVector;

	UPROPERTY()
	UUserWidget* ActiveChoiceWidget = nullptr;

	UPROPERTY()
	APlayerController* BlurredController = nullptr;
};
