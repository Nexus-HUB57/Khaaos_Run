// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// COMPONENTE: UKhaaosQualityProfileRuntime
// PROPÓSITO: Overrides de qualidade por jogador — permite que cada jogador tenha
//            configurações visuais personalizadas em cima do preset global.
//            Inclui modo espectador/killcam com LOD forçado alto para visual
//            detalhado, e integração com console commands para ajustes em runtime.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosQualityProfileRuntime.generated.h"

// ─── Player Quality Override ──────────────────────────────────────────────────

/** Configuração de qualidade por jogador — sobrepõe o preset global. */
USTRUCT(BlueprintType)
struct FKhaaosPlayerQualityOverride
{
    GENERATED_BODY()

    /** Escala de distância de view (0.1 - 2.0, 1.0 = padrão do preset) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|QualityOverride")
    float ViewDistScale = 1.0f;

    /** Intensidade de VFX (0.0 - 1.0, Niagara pool budget) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|QualityOverride", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float VFXIntensity = 1.0f;

    /** Detalhe de sombra (0=Off, 1=Low, 2=Medium, 3=High, 4=Ultra) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|QualityOverride", meta = (ClampMin = "0", ClampMax = "4"))
    int32 ShadowDetail = 3;

    /** Intensidade de pós-processamento (0.0 - 1.0) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|QualityOverride", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float PostProcessIntensity = 1.0f;

    /** Forçar LOD alto independente da distância (para espectador/killcam) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|QualityOverride")
    bool bForceHighLOD = false;
};

// ─── Delegate Declarations ────────────────────────────────────────────────────

/** Broadcast quando o override de qualidade é aplicado. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnQualityOverrideApplied);

/** Broadcast quando o override é removido e volta ao perfil global. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnQualityOverrideReset);

// ─── Quality Profile Runtime Component ────────────────────────────────────────

/**
 * UKhaaosQualityProfileRuntime — Per-player quality overrides.
 *
 * Permite que cada jogador tenha configurações visuais personalizadas que
 * sobrepõem o preset global. Inclui:
 * - Override de view distance, VFX, shadows, post-process
 * - Modo espectador/killcam com LOD forçado alto
 * - Backup e restore do perfil global
 * - Integração com console commands para ajustes em runtime
 *
 * Instanciado como componente no PlayerController ou OperativeActor.
 */
UCLASS(ClassGroup=(Khaaos, Graphics), meta=(BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosQualityProfileRuntime : public UActorComponent
{
    GENERATED_BODY()

public:
    // ─── Construction & Lifecycle ───────────────────────────────────────────

    UKhaaosQualityProfileRuntime();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    // ─── Quality Override ───────────────────────────────────────────────────

    /** Aplica override de qualidade específico do jogador.
     *  Sobrepõe o preset global com as configurações fornecidas.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|QualityProfile")
    void ApplyOverride(const FKhaaosPlayerQualityOverride& Override);

    /** Remove override e retorna ao preset global.
     *  Restaura backup do perfil global e re-aplica console commands.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|QualityProfile")
    void ResetToGlobal();

    // ─── Spectator / Killcam LOD ────────────────────────────────────────────

    /** Força LOD alto para modo espectador/killcam.
     *  Garante visual detalhado ao observar outros jogadores ou replay.
     *  @param bEnable - true para forçar LOD alto, false para restaurar
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|QualityProfile")
    void SetLODBiasForSpectating(bool bEnable);

    // ─── Console Command Integration ────────────────────────────────────────

    /** Aplica override via console command (string format).
     *  Formato: "khaaos.quality ViewDist=1.2 VFX=0.8 Shadow=3 PP=0.9"
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|QualityProfile")
    void ApplyOverrideFromConsole(const FString& CommandString);

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Verifica se há um override ativo. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|QualityProfile")
    bool HasOverride() const { return bHasOverride; }

    /** Obtém o override ativo (ou default se não há override). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|QualityProfile")
    const FKhaaosPlayerQualityOverride& GetCurrentOverride() const { return OverrideProfile; }

    /** Obtém o backup do perfil global (para debug). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|QualityProfile")
    const FKhaaosPlayerQualityOverride& GetGlobalBackup() const { return GlobalProfileBackup; }

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast quando o override é aplicado. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|QualityProfile")
    FOnQualityOverrideApplied OnQualityOverrideApplied;

    /** Broadcast quando o override é removido. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|QualityProfile")
    FOnQualityOverrideReset OnQualityOverrideReset;

private:

    /** Se há override ativo */
    UPROPERTY(Transient)
    bool bHasOverride = false;

    /** Override ativo */
    UPROPERTY(Transient)
    FKhaaosPlayerQualityOverride OverrideProfile;

    /** Backup do perfil global antes do override */
    UPROPERTY(Transient)
    FKhaaosPlayerQualityOverride GlobalProfileBackup;

    /** Se estamos em modo espectador com LOD forçado */
    UPROPERTY(Transient)
    bool bSpectatorLODActive = false;

    /** Valores de console backup para restore */
    float BackupViewDistScale = 1.0f;
    int32 BackupShadowQuality = 3;
    float BackupVFXBudget = 1.0f;
    float BackupPostProcessIntensity = 1.0f;

    // ─── Internal Helpers ───────────────────────────────────────────────────

    /** Backup dos valores globais atuais antes de aplicar override. */
    void BackupGlobalValues();

    /** Aplica os valores do override ao console do UE5. */
    void ApplyOverrideToConsole(const FKhaaosPlayerQualityOverride& Override);

    /** Restaura os valores globais backup ao console. */
    void RestoreGlobalValues();
};
