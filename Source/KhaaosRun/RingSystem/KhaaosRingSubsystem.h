// Copyright Khaaos Run. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosRingSubsystem.generated.h"

// Forward declarations
struct FRingWorldConfig;
struct FRingPhase;

/**
 * UKhaaosRingSubsystem - Subsystem global que carrega ring_config.json
 * e prov dados de configuracao para todos os AKhaaosRingManager.
 *
 * Responsabilidades:
 * - Carregar ring_config.json no startup
 * - Prover dados de configuracao por mundo
 * - Rastrear estado global do pipeline multi-world
 * - Coordinar transicoes entre mundos
 */
UCLASS()
class KHAAOSRUN_API UKhaaosRingSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Retorna a configuracao de ring para um mundo */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    FRingWorldConfig GetRingConfig(int32 WorldId) const;

    /** Retorna as fases de ring para um mundo */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    TArray<FRingPhase> GetPhasesForWorld(int32 WorldId) const;

    /** Retorna o proximo mundo no pipeline CIGKV->W1->W2->W3->W4 */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    int32 GetNextWorldInPipeline(int32 CurrentWorld) const;

    /** Marca transicao de mundo como completa */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring")
    void OnWorldTransitionComplete(int32 FromWorld, int32 ToWorld);

    /** Retorna o mundo atual no pipeline */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ring")
    int32 GetCurrentPipelineWorld() const;

    /** Carrega configuracao de ring do JSON (chamado em Initialize) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring")
    bool LoadRingConfigFromJSON(const FString& ConfigPath);

    // --- Properties ---

    /** Path do arquivo de configuracao */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring")
    FString RingConfigPath = TEXT("components_dev/rings/ring_config.json");

    /** Pipeline de mundos (ordem) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    TArray<int32> WorldPipelineOrder;

    /** Mundo atual no pipeline */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    int32 CurrentPipelineWorldId = 0;

    /** Configuracoes carregadas por mundo */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    TArray<FRingWorldConfig> WorldConfigs;

    /** Config carregado com sucesso? */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring")
    bool bConfigLoaded = false;

private:
    /** Cache de fases por mundo (WorldId -> Phases) */
    TMap<int32, TArray<FRingPhase>> CachedPhases;

    /** Parseia o JSON e popula WorldConfigs */
    bool ParseRingConfigJSON(const FString& JsonString);
};
