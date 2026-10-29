// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
//
// KhaaosGraphicsV3Spec.cpp — Testes de automação da v3 gráfica:
//   1. Receitas de mood válidas (ranges clamp, valores positivos)
//   2. Mapeamento mundo -> mood e mundo -> preset de luz
//   3. Perfis de rim por espécie (identidade visual do elenco)
//   4. Pipeline v3 com 7 estágios
//   5. WriteRecipeToSettings traduz receita para FPostProcessSettings real
//   6. Overlay de espécie acumula vignette corretamente
//
// Testes de lógica pura — não requerem world nem render.

#pragma once

#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/Graphics/KhaaosPostProcessDirector.h"
#include "Game/Graphics/KhaaosLightingDirector.h"
#include "Game/Graphics/KhaaosCharacterPopComponent.h"
#include "Game/Graphics/KhaaosGraphicsPipelineManager.h"

// ─── 1. Receitas de mood ──────────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosGraphicsV3_MoodRecipes_Valid,
    "Khaaos.GraphicsV3.MoodRecipes.Valid",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosGraphicsV3_MoodRecipes_Valid::RunTest(const FString& Parameters)
{
    // Todas as receitas devem nascer dentro dos ranges de clamp
    const TArray<EKhaaosWorldMood> Moods = {
        EKhaaosWorldMood::PadraoBattle,
        EKhaaosWorldMood::NoiteNeon,
        EKhaaosWorldMood::NebulosaAlien,
        EKhaaosWorldMood::AmanhecerVenenoso,
        EKhaaosWorldMood::LowEndLeve
    };

    for (const EKhaaosWorldMood Mood : Moods)
    {
        const FKhaaosPostProcessRecipe Recipe = UKhaaosPostProcessDirector::BuildRecipeForMood(Mood);

        TestTrue(FString::Printf(TEXT("%s: ExposureBias range"),
                *UEnum::GetDisplayValueAsText(Mood).ToString()),
            Recipe.ExposureBias >= -4.0f && Recipe.ExposureBias <= 4.0f);
        TestTrue(TEXT("FilmSlope range"), Recipe.FilmSlope > 0.0f && Recipe.FilmSlope <= 2.0f);
        TestTrue(TEXT("Saturation >= 1.0 (punchy)"), Recipe.Saturation >= 1.0f && Recipe.Saturation <= 2.0f);
        TestTrue(TEXT("Contrast >= 1.0"), Recipe.Contrast >= 1.0f && Recipe.Contrast <= 2.0f);
        TestTrue(TEXT("BloomIntensity range"), Recipe.BloomIntensity >= 0.0f && Recipe.BloomIntensity <= 4.0f);
        TestTrue(TEXT("BloomThreshold range"), Recipe.BloomThreshold >= 0.0f && Recipe.BloomThreshold <= 2.0f);
        TestTrue(TEXT("Vignette range"), Recipe.VignetteIntensity >= 0.0f && Recipe.VignetteIntensity <= 1.0f);
        TestTrue(TEXT("Sharpen range"), Recipe.Sharpen >= 0.0f && Recipe.Sharpen <= 1.0f);
        TestTrue(TEXT("Grain zerado (look limpo mobile)"), Recipe.FilmGrainIntensity == 0.0f);
    }

    // Assinatura Free Fire: PadraoBattle saturado e claro
    const FKhaaosPostProcessRecipe Signature = UKhaaosPostProcessDirector::BuildRecipeForMood(EKhaaosWorldMood::PadraoBattle);
    TestTrue(TEXT("Assinatura FF: saturação > 1.15"), Signature.Saturation > 1.15f);
    TestTrue(TEXT("Assinatura FF: exposição positiva (claro)"), Signature.ExposureBias > 0.0f);
    TestTrue(TEXT("Assinatura FF: tonemapper contraste (slope < 1.0)"), Signature.FilmSlope < 1.0f);

    return true;
}

// ─── 2. Mapeamento de mundos ──────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosGraphicsV3_WorldMapping_Correct,
    "Khaaos.GraphicsV3.WorldMapping.Correct",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosGraphicsV3_WorldMapping_Correct::RunTest(const FString& Parameters)
{
    // Mood por mundo
    TestEqual(TEXT("CIGKV -> PadraoBattle"),
        static_cast<int32>(UKhaaosPostProcessDirector::AutoMoodForWorld(FName(TEXT("CIGKV")))),
        static_cast<int32>(EKhaaosWorldMood::PadraoBattle));
    TestEqual(TEXT("Arukheea -> NoiteNeon"),
        static_cast<int32>(UKhaaosPostProcessDirector::AutoMoodForWorld(FName(TEXT("Arukheea")))),
        static_cast<int32>(EKhaaosWorldMood::NoiteNeon));
    TestEqual(TEXT("Ckesalth -> NebulosaAlien"),
        static_cast<int32>(UKhaaosPostProcessDirector::AutoMoodForWorld(FName(TEXT("Ckesalth")))),
        static_cast<int32>(EKhaaosWorldMood::NebulosaAlien));
    TestEqual(TEXT("Barburhen -> AmanhecerVenenoso"),
        static_cast<int32>(UKhaaosPostProcessDirector::AutoMoodForWorld(FName(TEXT("L_Barburhen")))),
        static_cast<int32>(EKhaaosWorldMood::AmanhecerVenenoso));
    TestEqual(TEXT("Mundo desconhecido -> PadraoBattle (fallback)"),
        static_cast<int32>(UKhaaosPostProcessDirector::AutoMoodForWorld(FName(TEXT("MundoInvalido")))),
        static_cast<int32>(EKhaaosWorldMood::PadraoBattle));

    // Preset de luz por mundo
    TestEqual(TEXT("CIGKV -> DiaSolarPadrao"),
        static_cast<int32>(UKhaaosLightingDirector::AutoPresetForWorld(FName(TEXT("CIGKV")))),
        static_cast<int32>(EKhaaosLightingPreset::DiaSolarPadrao));
    TestEqual(TEXT("Priadus -> TardeDourada"),
        static_cast<int32>(UKhaaosLightingDirector::AutoPresetForWorld(FName(TEXT("Priadus")))),
        static_cast<int32>(EKhaaosLightingPreset::TardeDourada));
    TestEqual(TEXT("Arukheea -> NoiteNeon"),
        static_cast<int32>(UKhaaosLightingDirector::AutoPresetForWorld(FName(TEXT("Arukheea")))),
        static_cast<int32>(EKhaaosLightingPreset::NoiteNeon));
    TestEqual(TEXT("Barburhen -> NebulosaVioleta"),
        static_cast<int32>(UKhaaosLightingDirector::AutoPresetForWorld(FName(TEXT("Barburhen")))),
        static_cast<int32>(EKhaaosLightingPreset::NebulosaVioleta));

    return true;
}

// ─── 3. Presets de iluminação ─────────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosGraphicsV3_LightingPresets_Valid,
    "Khaaos.GraphicsV3.LightingPresets.Valid",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosGraphicsV3_LightingPresets_Valid::RunTest(const FString& Parameters)
{
    const TArray<EKhaaosLightingPreset> Presets = {
        EKhaaosLightingPreset::DiaSolarPadrao,
        EKhaaosLightingPreset::TardeDourada,
        EKhaaosLightingPreset::NoiteNeon,
        EKhaaosLightingPreset::NebulosaVioleta
    };

    for (const EKhaaosLightingPreset Preset : Presets)
    {
        const FKhaaosLightingPresetConfig Config = UKhaaosLightingDirector::BuildConfigForPreset(Preset);
        const FString PresetName = UEnum::GetDisplayValueAsText(Preset).ToString();

        TestTrue(FString::Printf(TEXT("%s: sol dentro do range"), *PresetName),
            Config.SunIntensityLux > 0.0f && Config.SunIntensityLux <= 50.0f);
        TestTrue(FString::Printf(TEXT("%s: pitch válido"), *PresetName),
            Config.SunPitchDeg >= 5.0f && Config.SunPitchDeg <= 89.0f);
        TestTrue(FString::Printf(TEXT("%s: cascatas 1-4"), *PresetName),
            Config.ShadowCascades >= 1 && Config.ShadowCascades <= 4);
        TestTrue(FString::Printf(TEXT("%s: névoa positiva"), *PresetName),
            Config.FogDensity > 0.0f && Config.FogDensity <= 0.3f);
        TestTrue(FString::Printf(TEXT("%s: inscattering com alpha 1"), *PresetName),
            FMath::IsNearlyEqual(Config.FogInscatteringLuminance.A, 1.0f));
        TestTrue(FString::Printf(TEXT("%s: skylight não nula"), *PresetName),
            Config.SkyLightIntensity > 0.0f);
    }

    // Noite Neon deve ser muito mais escura que o Dia Solar (assinatura FF diurna)
    const float DaySun = UKhaaosLightingDirector::BuildConfigForPreset(EKhaaosLightingPreset::DiaSolarPadrao).SunIntensityLux;
    const float NightSun = UKhaaosLightingDirector::BuildConfigForPreset(EKhaaosLightingPreset::NoiteNeon).SunIntensityLux;
    TestTrue(TEXT("Noite Neon >> mais escura que Dia Solar"), NightSun < DaySun * 0.2f);

    return true;
}

// ─── 4. Perfis de rim por espécie ─────────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosGraphicsV3_SpeciesRim_Identified,
    "Khaaos.GraphicsV3.SpeciesRim.Identified",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosGraphicsV3_SpeciesRim_Identified::RunTest(const FString& Parameters)
{
    const TArray<EKhaaosSpecies> SpeciesList = {
        EKhaaosSpecies::HURAN, EKhaaosSpecies::KHAEL, EKhaaosSpecies::VENEX,
        EKhaaosSpecies::ONITH, EKhaaosSpecies::ZHEERS, EKhaaosSpecies::SKEETW
    };

    TArray<FLinearColor> SeenColors;

    for (const EKhaaosSpecies Species : SpeciesList)
    {
        FLinearColor Color = FLinearColor::White;
        float Intensity = 0.0f;
        UKhaaosCharacterPopComponent::GetSpeciesRimProfile(Species, Color, Intensity);

        const FString SpeciesName = UEnum::GetDisplayValueAsText(Species).ToString();
        TestTrue(FString::Printf(TEXT("%s: intensidade de rim > 0"), *SpeciesName), Intensity > 0.0f);
        TestTrue(FString::Printf(TEXT("%s: cor não é branca default"), *SpeciesName),
            !Color.Equals(FLinearColor::White));
        TestTrue(FString::Printf(TEXT("%s: cor com alpha 1"), *SpeciesName),
            FMath::IsNearlyEqual(Color.A, 1.0f));

        // Cores devem ser únicas por espécie (identidade visual)
        const bool bDuplicate = SeenColors.ContainsByPredicate([&Color](const FLinearColor& Existing)
        {
            return Existing.Equals(Color);
        });
        TestFalse(FString::Printf(TEXT("%s: cor de rim duplicada no elenco"), *SpeciesName), bDuplicate);
        SeenColors.Add(Color);
    }

    // NONE não tem rim
    FLinearColor NoneColor;
    float NoneIntensity = 1.0f;
    UKhaaosCharacterPopComponent::GetSpeciesRimProfile(EKhaaosSpecies::NONE, NoneColor, NoneIntensity);
    TestTrue(TEXT("NONE: rim zero"), FMath::IsNearlyEqual(NoneIntensity, 0.0f));

    return true;
}

// ─── 5. Pipeline com 7 estágios (v3) ──────────────────────────────────────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosGraphicsV3_PipelineStages_SevenStages,
    "Khaaos.GraphicsV3.PipelineStages.SevenStages",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosGraphicsV3_PipelineStages_SevenStages::RunTest(const FString& Parameters)
{
    // v3: POST_PROCESS_SETUP (4) e LIGHTING_SETUP (5) entre calibração e runtime
    TestEqual(TEXT("POST_PROCESS_SETUP == 4"),
        static_cast<int32>(EKhaaosPipelineStage::POST_PROCESS_SETUP), 4);
    TestEqual(TEXT("LIGHTING_SETUP == 5"),
        static_cast<int32>(EKhaaosPipelineStage::LIGHTING_SETUP), 5);
    TestEqual(TEXT("HOT_RELOAD == 6 (7 estágios no total)"),
        static_cast<int32>(EKhaaosPipelineStage::HOT_RELOAD), 6);

    return true;
}

// ─── 6. WriteRecipeToSettings traduz para FPostProcessSettings real ──────────

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKhaaosGraphicsV3_WriteRecipe_RealSettings,
    "Khaaos.GraphicsV3.WriteRecipe.RealSettings",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosGraphicsV3_WriteRecipe_RealSettings::RunTest(const FString& Parameters)
{
    const FKhaaosPostProcessRecipe Recipe = UKhaaosPostProcessDirector::BuildRecipeForMood(EKhaaosWorldMood::PadraoBattle);

    FPostProcessSettings Settings;
    const FLinearColor NoSpeciesTint = FLinearColor::White;
    UKhaaosPostProcessDirector::WriteRecipeToSettings(Recipe, NoSpeciesTint, 0.0f, Settings);

    // Overrides reais marcados — não CVars fake
    TestTrue(TEXT("bOverride_FilmSlope marcado"), Settings.bOverride_FilmSlope);
    TestTrue(TEXT("bOverride_ColorSaturation marcado"), Settings.bOverride_ColorSaturation);
    TestTrue(TEXT("bOverride_SceneColorTint marcado"), Settings.bOverride_SceneColorTint);
    TestTrue(TEXT("bOverride_BloomIntensity marcado"), Settings.bOverride_BloomIntensity);
    TestTrue(TEXT("bOverride_VignetteIntensity marcado"), Settings.bOverride_VignetteIntensity);
    TestTrue(TEXT("bOverride_AutoExposureMinBrightness marcado"), Settings.bOverride_AutoExposureMinBrightness);
    TestTrue(TEXT("bOverride_AutoExposureMaxBrightness marcado"), Settings.bOverride_AutoExposureMaxBrightness);

    // Valores traduzidos
    TestTrue(TEXT("FilmSlope traduzido"), FMath::IsNearlyEqual(Settings.FilmSlope, Recipe.FilmSlope));
    TestTrue(TEXT("Vignette sem espécie = recipe"), FMath::IsNearlyEqual(Settings.VignetteIntensity, Recipe.VignetteIntensity));

    // Exposição fixa: Min == Max (histograma colapsado)
    TestTrue(TEXT("Exposição fixa: Min == Max"),
        FMath::IsNearlyEqual(Settings.AutoExposureMinBrightness, Settings.AutoExposureMaxBrightness));

    // Overlay de espécie acumlula vignette e multiplica tint
    const FLinearColor ThermalTint = UKhaaosPostProcessDirector::GetSpeciesTint(EKhaaosSpecies::ONITH);
    FPostProcessSettings SpeciesSettings;
    UKhaaosPostProcessDirector::WriteRecipeToSettings(Recipe, ThermalTint, 0.18f, SpeciesSettings);

    TestTrue(TEXT("Vignette de espécie acumula (+0.18)"),
        FMath::IsNearlyEqual(SpeciesSettings.VignetteIntensity, Recipe.VignetteIntensity + 0.18f, 0.001f));
    TestTrue(TEXT("Tint multiplicado pelo overlay térmico"),
        FMath::IsNearlyEqual(SpeciesSettings.SceneColorTint.R, Recipe.SceneTint.R * ThermalTint.R, 0.001f));

    return true;
}
