// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosMobileGraphicsOptimizer
// PROPÓSITO: Coordena otimizações agressivas de gráficos mobile em um único
//            subsistema. Atualmente, constraints mobile estão espalhadas entre
//            PerformanceBudget e GraphicsPresetSubsystem. Este consolida e
//            adiciona CVars mobile-specific que Free Fire usa extensivamente.
//
//            3 tiers mobile:
//            - LowEnd (Adreno 506): half-res PP, FXAA, forward, sem SSR/Lumen
//            - MidRange (Adreno 610): half-res PP, FXAA, forward, shadows limitadas
//            - HighEnd (Adreno 660+): full-res PP, MSAA 4x, forward, SSR baixo
//
//            Guarda: só executa em PLATFORM_ANDROID || PLATFORM_IOS || -mobile flag.
//            Integração: estágio QUALITY_CALIBRATION do GraphicsPipelineManager.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosMobileGraphicsOptimizer.generated.h"

// ─── Mobile Tier Enumeration ──────────────────────────────────────────────────

/** Tiers de hardware mobile — baseado em GPU (Adreno/Mali). */
UENUM(BlueprintType)
enum class EKhaaosMobileTier : uint8
{
    LowEnd   UMETA(DisplayName = "Low End (Adreno 506)"),
    MidRange UMETA(DisplayName = "Mid Range (Adreno 610)"),
    HighEnd  UMETA(DisplayName = "High End (Adreno 660+)")
};

// ─── Mobile Optimization Profile ──────────────────────────────────────────────

/** Perfil completo de otimizações mobile. */
USTRUCT(BlueprintType)
struct FKhaaosMobileOptimizationProfile
{
    GENERATED_BODY()

    // ── Render Path ─────────────────────────────────────────────────────────
    /** Pós-processamento em meia resolução (r.Mobile.HalfResPP). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bHalfResPostProcess = true;

    /** GPU skinning cache (r.SkinCache.CompileShaderOnStartup). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bGPUSkinningCache = true;

    /** Máximo de texturas FP16 (mobile-friendly). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bMaxFP16Textures = true;

    /** Desabilitar lens flare (caro em mobile). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bDisableLensFlare = true;

    /** Desabilitar Screen Space Reflections. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bDisableSSR = true;

    /** Desabilitar Lumen GI. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bDisableLumen = true;

    /** Desabilitar volumetric fog (proibitivo em mobile). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bDisableVolumetricFog = true;

    // ── Quality ─────────────────────────────────────────────────────────────
    /** Bias de LOD de partículas (0=off, 2=agressivo). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0", ClampMax = "4"))
    int32 ParticleLODBias = 1;

    /** Bias de mip de textura (0=full, 1=medium, 2=low). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0", ClampMax = "3"))
    int32 TextureMipBias = 1;

    /** Resolução de sombra em pixels (256/512/1024). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "256", ClampMax = "2048"))
    int32 ShadowResolution = 512;

    /** Máximo de cascatas de sombra CSM (1-4). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "1", ClampMax = "4"))
    int32 MaxCascades = 2;

    // ── Renderer ────────────────────────────────────────────────────────────
    /** Forward renderer (obrigatório em mobile). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bForwardRenderer = true;

    /** Amostras de MSAA (0=off, 2, 4, 8). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0", ClampMax = "8"))
    int32 MSAASamples = 2;

    /** Tamanho do pool de texturas em MB. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "64", ClampMax = "2048"))
    int32 TexturePoolSizeMB = 256;
};

// ─── Mobile Graphics Optimizer Subsystem ───────────────────────────────────────

/**
 * UKhaaosMobileGraphicsOptimizer — Otimizador de gráficos mobile (EngineSubsystem).
 *
 * Coordena todas as otimizações agressivas de gráficos mobile em uma única
 * chamada ApplyMobileOptimizations(), configurando CVars de renderização,
 * sombra, textura, e pós-processamento de forma coordenada.
 *
 * Auto-detecção de tier via GPU (Adreno/Mali) usando GRHIAdapterName.
 * Guarda: só executa em PLATFORM_ANDROID || PLATFORM_IOS || -mobile flag.
 * Integração: estágio QUALITY_CALIBRATION do GraphicsPipelineManager.
 */
UCLASS(Config=Game, defaultconfig)
class KHAAOSRUN_API UKhaaosMobileGraphicsOptimizer : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize(FSubsystemCollectionBase& Collection) override;

    // ─── Mobile Optimization ───────────────────────────────────────────────

    /** Aplica TODAS as otimizações mobile em uma chamada coordenada. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MobileOptimizer")
    void ApplyMobileOptimizations(EKhaaosMobileTier Tier);

    /** Constrói o perfil de otimização para um tier. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|MobileOptimizer")
    static FKhaaosMobileOptimizationProfile BuildProfileForTier(EKhaaosMobileTier Tier);

    /** Auto-detecção de tier baseado na GPU (Adreno/Mali). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|MobileOptimizer")
    EKhaaosMobileTier DetectMobileTier() const;

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o otimizador ativo (null-safe). */
    static UKhaaosMobileGraphicsOptimizer* GetActiveForGame();

    /** Tier corrente. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|MobileOptimizer")
    EKhaaosMobileTier GetCurrentTier() const { return CurrentTier; }

    /** Perfil corrente. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|MobileOptimizer")
    FKhaaosMobileOptimizationProfile GetCurrentProfile() const { return CurrentProfile; }

    /** Se a plataforma corrente é mobile. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|MobileOptimizer")
    bool IsMobilePlatform() const { return bIsMobilePlatform; }

private:
    /** Verifica se está em plataforma mobile (Android/iOS/-mobile flag). */
    static bool CheckMobilePlatform();

    /** Tier detectado. */
    UPROPERTY(Transient)
    EKhaaosMobileTier CurrentTier = EKhaaosMobileTier::MidRange;

    /** Perfil corrente. */
    UPROPERTY(Transient)
    FKhaaosMobileOptimizationProfile CurrentProfile;

    /** Se a plataforma é mobile. */
    bool bIsMobilePlatform = false;
};
