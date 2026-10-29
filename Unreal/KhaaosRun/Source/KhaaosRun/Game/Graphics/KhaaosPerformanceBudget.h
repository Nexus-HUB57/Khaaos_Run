// ==============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// SUBSISTEMA: UKhaaosPerformanceBudget
// PROPÓSITO: Rastreamento de tempo de frame, escalação adaptativa de qualidade
//            e gerenciamento de budget mobile para Battle Royale de 6 espécies
//            alienígenas. Visa consistência de 30fps mobile / 60fps desktop
//            no estilo Free Fire.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosPerformanceBudget.generated.h"

// ─── Enums ─────────────────────────────────────────────────────────────────────

/** Plataforma alvo — define o budget de frame e restrições de qualidade. */
UENUM(BlueprintType)
enum class EKhaaosPlatformTarget : uint8
{
    MOBILE_LOW,     // Mobile低端 (Adreno 506 / Mali-G52, 30fps)
    MOBILE_MID,     // Mobile中端 (Adreno 610 / Mali-G57, 30fps)
    MOBILE_HIGH,    // Mobile高端 (Adreno 660+ / Mali-G710+, 60fps)
    DESKTOP_MIN,    // Desktop最低 (GTX 1050 / RX 560, 60fps)
    DESKTOP_MID,    // Desktop中端 (GTX 1070 / RX 570, 60fps)
    DESKTOP_MAX     // Desktop高端 (RTX 3070+ / RX 6800+, 120fps)
};

/** Estado atual do budget — indica se estamos dentro, no limite ou acima. */
UENUM(BlueprintType)
enum class EKhaaosBudgetState : uint8
{
    UNDER_BUDGET,   // Utilização < 70% do budget
    AT_BUDGET,      // Utilização 70-95% do budget
    OVER_BUDGET,    // Utilização 95-120% do budget
    CRITICAL_OVER   // Utilização > 120% do budget
};

// ─── Structs ───────────────────────────────────────────────────────────────────

/** Budget alvo para um frame — define os limites de tempo por thread. */
USTRUCT(BlueprintType)
struct FKhaaosFrameBudget
{
    GENERATED_BODY()

    /** FPS alvo (ex: 30.0, 60.0, 120.0) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "15.0", ClampMax = "240.0"))
    float TargetFPS = 60.0f;

    /** Tempo de frame alvo em ms (= 1000 / TargetFPS) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "4.0", ClampMax = "66.0"))
    float TargetFrameTimeMs = 16.67f;

    /** Budget máximo de GPU em ms (tipicamente 70% do frame) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "2.0", ClampMax = "50.0"))
    float MaxGPUTimeMs = 11.67f;

    /** Budget máximo de CPU/game thread em ms */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "2.0", ClampMax = "50.0"))
    float MaxCPUTimeMs = 10.0f;

    /** Budget máximo da render thread em ms */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "2.0", ClampMax = "50.0"))
    float MaxRenderThreadTimeMs = 10.0f;

    /** Margem de segurança (0-0.3) — percentual do budget reservado como headroom */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.0", ClampMax = "0.3"))
    float HeadroomPercent = 0.1f;

    /** Se a plataforma alvo é mobile */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget")
    bool bIsMobileTarget = false;
};

/** Snapshot de tempo de um único frame — medições brutas. */
USTRUCT(BlueprintType)
struct FKhaaosFrameTimeSnapshot
{
    GENERATED_BODY()

    /** Tempo de GPU em ms */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|PerfBudget")
    float GPUTimeMs = 0.0f;

    /** Tempo de CPU/game thread em ms */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|PerfBudget")
    float CPUTimeMs = 0.0f;

    /** Tempo da render thread em ms */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|PerfBudget")
    float RenderThreadTimeMs = 0.0f;

    /** Tempo de RHI em ms */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|PerfBudget")
    float RHITimeMs = 0.0f;

    /** Tempo total do frame em ms */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|PerfBudget")
    float FrameTimeMs = 0.0f;

    /** Timestamp da medição (FPlatformTime::Seconds()) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|PerfBudget")
    double Timestamp = 0.0;
};

/** Configuração de escalação adaptativa — regras para subir/descer qualidade. */
USTRUCT(BlueprintType)
struct FKhaaosAdaptiveQualityConfig
{
    GENERATED_BODY()

    /** Se a escalação adaptativa está habilitada */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget")
    bool bEnableAdaptiveQuality = true;

    /** Fração do budget acima da qual reduzimos qualidade (0.8-1.0) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.8", ClampMax = "1.0"))
    float ScaleDownThreshold = 0.9f;

    /** Fração do budget abaixo da qual aumentamos qualidade (0.5-0.8) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.5", ClampMax = "0.8"))
    float ScaleUpThreshold = 0.6f;

    /** Velocidade de redução de qualidade (unidades/segundo) quando acima do budget */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.01", ClampMax = "4.0"))
    float ScaleDownSpeed = 1.0f;

    /** Velocidade de aumento de qualidade (unidades/segundo) quando abaixo do budget */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.01", ClampMax = "4.0"))
    float ScaleUpSpeed = 0.5f;

    /** Nível mínimo de qualidade (0-4, nunca reduz abaixo deste) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.0", ClampMax = "4.0"))
    float MinQualityLevel = 0.0f;

    /** Nível máximo de qualidade (0-4, nunca aumenta acima deste) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "0.0", ClampMax = "4.0"))
    float MaxQualityLevel = 4.0f;

    /** Frames consecutivos a esperar antes de mudar qualidade (evita oscilação) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "1", ClampMax = "30"))
    int32 HysteresisFrames = 5;
};

/** Restrições específicas de mobile — limites de recursos para plataformas fracas. */
USTRUCT(BlueprintType)
struct FKhaaosMobileConstraints
{
    GENERATED_BODY()

    /** Resolução máxima de textura (512/1024/2048) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "256", ClampMax = "4096"))
    int32 MaxTextureResolution = 1024;

    /** Contagem máxima de partículas */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "100", ClampMax = "50000"))
    int32 MaxParticleCount = 5000;

    /** Resolução máxima de sombra (512/1024) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "256", ClampMax = "2048"))
    int32 MaxShadowResolution = 512;

    /** Desabilitar Screen Space Reflections */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget")
    bool bDisableSSR = false;

    /** Desabilitar Screen Space Ambient Occlusion */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget")
    bool bDisableSSAO = false;

    /** Desabilitar Volumetric Fog */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget")
    bool bDisableVolumetricFog = false;

    /** Desabilitar Lumen Global Illumination */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget")
    bool bDisableLumenGI = false;

    /** Máximo de draw calls por frame */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "100", ClampMax = "10000"))
    int32 MaxDrawCalls = 2000;

    /** Máximo de triângulos por frame */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|PerfBudget", meta = (ClampMin = "10000", ClampMax = "5000000"))
    int32 MaxTriangleCount = 500000;
};

// ─── Delegate Declarations ─────────────────────────────────────────────────────

/** Broadcast quando o nível de qualidade é escalado (adaptativo). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnQualityScaled, float, OldLevel, float, NewLevel);

/** Broadcast quando o estado do budget muda. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnBudgetStateChanged, EKhaaosBudgetState, NewState);

// ─── Performance Budget Subsystem ──────────────────────────────────────────────

/**
 * UKhaaosPerformanceBudget — Rastreamento de tempo de frame, escalação
 * adaptativa de qualidade e gerenciamento de budget mobile.
 *
 * Funcionalidades:
 * - Budget de frame por plataforma (6 perfis de MOBILE_LOW a DESKTOP_MAX)
 * - Histórico circular de 60 frames para média móvel
 * - Escalação adaptativa com histerese (evita oscilação)
 * - Restrições de recursos para mobile (texturas, partículas, sombras, etc.)
 * - Delegates para reação a mudanças de qualidade e estado do budget
 * - Diagnóstico completo via DumpBudgetState()
 *
 * Subsistema de engine — disponível desde o início, independente de mundo.
 */
UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosPerformanceBudget : public UEngineSubsystem
{
    GENERATED_BODY()

public:

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Configuração de Plataforma ─────────────────────────────────────────

    /** Define a plataforma alvo — configura budget, qualidade adaptativa e restrições mobile. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PerfBudget")
    void SetPlatformTarget(EKhaaosPlatformTarget NewPlatform);

    /** Obtém a plataforma alvo atual. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    EKhaaosPlatformTarget GetPlatformTarget() const { return Platform; }

    /** Obtém o budget padrão para uma plataforma específica. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    FKhaaosFrameBudget GetBudgetForPlatform(EKhaaosPlatformTarget TargetPlatform) const;

    // ─── Budget de Frame ────────────────────────────────────────────────────

    /** Define o budget de frame manualmente (sobrepõe o padrão da plataforma). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PerfBudget")
    void SetFrameBudget(const FKhaaosFrameBudget& NewBudget);

    /** Obtém o budget de frame atual. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    const FKhaaosFrameBudget& GetFrameBudget() const { return FrameBudget; }

    // ─── Rastreamento de Frame ──────────────────────────────────────────────

    /** Registra medições de tempo de um frame no histórico circular. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PerfBudget")
    void RecordFrameTime(const FKhaaosFrameTimeSnapshot& Snapshot);

    /** Obtém a média das medições de frame (média móvel sobre o histórico). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    FKhaaosFrameTimeSnapshot GetAverageFrameTime() const;

    // ─── Estado do Budget ───────────────────────────────────────────────────

    /** Obtém o estado atual do budget (UNDER/AT/OVER/CRITICAL). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    EKhaaosBudgetState GetCurrentBudgetState() const { return CurrentBudgetState; }

    /** Obtém a fração de utilização do budget (0-1+, >1 = acima do budget). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    float GetBudgetUtilization() const;

    // ─── Escalação Adaptativa ───────────────────────────────────────────────

    /** Define a configuração de escalação adaptativa. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PerfBudget")
    void SetAdaptiveConfig(const FKhaaosAdaptiveQualityConfig& NewConfig);

    /** Tick principal — avalia utilização e escala qualidade adaptativamente.
     *  Deve ser chamado uma vez por frame com o DeltaTime atual.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PerfBudget")
    void UpdateAdaptiveQuality(float DeltaTime);

    /** Obtém o nível de qualidade atual (0-4, interpolado suavemente). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    float GetCurrentQualityLevel() const { return CurrentQualityLevel; }

    // ─── Mobile ─────────────────────────────────────────────────────────────

    /** Obtém as restrições mobile atuais. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    const FKhaaosMobileConstraints& GetMobileConstraints() const { return MobileConstraints; }

    /** Verifica se a plataforma atual é mobile. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    bool IsMobilePlatform() const { return FrameBudget.bIsMobileTarget; }

    // ─── Histórico e Diagnóstico ────────────────────────────────────────────

    /** Obtém o histórico completo de medições (últimos N snapshots). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|PerfBudget")
    const TArray<FKhaaosFrameTimeSnapshot>& GetFrameTimeHistory() const { return FrameHistory; }

    /** Imprime diagnóstico completo do estado do budget no log. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|PerfBudget")
    void DumpBudgetState() const;

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast quando o nível de qualidade é escalado. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|PerfBudget")
    FOnQualityScaled OnQualityScaled;

    /** Broadcast quando o estado do budget muda. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|PerfBudget")
    FOnBudgetStateChanged OnBudgetStateChanged;

private:

    // ─── Estado Interno ─────────────────────────────────────────────────────

    /** Plataforma alvo atual */
    UPROPERTY(Transient)
    EKhaaosPlatformTarget Platform = EKhaaosPlatformTarget::DESKTOP_MID;

    /** Budget de frame atual */
    UPROPERTY(Transient)
    FKhaaosFrameBudget FrameBudget;

    /** Configuração de escalação adaptativa */
    UPROPERTY(Transient)
    FKhaaosAdaptiveQualityConfig AdaptiveConfig;

    /** Restrições mobile atuais */
    UPROPERTY(Transient)
    FKhaaosMobileConstraints MobileConstraints;

    /** Histórico circular de medições de frame (rolling window) */
    UPROPERTY(Transient)
    TArray<FKhaaosFrameTimeSnapshot> FrameHistory;

    /** Índice de escrita atual no buffer circular */
    int32 HistoryIndex = 0;

    /** Tamanho do histórico circular (rolling window de 60 frames) */
    static constexpr int32 HISTORY_SIZE = 60;

    /** Nível de qualidade atual (0-4, interpolado suavemente) */
    UPROPERTY(Transient)
    float CurrentQualityLevel = 2.0f;

    /** Nível de qualidade alvo (para onde estamos indo) */
    UPROPERTY(Transient)
    float TargetQualityLevel = 2.0f;

    /** Estado atual do budget */
    UPROPERTY(Transient)
    EKhaaosBudgetState CurrentBudgetState = EKhaaosBudgetState::UNDER_BUDGET;

    /** Frames consecutivos acima do budget (para histerese) */
    int32 OverBudgetFrames = 0;

    /** Frames consecutivos abaixo do budget (para histerese) */
    int32 UnderBudgetFrames = 0;

    // ─── Helpers Internos ───────────────────────────────────────────────────

    /** Obtém as restrições mobile padrão para uma plataforma. */
    FKhaaosMobileConstraints GetMobileConstraintsForPlatform(EKhaaosPlatformTarget TargetPlatform) const;

    /** Obtém a configuração adaptativa padrão para uma plataforma. */
    FKhaaosAdaptiveQualityConfig GetAdaptiveConfigForPlatform(EKhaaosPlatformTarget TargetPlatform) const;
};
