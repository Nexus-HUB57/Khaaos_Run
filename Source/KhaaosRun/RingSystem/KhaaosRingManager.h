// Copyright Khaaos Run. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KhaaosRingManager.generated.h"

// Forward declarations
class UKhaaosRingComponent;
class UKhaaosRingVisualComponent;

/** Fase individual do ring (carregada de ring_config.json) */
USTRUCT(BlueprintType)
struct FRingPhase
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    int32 PhaseIndex = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float RadiusStart = 800.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float RadiusEnd = 600.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float DurationSeconds = 180.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float DamagePerTick = 1.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float ShrinkSpeed = 1.f;
};

/** Zona de agua dentro do ring (Huran passive) */
USTRUCT(BlueprintType)
struct FWaterZone
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FString Type;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FVector Center = FVector::ZeroVector;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float Radius = 100.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float Depth = 3.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float DamageModifier = 0.5f;
};

/** Configuracao de ring por mundo */
USTRUCT(BlueprintType)
struct FRingWorldConfig
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    int32 WorldId = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FString WorldName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    int32 Capacity = 100;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    int32 RingPhases = 6;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TArray<FRingPhase> Phases;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TArray<FWaterZone> WaterZones;
};

/** Tipo de zona do ring */
UENUM(BlueprintType)
enum class ERingZoneType : uint8
{
    SAFE      UMETA(DisplayName = "Safe Zone"),
    SHRINKING UMETA(DisplayName = "Shrinking Ring"),
    DANGER    UMETA(DisplayName = "Danger Zone"),
    DEADLY    UMETA(DisplayName = "Deadly Zone"),
    WATER     UMETA(DisplayName = "Water Zone"),
    VOID      UMETA(DisplayName = "Void / World Closed"),
};

/** Tipo de evento do ring */
UENUM(BlueprintType)
enum class ERingEventType : uint8
{
    RingStart         UMETA(DisplayName = "Ring Start"),
    RingShrinking     UMETA(DisplayName = "Ring Shrinking"),
    RingClosed        UMETA(DisplayName = "Ring Closed"),
    WorldTransition   UMETA(DisplayName = "World Transition"),
    FinalRing         UMETA(DisplayName = "Final Ring"),
};

/**
 * AKhaaosRingManager - Actor principal que gerencia o ring system.
 * Spawnado pelo KhaaosGameMode no inicio de cada mundo.
 * Carrega configuracao de ring_config.json via UKhaaosRingSubsystem.
 *
 * Fluxo: InitializeRingForWorld -> StartNextPhase -> TickRingShrink -> OnRingPhaseComplete
 * Quando todas as fases completam: OnWorldRingClosed -> TriggerWorldTransition
 */
UCLASS()
class KHAAOSRUN_API AKhaaosRingManager : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosRingManager();

    /** Inicializa o ring para um mundo especifico */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring")
    void InitializeRingForWorld(int32 WorldId);

    /** Inicia a proxima fase do ring */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring")
    void StartNextPhase();

    /** Verifica se uma posicao esta na zona segura */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    bool IsPositionInSafeZone(const FVector& Position) const;

    /** Calcula o dano para uma posicao (considerando zona, agua, especie) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    float CalculateDamageForPosition(const FVector& Position, bool bIsHuranSpecies = false) const;

    /** Retorna o tipo de zona para uma posicao */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    ERingZoneType GetZoneTypeForPosition(const FVector& Position) const;

    /** Retorna se a posicao esta em uma water zone */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    bool IsPositionInWaterZone(const FVector& Position) const;

    // --- Delegates ---

    /** Disparado quando uma nova fase do ring comeca */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ring")
    FOnRingPhaseStarted OnRingPhaseStarted;

    /** Disparado quando o ring fecha completamente */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ring")
    FOnRingClosed OnRingClosed;

    /** Disparado quando e hora de transitar para o proximo mundo */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ring")
    FOnWorldTransition OnWorldTransition;

    // --- Properties ---

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    int32 CurrentPhase = 0;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    float CurrentRadius = 800.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    float TargetRadius = 600.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    float CurrentShrinkSpeed = 1.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    float CurrentDamagePerTick = 1.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    FVector RingCenter = FVector::ZeroVector;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    TArray<FRingPhase> RingPhases;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    TArray<FWaterZone> WaterZones;

    /** Tempo de aviso antes do ring comecar a encolher (segundos) */
    UPROPERTY(EditDefaultsOnly, Category = "Khaaos|Ring")
    float RingWarningSeconds = 30.f;

    /** Modificador de dano do ring em agua (para nao-Huran) */
    UPROPERTY(EditDefaultsOnly, Category = "Khaaos|Ring")
    float WaterDamageModifier = 0.5f;

    /** Modificador de dano do ring em agua para Huran operatives */
    UPROPERTY(EditDefaultsOnly, Category = "Khaaos|Ring|Huran")
    float HuranWaterDamageModifier = 0.f;

protected:
    virtual void Tick(float DeltaSeconds) override;

private:
    /** Timer handle para o tick de dano */
    FTimerHandle DamageTickTimer;

    /** Timer handle para o aviso de ring */
    FTimerHandle RingWarningTimer;

    /** Fase atual esta encolhendo? */
    bool bIsShrinking = false;

    /** Todas as fases completaram? */
    bool bAllPhasesComplete = false;

    /** Tick interno: aplica dano a todos os players fora da safe zone */
    void ApplyRingDamageTick();

    /** Chamado quando uma fase do ring completa */
    void OnRingPhaseComplete();

    /** Chamado quando o ring fecha completamente */
    void OnWorldRingClosed();

    /** Dispara a transicao para o proximo mundo no pipeline */
    void TriggerWorldTransition();

    /** Emite o evento de ring (audio/vfx/ui) */
    void EmitRingEvent(ERingEventType EventType);
};

// Delegate declarations
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRingPhaseStarted, int32, PhaseIndex, float, NewRadius);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnRingClosed);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnWorldTransition);
