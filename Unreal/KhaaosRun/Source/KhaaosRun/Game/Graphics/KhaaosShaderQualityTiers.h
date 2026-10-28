// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosShaderQualityTiers
// PROPÓSITO: Gerencia troca de tier de qualidade de shader para o master
//            material. Free Fire usa complexidade de shader diferente por
//            nível de qualidade:
//            - Minimal(0): apenas diffuse
//            - Low(1): +normal +rim
//            - Medium(2): +emissive +subsurface (default desktop)
//            - High(3): +clear coat +wet map (high-end desktop)
//            - Ultra(4): +iridescence +anisotropy (max quality, all features)
//
//            Controla o parâmetro escalar ShadingQuality (0-4) em todos os
//            MIDs registrados, e define quais features estão habilitadas por tier.
//
//            Integração: MaterialPipeline ApplyMaterialProfile e
//            GraphicsPipelineManager QUALITY_CALIBRATION stage.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "KhaaosShaderQualityTiers.generated.h"

// ─── Shader Tier Enumeration ──────────────────────────────────────────────────

/** Tiers de qualidade de shader — controla complexidade do master material. */
UENUM(BlueprintType)
enum class EKhaaosShaderTier : uint8
{
    Minimal UMETA(DisplayName = "Minimal (0)"),   // Apenas diffuse
    Low     UMETA(DisplayName = "Low (1)"),       // +normal +rim
    Medium  UMETA(DisplayName = "Medium (2)"),    // +emissive +subsurface
    High    UMETA(DisplayName = "High (3)"),      // +clear coat +wet map
    Ultra   UMETA(DisplayName = "Ultra (4)")      // +iridescence +anisotropy
};

// ─── Shader Tier Configuration ────────────────────────────────────────────────

/** Configuração de features habilitadas por tier de shader. */
USTRUCT(BlueprintType)
struct FKhaaosShaderTierConfig
{
    GENERATED_BODY()

    /** Nível do tier (0-4). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosShaderTier Tier = EKhaaosShaderTier::Medium;

    /** Habilitar normal map. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableNormalMap = true;

    /** Habilitar emissive. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableEmissive = true;

    /** Habilitar subsurface scattering. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableSubsurface = true;

    /** Habilitar clear coat. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableClearCoat = false;

    /** Habilitar rim light. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableRimLight = true;

    /** Habilitar iridescência. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableIridescence = false;

    /** Habilitar anisotropia. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableAnisotropy = false;

    /** Habilitar wet map (resposta à umidade). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableWetMap = false;

    /** Intensidade máxima do emissive (0-5). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "5.0"))
    float MaxEmissiveIntensity = 2.0f;

    /** Intensidade máxima do rim light (0-3). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "3.0"))
    float MaxRimIntensity = 1.5f;

    /** Escalar de complexidade do material (0-4, passado ao master material). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "4.0"))
    float MaterialComplexityScalar = 2.0f;
};

// ─── Shader Quality Tiers Subsystem ───────────────────────────────────────────

/**
 * UKhaaosShaderQualityTiers — Gerenciador de tiers de qualidade de shader.
 *
 * Controla o parâmetro ShadingQuality (0-4) em todos os MIDs registrados,
 * habilitando/desabilitando features do master material por tier.
 *
 * Registro de MIDs para atualização automática quando o tier muda.
 * Integração: MaterialPipeline ApplyMaterialProfile e
 * GraphicsPipelineManager QUALITY_CALIBRATION stage.
 */
UCLASS(Config=Game, defaultconfig)
class KHAAOSRUN_API UKhaaosShaderQualityTiers : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize(FSubsystemCollectionBase& Collection) override;

    // ─── Tier Management ───────────────────────────────────────────────────

    /** Define o tier ativo e aplica em todos os MIDs registrados. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ShaderTiers")
    void SetShaderTier(EKhaaosShaderTier Tier);

    /** Constrói a config de features para um tier. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ShaderTiers")
    static FKhaaosShaderTierConfig BuildTierConfig(EKhaaosShaderTier Tier);

    // ─── MID Registration ──────────────────────────────────────────────────

    /** Registra um MID para receber atualizações de tier. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ShaderTiers")
    void RegisterMID(UMaterialInstanceDynamic* MID);

    /** Remove um MID do registro. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ShaderTiers")
    void UnregisterMID(UMaterialInstanceDynamic* MID);

    // ─── MID Application ──────────────────────────────────────────────────

    /** Aplica os parâmetros de tier a um único MID. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ShaderTiers")
    static void ApplyTierToMID(UMaterialInstanceDynamic* MID, EKhaaosShaderTier Tier);

    /** Aplica o tier corrente a todos os MIDs registrados. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|ShaderTiers")
    void ApplyTierToAll();

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o subsistema ativo (null-safe). */
    static UKhaaosShaderQualityTiers* GetActiveForGame();

    /** Tier corrente. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ShaderTiers")
    EKhaaosShaderTier GetCurrentTier() const { return CurrentTier; }

    /** Config corrente. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ShaderTiers")
    FKhaaosShaderTierConfig GetCurrentConfig() const { return CurrentConfig; }

    /** Número de MIDs registrados. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|ShaderTiers")
    int32 GetRegisteredMIDCount() const;

private:
    /** Tier corrente. */
    UPROPERTY(Transient)
    EKhaaosShaderTier CurrentTier = EKhaaosShaderTier::Medium;

    /** Config corrente. */
    UPROPERTY(Transient)
    FKhaaosShaderTierConfig CurrentConfig;

    /** MIDs registrados para atualização automática de tier. */
    UPROPERTY(Transient)
    TArray<TWeakObjectPtr<UMaterialInstanceDynamic>> RegisteredMIDs;
};
