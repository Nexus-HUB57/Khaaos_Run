// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosMaterialOptimizer
// PROPÓSITO: Otimização de materiais e texturas em runtime com LOD de textura
//            adaptativo, streaming budget, e parameter batch updates para reduzir
//            draw calls e melhorar a experiência visual do jogador.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosMaterialOptimizer.generated.h"

UENUM(BlueprintType)
enum class EKhaaosTextureGroup : uint8
{
    CharacterDiffuse,    // Albedo/difusa de personagens (alta prioridade)
    CharacterNormal,     // Normal maps de personagens
    CharacterEmissive,   // Emissive/glow para skins MITICO
    VFXTexture,          // Texturas de Niagara VFX (média prioridade)
    WeaponDiffuse,       // Albedo de armas
    WeaponNormal,        // Normal maps de armas
    Environment,         // Terreno, paredes, céu
    UI,                  // HUD, minimap, menus
    LODFallback          // Placeholder genérico de baixa resolução
};

USTRUCT(BlueprintType)
struct FKhaaosTextureBudget
{
    GENERATED_BODY()

    /** Budget total de streaming de textura em MB */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "256", ClampMax = "16384"))
    int32 TotalStreamingBudgetMB = 2048;

    /** Prioridade relativa por grupo (soma = 1.0) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TMap<EKhaaosTextureGroup, float> GroupPriorities;

    /** Mip level máximo por grupo (-1 = sem limite) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TMap<EKhaaosTextureGroup, int32> MaxMipLevels;

    /** Tempo de fade entre LODs de textura em segundos */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.1", ClampMax = "2.0"))
    float MipFadeTime = 0.5f;
};

USTRUCT(BlueprintType)
struct FKhaaosMaterialBatch
{
    GENERATED_BODY()

    /** Nome do material batch para debug */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName BatchName;

    /** Número de instâncias ativas neste batch */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 ActiveInstanceCount = 0;

    /** Draw calls economizadas por batching */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 SavedDrawCalls = 0;
};

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosMaterialOptimizer : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Aplica o budget de streaming de textura ao engine */
    void ApplyStreamingBudget(const FKhaaosTextureBudget& Budget);

    /** Obtém o budget ativo */
    const FKhaaosTextureBudget& GetCurrentBudget() const { return ActiveBudget; }

    /** Ajusta budget automaticamente com base no VRAM detectado */
    void AutoConfigureBudget(int32 GPUVRAMMB);

    /** Registra um material instance para batch updates */
    void RegisterMaterialInstance(UMaterialInstanceDynamic* MID, EKhaaosTextureGroup Group);

    /** Remove um material instance do registry */
    void UnregisterMaterialInstance(UMaterialInstanceDynamic* MID);

    /** Atualiza parâmetros em batch para todos os MIDs de um grupo (single draw call) */
    void BatchUpdateScalarParameter(EKhaaosTextureGroup Group, const FName& ParamName, float Value);

    /** Atualiza parâmetros de cor em batch */
    void BatchUpdateVectorParameter(EKhaaosTextureGroup Group, const FName& ParamName, const FLinearColor& Value);

    /** Otimiza materiais distantes (fora do LOD range) */
    void DistantMaterialOptimization(float ViewerDistance, float OptimizationThreshold);

    /** Estatísticas */
    int32 GetTotalRegisteredInstances() const;
    int32 GetTotalBatches() const { return MaterialBatches.Num(); }
    int32 GetTotalSavedDrawCalls() const;

protected:
    /** Constrói budget padrão por qualidade */
    FKhaaosTextureBudget BuildDefaultBudget(int32 QualityLevel) const;

private:
    FKhaaosTextureBudget ActiveBudget;

    /** Registry de MIDs por grupo para batch updates */
    TMap<EKhaaosTextureGroup, TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>> GroupedInstances;

    /** Estatísticas de batch */
    TMap<EKhaaosTextureGroup, FKhaaosMaterialBatch> MaterialBatches;

    /** Total de draw calls economizadas */
    int32 TotalSavedDrawCalls = 0;
};
