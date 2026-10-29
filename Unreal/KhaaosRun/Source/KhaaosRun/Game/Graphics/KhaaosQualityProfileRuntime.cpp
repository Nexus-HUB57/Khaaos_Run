// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosQualityProfileRuntime
// Per-player quality overrides com integração de console commands, backup/restore
// de perfil global, e modo espectador/killcam com LOD forçado alto.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosQualityProfileRuntime.h"
#include "KhaaosRun.h"
#include "Game/Graphics/KhaaosGraphicsPresetSubsystem.h"
#include "Engine/Engine.h"
#include "HAL/IConsoleManager.h"

// ─── Construction & Lifecycle ──────────────────────────────────────────────────

UKhaaosQualityProfileRuntime::UKhaaosQualityProfileRuntime()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UKhaaosQualityProfileRuntime::BeginPlay()
{
    Super::BeginPlay();

    // Inicializar backup com valores padrão do preset global
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine ? GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>() : nullptr;
    if (PresetSubsystem)
    {
        const FKhaaosGraphicsProfile& Profile = PresetSubsystem->GetCurrentProfile();
        GlobalProfileBackup.ViewDistScale = Profile.ViewDistanceScale;
        GlobalProfileBackup.VFXIntensity = Profile.VFXBudgetPercent;
        GlobalProfileBackup.ShadowDetail = static_cast<int32>(Profile.ShadowQuality);
        GlobalProfileBackup.PostProcessIntensity = 1.0f;
        GlobalProfileBackup.bForceHighLOD = false;
    }

    UE_LOG(LogKhaaosRun, Display, TEXT("[QualityProfileRuntime] Component inicializado para jogador."));
}

void UKhaaosQualityProfileRuntime::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    // Restaurar perfil global ao sair
    if (bHasOverride)
    {
        ResetToGlobal();
    }

    Super::EndPlay(EndPlayReason);
}

// ─── Quality Override ──────────────────────────────────────────────────────────

void UKhaaosQualityProfileRuntime::ApplyOverride(const FKhaaosPlayerQualityOverride& Override)
{
    // Backup dos valores globais antes de aplicar override
    if (!bHasOverride)
    {
        BackupGlobalValues();
    }

    OverrideProfile = Override;
    bHasOverride = true;

    // Aplicar ao console do UE5
    ApplyOverrideToConsole(Override);

    UE_LOG(LogKhaaosRun, Display, TEXT("[QualityProfileRuntime] Override aplicado: ViewDist=%.2f VFX=%.2f Shadow=%d PP=%.2f ForceLOD=%s"),
        Override.ViewDistScale, Override.VFXIntensity, Override.ShadowDetail,
        Override.PostProcessIntensity, Override.bForceHighLOD ? TEXT("SIM") : TEXT("NÃO"));

    OnQualityOverrideApplied.Broadcast();
}

void UKhaaosQualityProfileRuntime::ResetToGlobal()
{
    if (!bHasOverride)
    {
        return; // Nada para resetar
    }

    // Restaurar valores globais backup
    RestoreGlobalValues();

    // Resetar estado
    bHasOverride = false;
    bSpectatorLODActive = false;
    OverrideProfile = FKhaaosPlayerQualityOverride();

    UE_LOG(LogKhaaosRun, Display, TEXT("[QualityProfileRuntime] Override removido — perfil global restaurado."));

    OnQualityOverrideReset.Broadcast();
}

// ─── Spectator / Killcam LOD ───────────────────────────────────────────────────

void UKhaaosQualityProfileRuntime::SetLODBiasForSpectating(bool bEnable)
{
    if (bEnable)
    {
        // Backup antes de forçar LOD alto
        if (!bHasOverride)
        {
            BackupGlobalValues();
        }

        // Configurar override para espectador: LOD alto, distância máxima, VFX completo
        FKhaaosPlayerQualityOverride SpectatorOverride;
        SpectatorOverride.ViewDistScale = 1.5f;       // Estender distância de view
        SpectatorOverride.VFXIntensity = 1.0f;         // VFX completo para killcam
        SpectatorOverride.ShadowDetail = 4;            // Ultra shadows para cinematic
        SpectatorOverride.PostProcessIntensity = 1.0f; // Post-process completo
        SpectatorOverride.bForceHighLOD = true;        // Forçar LOD0 em todos os operatives

        OverrideProfile = SpectatorOverride;
        bHasOverride = true;
        bSpectatorLODActive = true;

        ApplyOverrideToConsole(SpectatorOverride);

        // Forçar LOD bias via console — todos os meshes em LOD0
        if (GEngine)
        {
            GEngine->Exec(nullptr, TEXT("r.SkeletalMeshLODBias -1"));  // Force LOD0
            GEngine->Exec(nullptr, TEXT("r.ViewDistanceScale 2.0"));   // Máxima distância
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[QualityProfileRuntime] Modo espectador ATIVO — LOD forçado alto para killcam."));
    }
    else
    {
        // Desativar modo espectador
        bSpectatorLODActive = false;

        if (bHasOverride)
        {
            // Se ainda temos override, verificar se era só espectador
            if (OverrideProfile.bForceHighLOD)
            {
                ResetToGlobal();
            }
        }

        UE_LOG(LogKhaaosRun, Display, TEXT("[QualityProfileRuntime] Modo espectador DESATIVADO — perfil restaurado."));
    }
}

// ─── Console Command Integration ───────────────────────────────────────────────

void UKhaaosQualityProfileRuntime::ApplyOverrideFromConsole(const FString& CommandString)
{
    FKhaaosPlayerQualityOverride ParsedOverride;

    // Parse formato: "khaaos.quality ViewDist=1.2 VFX=0.8 Shadow=3 PP=0.9 ForceLOD=1"
    TArray<FString> Tokens;
    CommandString.ParseIntoArrayWS(Tokens);

    for (const FString& Token : Tokens)
    {
        FString Key, Value;
        if (Token.Split(TEXT("="), &Key, &Value))
        {
            if (Key == TEXT("ViewDist"))
            {
                ParsedOverride.ViewDistScale = FCString::Atof(*Value);
            }
            else if (Key == TEXT("VFX"))
            {
                ParsedOverride.VFXIntensity = FMath::Clamp(FCString::Atof(*Value), 0.0f, 1.0f);
            }
            else if (Key == TEXT("Shadow"))
            {
                ParsedOverride.ShadowDetail = FMath::Clamp(FMath::RoundToInt(FCString::Atof(*Value)), 0, 4);
            }
            else if (Key == TEXT("PP"))
            {
                ParsedOverride.PostProcessIntensity = FMath::Clamp(FCString::Atof(*Value), 0.0f, 1.0f);
            }
            else if (Key == TEXT("ForceLOD"))
            {
                ParsedOverride.bForceHighLOD = (Value.ToInt() != 0);
            }
        }
    }

    ApplyOverride(ParsedOverride);
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

void UKhaaosQualityProfileRuntime::BackupGlobalValues()
{
    // Ler valores atuais do console para backup
    static IConsoleVariable* CVarViewDist = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ViewDistanceScale"));
    if (CVarViewDist)
    {
        BackupViewDistScale = CVarViewDist->GetFloat();
    }

    static IConsoleVariable* CVarShadowQuality = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ShadowQuality"));
    if (CVarShadowQuality)
    {
        BackupShadowQuality = CVarShadowQuality->GetInt();
    }

    // VFX e Post-Process não têm CVar direto — usar valores do preset global
    UKhaaosGraphicsPresetSubsystem* PresetSubsystem = GEngine ? GEngine->GetEngineSubsystem<UKhaaosGraphicsPresetSubsystem>() : nullptr;
    if (PresetSubsystem)
    {
        const FKhaaosGraphicsProfile& Profile = PresetSubsystem->GetCurrentProfile();
        BackupVFXBudget = Profile.VFXBudgetPercent;
        BackupPostProcessIntensity = 1.0f;

        GlobalProfileBackup.ViewDistScale = Profile.ViewDistanceScale;
        GlobalProfileBackup.VFXIntensity = Profile.VFXBudgetPercent;
        GlobalProfileBackup.ShadowDetail = static_cast<int32>(Profile.ShadowQuality);
        GlobalProfileBackup.PostProcessIntensity = 1.0f;
    }

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[QualityProfileRuntime] Backup global: ViewDist=%.2f Shadow=%d VFX=%.2f"),
        BackupViewDistScale, BackupShadowQuality, BackupVFXBudget);
}

void UKhaaosQualityProfileRuntime::ApplyOverrideToConsole(const FKhaaosPlayerQualityOverride& Override)
{
    // Aplicar View Distance Scale (multiplicado sobre o global)
    static IConsoleVariable* CVarViewDist = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ViewDistanceScale"));
    if (CVarViewDist)
    {
        const float NewViewDist = BackupViewDistScale * Override.ViewDistScale;
        CVarViewDist->Set(NewViewDist, ECVF_SetByConsole);
    }

    // Aplicar Shadow Quality
    static IConsoleVariable* CVarShadowQuality = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ShadowQuality"));
    if (CVarShadowQuality)
    {
        CVarShadowQuality->Set(Override.ShadowDetail, ECVF_SetByConsole);
    }

    // Aplicar LOD bias se ForceHighLOD
    if (Override.bForceHighLOD)
    {
        if (GEngine)
        {
            GEngine->Exec(nullptr, TEXT("r.SkeletalMeshLODBias -1")); // Force LOD0
        }
    }
}

void UKhaaosQualityProfileRuntime::RestoreGlobalValues()
{
    // Restaurar View Distance Scale
    static IConsoleVariable* CVarViewDist = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ViewDistanceScale"));
    if (CVarViewDist)
    {
        CVarViewDist->Set(BackupViewDistScale, ECVF_SetByConsole);
    }

    // Restaurar Shadow Quality
    static IConsoleVariable* CVarShadowQuality = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ShadowQuality"));
    if (CVarShadowQuality)
    {
        CVarShadowQuality->Set(BackupShadowQuality, ECVF_SetByConsole);
    }

    // Restaurar LOD bias
    if (GEngine)
    {
        GEngine->Exec(nullptr, TEXT("r.SkeletalMeshLODBias 0")); // Reset to default
    }

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[QualityProfileRuntime] Valores globais restaurados: ViewDist=%.2f Shadow=%d"),
        BackupViewDistScale, BackupShadowQuality);
}
