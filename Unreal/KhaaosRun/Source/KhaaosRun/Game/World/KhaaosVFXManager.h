// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosVFXManager
// PROPÓSITO: Orquestração e Disparo Sequencial de Ativos Niagara para Validação
//            Visual de 48 Habilidades (GAS) e 27 VFX em Máquinas com GPU.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "NiagaraSystem.h"
#include "KhaaosVFXManager.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosVFXValidationEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Validation")
    FGameplayTag AbilityTag;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Validation")
    TSoftObjectPtr<UNiagaraSystem> NiagaraSystemAsset;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Validation")
    float TestDuration = 2.0f;
};

DECLARE_LOG_CATEGORY_EXTERN(LogKhaaosVFXValidator, Log, All);

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosVFXManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosVFXManager();

    // Inicialização do ciclo de vida do subsistema
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Dispara a sequência automatizada de testes visuais em lote */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Validation")
    void StartSequentialVFXTest(AActor* TestAnchorActor);

    /** Interrompe a validação de forma segura */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Validation")
    void StopValidationTest();

    /** Retorna verdadeiro se o teste sequencial está em execução */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Validation")
    bool IsTesting() const { return CurrentTestIndex != INDEX_NONE; }

    /** Retorna o índice atual do teste */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Validation")
    int32 GetCurrentTestIndex() const { return CurrentTestIndex; }

    /** Retorna o total de entradas na fila de validação */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Validation")
    int32 GetTotalTestCount() const { return ValidationRegistry.Num(); }

protected:
    void ProcessNextValidationEntry();
    
    UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Validation")
    TArray<FKhaaosVFXValidationEntry> ValidationRegistry;

private:
    int32 CurrentTestIndex;
    
    UPROPERTY()
    TObjectPtr<AActor> CachedAnchorActor;

    UPROPERTY()
    TObjectPtr<class UNiagaraComponent> ActiveVFXComponent;

    FTimerHandle SequentialTestTimerHandle;

    /** Contadores de resultado para reporte final */
    int32 PassedCount;
    int32 FailedCount;
};
