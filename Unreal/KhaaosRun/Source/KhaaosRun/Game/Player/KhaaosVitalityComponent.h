// Copyright Nexus-HUB57. All Rights Reserved.
// Sistema de Vitalidade real do Khaaos Run
// Integra GAS Health + Fome / Sede / Cansaço / Medo (lore oficial)

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayEffectTypes.h"
#include "KhaaosVitalityComponent.generated.h"

class UAbilitySystemComponent;
class UAttributeSet;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnVitalityChanged, float, CurrentPercent, float, MaxVitality);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnVitalityDepleted, AActor*, Owner);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnDebuffApplied, FGameplayTag, DebuffTag, float, Duration);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDebuffRemoved, FGameplayTag, DebuffTag);

/**
 * Componente de Vitalidade do jogador.
 *
 * - Usa o AttributeSet de Health do GAS como base (CurrentHealth / MaxHealth).
 * - Adiciona camadas de sobrevivência do lore: Fome, Sede, Cansaço, Medo.
 * - API de dano percentual usada pelos Zu 1–3 do CIGKV.
 * - Debuffs (Stun, VisionBlur) com timers e tags.
 *
 * Coloque este componente no Character / PlayerState do projeto.
 */
UCLASS(ClassGroup = (Khaaos), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosVitalityComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosVitalityComponent();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	// ============================================================
	// CONFIGURAÇÃO
	// ============================================================

	/** Vitalidade máxima (espelha MaxHealth do AttributeSet quando disponível) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Core")
	float MaxVitality = 100.0f;

	/** Vitalidade atual (0–MaxVitality) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Vitality|Core")
	float CurrentVitality = 100.0f;

	/** Fome (0 = cheio, 100 = faminto) – afeta regeneração */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Survival", meta = (ClampMin = "0", ClampMax = "100"))
	float Hunger = 0.0f;

	/** Sede (0 = hidratado, 100 = desidratado) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Survival", meta = (ClampMin = "0", ClampMax = "100"))
	float Thirst = 0.0f;

	/** Cansaço (0 = descansado, 100 = exausto) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Survival", meta = (ClampMin = "0", ClampMax = "100"))
	float Fatigue = 0.0f;

	/** Medo (0 = calmo, 100 = pânico) – aumenta perto de corpos / prédios instáveis */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Survival", meta = (ClampMin = "0", ClampMax = "100"))
	float Fear = 0.0f;

	/** Taxa de aumento natural de Fome por segundo */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Rates")
	float HungerRate = 0.15f;

	/** Taxa de aumento natural de Sede por segundo */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Rates")
	float ThirstRate = 0.25f;

	/** Taxa de aumento natural de Cansaço por segundo (em movimento) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Rates")
	float FatigueRate = 0.10f;

	/** Multiplicador de dano recebido quando Fome/Sede > 70 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vitality|Modifiers")
	float StarvationDamageMultiplier = 1.25f;

	// ============================================================
	// EVENTOS
	// ============================================================

	UPROPERTY(BlueprintAssignable, Category = "Vitality|Events")
	FOnVitalityChanged OnVitalityChanged;

	UPROPERTY(BlueprintAssignable, Category = "Vitality|Events")
	FOnVitalityDepleted OnVitalityDepleted;

	UPROPERTY(BlueprintAssignable, Category = "Vitality|Events")
	FOnDebuffApplied OnDebuffApplied;

	UPROPERTY(BlueprintAssignable, Category = "Vitality|Events")
	FOnDebuffRemoved OnDebuffRemoved;

	// ============================================================
	// API PÚBLICA (usada pelos Zu e pelo resto do jogo)
	// ============================================================

	/** Aplica dano percentual (0.0–1.0). Ex: 0.30 = −30 % da vitalidade máxima. */
	UFUNCTION(BlueprintCallable, Category = "Vitality")
	void ApplyPercentageDamage(float Percent, AActor* DamageCauser = nullptr);

	/** Aplica dano absoluto */
	UFUNCTION(BlueprintCallable, Category = "Vitality")
	void ApplyDamage(float Amount, AActor* DamageCauser = nullptr);

	/** Cura percentual */
	UFUNCTION(BlueprintCallable, Category = "Vitality")
	void ApplyPercentageHeal(float Percent);

	/** Cura absoluta */
	UFUNCTION(BlueprintCallable, Category = "Vitality")
	void ApplyHeal(float Amount);

	/** Retorna vitalidade atual em % (0–1) */
	UFUNCTION(BlueprintPure, Category = "Vitality")
	float GetVitalityPercent() const;

	/** Está vivo? */
	UFUNCTION(BlueprintPure, Category = "Vitality")
	bool IsAlive() const;

	/** Aplica debuff de Atordoamento (Stun) */
	UFUNCTION(BlueprintCallable, Category = "Vitality|Debuff")
	void ApplyStun(float Duration);

	/** Aplica debuff de Visão Embaçada */
	UFUNCTION(BlueprintCallable, Category = "Vitality|Debuff")
	void ApplyVisionBlur(float Duration);

	/** Remove um debuff específico por tag */
	UFUNCTION(BlueprintCallable, Category = "Vitality|Debuff")
	void RemoveDebuff(FGameplayTag DebuffTag);

	/** Verifica se o jogador está sob um debuff */
	UFUNCTION(BlueprintPure, Category = "Vitality|Debuff")
	bool HasDebuff(FGameplayTag DebuffTag) const;

	/** Inicializa a partir do AbilitySystemComponent (chamado no BeginPlay ou manualmente) */
	UFUNCTION(BlueprintCallable, Category = "Vitality")
	void InitializeFromASC(UAbilitySystemComponent* ASC);

protected:
	/** Tick de sobrevivência (fome/sede/cansaço) */
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	void ClampVitality();
	void SyncToGASHealth();
	void NotifyVitalityChanged();
	void HandleDeath();

	void ClearStun();
	void ClearVisionBlur();

	/** Referência ao ASC (GAS) */
	UPROPERTY()
	TWeakObjectPtr<UAbilitySystemComponent> AbilitySystemComp;

	/** Tags de debuff ativos */
	UPROPERTY()
	TSet<FGameplayTag> ActiveDebuffs;

	FTimerHandle StunTimerHandle;
	FTimerHandle BlurTimerHandle;

	/** Tags padrão (definidas no construtor) */
	FGameplayTag StunTag;
	FGameplayTag VisionBlurTag;
};
