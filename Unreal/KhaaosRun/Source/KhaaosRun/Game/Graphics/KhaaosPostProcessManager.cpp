// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosPostProcessManager
// Species-specific post-process effects com blending e GPU budget.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosPostProcessManager.h"
#include "Engine/Engine.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"

void UKhaaosPostProcessManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Construir perfis para todas as 6 espécies
    SpeciesProfiles.Add(EKhaaosSpecies::HURAN,  BuildSpeciesPostProfile(EKhaaosSpecies::HURAN));
    SpeciesProfiles.Add(EKhaaosSpecies::KHAEL,  BuildSpeciesPostProfile(EKhaaosSpecies::KHAEL));
    SpeciesProfiles.Add(EKhaaosSpecies::VENEX,  BuildSpeciesPostProfile(EKhaaosSpecies::VENEX));
    SpeciesProfiles.Add(EKhaaosSpecies::ONITH,  BuildSpeciesPostProfile(EKhaaosSpecies::ONITH));
    SpeciesProfiles.Add(EKhaaosSpecies::ZHEERS, BuildSpeciesPostProfile(EKhaaosSpecies::ZHEERS));
    SpeciesProfiles.Add(EKhaaosSpecies::SKEETW, BuildSpeciesPostProfile(EKhaaosSpecies::SKEETW));

    UE_LOG(LogTemp, Display, TEXT("[PostProcess] Subsystem inicializado. 6 perfis de pós-processamento."));
}

void UKhaaosPostProcessManager::ActivateSpeciesEffects(EKhaaosSpecies Species, float BlendTime)
{
    const FKhaaosSpeciesPostProfile* Profile = SpeciesProfiles.Find(Species);
    if (!Profile) return;

    for (const FKhaaosPostEffectEntry& Effect : Profile->Effects)
    {
        const FName Key = MakeEffectKey(Species, Effect.EffectType);

        ActiveEffects.Add(Key, Effect);
        ActiveEffectIntensities.Add(Key, 0.0f); // Começa em 0, faz fade in
        EffectFadeTimers.Add(Key, BlendTime > 0.0f ? BlendTime : Effect.FadeInTime);

        UE_LOG(LogTemp, Verbose, TEXT("[PostProcess] Ativando efeito %s para espécie %s"),
            *UEnum::GetDisplayValueAsText(Effect.EffectType).ToString(),
            *UEnum::GetDisplayValueAsText(Species).ToString());
    }

    UE_LOG(LogTemp, Display, TEXT("[PostProcess] Efeitos ativados para %s. Custo estimado: %.2fms"),
        *UEnum::GetDisplayValueAsText(Species).ToString(), Profile->TotalGPUTimeMs);
}

void UKhaaosPostProcessManager::DeactivateSpeciesEffects(EKhaaosSpecies Species, float BlendTime)
{
    const FKhaaosSpeciesPostProfile* Profile = SpeciesProfiles.Find(Species);
    if (!Profile) return;

    for (const FKhaaosPostEffectEntry& Effect : Profile->Effects)
    {
        const FName Key = MakeEffectKey(Species, Effect.EffectType);

        if (ActiveEffects.Contains(Key))
        {
            // Iniciar fade out
            EffectFadeTimers.Add(Key, -(BlendTime > 0.0f ? BlendTime : Effect.FadeOutTime));
        }
    }
}

void UKhaaosPostProcessManager::ActivateGlobalEffect(EKhaaosPostEffectType EffectType, float Intensity, float Duration)
{
    const FName Key = MakeEffectKey(EKhaaosSpecies::NONE, EffectType);

    FKhaaosPostEffectEntry GlobalEffect;
    GlobalEffect.EffectType = EffectType;
    GlobalEffect.Species = EKhaaosSpecies::NONE;
    GlobalEffect.Intensity = Intensity;
    GlobalEffect.bIsGlobal = true;
    GlobalEffect.FadeInTime = 0.3f;
    GlobalEffect.FadeOutTime = 0.5f;
    GlobalEffect.EstimatedGPUTimeMs = 0.5f;
    GlobalEffect.Priority = 10; // Alta prioridade para efeitos globais

    ActiveEffects.Add(Key, GlobalEffect);
    ActiveEffectIntensities.Add(Key, 0.0f);
    EffectFadeTimers.Add(Key, GlobalEffect.FadeInTime);

    // Se Duration > 0, auto-desativar após Duration segundos
    if (Duration > 0.0f)
    {
        // Timer será tratado no UpdatePostProcess
        EffectFadeTimers.Add(FName(*Key.ToString() + TEXT("_AutoOff")), Duration);
    }
}

void UKhaaosPostProcessManager::UpdatePostProcess(float DeltaTime)
{
    ActiveGPUTimeMs = 0.0f;

    // Atualizar fading para todos os efeitos ativos
    TArray<FName> KeysToRemove;
    for (auto& Pair : ActiveEffectIntensities)
    {
        const FName& Key = Pair.Key;
        float& CurrentIntensity = Pair.Value;

        if (const FKhaaosPostEffectEntry* Effect = ActiveEffects.Find(Key))
        {
            if (float* FadeTimer = EffectFadeTimers.Find(Key))
            {
                if (*FadeTimer > 0.0f)
                {
                    // Fade in
                    *FadeTimer -= DeltaTime;
                    const float BlendFactor = 1.0f - FMath::Clamp(*FadeTimer / Effect->FadeInTime, 0.0f, 1.0f);
                    CurrentIntensity = Effect->Intensity * BlendFactor;
                }
                else if (*FadeTimer < 0.0f)
                {
                    // Fade out (timer negativo = fading out)
                    *FadeTimer += DeltaTime;
                    const float BlendFactor = FMath::Clamp(-(*FadeTimer) / Effect->FadeOutTime, 0.0f, 1.0f);
                    CurrentIntensity = Effect->Intensity * BlendFactor;

                    if (CurrentIntensity <= 0.01f)
                    {
                        KeysToRemove.Add(Key);
                    }
                }
            }

            // Aplicar ao post process volume
            if (CurrentIntensity > 0.01f)
            {
                ApplyEffectToPostProcessVolume(*Effect, CurrentIntensity);
                ActiveGPUTimeMs += Effect->EstimatedGPUTimeMs * CurrentIntensity;
            }
        }
    }

    // Remover efeitos que completaram fade out
    for (const FName& Key : KeysToRemove)
    {
        ActiveEffects.Remove(Key);
        ActiveEffectIntensities.Remove(Key);
        EffectFadeTimers.Remove(Key);
    }
}

const FKhaaosSpeciesPostProfile* UKhaaosPostProcessManager::GetSpeciesProfile(EKhaaosSpecies Species) const
{
    return SpeciesProfiles.Find(Species);
}

void UKhaaosPostProcessManager::OptimizeForBudget(float TargetGPUTimeMs)
{
    if (ActiveGPUTimeMs <= TargetGPUTimeMs) return;

    // Coletar efeitos ordenados por prioridade (baixa prioridade cortada primeiro)
    TArray<TPair<int32, FName>> EffectsByPriority;
    for (const auto& Pair : ActiveEffects)
    {
        EffectsByPriority.Add(TPair<int32, FName>(Pair.Value.Priority, Pair.Key));
    }

    EffectsByPriority.Sort([](const TPair<int32, FName>& A, const TPair<int32, FName>& B)
    {
        return A.Key < B.Key; // Ascending — baixa prioridade primeiro
    });

    // Cortar efeitos de baixa prioridade até ficar dentro do budget
    float RemainingCost = ActiveGPUTimeMs;
    for (const auto& Pair : EffectsByPriority)
    {
        if (RemainingCost <= TargetGPUTimeMs) break;

        if (const FKhaaosPostEffectEntry* Effect = ActiveEffects.Find(Pair.Value))
        {
            // Reduzir intensidade proporcionalmente
            const float ReductionNeeded = (RemainingCost - TargetGPUTimeMs) / Effect->EstimatedGPUTimeMs;
            const float NewIntensity = FMath::Clamp(1.0f - ReductionNeeded, 0.0f, 1.0f);

            if (NewIntensity < 0.1f)
            {
                // Desativar completamente
                EffectFadeTimers.Add(Pair.Value, -(Effect->FadeOutTime));
            }
            else
            {
                ActiveEffectIntensities.Add(Pair.Value, NewIntensity * Effect->Intensity);
            }

            RemainingCost -= Effect->EstimatedGPUTimeMs * (1.0f - NewIntensity);
        }
    }

    UE_LOG(LogTemp, Display, TEXT("[PostProcess] Budget otimizado: %.2fms -> target %.2fms"),
        ActiveGPUTimeMs, TargetGPUTimeMs);
}

bool UKhaaosPostProcessManager::IsEffectActive(EKhaaosSpecies Species, EKhaaosPostEffectType EffectType) const
{
    return ActiveEffects.Contains(MakeEffectKey(Species, EffectType));
}

void UKhaaosPostProcessManager::DumpActiveEffects() const
{
    UE_LOG(LogTemp, Display, TEXT("[PostProcess] === Efeitos Ativos (GPU: %.2fms) ==="), ActiveGPUTimeMs);
    for (const auto& Pair : ActiveEffects)
    {
        const FKhaaosPostEffectEntry& Effect = Pair.Value;
        const float Intensity = ActiveEffectIntensities.FindRef(Pair.Key);
        UE_LOG(LogTemp, Display, TEXT("  %s | Species=%s | Intensity=%.2f | GPU=%.2fms | Priority=%d"),
            *UEnum::GetDisplayValueAsText(Effect.EffectType).ToString(),
            *UEnum::GetDisplayValueAsText(Effect.Species).ToString(),
            Intensity, Effect.EstimatedGPUTimeMs, Effect.Priority);
    }
}

void UKhaaosPostProcessManager::ApplyEffectToPostProcessVolume(const FKhaaosPostEffectEntry& Effect, float CurrentIntensity)
{
    if (!GEngine) return;

    // Aplicar efeitos via CVars REAIS do UE5 + delegação ao PostProcessDirector.
    // Intensidades de grading/bloom/vignette são centralizadas no Director
    // (FPostProcessSettings) — aqui ficam apenas quality CVars e overlays.
    switch (Effect.EffectType)
    {
    case EKhaaosPostEffectType::Bloom:
        // Intensidade de bloom vive na receita do Director (FPostProcessSettings);
        // aqui apenas garantimos a qualidade.
        GEngine->Exec(nullptr, TEXT("r.BloomQuality 3"));
        break;

    case EKhaaosPostEffectType::ChromaticAberration:
        // CVar real do UE5 (range 0-5); antes usava r.SceneChromaticAberration (inexistente)
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.SceneColorFringe.Intensity %.3f"), CurrentIntensity * 1.5f));
        break;

    case EKhaaosPostEffectType::DepthOfField:
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.DepthOfFieldQuality %d"), CurrentIntensity > 0.5f ? 3 : 2));
        break;

    case EKhaaosPostEffectType::Distortion:
        // Distortion de tela (Huran underwater / Skeetw wind) requer
        // post-process material de asset — placeholder até o inventário de
        // materiais PP. Antes escrevia r.UnderwaterDistortion (inexistente).
        UE_LOG(LogTemp, Verbose, TEXT("[PostProcess] Distortion para %s aguarda PP material asset."),
            *UEnum::GetDisplayValueAsText(Effect.Species).ToString());
        break;

    case EKhaaosPostEffectType::ColorGrading:
        // REAL: tint + vignette de espécie via FPostProcessSettings do Director
        // (antes escrevia r.ColorGradingLUT, que não existe na engine)
        UKhaaosPostProcessDirector::ApplySpeciesGrade(Effect.Species);
        break;

    case EKhaaosPostEffectType::MotionBlur:
        GEngine->Exec(nullptr, *FString::Printf(TEXT("r.MotionBlurQuality %d"), CurrentIntensity > 0.5f ? 2 : 1));
        break;

    case EKhaaosPostEffectType::Vignette:
        // Vignette de espécie já é aplicada pelo Director no ApplySpeciesGrade
        // (antes escrevia r.VignetteIntensity, que não existe na engine)
        break;

    default:
        break;
    }
}

FKhaaosSpeciesPostProfile UKhaaosPostProcessManager::BuildSpeciesPostProfile(EKhaaosSpecies Species) const
{
    FKhaaosSpeciesPostProfile Profile;
    Profile.Species = Species;

    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
        Profile.Effects = {
            { EKhaaosPostEffectType::Bloom,              Species, 0.8f, 0.3f, 0.8f, 0.8f, 8, false },  // Bioluminescent bloom
            { EKhaaosPostEffectType::Distortion,         Species, 0.5f, 0.5f, 1.0f, 0.6f, 5, false },  // Underwater caustics
            { EKhaaosPostEffectType::ColorGrading,       Species, 0.3f, 0.3f, 0.5f, 0.3f, 3, false },  // Aquatic tint
            { EKhaaosPostEffectType::Vignette,           Species, 0.2f, 0.5f, 0.8f, 0.2f, 2, false },  // Depth pressure
        };
        break;

    case EKhaaosSpecies::KHAEL:
        Profile.Effects = {
            { EKhaaosPostEffectType::Bloom,              Species, 1.0f, 0.2f, 0.5f, 1.2f, 9, false },  // Arcane glow bloom (intenso)
            { EKhaaosPostEffectType::ChromaticAberration,Species, 0.4f, 0.3f, 0.6f, 0.4f, 6, false },  // Crystal refraction
            { EKhaaosPostEffectType::ColorGrading,       Species, 0.3f, 0.3f, 0.5f, 0.3f, 3, false },  // Arcane LUT
        };
        break;

    case EKhaaosSpecies::VENEX:
        Profile.Effects = {
            { EKhaaosPostEffectType::ChromaticAberration,Species, 0.6f, 0.1f, 0.3f, 0.5f, 7, false },  // Cyber implant glow
            { EKhaaosPostEffectType::Bloom,              Species, 0.5f, 0.2f, 0.4f, 0.6f, 6, false },  // Chrome reflections
            { EKhaaosPostEffectType::ColorGrading,       Species, 0.4f, 0.2f, 0.4f, 0.3f, 4, false },  // Cyber LUT
            { EKhaaosPostEffectType::Vignette,           Species, 0.3f, 0.3f, 0.5f, 0.2f, 2, false },  // HUD vignette
        };
        break;

    case EKhaaosSpecies::ONITH:
        Profile.Effects = {
            { EKhaaosPostEffectType::ColorGrading,       Species, 0.6f, 0.3f, 0.5f, 0.4f, 7, false },  // Thermal vision tint
            { EKhaaosPostEffectType::Bloom,              Species, 0.4f, 0.3f, 0.6f, 0.5f, 5, false },  // Chitin iridescence
            { EKhaaosPostEffectType::Distortion,         Species, 0.2f, 0.5f, 0.8f, 0.3f, 3, false },  // Thermal shimmer
        };
        break;

    case EKhaaosSpecies::ZHEERS:
        Profile.Effects = {
            { EKhaaosPostEffectType::Bloom,              Species, 0.5f, 0.3f, 0.6f, 0.6f, 6, false },  // Tattoo glow
            { EKhaaosPostEffectType::Vignette,           Species, 0.4f, 0.5f, 1.0f, 0.2f, 4, false },  // Shadow meld emphasis
            { EKhaaosPostEffectType::ColorGrading,       Species, 0.3f, 0.3f, 0.5f, 0.3f, 3, false },  // Shadow LUT
        };
        break;

    case EKhaaosSpecies::SKEETW:
        Profile.Effects = {
            { EKhaaosPostEffectType::Bloom,              Species, 0.7f, 0.2f, 0.5f, 0.8f, 7, false },  // Feather iridescence
            { EKhaaosPostEffectType::MotionBlur,         Species, 0.5f, 0.3f, 0.6f, 0.4f, 5, false },  // Avian motion blur
            { EKhaaosPostEffectType::Distortion,         Species, 0.3f, 0.5f, 0.8f, 0.4f, 4, false },  // Wind distortion
            { EKhaaosPostEffectType::ChromaticAberration,Species, 0.2f, 0.3f, 0.5f, 0.3f, 3, false },  // Iridescence CA
        };
        break;

    default:
        break;
    }

    // Calcular custo total
    for (const auto& Effect : Profile.Effects)
    {
        Profile.TotalGPUTimeMs += Effect.EstimatedGPUTimeMs;
    }

    return Profile;
}

FName UKhaaosPostProcessManager::MakeEffectKey(EKhaaosSpecies Species, EKhaaosPostEffectType Type)
{
    return FName(*FString::Printf(TEXT("PP_%s_%s"),
        *UEnum::GetDisplayValueAsText(Species).ToString(),
        *UEnum::GetDisplayValueAsText(Type).ToString()));
}
