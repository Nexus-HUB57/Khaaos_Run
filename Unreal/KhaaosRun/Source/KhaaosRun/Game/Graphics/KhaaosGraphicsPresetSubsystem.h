// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosGraphicsPresetSubsystem
// PROPÓSITO: Presets de qualidade gráfica adaptativos com auto-detecção de GPU,
//            integração DLSS/FSR/XeSS, e orquestração de todos os sistemas visuais.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosGraphicsPresetSubsystem.generated.h"

UENUM(BlueprintType)
enum class EKhaaosQualityPreset : uint8
{
    Low,        // 720p@30fps — hardware integrado / mobile
    Medium,     // 1080p@60fps — GTX 1060 / RX 580
    High,       // 1440p@60fps — RTX 3060 / RX 6700
    Ultra,      // 4K@60fps  — RTX 4070 / RX 7800
    PhD         // 4K@120fps — RTX 4090 / RX 7900 XTX (max quality)
};

UENUM(BlueprintType)
enum class EKhaaosUpscalerTech : uint8
{
    None,       // Resolução nativa
    DLSS,       // NVIDIA Deep Learning Super Sampling
    FSR,        // AMD FidelityFX Super Resolution
    XeSS,       // Intel Xe Super Sampling
    TSR         // UE5 Temporal Super Resolution (fallback universal)
};

UENUM(BlueprintType)
enum class EKhaaosShadowQuality : uint8
{
    Off, Low, Medium, High, Ultra, RayTraced
};

UENUM(BlueprintType)
enum class EKhaaosAOQuality : uint8
{
    Off, SSAO, GTAO, Lumen
};

USTRUCT(BlueprintType)
struct FKhaaosGraphicsProfile
{
    GENERATED_BODY()

    /** Resolução de renderização horizontal */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 RenderResolutionX = 1920;

    /** Resolução de renderização vertical */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 RenderResolutionY = 1080;

    /** Qualidade de sombra */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosShadowQuality ShadowQuality = EKhaaosShadowQuality::Medium;

    /** Qualidade de Anti-Aliasing / AO */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosAOQuality AmbientOcclusion = EKhaaosAOQuality::GTAO;

    /** Distância de view distance scale (0.0-1.0) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float ViewDistanceScale = 0.7f;

    /** Qualidade de textura (0=Low, 4=Ultra) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 TextureQuality = 2;

    /** Qualidade de VFX Niagara (pool budget %) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float VFXBudgetPercent = 0.65f;

    /** Lumen GI habilitado */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableLumenGI = false;

    /** Nanite virtual geometry habilitado */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableNanite = true;

    /** Motion blur habilitado */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableMotionBlur = false;

    /** Taxa alvo de frames */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 TargetFPS = 60;

    /** Upscaler ativo */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosUpscalerTech Upscaler = EKhaaosUpscalerTech::TSR;
};

UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosGraphicsPresetSubsystem : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Auto-detecta GPU e aplica preset correspondente */
    EKhaaosQualityPreset AutoDetectAndApply();

    /** Aplica preset manual de qualidade */
    void ApplyPreset(EKhaaosQualityPreset Preset);

    /** Obtém o perfil ativo atual */
    const FKhaaosGraphicsProfile& GetCurrentProfile() const { return ActiveProfile; }

    /** Obtém preset atual */
    EKhaaosQualityPreset GetCurrentPreset() const { return CurrentPreset; }

    /** Detecta upscaler disponível (DLSS > FSR > XeSS > TSR) */
    EKhaaosUpscalerTech DetectBestUpscaler() const;

    /** Registra callback para mudança de preset */
    DECLARE_EVENT_OneParam(UKhaaosGraphicsPresetSubsystem, FOnPresetChanged, EKhaaosQualityPreset);

    FOnPresetChanged& OnPresetChanged() { return PresetChangedEvent; }

protected:
    /** Constrói perfil para cada preset */
    FKhaaosGraphicsProfile BuildPresetProfile(EKhaaosQualityPreset Preset) const;

    /** Aplica configurações ao console do UE5 */
    void ApplyConsoleCommands(const FKhaaosGraphicsProfile& Profile);

    /** Detecta VRAM da GPU via nvidia-smi ou DXGI */
    int32 DetectGPUVRAM() const;

private:
    EKhaaosQualityPreset CurrentPreset = EKhaaosQualityPreset::Medium;
    FKhaaosGraphicsProfile ActiveProfile;
    FOnPresetChanged PresetChangedEvent;

    /** Presets pré-calculados */
    TMap<EKhaaosQualityPreset, FKhaaosGraphicsProfile> CachedPresets;
};
