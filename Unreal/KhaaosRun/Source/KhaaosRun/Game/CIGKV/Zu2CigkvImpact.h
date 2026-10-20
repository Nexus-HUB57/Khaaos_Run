// Copyright Nexus-HUB57. All Rights Reserved.
// Zu 2 CIGKV – Capotamento (Desmoronamento)
// Protocolo oficial: Capota com rocha → saltar

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "Blueprint/UserWidget.h"
#include "Zu2CigkvImpact.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZu2ChoiceMade, bool, bJumped);

/**
 * Actor da entrada cinematográfica Zu 2 do CIGKV.
 * - Capotamento / desmoronamento
 * - Pop-up: Saltar / Permanecer
 * - Saltar → imune
 * - Permanecer → −30 % Vitalidade + atordoamento 5 s
 * - Loot mais pesado (facas + munição + kits)
 */
UCLASS(Blueprintable, BlueprintType)
class KHAAOSRUN_API AZu2CigkvImpact : public AActor
{
	GENERATED_BODY()

public:
	AZu2CigkvImpact();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:
	// ============================================================
	// CONFIGURAÇÃO
	// ============================================================

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Crash")
	float ImpactForce = 18000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Crash")
	float CriticalDamageMultiplier = 1.5f;

	/** Duração do atordoamento (segundos) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Debuff")
	float StunDuration = 5.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Loot")
	float LootSpawnRadius = 280.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Timing")
	float PopUpDelay = 1.8f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Timing")
	float LootSpawnDelay = 3.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Loot", meta = (ClampMin = "1", ClampMax = "15"))
	int32 LootCrateCount = 8;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|UI")
	TSubclassOf<UUserWidget> ChoiceWidgetClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Loot")
	TSubclassOf<AActor> LootCrateClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|FX")
	UNiagaraSystem* CrashFX;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Audio")
	USoundCue* CrashSound;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Audio")
	USoundCue* MarechalVoiceCue;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu2|Audio")
	FText MarechalVoiceText = FText::FromString(TEXT("Saltou? Imune. Permanecer? Morte lenta!"));

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

	UPROPERTY(BlueprintAssignable, Category = "Zu2|Events")
	FOnZu2ChoiceMade OnChoiceMade;

	// ============================================================
	// FUNÇÕES
	// ============================================================

	UFUNCTION(BlueprintCallable, Category = "Zu2")
	void TriggerCrash();

	UFUNCTION(BlueprintCallable, Category = "Zu2")
	void OnPlayerChoice(bool bJumped);

protected:
	UFUNCTION()
	void OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	void ApplyImpactPhysics();
	void PlayCrashEffects();
	void ShowChoiceWidget();
	void SpawnLootCrates();
	void ApplyVitalityDamage(APawn* PlayerPawn, float DamagePercent);
	void ApplyStun(APawn* PlayerPawn);
	void ClearStun();
	void PlayMarechalVoice();

	FTimerHandle PopUpTimerHandle;
	FTimerHandle LootTimerHandle;
	FTimerHandle StunTimerHandle;

	bool bCrashTriggered = false;
	bool bChoiceMade = false;
	FVector ImpactPoint = FVector::ZeroVector;

	UPROPERTY()
	UUserWidget* ActiveChoiceWidget = nullptr;

	UPROPERTY()
	APawn* StunnedPawn = nullptr;
};
