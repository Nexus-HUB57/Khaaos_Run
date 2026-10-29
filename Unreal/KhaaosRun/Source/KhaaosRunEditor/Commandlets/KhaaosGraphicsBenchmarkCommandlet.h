// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// COMMANDLET: UKhaaosGraphicsBenchmarkCommandlet
// PROPÓSITO: Benchmark headless de qualidade gráfica e performance para CI/CD.
//            Executa sem RHI (-NullRHI) e valida:
//            - 5 presets de qualidade (Low→PhD) inicializam sem erro
//            - Species LOD configs válidas para todas as 6 espécies
//            - Post-process profiles têm GPU time estimado < budget
//            - Material optimizer budget compila sem crash
//            - Dynamic resolution config é válida
//            - Cosmetic validator rejeita loadouts inválidos
//            Uso: KhaaosRunEditor -run=KhaaosGraphicsBenchmark -NullRHI -Unattended
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "KhaaosGraphicsBenchmarkCommandlet.generated.h"

UCLASS()
class UKhaaosGraphicsBenchmarkCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    virtual int32 Main(const FString& Params) override;

private:
    /** Benchmark Graphics Preset Subsystem */
    bool BenchmarkGraphicsPresets();

    /** Benchmark Species LOD Manager */
    bool BenchmarkSpeciesLOD();

    /** Benchmark Post Process Manager */
    bool BenchmarkPostProcess();

    /** Benchmark Material Optimizer */
    bool BenchmarkMaterialOptimizer();

    /** Benchmark Dynamic Resolution */
    bool BenchmarkDynamicResolution();

    /** Benchmark Cosmetic Validator */
    bool BenchmarkCosmeticValidator();

    /** Benchmark Character Customizer */
    bool BenchmarkCharacterCustomizer();

    /** Benchmark Animation Blend Manager configs */
    bool BenchmarkAnimationBlend();

    /** Gera relatório final */
    void GenerateReport(const TMap<FString, bool>& Results);

    /** Contagem de PASS/FAIL */
    int32 PassCount = 0;
    int32 FailCount = 0;
};
