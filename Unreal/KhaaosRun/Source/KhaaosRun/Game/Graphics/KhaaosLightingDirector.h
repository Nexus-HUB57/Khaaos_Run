// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosLightingDirector
// PROPÓSITO: Diretor de iluminação — constrói e configura programaticamente o
//            rig de luz completo do mundo (DirectionalLight + SkyLight +
//            ExponentialHeightFog + SkyAtmosphere), eliminando a dependência
//            de iluminação manual nos níveis. É o segundo pilar do look
//            Free Fire: sol forte, ambient caprichada e névoa de profundidade
//            que separa personagem de cenário.
//
//            4 presets do planeta Khaaos:
//            - DiaSolarPadrao: meio-dia brillante (assinatura FF)
//            - TardeDourada: hora dourada cinematográfica (Priadus)
//            - NoiteNeon: lua fria + ambiente azul neon (Arukheea)
//            - NebulosaVioleta: neblina densa violeta alienígena (Ckesalth/Barburhen)
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KhaaosLightingDirector.generated.h"

class ADirectionalLight;
class ASkyLight;
class AExponentialHeightFog;
class ASkyAtmosphere;

// ─── Lighting Preset Enumeration ──────────────────────────────────────────────

/** Presets de iluminação do planeta Khaaos. */
UENUM(BlueprintType)
enum class EKhaaosLightingPreset : uint8
{
    DiaSolarPadrao   UMETA(DisplayName = "Dia Solar Padrao"),
    TardeDourada     UMETA(DisplayName = "Tarde Dourada"),
    NoiteNeon        UMETA(DisplayName = "Noite Neon"),
    NebulosaVioleta  UMETA(DisplayName = "Nebulosa Violeta")
};

// ─── Lighting Preset Descriptor ───────────────────────────────────────────────

/** Configuração completa do rig de luz para um preset. */
USTRUCT(BlueprintType)
struct FKhaaosLightingPresetConfig
{
    GENERATED_BODY()

    // ── Sol (DirectionalLight) ──────────────────────────────────────────────
    /** Intensidade do sol em lux (12 = meio-dia claro estilo FF). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "50.0"))
    float SunIntensityLux = 12.0f;

    /** Temperatura de cor do sol em Kelvin (6100 = branco quente). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "1700", ClampMax = "20000"))
    float SunTemperature = 6100.0f;

    /** Pitch do sol em graus (55 = alto, 20 = horizonte). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "5.0", ClampMax = "89.0"))
    float SunPitchDeg = 55.0f;

    /** Yaw do sol em graus. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "360.0"))
    float SunYawDeg = 30.0f;

    /** Número de cascatas de shadow map dinâmicas (1-4, mobile usa 1-2). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "1", ClampMax = "4"))
    int32 ShadowCascades = 3;

    /** Comprimento do contact shadow (ancora personagens no chão, 0 = off). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "0.5"))
    float ContactShadowLength = 0.1f;

    // ── Céu (SkyLight — ambient) ────────────────────────────────────────────
    /** Intensidade da sky light (ambient hemisférico). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "4.0"))
    float SkyLightIntensity = 1.0f;

    // ── Névoa (ExponentialHeightFog — profundidade) ─────────────────────────
    /** Densidade da névoa exponencial (0.03 = sutil, 0.09 = densa alienígena). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "0.3"))
    float FogDensity = 0.035f;

    /** Queda de densidade com altura (maior = névoa colada no chão). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float FogHeightFalloff = 0.35f;

    /** Cor de inscattering da névoa (domina a tonalidade de fundo). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor FogInscatteringLuminance = FLinearColor(0.75f, 0.80f, 0.90f);

    /** Distância inicial da névoa em cm. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "50000.0"))
    float FogStartDistance = 3000.0f;

    // ── Atmosfera ────────────────────────────────────────────────────────────
    /** Se a SkyAtmosphere (espalhamento atmosférico next-gen) está visível. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bSkyAtmosphereVisible = true;
};

// ─── Lighting Director Subsystem ──────────────────────────────────────────────

/**
 * UKhaaosLightingDirector — Diretor de iluminação por mundo.
 *
 * No BeginPlay do mundo, garante que existam Sol + SkyLight + Névoa +
 * Atmosfera (spawnando os que faltam) e aplica o preset correto para o
 * mundo corrente. Em dedicated server/-NullRHI não faz nada (guarda de
 * runtime visual).
 *
 * Integração: estágio LIGHTING_SETUP do GraphicsPipelineManager.
 */
UCLASS()
class KHAAOSRUN_API UKhaaosLightingDirector : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void OnWorldBeginPlay(UWorld& InWorld) override;

    // ─── Preset Application ─────────────────────────────────────────────────

    /** Aplica um preset de iluminação ao rig ativo (spawnando o que faltar).
     *  Idempotente — pode ser chamado em transição de mundo ou hora do dia.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|LightingDirector")
    void ApplyLightingPreset(EKhaaosLightingPreset Preset);

    /** Mapeia nome do mundo para o preset padrão (CIGKV=Dia, Priadus=Tarde,
     *  Arukheea=NoiteNeon, Barburhen/Ckesalth=Nebulosa). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|LightingDirector")
    static EKhaaosLightingPreset AutoPresetForWorld(FName WorldName);

    /** Constrói a config completa de um preset. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|LightingDirector")
    static FKhaaosLightingPresetConfig BuildConfigForPreset(EKhaaosLightingPreset Preset);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Encontra o diretor ativo no mundo de jogo corrente (null-safe). */
    static UKhaaosLightingDirector* GetActiveForGame();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LightingDirector")
    EKhaaosLightingPreset GetCurrentPreset() const { return CurrentPreset; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LightingDirector")
    ADirectionalLight* GetSunLight() const { return SunLight; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LightingDirector")
    ASkyLight* GetSkyLight() const { return SkyLight; }

private:
    /** Garante o rig de luz completo (spawn os ausentes). Retorna false em headless. */
    bool EnsureLightingRig(UWorld& InWorld);

    /** Guarda comuns: false em dedicated server / -NullRHI / commandlet. */
    static bool IsVisualRuntime(const UWorld& World);

    /** Sol direcional com sombras e acoplamento à atmosfera. */
    UPROPERTY(Transient)
    TObjectPtr<ADirectionalLight> SunLight;

    /** Sky light (ambient capturado do céu). */
    UPROPERTY(Transient)
    TObjectPtr<ASkyLight> SkyLight;

    /** Névoa exponencial de profundidade. */
    UPROPERTY(Transient)
    TObjectPtr<AExponentialHeightFog> HeightFog;

    /** Atmosfera (espalhamento Rayleigh/Mie next-gen). */
    UPROPERTY(Transient)
    TObjectPtr<ASkyAtmosphere> SkyAtmosphere;

    /** Preset correntemente aplicado. */
    UPROPERTY(Transient)
    EKhaaosLightingPreset CurrentPreset = EKhaaosLightingPreset::DiaSolarPadrao;
};
