// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosAtmosphereLighting
// PROPÓSITO: Gestão de atmosfera e iluminação para Battle Royale de 6 espécies
//            alienígenas (Huran/Khael/Venex/Onith/Zheers/Skeetw), almejando a
//            qualidade de iluminação quente e vibrante do Free Fire.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "KhaaosAtmosphereLighting.generated.h"

// -----------------------------------------------------------------------------
// Enums — Fases do dia e biomas do mundo
// -----------------------------------------------------------------------------

/** Fases do ciclo dia/noite — 8 momentos distintos para iluminação */
UENUM(BlueprintType)
enum class EKhaaosTimeOfDay : uint8
{
    DAWN            UMETA(DisplayName = "Amanhecer"),
    MORNING         UMETA(DisplayName = "Manhã"),
    MIDDAY          UMETA(DisplayName = "Meio-dia"),
    AFTERNOON       UMETA(DisplayName = "Tarde"),
    GOLDEN_HOUR     UMETA(DisplayName = "Hora Dourada"),
    DUSK            UMETA(DisplayName = "Entardecer"),
    NIGHT           UMETA(DisplayName = "Noite"),
    MIDNIGHT        UMETA(DisplayName = "Meia-noite")
};

/** Presets de ambiente/bioma — 8 biomas distintos do mundo Khaaos */
UENUM(BlueprintType)
enum class EKhaaosEnvironmentPreset : uint8
{
    GENERIC         UMETA(DisplayName = "Genérico"),
    DESERT          UMETA(DisplayName = "Deserto"),
    JUNGLE          UMETA(DisplayName = "Selva"),
    ARCTIC          UMETA(DisplayName = "Ártico"),
    VOLCANIC        UMETA(DisplayName = "Vulcânico"),
    URBAN           UMETA(DisplayName = "Urbano"),
    COASTAL         UMETA(DisplayName = "Costeiro"),
    UNDERGROUND     UMETA(DisplayName = "Subterrâneo")
};

// -----------------------------------------------------------------------------
// Structs — Configuração de sol, atmosfera e preset completo
// -----------------------------------------------------------------------------

/** Configuração da luz direcional (sol/lua) */
USTRUCT(BlueprintType)
struct FKhaaosSunConfig
{
    GENERATED_BODY()

    /** Direção do sol — pitch/yaw (graus) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FRotator SunDirection = FRotator(45.0f, 0.0f, 0.0f);

    /** Intensidade da luz solar (0-50 lux) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float SunIntensity = 10.0f;

    /** Temperatura de cor do sol (1500-15000 K) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float SunTemperature = 6500.0f;

    /** Cor derivada da temperatura de cor */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor SunColor = FLinearColor(1.0f, 1.0f, 0.95f, 1.0f);

    /** Se o sol projeta sombras */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bCastShadows = true;

    /** Distância de sombra (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float ShadowDistance = 200000.0f;

    /** Comprimento de contact shadows (0-1) para detalhe de perto */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float ContactShadowLength = 0.1f;
};

/** Configuração de neblina atmosférica e céu */
USTRUCT(BlueprintType)
struct FKhaaosAtmosphereConfig
{
    GENERATED_BODY()

    /** Densidade da neblina (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float FogDensity = 0.15f;

    /** Distância de início da neblina (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float FogStartDistance = 0.0f;

    /** Cor da neblina */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor FogColor = FLinearColor(0.7f, 0.75f, 0.85f, 1.0f);

    /** Intensidade da neblina volumétrica (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float VolumetricFogIntensity = 0.3f;

    /** Intensidade de dispersão volumétrica (0-10) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float VolumetricScatteringIntensity = 1.0f;

    /** Intensidade da luz do céu (0-5) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float SkyLightIntensity = 1.0f;

    /** Cor da luz do céu */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor SkyLightColor = FLinearColor(0.6f, 0.7f, 1.0f, 1.0f);

    /** Ativar nuvens volumétricas */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableVolumetricClouds = true;

    /** Densidade das nuvens (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float CloudDensity = 0.4f;

    /** Intensidade de neblina atmosférica/haze (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float HazeIntensity = 0.1f;
};

/** Preset completo de iluminação para uma combinação tempo+ambiente */
USTRUCT(BlueprintType)
struct FKhaaosLightingPreset
{
    GENERATED_BODY()

    /** Fase do dia */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosTimeOfDay TimeOfDay = EKhaaosTimeOfDay::MIDDAY;

    /** Ambiente/bioma */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosEnvironmentPreset Environment = EKhaaosEnvironmentPreset::GENERIC;

    /** Configuração do sol */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FKhaaosSunConfig Sun;

    /** Configuração atmosférica */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FKhaaosAtmosphereConfig Atmosphere;

    /** Cor da luz ambiente */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor AmbientLightColor = FLinearColor(0.3f, 0.35f, 0.5f, 1.0f);

    /** Intensidade da luz ambiente (0-5) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float AmbientLightIntensity = 0.3f;

    /** Ativar Lumen Global Illumination */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnableLumenGI = true;

    /** Qualidade do Lumen (0=Baixo, 1=Médio, 2=Alto, 3=Ultra) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 LumenQuality = 2;

    /** Compensação de exposição para pós-processo */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float ExposureCompensation = 0.0f;
};

// -----------------------------------------------------------------------------
// Subsystem — Gestão de atmosfera e iluminação
// -----------------------------------------------------------------------------

/**
 * Subsystem de engine para gestão de atmosfera e iluminação.
 * Controla ciclo dia/noite, presets de bioma, e qualidade visual
 * inspirada no Free Fire (warm, vibrant, golden-hour emphasis).
 */
UCLASS(Config=Game, defaultconfig)
class KHAAOSRUN_API UKhaaosAtmosphereLighting : public UEngineSubsystem
{
    GENERATED_BODY()

public:

    // --- Ciclo de vida do subsystem ---

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // --- API pública ---

    /** Transiciona para nova fase do dia com blending suave */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Atmosphere")
    void SetTimeOfDay(EKhaaosTimeOfDay NewTime, float BlendTime = 2.0f);

    /** Troca o preset de ambiente/bioma com blending */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Atmosphere")
    void SetEnvironment(EKhaaosEnvironmentPreset NewEnvironment, float BlendTime = 2.0f);

    /** Retorna a fase do dia atual */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Atmosphere")
    EKhaaosTimeOfDay GetCurrentTimeOfDay() const;

    /** Retorna o ambiente atual */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Atmosphere")
    EKhaaosEnvironmentPreset GetCurrentEnvironment() const;

    /** Constrói preset completo para uma combinação tempo+ambiente */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Atmosphere")
    FKhaaosLightingPreset BuildLightingPreset(EKhaaosTimeOfDay Time, EKhaaosEnvironmentPreset Env) const;

    /** Aplica um preset de iluminação ao engine com blending */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Atmosphere")
    void ApplyLightingPreset(const FKhaaosLightingPreset& Preset, float BlendTime);

    /** Avança o ciclo automático de dia/noite (chamar no Tick) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Atmosphere")
    void UpdateTimeCycle(float DeltaTime);

    /** Ativa/desativa ciclo automático de tempo */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Atmosphere")
    void SetAutoTimeCycle(bool bEnable, float CycleDurationSeconds = 300.0f);

    /** Retorna o preset ativo atual */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Atmosphere")
    const FKhaaosLightingPreset& GetActivePreset() const;

    /** Dump do estado de iluminação para debug/log */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Atmosphere|Debug")
    void DumpLightingState() const;

private:

    // --- Estado interno ---

    /** Fase do dia atual */
    EKhaaosTimeOfDay CurrentTime = EKhaaosTimeOfDay::MIDDAY;

    /** Ambiente/bioma atual */
    EKhaaosEnvironmentPreset CurrentEnvironment = EKhaaosEnvironmentPreset::GENERIC;

    /** Preset ativo (último aplicado) */
    FKhaaosLightingPreset ActivePreset;

    /** Se o ciclo automático está ativo */
    bool bAutoCycleEnabled = false;

    /** Duração do ciclo completo em segundos (amanhecer→meia-noite→amanhecer) */
    float AutoCycleDuration = 300.0f;

    /** Acumulador de tempo para o ciclo automático */
    float AutoCycleAccumulator = 0.0f;

    /** Cache de presets pré-calculados — chave = par(TimeOfDay, Environment) */
    TMap<uint32, FKhaaosLightingPreset> CachedTimePresets;

    // --- Funções auxiliares internas ---

    /** Gera chave de cache a partir de tempo+ambiente */
    static uint32 MakeCacheKey(EKhaaosTimeOfDay Time, EKhaaosEnvironmentPreset Env);

    /** Converte temperatura de cor (K) em FLinearColor aproximado */
    static FLinearColor TemperatureToColor(float TemperatureKelvin);

    /** Aplica overrides de ambiente sobre um preset base (modifica in-place) */
    void ApplyEnvironmentOverrides(FKhaaosLightingPreset& Preset, EKhaaosEnvironmentPreset Env) const;
};
