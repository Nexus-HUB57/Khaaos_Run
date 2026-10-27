// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosSpeciesLODManager
// PROPÓSITO: Gerenciamento de LOD por espécie com distância adaptativa.
//            Cada espécie alienígena tem requisitos de LOD diferentes:
//            - Skeetw: plumas/penas requerem bone count alto; LOD reduz feathers
//            - Onith: cauda e carapaça requerem mesh complexity; LOD simplifica chitin
//            - Khael: cristais e runas glow; LOD desativa glow distante
//            - Venex: implantes cyber; LOD desativa emissive longe
//            - Huran: brânquias e membranas; LOD simplifica gills
//            - Zheers: tatuagens e orelhas; LOD mais simples
//            Integrado com KhaaosPerformanceBudget para frame budget compliance.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosSpeciesLODManager.generated.h"

UENUM(BlueprintType)
enum class EKhaaosLODLevel : uint8
{
    LOD0,   // Full detail — < 10m (close combat range)
    LOD1,   // High detail — 10-25m (nearby visibility)
    LOD2,   // Medium detail — 25-50m (mid-range)
    LOD3,   // Low detail — 50-100m (distant)
    LOD4    // Minimal — > 100m (ultra-distant / significance culled)
};

USTRUCT(BlueprintType)
struct FKhaaosSpeciesLODConfig
{
    GENERATED_BODY()

    /** Espécie desta configuração */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    /** Distâncias de transição LOD (em cm) — 4 thresholds para 5 níveis */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<float> LODDistances = { 1000.0f, 2500.0f, 5000.0f, 10000.0f };

    /** Screen size thresholds para auto-LOD (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<float> ScreenSizeThresholds = { 0.5f, 0.25f, 0.12f, 0.06f };

    /** Forçar desativação de emissive/glow a partir deste LOD */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosLODLevel DisableEmissiveAtLOD = EKhaaosLODLevel::LOD2;

    /** Forçar desativação de VFX aura a partir deste LOD */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosLODLevel DisableVFXAtLOD = EKhaaosLODLevel::LOD3;

    /** Reduzir bone count de animação a partir deste LOD */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosLODLevel ReduceBoneCountAtLOD = EKhaaosLODLevel::LOD2;

    /** Desativar morph targets a partir deste LOD */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosLODLevel DisableMorphTargetsAtLOD = EKhaaosLODLevel::LOD1;

    /** Forçar significância cull (render nothing) neste LOD */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosLODLevel SignificanceCullAtLOD = EKhaaosLODLevel::LOD4;

    /** FPS de animação reduzido para LOD distante */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 DistantAnimTickRate = 15;

    /** Habilitar Nanite impostor para LOD4 */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableNaniteImpostor = true;
};

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosSpeciesLODManager : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Determina LOD level para uma espécie baseado na distância */
    EKhaaosLODLevel CalculateLOD(EKhaaosSpecies Species, float DistanceCm, float ScreenSizeFraction) const;

    /** Obtém a configuração de LOD para uma espécie */
    const FKhaaosSpeciesLODConfig& GetSpeciesLODConfig(EKhaaosSpecies Species) const;

    /** Aplica LOD a um skeletal mesh component */
    void ApplyLODToMesh(class USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species, EKhaaosLODLevel LODLevel);

    /** Verifica se emissive deve ser desativado para este LOD */
    bool ShouldDisableEmissive(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const;

    /** Verifica se VFX aura deve ser desativado para este LOD */
    bool ShouldDisableVFX(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const;

    /** Verifica se morph targets devem ser desativados para este LOD */
    bool ShouldDisableMorphTargets(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const;

    /** Verifica se deve ser significance culled */
    bool ShouldSignificanceCull(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const;

    /** Obtém tick rate de animação para LOD */
    int32 GetAnimTickRate(EKhaaosSpecies Species, EKhaaosLODLevel LODLevel) const;

    /** Estatísticas: contagem de operatives por LOD level */
    const TMap<EKhaaosLODLevel, int32>& GetLODDistribution() const { return LODDistribution; }

    /** Atualiza distribuição de LOD (chamado uma vez por frame) */
    void UpdateLODDistribution(const TMap<EKhaaosLODLevel, int32>& NewDistribution);

    /** Debug: dump LOD stats para console */
    void DumpLODStats() const;

protected:
    /** Constrói configuração de LOD para cada espécie */
    FKhaaosSpeciesLODConfig BuildSpeciesLODConfig(EKhaaosSpecies Species) const;

private:
    /** Configurações por espécie */
    TMap<EKhaaosSpecies, FKhaaosSpeciesLODConfig> SpeciesConfigs;

    /** Distribuição atual de operatives por LOD */
    TMap<EKhaaosLODLevel, int32> LODDistribution;

    /** Helper: converte LODLevel para índice (0-4) */
    static int32 LODToIndex(EKhaaosLODLevel Level) { return static_cast<int32>(Level); }
};
