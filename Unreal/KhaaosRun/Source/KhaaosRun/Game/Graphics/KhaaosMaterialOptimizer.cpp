// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosMaterialOptimizer
// Streaming budget adaptativo, batch updates, distant material optimization.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosMaterialOptimizer.h"
#include "Engine/Engine.h"
#include "Materials/MaterialInstanceDynamic.h"

void UKhaaosMaterialOptimizer::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Inicializar prioridades padrão por grupo de textura
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::CharacterDiffuse,  0.25f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::CharacterNormal,   0.15f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::CharacterEmissive, 0.10f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::VFXTexture,       0.15f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::WeaponDiffuse,     0.10f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::WeaponNormal,      0.05f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::Environment,       0.15f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::UI,               0.05f);
    ActiveBudget.GroupPriorities.Add(EKhaaosTextureGroup::LODFallback,      0.00f);

    // Mip levels máximos por grupo
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::CharacterDiffuse,  -1);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::CharacterNormal,   -1);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::CharacterEmissive, 6);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::VFXTexture,       5);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::WeaponDiffuse,     -1);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::WeaponNormal,      8);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::Environment,       10);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::UI,               4);
    ActiveBudget.MaxMipLevels.Add(EKhaaosTextureGroup::LODFallback,       2);

    // Inicializar arrays por grupo
    for (uint8 i = 0; i <= static_cast<uint8>(EKhaaosTextureGroup::LODFallback); ++i)
    {
        EKhaaosTextureGroup Group = static_cast<EKhaaosTextureGroup>(i);
        GroupedInstances.Add(Group, TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>());
        MaterialBatches.Add(Group, FKhaaosMaterialBatch{FName(*UEnum::GetDisplayValueAsText(Group).ToString()), 0, 0});
    }

    UE_LOG(LogTemp, Display, TEXT("[MaterialOptimizer] Subsystem inicializado. Budget: %dMB, 9 grupos de textura."),
        ActiveBudget.TotalStreamingBudgetMB);
}

void UKhaaosMaterialOptimizer::ApplyStreamingBudget(const FKhaaosTextureBudget& Budget)
{
    ActiveBudget = Budget;

    if (GEngine)
    {
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.Streaming.PoolSize %d"), Budget.TotalStreamingBudgetMB));
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.Streaming.MipFadeTime %.2f"), Budget.MipFadeTime));
        GEngine->Exec(nullptr, TEXT("r.Streaming.UseNewMetrics 1"));
        GEngine->Exec(nullptr, TEXT("r.Streaming.AmortizeResourcePriority 1"));
    }

    UE_LOG(LogTemp, Display, TEXT("[MaterialOptimizer] Budget aplicado: %dMB, MipFade=%.2fs"),
        Budget.TotalStreamingBudgetMB, Budget.MipFadeTime);
}

void UKhaaosMaterialOptimizer::AutoConfigureBudget(int32 GPUVRAMMB)
{
    int32 BudgetMB;
    int32 QualityLevel;

    if (GPUVRAMMB >= 24000)       { BudgetMB = 8192; QualityLevel = 4; }
    else if (GPUVRAMMB >= 12000)  { BudgetMB = 4096; QualityLevel = 3; }
    else if (GPUVRAMMB >= 8000)   { BudgetMB = 3072; QualityLevel = 2; }
    else if (GPUVRAMMB >= 6000)   { BudgetMB = 2048; QualityLevel = 1; }
    else                          { BudgetMB = 1024; QualityLevel = 0; }

    FKhaaosTextureBudget Budget = BuildDefaultBudget(QualityLevel);
    Budget.TotalStreamingBudgetMB = BudgetMB;
    ApplyStreamingBudget(Budget);

    UE_LOG(LogTemp, Display, TEXT("[MaterialOptimizer] Auto-config: VRAM=%dMB -> Pool=%dMB, Quality=%d"),
        GPUVRAMMB, BudgetMB, QualityLevel);
}

FKhaaosTextureBudget UKhaaosMaterialOptimizer::BuildDefaultBudget(int32 QualityLevel) const
{
    FKhaaosTextureBudget Budget;

    Budget.MipFadeTime = (QualityLevel >= 3) ? 0.3f : 0.5f;

    if (QualityLevel <= 1)
    {
        Budget.GroupPriorities.Add(EKhaaosTextureGroup::CharacterEmissive, 0.03f);
        Budget.GroupPriorities.Add(EKhaaosTextureGroup::VFXTexture, 0.08f);
        Budget.GroupPriorities.Add(EKhaaosTextureGroup::CharacterDiffuse, 0.30f);
    }

    return Budget;
}

void UKhaaosMaterialOptimizer::RegisterMaterialInstance(UMaterialInstanceDynamic* MID, EKhaaosTextureGroup Group)
{
    if (!MID) return;

    if (TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>* Instances = GroupedInstances.Find(Group))
    {
        Instances->Add(MID);
    }

    if (FKhaaosMaterialBatch* Batch = MaterialBatches.Find(Group))
    {
        Batch->ActiveInstanceCount++;
    }
}

void UKhaaosMaterialOptimizer::UnregisterMaterialInstance(UMaterialInstanceDynamic* MID)
{
    if (!MID) return;

    for (auto& Pair : GroupedInstances)
    {
        TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>& Instances = Pair.Value;
        int32 Removed = Instances.RemoveAll([MID](const TWeakObjectPtr<UMaterialInstanceDynamic>& WeakPtr)
        {
            return WeakPtr.Get() == MID;
        });

        if (Removed > 0)
        {
            if (FKhaaosMaterialBatch* Batch = MaterialBatches.Find(Pair.Key))
            {
                Batch->ActiveInstanceCount = FMath::Max(0, Batch->ActiveInstanceCount - Removed);
            }
            break;
        }
    }
}

void UKhaaosMaterialOptimizer::BatchUpdateScalarParameter(EKhaaosTextureGroup Group, const FName& ParamName, float Value)
{
    if (const TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>* Instances = GroupedInstances.Find(Group))
    {
        int32 Updated = 0;
        for (const auto& WeakPtr : *Instances)
        {
            if (UMaterialInstanceDynamic* MID = WeakPtr.Get())
            {
                MID->SetScalarParameterValue(ParamName, Value);
                Updated++;
            }
        }

        // Limpar referências mortas
        if (Updated < Instances->Num())
        {
            const_cast<TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>*>(Instances)->RemoveAll(
                [](const TWeakObjectPtr<UMaterialInstanceDynamic>& W)
                {
                    return !W.IsValid();
                });
        }

        if (FKhaaosMaterialBatch* Batch = MaterialBatches.Find(Group))
        {
            const int32 Saved = FMath::Max(0, Updated - 1);
            Batch->SavedDrawCalls += Saved;
            TotalSavedDrawCalls += Saved;
        }
    }
}

void UKhaaosMaterialOptimizer::BatchUpdateVectorParameter(EKhaaosTextureGroup Group, const FName& ParamName, const FLinearColor& Value)
{
    if (const TArray<TWeakObjectPtr<UMaterialInstanceDynamic>>* Instances = GroupedInstances.Find(Group))
    {
        for (const auto& WeakPtr : *Instances)
        {
            if (UMaterialInstanceDynamic* MID = WeakPtr.Get())
            {
                MID->SetVectorParameterValue(ParamName, Value);
            }
        }
    }
}

void UKhaaosMaterialOptimizer::DistantMaterialOptimization(float ViewerDistance, float OptimizationThreshold)
{
    if (ViewerDistance <= OptimizationThreshold) return;

    // Para personagens distantes:
    // 1. Desativar emissive/glow (economiza ~15% do fragment shader)
    // 2. Reduzir resolução de textura via mip bias
    // 3. Desativar normal maps se muito distante

    const float MipBias = FMath::Clamp((ViewerDistance - OptimizationThreshold) / 100.0f, 0.0f, 3.0f);

    // Desativar emissive para personagens distantes
    BatchUpdateScalarParameter(EKhaaosTextureGroup::CharacterEmissive, FName("EmissiveStrength"), 0.0f);

    // Aplicar mip bias global
    if (GEngine)
    {
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.MipBias %.1f"), MipBias));
    }

    // Muito distante: desativar normal maps
    if (ViewerDistance > OptimizationThreshold * 2.0f)
    {
        BatchUpdateScalarParameter(EKhaaosTextureGroup::CharacterNormal, FName("NormalStrength"), 0.0f);
    }
}

int32 UKhaaosMaterialOptimizer::GetTotalRegisteredInstances() const
{
    int32 Total = 0;
    for (const auto& Pair : GroupedInstances)
    {
        Total += Pair.Value.Num();
    }
    return Total;
}

int32 UKhaaosMaterialOptimizer::GetTotalSavedDrawCalls() const
{
    return TotalSavedDrawCalls;
}
