// Copyright Nexus-HUB57. All Rights Reserved.
// Zu 1 CIGKV – Caminhão Atropelando Bois
// Protocolo de Ingresso oficial (README: Caminhão atropela bois → apertar cinto)

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "Blueprint/UserWidget.h"
#include "Zu1CigkvImpact.generated.h"

class UZu1ChoiceWidget;
class UPlayerVitalityComponent; // Assumindo componente de Vitalidade existente no projeto

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZu1ChoiceMade, bool, bSeatbeltFastened);

/**
 * Actor responsável pela entrada cinematográfica Zu 1 do CIGKV.
 * - Física de impacto realista
 * - Pop-up interativo (Cinto / Sem Cinto)
 * - Dano de Vitalidade (−30 % se sem cinto)
 * - Spawn de caixotes de loot após delay
 * - Niagara + Som 3D
 */
UCLASS(Blueprintable, BlueprintType)
class KHAAOSRUN_API AZu1CigkvImpact : public AActor
{
	GENERATED_BODY()

public:
	AZu1CigkvImpact();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:
	// ============================================================
	// CONFIGURAÇÃO (Details Panel)
	// ============================================================

	/** Força do impulso no impacto (padrão README: forte o suficiente para sensação de atropelamento) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Crash")
	float ImpactForce = 12000.0f;

	/** Multiplicador de dano crítico */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Crash")
	float CriticalDamageMultiplier = 1.5f;

	/** Raio de spawn dos caixotes de loot */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Loot")
	float LootSpawnRadius = 250.0f;

	/** Delay em segundos antes de mostrar o pop-up (após impacto) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Timing")
	float PopUpDelay = 1.5f;

	/** Delay em segundos para spawn dos caixotes após a escolha */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Timing")
	float LootSpawnDelay = 3.0f;

	/** Quantidade de caixotes a spawnar (3–8 recomendado) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Loot", meta = (ClampMin = "1", ClampMax = "12"))
	int32 LootCrateCount = 5;

	/** Classe do Widget de escolha (Cinto / Sem Cinto) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|UI")
	TSubclassOf<UUserWidget> ChoiceWidgetClass;

	/** Classe do Actor de caixote de loot */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Loot")
	TSubclassOf<AActor> LootCrateClass;

	/** Sistema Niagara de impacto (fumaça + destroços + poeira) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|FX")
	UNiagaraSystem* CrashFX;

	/** Sound Cue 3D do impacto (metal rangendo) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Audio")
	USoundCue* CrashSound;

	/** Voz distorcida do Marechal (opcional) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Audio")
	USoundCue* MarechalVoiceCue;

	/** Texto da voz: "Atenção, Zheers… o Khaaos não perdoa covardes." */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Zu1|Audio")
	FText MarechalVoiceText = FText::FromString(TEXT("Atenção, Zheers… o Khaaos não perdoa covardes."));

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

	/** Disparado quando o jogador faz a escolha no pop-up */
	UPROPERTY(BlueprintAssignable, Category = "Zu1|Events")
	FOnZu1ChoiceMade OnChoiceMade;

	// ============================================================
	// FUNÇÕES PÚBLICAS
	// ============================================================

	/** Inicia a sequência de impacto (chamado pelo overlap ou por timeline externa) */
	UFUNCTION(BlueprintCallable, Category = "Zu1")
	void TriggerCrash();

	/** Chamado pelo Widget quando o jogador escolhe */
	UFUNCTION(BlueprintCallable, Category = "Zu1")
	void OnPlayerChoice(bool bSeatbeltFastened);

protected:
	// ============================================================
	// FUNÇÕES INTERNAS
	// ============================================================

	UFUNCTION()
	void OnTriggerBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	void ApplyImpactPhysics();
	void PlayCrashEffects();
	void ShowChoiceWidget();
	void SpawnLootCrates();
	void ApplyVitalityDamage(APawn* PlayerPawn, float DamagePercent);
	void PlayMarechalVoice();

	/** Timer handles */
	FTimerHandle PopUpTimerHandle;
	FTimerHandle LootTimerHandle;

	/** Estado interno */
	bool bCrashTriggered = false;
	bool bChoiceMade = false;
	FVector ImpactPoint = FVector::ZeroVector;

	/** Referência ao Widget ativo */
	UPROPERTY()
	UUserWidget* ActiveChoiceWidget = nullptr;
};
