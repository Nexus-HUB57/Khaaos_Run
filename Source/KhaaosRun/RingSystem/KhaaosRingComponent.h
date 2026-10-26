// Copyright Khaaos Run. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosRingComponent.generated.h"

// Enums from KhaaosRingManager.h
enum class ERingZoneType : uint8;

/**
 * UKhaaosRingComponent - Componente attachado ao PlayerState
 * para rastrear posicao relativa ao ring e calcular/apply dano.
 *
 * Responsabilidades:
 * - Verificar se player esta em safe zone, danger zone, ou water zone
 * - Aplicar dano do ring por tick
 * - Notificar UI sobre status de zona
 * - Modificar dano para Huran operatives em water zones
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosRingComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosRingComponent();

    /** Atualiza o status de zona baseado na posicao atual do owner */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring")
    void UpdateZoneStatus();

    /** Retorna o tipo de zona atual do player */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    ERingZoneType GetCurrentZoneType() const;

    /** Retorna o dano atual por tick que o player recebe */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    float GetCurrentDamage() const;

    /** Retorna se o player esta em uma water zone */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    bool IsInWaterZone() const;

    /** Retorna o modificador de dano para Huran em water zone */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring|Huran")
    float GetHuranDamageModifier() const;

    /** Forca a aplicacao de dano do ring (chamado pelo RingManager) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring")
    void ApplyRingDamage();

    // --- Delegates ---

    /** Disparado quando o status de zona muda */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ring")
    FOnZoneStatusChanged OnZoneStatusChanged;

    // --- Properties ---

    /** Este operative e da especie Huran? (afeta dano em water zones) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Huran")
    bool bIsHuranSpecies = false;

    /** Zona atual do player */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    ERingZoneType CurrentZoneType;

    /** Dano atual por tick */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    float CurrentDamagePerTick = 0.f;

    /** Ultima posicao verificada */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    FVector LastCheckedPosition = FVector::ZeroVector;

protected:
    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
                              FActorComponentTickFunction* ThisTickFunction) override;

private:
    /** Timer para aplicar dano periodicamente */
    FTimerHandle DamageApplicationTimer;

    /** Verificacao de posicao a cada N frames */
    int32 FrameCounter = 0;
    int32 UpdateEveryNFrames = 3;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnZoneStatusChanged, ERingZoneType, NewZoneType, float, DamagePerTick);
