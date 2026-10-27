// Copyright Nexus-HUB57. All Rights Reserved.
// Volume de Chuva Ácida – Plus − de Barburhen (W1/C1)
// Lore: −1 % Vitalidade a cada 10 s sem colete/máscara

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/BoxComponent.h"
#include "GameplayTagContainer.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "BarburhenAcidRainVolume.generated.h"

class UKhaaosVitalityComponent;
class UAudioComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAcidRainTick, APawn*, Player, float, DamagePercentApplied);

/**
 * Chuva ácida de Barburhen.
 *
 * Fórmula oficial (sincronizada com DT_Barburhen_WorldConfig):
 *   DamagePercentPerTick = AcidRainDamagePerSecond * AcidRainTickInterval
 *   Padrão: 0.001/s * 10 s = 0.01 → −1 % MaxVitality por tick
 *
 * Aplicação:
 *   1. Timer a cada TickInterval
 *   2. Lista Characters player-controlled dentro do RainVolume
 *   3. Se bRequireNoProtection e Actor tem tag "HasAcidProtection" → ignora
 *   4. Vitality->ApplyPercentageDamage(DamagePercentPerTick) + Fear ↑
 *   5. Sync GAS Health via Vitality component
 *
 * Diferente do Ring (dano contínuo ~5 %/s fora do anel):
 *   Chuva = tick lento em área; Ring = fora do raio, todo frame.
 *   Podem acumular.
 */
UCLASS(Blueprintable, BlueprintType)
class KHAOSRUN_API ABarburhenAcidRainVolume : public AActor
{
        GENERATED_BODY()

public:
        ABarburhenAcidRainVolume();

protected:
        virtual void BeginPlay() override;
        virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:
        /** % da vitalidade máxima por tick (0.01 = 1 %). Sincronizado pelo MapBuilder. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain", meta = (ClampMin = "0.0", ClampMax = "1.0"))
        float DamagePercentPerTick = 0.01f;

        /** Intervalo entre ticks (segundos). Oficial = 10. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain", meta = (ClampMin = "0.5"))
        float TickInterval = 10.0f;

        /** Medo adicional por tick (0–100 scale). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
        float FearPerTick = 2.0f;

        /** Se true, ignora quem tem tag HasAcidProtection (colete/máscara). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
        bool bRequireNoProtection = true;

        /** Tag de proteção (Forja: colete / máscara) — caminho legado por actor tag. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
        FName ProtectionTag = FName(TEXT("HasAcidProtection"));

        /** Tag GAS de proteção (canônica): concedida por GameplayEffect
         *  (UKhaaosGameplayEffects::CreateTagGrantEffect) quando o colete/máscara
         *  anti-ácido está equipado. O volume consulta a AbilitySystemComponent
         *  do personagem além do actor tag legado. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain")
        FGameplayTag ProtectionGameplayTag = FGameplayTag::RequestGameplayTag(FName("World.Barburhen.AcidProtection"));

        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain|FX")
        UNiagaraSystem* RainFX;

        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AcidRain|Audio")
        USoundCue* RainAmbientLoop;

        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
        UBoxComponent* RainVolume;

        UPROPERTY(BlueprintAssignable, Category = "AcidRain|Events")
        FOnAcidRainTick OnAcidRainTick;

        UFUNCTION(BlueprintCallable, Category = "AcidRain")
        void SetRainActive(bool bActive);

        UFUNCTION(BlueprintPure, Category = "AcidRain")
        bool IsRainActive() const { return bRainActive; }

        /** DPS equivalente (para UI/debug): DamagePercentPerTick / TickInterval */
        UFUNCTION(BlueprintPure, Category = "AcidRain")
        float GetEquivalentDamagePerSecond() const
        {
                return TickInterval > 0.f ? DamagePercentPerTick / TickInterval : 0.f;
        }

protected:
        void ApplyRainTick();
        /** Proteção = actor tag legado OR tag GAS ativa na ASC (GE do equipamento). */
        bool HasAcidProtection(AActor* Actor) const;

        FTimerHandle RainTimerHandle;
        bool bRainActive = true;

        UPROPERTY()
        UAudioComponent* AmbientAudio = nullptr;
};
