// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosMaterialPipeline
// Pipeline de materiais — perfis por espécie, async streaming, e aplicação
// de material via UMaterialInstanceDynamic com parâmetros species-specific.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosMaterialPipeline.h"
#include "KhaaosRun.h"
#include "Components/SkeletalMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/Engine.h"
#include "Rendering/Texture2DResource.h"

// ─── Static Default ───────────────────────────────────────────────────────────

FKhaaosSpeciesMaterialProfile UKhaaosMaterialPipeline::DefaultProfile;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosMaterialPipeline::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Construir perfis para todas as 6 espécies na inicialização
    BuildSpeciesMaterialProfiles();

    // Configurar async streaming priorities
    ConfigureAsyncStreaming();

    UE_LOG(LogKhaaosRun, Display, TEXT("[MaterialPipeline] Subsystem inicializado. 6 perfis de espécie construídos."));
}

void UKhaaosMaterialPipeline::Deinitialize(FSubsystemCollectionBase& Collection)
{
    SpeciesProfiles.Empty();
    StreamingPriorities.Empty();

    UE_LOG(LogKhaaosRun, Display, TEXT("[MaterialPipeline] Subsystem desinicializado."));
    Super::Deinitialize(Collection);
}

// ─── Species Material Profiles ────────────────────────────────────────────────

void UKhaaosMaterialPipeline::BuildSpeciesMaterialProfiles()
{
    SpeciesProfiles.Empty();

    SpeciesProfiles.Add(EKhaaosSpecies::HURAN,  BuildSingleSpeciesProfile(EKhaaosSpecies::HURAN));
    SpeciesProfiles.Add(EKhaaosSpecies::KHAEL,  BuildSingleSpeciesProfile(EKhaaosSpecies::KHAEL));
    SpeciesProfiles.Add(EKhaaosSpecies::VENEX,  BuildSingleSpeciesProfile(EKhaaosSpecies::VENEX));
    SpeciesProfiles.Add(EKhaaosSpecies::ONITH,  BuildSingleSpeciesProfile(EKhaaosSpecies::ONITH));
    SpeciesProfiles.Add(EKhaaosSpecies::ZHEERS, BuildSingleSpeciesProfile(EKhaaosSpecies::ZHEERS));
    SpeciesProfiles.Add(EKhaaosSpecies::SKEETW, BuildSingleSpeciesProfile(EKhaaosSpecies::SKEETW));

    UE_LOG(LogKhaaosRun, Display, TEXT("[MaterialPipeline] Perfis construídos para 6 espécies."));
}

FKhaaosSpeciesMaterialProfile UKhaaosMaterialPipeline::BuildSingleSpeciesProfile(EKhaaosSpecies Species) const
{
    FKhaaosSpeciesMaterialProfile Profile;
    Profile.Species = Species;

    // Todos os perfis começam com BaseColor e ORM como passes obrigatórios
    Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::BASE_COLOR, true, 0, 0, 0, true));
    Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::ORM, true, 0, 0, 0, true));

    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
        // Huran: espécie aquática com brânquias bioluminescentes e membranas
        // - Subsurface: pele aquática translúcida (scattering de luz na água)
        // - Wet Map: mapas de umidade para efeito molhado/aquático
        // - Emissive: bioluminescência das brânquias (brilho orgânico)
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SUBSURFACE, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::WATER_WET_MAP, true, 2, 0, 2, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, true, 1, -1, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::CLEAR_COAT, false, 3, 0, 0, false));
        Profile.EmissiveIntensity = 2.5f;  // Brânquias brilham forte
        Profile.SubsurfaceColor = FLinearColor(0.2f, 0.6f, 0.8f); // Azul-aquático
        Profile.ORMOverrideRoughness = 0.35f; // Pele semi-lisa
        Profile.ORMOverrideMetallic = 0.0f;   // Não metálico
        break;

    case EKhaaosSpecies::KHAEL:
        // Khael: espécie cristalina com armadura de cristal e runas arcanas
        // - Clear Coat: armadura de cristal com reflexão especular forte
        // - Emissive: runas arcanas com glow pulsante
        // - ORM: runas metálicas (metallic alto nos padrões rúnicos)
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::CLEAR_COAT, true, 1, -1, 0, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, true, 1, -1, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SUBSURFACE, false, 3, 0, 1, false));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::WATER_WET_MAP, false, 3, 0, 0, false));
        Profile.EmissiveIntensity = 3.0f;  // Runas arcanas brilham muito
        Profile.SubsurfaceColor = FLinearColor(0.5f, 0.2f, 0.8f); // Roxo arcano
        Profile.ORMOverrideRoughness = 0.15f; // Cristal muito liso
        Profile.ORMOverrideMetallic = 0.7f;   // Runas metálicas
        break;

    case EKhaaosSpecies::VENEX:
        // Venex: espécie cybernética com implantes chrome e hologramas
        // - Clear Coat: superfície chrome com reflexões nítidas
        // - Emissive: hologramas e LEDs cybernéticos
        // - Normal: padrões cyber gravados na superfície chrome
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::CLEAR_COAT, true, 1, -1, 0, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, true, 1, -1, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SUBSURFACE, false, 3, 0, 1, false));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::WATER_WET_MAP, false, 3, 0, 0, false));
        Profile.EmissiveIntensity = 2.0f;  // Hologramas e LEDs
        Profile.SubsurfaceColor = FLinearColor(0.0f, 0.8f, 1.0f); // Cyan cyber
        Profile.ORMOverrideRoughness = 0.05f; // Chrome ultra-liso
        Profile.ORMOverrideMetallic = 0.9f;   // Altamente metálico
        break;

    case EKhaaosSpecies::ONITH:
        // Onith: espécie quitinosa com carapaça e ventes térmicos
        // - Normal: bumps de quitina na carapaça (detalhe estrutural)
        // - ORM: carapaça metálica parcial (metallic em áreas de armadura)
        // - Emissive: ventes térmicos com glow vermelho/laranja
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SUBSURFACE, false, 3, 0, 1, false));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::CLEAR_COAT, false, 3, 0, 0, false));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::WATER_WET_MAP, false, 3, 0, 0, false));
        Profile.EmissiveIntensity = 1.8f;  // Ventes térmicos
        Profile.SubsurfaceColor = FLinearColor(0.8f, 0.3f, 0.1f); // Laranja térmico
        Profile.ORMOverrideRoughness = 0.5f;  // Carapaça semi-rugosa
        Profile.ORMOverrideMetallic = 0.4f;   // Parcialmente metálica
        Profile.ORMOverrideOcclusion = 0.8f;  // Carapaça oclui bastante
        break;

    case EKhaaosSpecies::ZHEERS:
        // Zheers: espécie orgânica com orelhas grandes e tatuagens tribais
        // - Subsurface: tecido auricular translúcido (orelhas finas)
        // - Emissive: tatuagens tribais com glow espiritual
        // - ORM: material orgânico (roughness variado, não metálico)
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SUBSURFACE, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::CLEAR_COAT, false, 3, 0, 0, false));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::WATER_WET_MAP, false, 3, 0, 0, false));
        Profile.EmissiveIntensity = 1.5f;  // Tatuagens com glow suave
        Profile.SubsurfaceColor = FLinearColor(0.8f, 0.5f, 0.3f); // Pele quente
        Profile.ORMOverrideRoughness = 0.6f;  // Pele orgânica
        Profile.ORMOverrideMetallic = 0.0f;   // Não metálico
        break;

    case EKhaaosSpecies::SKEETW:
        // Skeetw: espécie aviária com plumas e bico
        // - Subsurface: barba de pena translúcida (barbs das plumas)
        // - Normal: direção de pena para anisotropic lighting
        // - Emissive: iridescência das plumas (mudança de cor com ângulo)
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SUBSURFACE, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, -1, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, true, 1, -1, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::CLEAR_COAT, false, 3, 0, 0, false));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::WATER_WET_MAP, false, 3, 0, 0, false));
        Profile.EmissiveIntensity = 1.2f;  // Iridescência sutil
        Profile.SubsurfaceColor = FLinearColor(0.6f, 0.8f, 0.4f); // Verde-pena
        Profile.ORMOverrideRoughness = 0.4f;  // Plumas semi-lisas
        Profile.ORMOverrideMetallic = 0.0f;   // Não metálico
        break;

    default:
        // Perfil genérico com passes básicos
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::NORMAL_MAP, true, 1, 0, 1, true));
        Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::EMISSIVE, false, 2, 0, 1, false));
        Profile.EmissiveIntensity = 1.0f;
        break;
    }

    // Adicionar pass SPECIES_TRAIT para todas as espécies (dados customizados)
    Profile.Passes.Add(MakePassConfig(EKhaaosMaterialPass::SPECIES_TRAIT, true, 2, 1, 0, true));

    return Profile;
}

// ─── Material Application ─────────────────────────────────────────────────────

void UKhaaosMaterialPipeline::ApplyMaterialProfile(USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species)
{
    if (!MeshComp)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialPipeline] ApplyMaterialProfile: MeshComp nulo."));
        return;
    }

    const FKhaaosSpeciesMaterialProfile* Profile = SpeciesProfiles.Find(Species);
    if (!Profile)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialPipeline] Perfil não encontrado para espécie %s."),
            *UEnum::GetDisplayValueAsText(Species).ToString());
        return;
    }

    // Criar MaterialInstanceDynamic para o material principal (slot 0)
    UMaterialInstanceDynamic* MID = MeshComp->CreateAndSetMID_Gameplay(0);
    if (!MID)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[MaterialPipeline] Falha ao criar MID para espécie %s."),
            *UEnum::GetDisplayValueAsText(Species).ToString());
        return;
    }

    // ── Aplicar parâmetros de Emissive ─────────────────────────────────────
    if (IsPassEnabled(Species, EKhaaosMaterialPass::EMISSIVE))
    {
        MID->SetScalarParameterValue(FName("EmissiveIntensity"), Profile->EmissiveIntensity);
    }
    else
    {
        MID->SetScalarParameterValue(FName("EmissiveIntensity"), 0.0f);
    }

    // ── Aplicar parâmetros de Subsurface ───────────────────────────────────
    if (IsPassEnabled(Species, EKhaaosMaterialPass::SUBSURFACE))
    {
        MID->SetVectorParameterValue(FName("SubsurfaceColor"), Profile->SubsurfaceColor);
        MID->SetScalarParameterValue(FName("SubsurfaceStrength"), 1.0f);
    }
    else
    {
        MID->SetScalarParameterValue(FName("SubsurfaceStrength"), 0.0f);
    }

    // ── Aplicar parâmetros de ORM (Occlusion/Roughness/Metallic) ───────────
    if (Profile->ORMOverrideRoughness >= 0.0f)
    {
        MID->SetScalarParameterValue(FName("RoughnessOverride"), Profile->ORMOverrideRoughness);
    }
    if (Profile->ORMOverrideMetallic >= 0.0f)
    {
        MID->SetScalarParameterValue(FName("MetallicOverride"), Profile->ORMOverrideMetallic);
    }
    if (Profile->ORMOverrideOcclusion >= 0.0f)
    {
        MID->SetScalarParameterValue(FName("OcclusionOverride"), Profile->ORMOverrideOcclusion);
    }

    // ── Aplicar parâmetros de Clear Coat ───────────────────────────────────
    if (IsPassEnabled(Species, EKhaaosMaterialPass::CLEAR_COAT))
    {
        MID->SetScalarParameterValue(FName("ClearCoatStrength"), 1.0f);
        MID->SetScalarParameterValue(FName("ClearCoatRoughness"), 0.05f);
    }
    else
    {
        MID->SetScalarParameterValue(FName("ClearCoatStrength"), 0.0f);
    }

    // ── Aplicar parâmetros de Water Wet Map ────────────────────────────────
    if (IsPassEnabled(Species, EKhaaosMaterialPass::WATER_WET_MAP))
    {
        MID->SetScalarParameterValue(FName("WetMapStrength"), 1.0f);
    }
    else
    {
        MID->SetScalarParameterValue(FName("WetMapStrength"), 0.0f);
    }

    // ── Flag de espécie para material ──────────────────────────────────────
    MID->SetScalarParameterValue(FName("SpeciesID"), static_cast<float>(Species));

    UE_LOG(LogKhaaosRun, Display, TEXT("[MaterialPipeline] Perfil aplicado para %s: Emissive=%.1f Subsurface=%s ClearCoat=%s WetMap=%s"),
        *UEnum::GetDisplayValueAsText(Species).ToString(),
        Profile->EmissiveIntensity,
        IsPassEnabled(Species, EKhaaosMaterialPass::SUBSURFACE) ? TEXT("SIM") : TEXT("NÃO"),
        IsPassEnabled(Species, EKhaaosMaterialPass::CLEAR_COAT) ? TEXT("SIM") : TEXT("NÃO"),
        IsPassEnabled(Species, EKhaaosMaterialPass::WATER_WET_MAP) ? TEXT("SIM") : TEXT("NÃO"));
}

// ─── Async Streaming Configuration ────────────────────────────────────────────

void UKhaaosMaterialPipeline::ConfigureAsyncStreaming()
{
    StreamingPriorities.Empty();

    // Texture groups com prioridades de streaming (maior = stream primeiro)
    // Group 0: CharacterDiffuse (prioridade máxima — sempre visível)
    // Group 1: CharacterNormal/Emissive (alta prioridade)
    // Group 2: VFXTexture (média prioridade)
    // Group 3: WeaponDiffuse/Normal (média-baixa)
    // Group 4: Environment (baixa prioridade — stream em background)
    // Group 5: UI (mínima — não precisa de alta resolução)
    // Group 6: LODFallback (mínima — placeholder)

    StreamingPriorities.Add(0, 1.0f);   // CharacterDiffuse — prioridade máxima
    StreamingPriorities.Add(1, 0.85f);  // CharacterNormal/Emissive
    StreamingPriorities.Add(2, 0.65f);  // VFXTexture
    StreamingPriorities.Add(3, 0.50f);  // WeaponDiffuse/Normal
    StreamingPriorities.Add(4, 0.35f);  // Environment
    StreamingPriorities.Add(5, 0.20f);  // UI
    StreamingPriorities.Add(6, 0.10f);  // LODFallback

    // Aplicar configurações de streaming via console commands
    if (GEngine)
    {
        // Habilitar streaming assíncrono de textura
        GEngine->Exec(nullptr, TEXT("r.TextureStreaming 1"));
        GEngine->Exec(nullptr, TEXT("r.Streaming.PoolSize 2048"));        // 2GB pool padrão
        GEngine->Exec(nullptr, TEXT("r.Streaming.UseTexturePoolDebug 0")); // Desativar debug em produção
        GEngine->Exec(nullptr, TEXT("r.Streaming.FullyLoadUsedTextures 1")); // Pre-load texturas em uso
        GEngine->Exec(nullptr, TEXT("r.Streaming.MaxNumTexturesToLoadPerFrame 4")); // Limitar load por frame
        GEngine->Exec(nullptr, TEXT("r.Streaming.MipCalculationMethod 2")); // Mip calc: balance
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[MaterialPipeline] Async streaming configurado — 7 texture groups com prioridades."));
}

// ─── Query ────────────────────────────────────────────────────────────────────

const FKhaaosSpeciesMaterialProfile& UKhaaosMaterialPipeline::GetSpeciesMaterialProfile(EKhaaosSpecies Species) const
{
    const FKhaaosSpeciesMaterialProfile* Profile = SpeciesProfiles.Find(Species);
    return Profile ? *Profile : DefaultProfile;
}

bool UKhaaosMaterialPipeline::GetMaterialPassConfig(EKhaaosSpecies Species, EKhaaosMaterialPass Pass, FKhaaosMaterialPassConfig& OutConfig) const
{
    const FKhaaosSpeciesMaterialProfile* Profile = SpeciesProfiles.Find(Species);
    if (!Profile) return false;

    for (const FKhaaosMaterialPassConfig& PassConfig : Profile->Passes)
    {
        if (PassConfig.Pass == Pass)
        {
            OutConfig = PassConfig;
            return true;
        }
    }

    return false;
}

bool UKhaaosMaterialPipeline::IsPassEnabled(EKhaaosSpecies Species, EKhaaosMaterialPass Pass) const
{
    const FKhaaosSpeciesMaterialProfile* Profile = SpeciesProfiles.Find(Species);
    if (!Profile) return false;

    for (const FKhaaosMaterialPassConfig& PassConfig : Profile->Passes)
    {
        if (PassConfig.Pass == Pass)
        {
            return PassConfig.bEnabled;
        }
    }

    return false; // Pass não encontrado = desabilitado
}

void UKhaaosMaterialPipeline::DumpMaterialProfiles() const
{
    UE_LOG(LogKhaaosRun, Display, TEXT("[MaterialPipeline] === Species Material Profiles ==="));

    for (const auto& Pair : SpeciesProfiles)
    {
        const FKhaaosSpeciesMaterialProfile& Profile = Pair.Value;
        UE_LOG(LogKhaaosRun, Display, TEXT("  %s: %d passes, Emissive=%.1f, Subsurface=(%.2f,%.2f,%.2f), Rough=%.2f, Metal=%.2f"),
            *UEnum::GetDisplayValueAsText(Profile.Species).ToString(),
            Profile.Passes.Num(),
            Profile.EmissiveIntensity,
            Profile.SubsurfaceColor.R, Profile.SubsurfaceColor.G, Profile.SubsurfaceColor.B,
            Profile.ORMOverrideRoughness,
            Profile.ORMOverrideMetallic);

        for (const FKhaaosMaterialPassConfig& PassConfig : Profile.Passes)
        {
            UE_LOG(LogKhaaosRun, Display, TEXT("    Pass %s: Enabled=%s Group=%d MipBias=%d Async=%s"),
                *UEnum::GetDisplayValueAsText(PassConfig.Pass).ToString(),
                PassConfig.bEnabled ? TEXT("SIM") : TEXT("NÃO"),
                PassConfig.TextureGroup,
                PassConfig.MipBias,
                PassConfig.bStreamAsync ? TEXT("SIM") : TEXT("NÃO"));
        }
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

FKhaaosMaterialPassConfig UKhaaosMaterialPipeline::MakePassConfig(
    EKhaaosMaterialPass Pass, bool bEnabled, int32 TextureGroup,
    int32 MipBias, int32 CompressionSetting, bool bStreamAsync) const
{
    FKhaaosMaterialPassConfig Config;
    Config.Pass = Pass;
    Config.bEnabled = bEnabled;
    Config.TextureGroup = TextureGroup;
    Config.MipBias = MipBias;
    Config.CompressionSetting = CompressionSetting;
    Config.bStreamAsync = bStreamAsync;
    return Config;
}
