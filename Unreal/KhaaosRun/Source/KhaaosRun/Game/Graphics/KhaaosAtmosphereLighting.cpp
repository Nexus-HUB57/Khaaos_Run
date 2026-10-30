// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// IMPLEMENTAÇÃO: UKhaaosAtmosphereLighting
// Gestão de atmosfera e iluminação — ciclo dia/noite, presets de bioma,
// qualidade visual inspirada no Free Fire (warm, vibrant, golden-hour emphasis).
// ==============================================================================

#include "KhaaosAtmosphereLighting.h"
#include "Engine/Engine.h"
#include "HAL/IConsoleManager.h"

// ==============================================================================
// Constantes auxiliares
// ==============================================================================

namespace KhaaosAtmosphereConstants
{
    /** Número total de fases do dia (para cálculo do ciclo automático) */
    static constexpr int32 NumTimePhases = 8;

    /** Duração padrão do ciclo em segundos */
    static constexpr float DefaultCycleDuration = 300.0f;

    /** Blending padrão em segundos */
    static constexpr float DefaultBlendTime = 2.0f;

    /** Distância de sombra padrão (cm) */
    static constexpr float DefaultShadowDistance = 200000.0f;

    /** Contact shadow padrão */
    static constexpr float DefaultContactShadowLength = 0.1f;
}

// ==============================================================================
// UKhaaosAtmosphereLighting — Ciclo de vida
// ==============================================================================

void UKhaaosAtmosphereLighting::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Inicializar estado com Meio-dia / Genérico
    CurrentTime = EKhaaosTimeOfDay::MIDDAY;
    CurrentEnvironment = EKhaaosEnvironmentPreset::GENERIC;
    bAutoCycleEnabled = false;
    AutoCycleDuration = KhaaosAtmosphereConstants::DefaultCycleDuration;
    AutoCycleAccumulator = 0.0f;

    // Construir e cachear o preset inicial
    const uint32 InitialKey = MakeCacheKey(CurrentTime, CurrentEnvironment);
    ActivePreset = BuildLightingPreset(CurrentTime, CurrentEnvironment);
    CachedTimePresets.Add(InitialKey, ActivePreset);

    // Aplicar preset inicial sem blending
    ApplyLightingPreset(ActivePreset, 0.0f);

    UE_LOG(LogTemp, Display, TEXT("[AtmosphereLighting] Subsystem inicializado — Tempo=%s, Ambiente=%s"),
        *UEnum::GetDisplayValueAsText(CurrentTime).ToString(),
        *UEnum::GetDisplayValueAsText(CurrentEnvironment).ToString());
}

void UKhaaosAtmosphereLighting::Deinitialize()
{
    // Limpar cache de presets
    CachedTimePresets.Empty();

    // Desativar ciclo automático
    bAutoCycleEnabled = false;

    UE_LOG(LogTemp, Display, TEXT("[AtmosphereLighting] Subsystem desinicializado."));

    Super::Deinitialize();
}

// ==============================================================================
// UKhaaosAtmosphereLighting — API pública
// ==============================================================================

void UKhaaosAtmosphereLighting::SetTimeOfDay(EKhaaosTimeOfDay NewTime, float BlendTime)
{
    if (NewTime == CurrentTime)
    {
        // Mesma fase — nada a fazer
        return;
    }

    UE_LOG(LogTemp, Display, TEXT("[AtmosphereLighting] SetTimeOfDay: %s -> %s (BlendTime=%.1fs)"),
        *UEnum::GetDisplayValueAsText(CurrentTime).ToString(),
        *UEnum::GetDisplayValueAsText(NewTime).ToString(),
        BlendTime);

    CurrentTime = NewTime;

    // Reconstruir preset com o novo tempo e ambiente atual
    const FKhaaosLightingPreset NewPreset = BuildLightingPreset(CurrentTime, CurrentEnvironment);
    ActivePreset = NewPreset;

    // Cachear o preset
    const uint32 Key = MakeCacheKey(CurrentTime, CurrentEnvironment);
    CachedTimePresets.Add(Key, NewPreset);

    // Aplicar com blending
    ApplyLightingPreset(NewPreset, BlendTime);
}

void UKhaaosAtmosphereLighting::SetEnvironment(EKhaaosEnvironmentPreset NewEnvironment, float BlendTime)
{
    if (NewEnvironment == CurrentEnvironment)
    {
        // Mesmo ambiente — nada a fazer
        return;
    }

    UE_LOG(LogTemp, Display, TEXT("[AtmosphereLighting] SetEnvironment: %s -> %s (BlendTime=%.1fs)"),
        *UEnum::GetDisplayValueAsText(CurrentEnvironment).ToString(),
        *UEnum::GetDisplayValueAsText(NewEnvironment).ToString(),
        BlendTime);

    CurrentEnvironment = NewEnvironment;

    // Reconstruir preset com o tempo atual e novo ambiente
    const FKhaaosLightingPreset NewPreset = BuildLightingPreset(CurrentTime, CurrentEnvironment);
    ActivePreset = NewPreset;

    // Cachear o preset
    const uint32 Key = MakeCacheKey(CurrentTime, CurrentEnvironment);
    CachedTimePresets.Add(Key, NewPreset);

    // Aplicar com blending
    ApplyLightingPreset(NewPreset, BlendTime);
}

EKhaaosTimeOfDay UKhaaosAtmosphereLighting::GetCurrentTimeOfDay() const
{
    return CurrentTime;
}

EKhaaosEnvironmentPreset UKhaaosAtmosphereLighting::GetCurrentEnvironment() const
{
    return CurrentEnvironment;
}

const FKhaaosLightingPreset& UKhaaosAtmosphereLighting::GetActivePreset() const
{
    return ActivePreset;
}

// ==============================================================================
// UKhaaosAtmosphereLighting — BuildLightingPreset
// Constrói preset completo para cada combinação de 8 tempos x 8 biomas
// ==============================================================================

FKhaaosLightingPreset UKhaaosAtmosphereLighting::BuildLightingPreset(
    EKhaaosTimeOfDay Time, EKhaaosEnvironmentPreset Env) const
{
    // Verificar cache primeiro (lazy build on demand)
    const uint32 Key = MakeCacheKey(Time, Env);
    if (const FKhaaosLightingPreset* Cached = CachedTimePresets.Find(Key))
    {
        return *Cached;
    }

    // --- Passo 1: Configurar preset base para a fase do dia ---
    FKhaaosLightingPreset Preset;
    Preset.TimeOfDay = Time;
    Preset.Environment = Env;

    // Valores padrão de sol (serão sobrescritos por cada fase)
    Preset.Sun.bCastShadows = true;
    Preset.Sun.ShadowDistance = KhaaosAtmosphereConstants::DefaultShadowDistance;
    Preset.Sun.ContactShadowLength = KhaaosAtmosphereConstants::DefaultContactShadowLength;

    // Valores padrão de atmosfera
    Preset.Atmosphere.bEnableVolumetricClouds = true;
    Preset.Atmosphere.CloudDensity = 0.4f;
    Preset.Atmosphere.HazeIntensity = 0.1f;

    // Valores padrão de iluminação
    Preset.bEnableLumenGI = true;
    Preset.LumenQuality = 2;
    Preset.ExposureCompensation = 0.0f;
    Preset.AmbientLightColor = FLinearColor(0.3f, 0.35f, 0.5f, 1.0f);
    Preset.AmbientLightIntensity = 0.3f;

    switch (Time)
    {
    // ------------------------------------------------------------------
    // AMANHECER — Sol no horizonte, tons laranja-rosa quente
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::DAWN:
        Preset.Sun.SunDirection = FRotator(2.0f, 90.0f, 0.0f);    // pitch=2 (horizonte), yaw=leste
        Preset.Sun.SunTemperature = 3000.0f;                        // Laranja-rosa quente
        Preset.Sun.SunIntensity = 3.0f;
        Preset.Sun.SunColor = TemperatureToColor(3000.0f);
        Preset.Sun.bCastShadows = true;
        Preset.Sun.ContactShadowLength = 0.15f;

        Preset.Atmosphere.FogDensity = 0.3f;
        Preset.Atmosphere.FogStartDistance = 5000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.85f, 0.65f, 0.55f, 1.0f); // Neblina rósea
        Preset.Atmosphere.VolumetricFogIntensity = 0.5f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 1.5f;
        Preset.Atmosphere.SkyLightIntensity = 0.6f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.9f, 0.7f, 0.6f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.5f;
        Preset.Atmosphere.HazeIntensity = 0.2f;

        Preset.AmbientLightColor = FLinearColor(0.6f, 0.4f, 0.35f, 1.0f);
        Preset.AmbientLightIntensity = 0.25f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 2;
        Preset.ExposureCompensation = -0.3f;
        break;

    // ------------------------------------------------------------------
    // MANHÃ — Sol subindo, branco quente, atmosfera limpa
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::MORNING:
        Preset.Sun.SunDirection = FRotator(30.0f, 100.0f, 0.0f);
        Preset.Sun.SunTemperature = 5500.0f;                         // Branco quente
        Preset.Sun.SunIntensity = 8.0f;
        Preset.Sun.SunColor = TemperatureToColor(5500.0f);
        Preset.Sun.bCastShadows = true;
        Preset.Sun.ContactShadowLength = 0.1f;

        Preset.Atmosphere.FogDensity = 0.15f;
        Preset.Atmosphere.FogStartDistance = 10000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.75f, 0.8f, 0.85f, 1.0f);
        Preset.Atmosphere.VolumetricFogIntensity = 0.3f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 1.0f;
        Preset.Atmosphere.SkyLightIntensity = 1.0f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.6f, 0.7f, 0.9f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.3f;
        Preset.Atmosphere.HazeIntensity = 0.1f;

        Preset.AmbientLightColor = FLinearColor(0.4f, 0.45f, 0.55f, 1.0f);
        Preset.AmbientLightIntensity = 0.3f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 2;
        Preset.ExposureCompensation = 0.0f;
        break;

    // ------------------------------------------------------------------
    // MEIO-DIA — Sol no topo, branco brilhante, nuvens esparsas
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::MIDDAY:
        Preset.Sun.SunDirection = FRotator(70.0f, 180.0f, 0.0f);
        Preset.Sun.SunTemperature = 6500.0f;                          // Branco neutro/dia
        Preset.Sun.SunIntensity = 10.0f;
        Preset.Sun.SunColor = TemperatureToColor(6500.0f);
        Preset.Sun.bCastShadows = true;
        Preset.Sun.ContactShadowLength = 0.08f;

        Preset.Atmosphere.FogDensity = 0.1f;
        Preset.Atmosphere.FogStartDistance = 15000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.7f, 0.75f, 0.85f, 1.0f);
        Preset.Atmosphere.VolumetricFogIntensity = 0.2f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 0.8f;
        Preset.Atmosphere.SkyLightIntensity = 1.2f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.5f, 0.65f, 1.0f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.3f;
        Preset.Atmosphere.HazeIntensity = 0.05f;

        Preset.AmbientLightColor = FLinearColor(0.3f, 0.35f, 0.5f, 1.0f);
        Preset.AmbientLightIntensity = 0.3f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 2;
        Preset.ExposureCompensation = 0.1f;
        break;

    // ------------------------------------------------------------------
    // TARDE — Sol descendo, tons quentes suaves
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::AFTERNOON:
        Preset.Sun.SunDirection = FRotator(45.0f, 240.0f, 0.0f);
        Preset.Sun.SunTemperature = 5000.0f;                           // Quente suave
        Preset.Sun.SunIntensity = 7.0f;
        Preset.Sun.SunColor = TemperatureToColor(5000.0f);
        Preset.Sun.bCastShadows = true;
        Preset.Sun.ContactShadowLength = 0.12f;

        Preset.Atmosphere.FogDensity = 0.15f;
        Preset.Atmosphere.FogStartDistance = 10000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.8f, 0.75f, 0.7f, 1.0f);
        Preset.Atmosphere.VolumetricFogIntensity = 0.3f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 1.2f;
        Preset.Atmosphere.SkyLightIntensity = 1.0f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.7f, 0.65f, 0.6f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.35f;
        Preset.Atmosphere.HazeIntensity = 0.15f;

        Preset.AmbientLightColor = FLinearColor(0.45f, 0.4f, 0.35f, 1.0f);
        Preset.AmbientLightIntensity = 0.3f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 2;
        Preset.ExposureCompensation = 0.0f;
        break;

    // ------------------------------------------------------------------
    // HORA DOURADA — Inspirado no Free Fire! Raios dourados, dispersão alta
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::GOLDEN_HOUR:
        Preset.Sun.SunDirection = FRotator(8.0f, 270.0f, 0.0f);     // pitch=8 (quase horizonte)
        Preset.Sun.SunTemperature = 3500.0f;                          // Dourado intenso
        Preset.Sun.SunIntensity = 5.0f;
        Preset.Sun.SunColor = TemperatureToColor(3500.0f);
        Preset.Sun.bCastShadows = true;
        Preset.Sun.ContactShadowLength = 0.2f;

        Preset.Atmosphere.FogDensity = 0.25f;
        Preset.Atmosphere.FogStartDistance = 8000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.9f, 0.7f, 0.45f, 1.0f); // Neblina dourada
        Preset.Atmosphere.VolumetricFogIntensity = 0.6f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 2.0f;  // Free Fire golden hour scattering
        Preset.Atmosphere.SkyLightIntensity = 0.8f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.9f, 0.75f, 0.5f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.5f;
        Preset.Atmosphere.HazeIntensity = 0.3f;

        Preset.AmbientLightColor = FLinearColor(0.7f, 0.55f, 0.3f, 1.0f);
        Preset.AmbientLightIntensity = 0.35f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 2;
        Preset.ExposureCompensation = 0.3f;  // Boost para golden hour
        break;

    // ------------------------------------------------------------------
    // ENTARDECER — Sol no horizonte, laranja-vermelho, dispersão máxima
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::DUSK:
        Preset.Sun.SunDirection = FRotator(3.0f, 280.0f, 0.0f);
        Preset.Sun.SunTemperature = 2500.0f;                           // Laranja-vermelho
        Preset.Sun.SunIntensity = 3.0f;
        Preset.Sun.SunColor = TemperatureToColor(2500.0f);
        Preset.Sun.bCastShadows = true;
        Preset.Sun.ContactShadowLength = 0.15f;

        Preset.Atmosphere.FogDensity = 0.35f;
        Preset.Atmosphere.FogStartDistance = 5000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.85f, 0.5f, 0.35f, 1.0f); // Neblina alaranjada
        Preset.Atmosphere.VolumetricFogIntensity = 0.6f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 3.0f;      // Dispersão máxima
        Preset.Atmosphere.SkyLightIntensity = 0.5f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.8f, 0.5f, 0.35f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.5f;
        Preset.Atmosphere.HazeIntensity = 0.25f;

        Preset.AmbientLightColor = FLinearColor(0.55f, 0.35f, 0.25f, 1.0f);
        Preset.AmbientLightIntensity = 0.25f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 1;
        Preset.ExposureCompensation = -0.2f;
        break;

    // ------------------------------------------------------------------
    // NOITE — Lua, luz azulada, neblina densa
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::NIGHT:
        Preset.Sun.SunDirection = FRotator(-20.0f, 0.0f, 0.0f);     // Sol abaixo do horizonte
        Preset.Sun.SunTemperature = 9000.0f;                            // Luz de lua (azulada)
        Preset.Sun.SunIntensity = 0.5f;
        Preset.Sun.SunColor = TemperatureToColor(9000.0f);
        Preset.Sun.bCastShadows = false;                                // Lua não projeta sombras fortes
        Preset.Sun.ContactShadowLength = 0.0f;

        Preset.Atmosphere.FogDensity = 0.5f;
        Preset.Atmosphere.FogStartDistance = 2000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.15f, 0.18f, 0.3f, 1.0f); // Neblina noturna azul
        Preset.Atmosphere.VolumetricFogIntensity = 0.4f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 0.5f;
        Preset.Atmosphere.SkyLightIntensity = 0.2f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.15f, 0.2f, 0.4f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.3f;
        Preset.Atmosphere.HazeIntensity = 0.05f;

        Preset.AmbientLightColor = FLinearColor(0.15f, 0.18f, 0.35f, 1.0f);
        Preset.AmbientLightIntensity = 0.2f;
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 1;
        Preset.ExposureCompensation = -1.5f;
        break;

    // ------------------------------------------------------------------
    // MEIA-NOITE — Similar à noite, mas mais escuro
    // ------------------------------------------------------------------
    case EKhaaosTimeOfDay::MIDNIGHT:
        Preset.Sun.SunDirection = FRotator(-45.0f, 0.0f, 0.0f);     // Sol bem abaixo
        Preset.Sun.SunTemperature = 9000.0f;                            // Lua (azulada fria)
        Preset.Sun.SunIntensity = 0.3f;                                 // Ainda menos intensidade
        Preset.Sun.SunColor = TemperatureToColor(9000.0f);
        Preset.Sun.bCastShadows = false;
        Preset.Sun.ContactShadowLength = 0.0f;

        Preset.Atmosphere.FogDensity = 0.55f;
        Preset.Atmosphere.FogStartDistance = 1000.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.1f, 0.12f, 0.25f, 1.0f); // Neblina muito escura
        Preset.Atmosphere.VolumetricFogIntensity = 0.35f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 0.3f;
        Preset.Atmosphere.SkyLightIntensity = 0.1f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.1f, 0.12f, 0.3f, 1.0f);
        Preset.Atmosphere.bEnableVolumetricClouds = true;
        Preset.Atmosphere.CloudDensity = 0.2f;
        Preset.Atmosphere.HazeIntensity = 0.02f;

        Preset.AmbientLightColor = FLinearColor(0.1f, 0.12f, 0.3f, 1.0f);
        Preset.AmbientLightIntensity = 0.1f;                            // Mais escuro que noite
        Preset.bEnableLumenGI = true;
        Preset.LumenQuality = 1;
        Preset.ExposureCompensation = -2.0f;
        break;
    }

    // --- Passo 2: Aplicar overrides do ambiente/bioma ---
    ApplyEnvironmentOverrides(Preset, Env);

    return Preset;
}

// ==============================================================================
// UKhaaosAtmosphereLighting — ApplyEnvironmentOverrides
// Modifica o preset base conforme o bioma do mundo
// ==============================================================================

void UKhaaosAtmosphereLighting::ApplyEnvironmentOverrides(
    FKhaaosLightingPreset& Preset, EKhaaosEnvironmentPreset Env) const
{
    switch (Env)
    {
    // ------------------------------------------------------------------
    // DESERTO — Neblina arenosa, haze intenso, céu limpo
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::DESERT:
        Preset.Atmosphere.FogDensity *= 1.5f;
        Preset.Atmosphere.FogColor = FLinearColor(0.85f, 0.75f, 0.55f, 1.0f); // Areia
        Preset.Atmosphere.HazeIntensity = 0.5f;
        Preset.Atmosphere.CloudDensity = 0.1f;
        Preset.Atmosphere.VolumetricScatteringIntensity = FMath::Min(
            Preset.Atmosphere.VolumetricScatteringIntensity + 0.5f, 10.0f);
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.9f, 0.8f, 0.6f, 1.0f);
        Preset.ExposureCompensation += 0.2f;  // Compensar brilho da areia
        break;

    // ------------------------------------------------------------------
    // SELVA — Neblina esverdeada, volumétrica densa, nuvens pesadas
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::JUNGLE:
        Preset.Atmosphere.FogDensity *= 1.2f;
        Preset.Atmosphere.FogColor = FLinearColor(0.55f, 0.7f, 0.45f, 1.0f); // Verde
        Preset.Atmosphere.VolumetricFogIntensity = 0.8f;
        Preset.Atmosphere.CloudDensity = 0.6f;
        Preset.Atmosphere.HazeIntensity = 0.25f;
        Preset.Atmosphere.SkyLightIntensity *= 0.7f;  // Coberto pela copa
        Preset.AmbientLightColor = FLinearColor(0.25f, 0.35f, 0.2f, 1.0f);
        Preset.ExposureCompensation -= 0.2f;  // Mais sombra
        break;

    // ------------------------------------------------------------------
    // ÁRTICO — Neblina branca-azulada, céu claro
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::ARCTIC:
        Preset.Atmosphere.FogColor = FLinearColor(0.8f, 0.85f, 0.95f, 1.0f); // Branco-azulado
        Preset.Atmosphere.FogDensity *= 0.8f;
        Preset.Atmosphere.HazeIntensity = 0.3f;
        Preset.Atmosphere.VolumetricScatteringIntensity = FMath::Min(
            Preset.Atmosphere.VolumetricScatteringIntensity + 0.3f, 10.0f);
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.7f, 0.8f, 1.0f, 1.0f);
        Preset.AmbientLightColor = FLinearColor(0.4f, 0.45f, 0.6f, 1.0f);
        Preset.ExposureCompensation += 0.3f;  // Reflexo do gelo
        break;

    // ------------------------------------------------------------------
    // VULCÂNICO — Neblina vermelho-laranja, dispersão extrema, luz ambiente vermelha
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::VOLCANIC:
        Preset.Atmosphere.FogColor = FLinearColor(0.7f, 0.3f, 0.15f, 1.0f); // Vermelho-laranja
        Preset.Atmosphere.FogDensity *= 1.5f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 5.0f;
        Preset.Atmosphere.VolumetricFogIntensity = 0.7f;
        Preset.Atmosphere.HazeIntensity = 0.4f;
        Preset.AmbientLightColor = FLinearColor(0.5f, 0.2f, 0.1f, 1.0f); // Luz ambiente vermelha
        Preset.AmbientLightIntensity = FMath::Max(Preset.AmbientLightIntensity, 0.4f);
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.6f, 0.3f, 0.15f, 1.0f);
        Preset.ExposureCompensation -= 0.3f;
        break;

    // ------------------------------------------------------------------
    // URBANO — Menos neblina, mais luz ambiente, céu poluído
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::URBAN:
        Preset.Atmosphere.FogDensity *= 0.7f;
        Preset.Atmosphere.CloudDensity = 0.2f;
        Preset.Atmosphere.HazeIntensity = 0.2f;
        Preset.AmbientLightIntensity = FMath::Max(Preset.AmbientLightIntensity, 0.4f);
        Preset.Atmosphere.SkyLightIntensity *= 0.8f;
        Preset.Atmosphere.FogColor = FLinearColor(0.65f, 0.65f, 0.7f, 1.0f); // Neblina urbana cinza
        Preset.ExposureCompensation += 0.1f;
        break;

    // ------------------------------------------------------------------
    // COSTEIRO — Neblina salina, haze, dispersão moderada
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::COASTAL:
        // FogDensity *= 1.0 (sem alteração)
        Preset.Atmosphere.HazeIntensity = 0.4f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 1.5f;
        Preset.Atmosphere.FogColor = FLinearColor(0.75f, 0.8f, 0.85f, 1.0f); // Neblina salina
        Preset.Atmosphere.SkyLightIntensity *= 1.1f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.5f, 0.7f, 1.0f, 1.0f);
        Preset.ExposureCompensation += 0.1f;
        break;

    // ------------------------------------------------------------------
    // SUBTERRÂNEO — Sem sol, neblina densa, Lumen desativado
    // ------------------------------------------------------------------
    case EKhaaosEnvironmentPreset::UNDERGROUND:
        // Sem sol — desativar completamente
        Preset.Sun.SunIntensity = 0.0f;
        Preset.Sun.bCastShadows = false;
        Preset.Sun.SunColor = FLinearColor::Black;
        Preset.Sun.SunTemperature = 6500.0f;

        // Neblina densa subterrânea
        Preset.Atmosphere.FogDensity = 0.8f;
        Preset.Atmosphere.FogStartDistance = 500.0f;
        Preset.Atmosphere.FogColor = FLinearColor(0.15f, 0.15f, 0.2f, 1.0f);
        Preset.Atmosphere.VolumetricFogIntensity = 0.3f;
        Preset.Atmosphere.VolumetricScatteringIntensity = 0.2f;
        Preset.Atmosphere.bEnableVolumetricClouds = false;
        Preset.Atmosphere.CloudDensity = 0.0f;
        Preset.Atmosphere.HazeIntensity = 0.0f;
        Preset.Atmosphere.SkyLightIntensity = 0.05f;
        Preset.Atmosphere.SkyLightColor = FLinearColor(0.1f, 0.1f, 0.15f, 1.0f);

        // Luz ambiente para compensar ausência de sol
        Preset.AmbientLightIntensity = 0.5f;
        Preset.AmbientLightColor = FLinearColor(0.3f, 0.28f, 0.35f, 1.0f);

        // Lumen GI desativado (subterrâneo sem sky light)
        Preset.bEnableLumenGI = false;
        Preset.LumenQuality = 0;
        Preset.ExposureCompensation = -1.0f;
        break;

    // GENÉRICO — Sem overrides, manter preset base do tempo
    case EKhaaosEnvironmentPreset::GENERIC:
    default:
        break;
    }
}

// ==============================================================================
// UKhaaosAtmosphereLighting — ApplyLightingPreset
// Aplica preset ao engine via console commands e CVar diretas
// ==============================================================================

void UKhaaosAtmosphereLighting::ApplyLightingPreset(
    const FKhaaosLightingPreset& Preset, float BlendTime)
{
    UE_LOG(LogTemp, Display,
        TEXT("[AtmosphereLighting] ApplyLightingPreset — Tempo=%s, Ambiente=%s, BlendTime=%.1fs"),
        *UEnum::GetDisplayValueAsText(Preset.TimeOfDay).ToString(),
        *UEnum::GetDisplayValueAsText(Preset.Environment).ToString(),
        BlendTime);

    if (!GEngine)
    {
        UE_LOG(LogTemp, Warning, TEXT("[AtmosphereLighting] GEngine nulo — impossível aplicar preset."));
        return;
    }

    // --- Luz direcional (sol) ---
    // Intensidade do sol
    {
        static IConsoleVariable* CVarSunIntensity =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.DirectionalLightIntensity"));
        if (CVarSunIntensity)
        {
            CVarSunIntensity->Set(Preset.Sun.SunIntensity, ECVF_SetByConsole);
        }
    }

    // Cor do sol via exposure (aproximação — UE5 usa r.DefaultFeature.AmbientOcclusionStaticFraction
    // e exposure compensation para controlar tons quentes)
    {
        // Compensação de exposição para pós-processo
        static IConsoleVariable* CVarExposure =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.DefaultFeature.Exposure.Compensation"));
        if (CVarExposure)
        {
            CVarExposure->Set(Preset.ExposureCompensation, ECVF_SetByConsole);
        }
    }

    // --- Neblina ---
    {
        static IConsoleVariable* CVarFogDensity =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.FogDensity"));
        if (CVarFogDensity)
        {
            CVarFogDensity->Set(Preset.Atmosphere.FogDensity, ECVF_SetByConsole);
        }
    }

    // --- Neblina volumétrica ---
    {
        static IConsoleVariable* CVarVolumetricFog =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.VolumetricFog"));
        if (CVarVolumetricFog)
        {
            CVarVolumetricFog->Set(Preset.Atmosphere.VolumetricFogIntensity > 0.0f ? 1 : 0, ECVF_SetByConsole);
        }
    }

    {
        static IConsoleVariable* CVarVolumetricFogScattering =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.VolumetricFogScatteringIntensity"));
        if (CVarVolumetricFogScattering)
        {
            CVarVolumetricFogScattering->Set(
                Preset.Atmosphere.VolumetricScatteringIntensity, ECVF_SetByConsole);
        }
    }

    // --- Sky Light ---
    {
        static IConsoleVariable* CVarSkyLightIntensity =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.SkylightIntensity"));
        if (CVarSkyLightIntensity)
        {
            CVarSkyLightIntensity->Set(Preset.Atmosphere.SkyLightIntensity, ECVF_SetByConsole);
        }
    }

    // --- Lumen GI ---
    {
        static IConsoleVariable* CVarLumenGI =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.Lumen.DiffuseIndirect.Allow"));
        if (CVarLumenGI)
        {
            CVarLumenGI->Set(Preset.bEnableLumenGI ? 1 : 0, ECVF_SetByConsole);
        }
    }

    // Qualidade do Lumen (0-3)
    {
        static IConsoleVariable* CVarLumenQuality =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.Lumen.DiffuseIndirect.Quality"));
        if (CVarLumenQuality)
        {
            const int32 ClampedQuality = FMath::Clamp(Preset.LumenQuality, 0, 3);
            CVarLumenQuality->Set(ClampedQuality, ECVF_SetByConsole);
        }
    }

    // --- Contact Shadows ---
    {
        static IConsoleVariable* CVarContactShadows =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.ContactShadows"));
        if (CVarContactShadows)
        {
            CVarContactShadows->Set(
                Preset.Sun.ContactShadowLength > 0.0f ? 1 : 0, ECVF_SetByConsole);
        }
    }

    {
        static IConsoleVariable* CVarContactShadowLength =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.ContactShadows.Length"));
        if (CVarContactShadowLength)
        {
            CVarContactShadowLength->Set(Preset.Sun.ContactShadowLength, ECVF_SetByConsole);
        }
    }

    // --- Nuvens volumétricas ---
    {
        static IConsoleVariable* CVarVolumetricClouds =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.VolumetricClouds"));
        if (CVarVolumetricClouds)
        {
            CVarVolumetricClouds->Set(
                Preset.Atmosphere.bEnableVolumetricClouds ? 1 : 0, ECVF_SetByConsole);
        }
    }

    // --- Shadow distance ---
    {
        static IConsoleVariable* CVarShadowDistance =
            IConsoleManager::Get().FindConsoleVariable(TEXT("r.ShadowDistanceScale"));
        if (CVarShadowDistance)
        {
            // Normalizar para 0-1 range (200000cm = 1.0)
            const float NormalizedDist = Preset.Sun.ShadowDistance / 200000.0f;
            CVarShadowDistance->Set(FMath::Clamp(NormalizedDist, 0.0f, 1.0f), ECVF_SetByConsole);
        }
    }

    // --- Exec commands para parâmetros sem CVar direto ---
    // Direção do sol (yaw do Directional Light — requer level-specific, usar exec como aproximação)
    GEngine->Exec(nullptr, *FString::Printf(
        TEXT("r.DirectionalLightIntensity %.2f"), Preset.Sun.SunIntensity));

    // Haze via AtmosphericFog density
    GEngine->Exec(nullptr, *FString::Printf(
        TEXT("r.AtmosphericFogDensity %.3f"), Preset.Atmosphere.HazeIntensity));

    // Log de confirmação
    UE_LOG(LogTemp, Verbose,
        TEXT("[AtmosphereLighting] Preset aplicado: SunInt=%.1f, SunTemp=%.0fK, "
             "FogDens=%.2f, VolFog=%.2f, Scatt=%.1f, SkyInt=%.1f, "
             "AmbInt=%.2f, Lumen=%s, LumenQ=%d, Exposure=%.2f"),
        Preset.Sun.SunIntensity, Preset.Sun.SunTemperature,
        Preset.Atmosphere.FogDensity,
        Preset.Atmosphere.VolumetricFogIntensity,
        Preset.Atmosphere.VolumetricScatteringIntensity,
        Preset.Atmosphere.SkyLightIntensity,
        Preset.AmbientLightIntensity,
        Preset.bEnableLumenGI ? TEXT("ON") : TEXT("OFF"),
        Preset.LumenQuality,
        Preset.ExposureCompensation);
}

// ==============================================================================
// UKhaaosAtmosphereLighting — UpdateTimeCycle
// Avança o ciclo automático de dia/noite
// ==============================================================================

void UKhaaosAtmosphereLighting::UpdateTimeCycle(float DeltaTime)
{
    if (!bAutoCycleEnabled)
    {
        return;
    }

    // Acumular tempo
    AutoCycleAccumulator += DeltaTime;

    // Calcular duração de cada fase (tempo total / número de fases)
    const float PhaseDuration = AutoCycleDuration /
        static_cast<float>(KhaaosAtmosphereConstants::NumTimePhases);

    // Verificar se ultrapassou o threshold da fase atual
    if (AutoCycleAccumulator >= PhaseDuration)
    {
        AutoCycleAccumulator -= PhaseDuration;

        // Avançar para a próxima fase do dia (circular)
        int32 CurrentIndex = static_cast<int32>(CurrentTime);
        CurrentIndex = (CurrentIndex + 1) % KhaaosAtmosphereConstants::NumTimePhases;
        EKhaaosTimeOfDay NextTime = static_cast<EKhaaosTimeOfDay>(CurrentIndex);

        UE_LOG(LogTemp, Display,
            TEXT("[AtmosphereLighting] Ciclo automático: avançando de %s para %s"),
            *UEnum::GetDisplayValueAsText(CurrentTime).ToString(),
            *UEnum::GetDisplayValueAsText(NextTime).ToString());

        // Aplicar com blending suave (2s padrão para ciclo automático)
        SetTimeOfDay(NextTime, KhaaosAtmosphereConstants::DefaultBlendTime);
    }
}

// ==============================================================================
// UKhaaosAtmosphereLighting — SetAutoTimeCycle
// ==============================================================================

void UKhaaosAtmosphereLighting::SetAutoTimeCycle(bool bEnable, float CycleDurationSeconds)
{
    bAutoCycleEnabled = bEnable;

    if (bEnable)
    {
        AutoCycleDuration = FMath::Max(CycleDurationSeconds, 60.0f); // Mínimo 60s
        AutoCycleAccumulator = 0.0f; // Resetar acumulador ao ativar

        UE_LOG(LogTemp, Display,
            TEXT("[AtmosphereLighting] Ciclo automático ATIVADO — Duração=%.1fs (%.1fmin)"),
            AutoCycleDuration, AutoCycleDuration / 60.0f);
    }
    else
    {
        UE_LOG(LogTemp, Display, TEXT("[AtmosphereLighting] Ciclo automático DESATIVADO."));
    }
}

// ==============================================================================
// UKhaaosAtmosphereLighting — DumpLightingState
// ==============================================================================

void UKhaaosAtmosphereLighting::DumpLightingState() const
{
    UE_LOG(LogTemp, Display, TEXT("=============================================================="));
    UE_LOG(LogTemp, Display, TEXT("[AtmosphereLighting] DUMP DE ESTADO"));
    UE_LOG(LogTemp, Display, TEXT("=============================================================="));

    // Estado geral
    UE_LOG(LogTemp, Display, TEXT("  Tempo do dia  : %s"),
        *UEnum::GetDisplayValueAsText(CurrentTime).ToString());
    UE_LOG(LogTemp, Display, TEXT("  Ambiente      : %s"),
        *UEnum::GetDisplayValueAsText(CurrentEnvironment).ToString());
    UE_LOG(LogTemp, Display, TEXT("  Ciclo automático: %s (Duração=%.1fs, Acc=%.2fs)"),
        bAutoCycleEnabled ? TEXT("ON") : TEXT("OFF"), AutoCycleDuration, AutoCycleAccumulator);

    // Sol
    UE_LOG(LogTemp, Display, TEXT("  --- SOL ---"));
    UE_LOG(LogTemp, Display, TEXT("  Direção       : Pitch=%.1f, Yaw=%.1f"),
        ActivePreset.Sun.SunDirection.Pitch, ActivePreset.Sun.SunDirection.Yaw);
    UE_LOG(LogTemp, Display, TEXT("  Intensidade   : %.2f lux"), ActivePreset.Sun.SunIntensity);
    UE_LOG(LogTemp, Display, TEXT("  Temperatura   : %.0f K"), ActivePreset.Sun.SunTemperature);
    UE_LOG(LogTemp, Display, TEXT("  Cor           : R=%.3f G=%.3f B=%.3f"),
        ActivePreset.Sun.SunColor.R, ActivePreset.Sun.SunColor.G, ActivePreset.Sun.SunColor.B);
    UE_LOG(LogTemp, Display, TEXT("  Sombras       : %s (Dist=%.0fcm, ContactLen=%.2f)"),
        ActivePreset.Sun.bCastShadows ? TEXT("ON") : TEXT("OFF"),
        ActivePreset.Sun.ShadowDistance, ActivePreset.Sun.ContactShadowLength);

    // Atmosfera
    UE_LOG(LogTemp, Display, TEXT("  --- ATMOSFERA ---"));
    UE_LOG(LogTemp, Display, TEXT("  FogDensity    : %.3f"), ActivePreset.Atmosphere.FogDensity);
    UE_LOG(LogTemp, Display, TEXT("  FogStartDist  : %.0f cm"), ActivePreset.Atmosphere.FogStartDistance);
    UE_LOG(LogTemp, Display, TEXT("  FogColor      : R=%.3f G=%.3f B=%.3f"),
        ActivePreset.Atmosphere.FogColor.R, ActivePreset.Atmosphere.FogColor.G, ActivePreset.Atmosphere.FogColor.B);
    UE_LOG(LogTemp, Display, TEXT("  VolFog        : %.2f"), ActivePreset.Atmosphere.VolumetricFogIntensity);
    UE_LOG(LogTemp, Display, TEXT("  VolScattering : %.2f"), ActivePreset.Atmosphere.VolumetricScatteringIntensity);
    UE_LOG(LogTemp, Display, TEXT("  SkyLightInt   : %.2f"), ActivePreset.Atmosphere.SkyLightIntensity);
    UE_LOG(LogTemp, Display, TEXT("  SkyLightColor : R=%.3f G=%.3f B=%.3f"),
        ActivePreset.Atmosphere.SkyLightColor.R, ActivePreset.Atmosphere.SkyLightColor.G, ActivePreset.Atmosphere.SkyLightColor.B);
    UE_LOG(LogTemp, Display, TEXT("  VolClouds     : %s (Density=%.2f)"),
        ActivePreset.Atmosphere.bEnableVolumetricClouds ? TEXT("ON") : TEXT("OFF"),
        ActivePreset.Atmosphere.CloudDensity);
    UE_LOG(LogTemp, Display, TEXT("  HazeIntensity : %.2f"), ActivePreset.Atmosphere.HazeIntensity);

    // Iluminação
    UE_LOG(LogTemp, Display, TEXT("  --- ILUMINAÇÃO ---"));
    UE_LOG(LogTemp, Display, TEXT("  AmbientColor  : R=%.3f G=%.3f B=%.3f"),
        ActivePreset.AmbientLightColor.R, ActivePreset.AmbientLightColor.G, ActivePreset.AmbientLightColor.B);
    UE_LOG(LogTemp, Display, TEXT("  AmbientInt    : %.2f"), ActivePreset.AmbientLightIntensity);
    UE_LOG(LogTemp, Display, TEXT("  LumenGI       : %s (Quality=%d)"),
        ActivePreset.bEnableLumenGI ? TEXT("ON") : TEXT("OFF"), ActivePreset.LumenQuality);
    UE_LOG(LogTemp, Display, TEXT("  ExposureComp  : %.2f"), ActivePreset.ExposureCompensation);

    // Cache
    UE_LOG(LogTemp, Display, TEXT("  --- CACHE ---"));
    UE_LOG(LogTemp, Display, TEXT("  Presets cached: %d / 64"), CachedTimePresets.Num());

    UE_LOG(LogTemp, Display, TEXT("=============================================================="));
}

// ==============================================================================
// UKhaaosAtmosphereLighting — Auxiliares privados
// ==============================================================================

uint32 UKhaaosAtmosphereLighting::MakeCacheKey(
    EKhaaosTimeOfDay Time, EKhaaosEnvironmentPreset Env)
{
    // Combinar 2 enums uint8 em chave uint32 única
    return (static_cast<uint32>(Time) << 8) | static_cast<uint32>(Env);
}

FLinearColor UKhaaosAtmosphereLighting::TemperatureToColor(float TemperatureKelvin)
{
    // Conversão aproximada de temperatura de cor (Planckian locus) para RGB linear.
    // Baseado no algoritmo de Tanner Helland (simplificado para uso em runtime).
    // Faixa válida: 1000K - 40000K

    float Temp = FMath::Clamp(TemperatureKelvin, 1000.0f, 40000.0f);
    Temp = Temp / 100.0f;

    // Componente Vermelho
    float Red;
    if (Temp <= 66.0f)
    {
        Red = 1.0f;
    }
    else
    {
        Red = Temp - 60.0f;
        Red = 329.698727446f * FMath::Pow(Red, -0.1332047592f);
        Red = FMath::Clamp(Red / 255.0f, 0.0f, 1.0f);
    }

    // Componente Verde
    float Green;
    if (Temp <= 66.0f)
    {
        Green = 99.4708025861f * FMath::Log(Temp) - 161.1195681661f;
        Green = FMath::Clamp(Green / 255.0f, 0.0f, 1.0f);
    }
    else
    {
        Green = Temp - 60.0f;
        Green = 288.1221695283f * FMath::Pow(Green, -0.0755148492f);
        Green = FMath::Clamp(Green / 255.0f, 0.0f, 1.0f);
    }

    // Componente Azul
    float Blue;
    if (Temp >= 66.0f)
    {
        Blue = 1.0f;
    }
    else if (Temp <= 19.0f)
    {
        Blue = 0.0f;
    }
    else
    {
        Blue = Temp - 10.0f;
        Blue = 138.5177312231f * FMath::Log(Blue) - 305.0447927307f;
        Blue = FMath::Clamp(Blue / 255.0f, 0.0f, 1.0f);
    }

    return FLinearColor(Red, Green, Blue, 1.0f);
}
