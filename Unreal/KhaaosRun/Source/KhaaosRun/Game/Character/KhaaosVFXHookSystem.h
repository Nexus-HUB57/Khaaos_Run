// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosVFXHookSystem
// PROPÓSITO: Sistema de hooks VFX para acessórios e eventos de lifecycle.
//            Conecta efeitos Niagara a pontos de attachment e eventos do
//            gameplay (equip, damage, ability, kill, etc.), com filtro
//            por espécie, pooling automático, e gerenciamento de lifecycle.
//
//            Hooks pré-construídos por espécie:
//              Huran:  WaterSplash (OnMove), GillGlow (OnEquip), BubbleTrail (OnMove)
//              Khael:  CrystalResonance (OnAbility), RuneGlow (OnIdle), ArcaneBurst (OnKill)
//              Venex:  CyberPulse (OnAbility), HologramFlicker (OnDamage), ShieldBreak (OnDamage)
//              Onith:  TailWhip (OnAbility), ThermalVent (OnIdle), ChitinShed (OnDamage)
//              Zheers: FogCloak (OnAbility), TattooGlow (OnKill), EarRadar (OnIdle)
//              Skeetw: WingGust (OnMove), FeatherBurst (OnDamage), WindSense (OnIdle)
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosVFXHookSystem.generated.h"

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Eventos de lifecycle que podem disparar VFX hooks */
UENUM(BlueprintType)
enum class EKhaaosVFXHookEvent : uint8
{
    OnEquip      UMETA(DisplayName = "On Equip"),
    OnUnequip    UMETA(DisplayName = "On Unequip"),
    OnDamage     UMETA(DisplayName = "On Damage"),
    OnAbility    UMETA(DisplayName = "On Ability"),
    OnKill       UMETA(DisplayName = "On Kill"),
    OnDeath      UMETA(DisplayName = "On Death"),
    OnIdle       UMETA(DisplayName = "On Idle"),
    OnMove       UMETA(DisplayName = "On Move"),
    OnInteract   UMETA(DisplayName = "On Interact"),
    OnPurchase   UMETA(DisplayName = "On Purchase")
};

// ─── Structs ────────────────────────────────────────────────────────────────

/** Definição de um VFX hook */
USTRUCT(BlueprintType)
struct FKhaaosVFXHook
{
    GENERATED_BODY()

    /** Nome único do hook (ex: "VFXHook_HUR_WaterSplash") */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FName HookName;

    /** Evento que dispara este hook */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    EKhaaosVFXHookEvent HookEvent = EKhaaosVFXHookEvent::OnEquip;

    /** Sistema Niagara para este hook */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TSoftObjectPtr<UNiagaraSystem> VFXSystem;

    /** Ponto de attachment (nome do AccessoryPoint) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    FName AttachPoint;

    /** Se true, VFX segue o owner (attached); se false, spawn no mundo */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    bool bFollowOwner = true;

    /** Se true, usa pooling automático do Niagara */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    bool bPoolAutomatically = true;

    /** Tamanho do pool (quando bPoolAutomatically = true) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    int32 PoolEfectiveSize = 4;

    /** Override de lifetime (0 = usa default do Niagara system) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    float LifetimeOverride = 0.0f;

    /** Se true, este hook é específico de uma espécie */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    bool bSpeciesSpecific = false;

    /** Espécies permitidas (quando bSpeciesSpecific = true) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TArray<EKhaaosSpecies> AllowedSpecies;

    /** Se true, hook está habilitado */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bEnabled = true;
};

/** Hook VFX ativo (instância em execução) */
USTRUCT(BlueprintType)
struct FKhaaosActiveVFXHook
{
    GENERATED_BODY()

    /** Definição do hook */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FKhaaosVFXHook Hook;

    /** Componente Niagara ativo */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TWeakObjectPtr<UNiagaraComponent> NiagaraComponent;

    /** Se true, hook está ativo */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bIsActive = true;

    /** Timestamp de ativação */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float TimeActivated = 0.0f;
};

// ─── Delegates ──────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnVFXHookTriggered, FName, HookName, EKhaaosVFXHookEvent, Event, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnVFXHookStopped, FName, HookName, bool, bGraceful);

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * UKhaaosVFXHookSystem
 *
 * Sistema de hooks VFX para acessórios cosméticos e eventos de lifecycle.
 * - Registro e disparo de hooks baseados em eventos
 * - Filtro por espécie (hooks específicos por espécie)
 * - Pooling automático de Niagara components
 * - Gerenciamento de lifecycle (spawn, stop, cleanup)
 * - Integração com UKhaaosVFXManager para spawning centralizado
 * - Hooks pré-construídos para cada espécie
 */
UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosVFXHookSystem : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosVFXHookSystem();

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    // ─── Hook Registration ──────────────────────────────────────────────────

    /** Registra um VFX hook. Retorna false se já existe. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    bool RegisterHook(const FKhaaosVFXHook& Hook);

    /** Remove um hook do registro */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    void UnregisterHook(FName HookName);

    // ─── Hook Triggering ────────────────────────────────────────────────────

    /** Dispara VFX para um evento específico, filtrando por espécie */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    void TriggerHook(EKhaaosVFXHookEvent Event, EKhaaosSpecies CurrentSpecies = EKhaaosSpecies::NONE);

    /** Dispara um hook específico pelo nome */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    void TriggerHookByName(FName HookName, EKhaaosSpecies CurrentSpecies = EKhaaosSpecies::NONE);

    // ─── Hook Control ───────────────────────────────────────────────────────

    /** Para um hook ativo específico */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    void StopHook(FName HookName, bool bGraceful = true);

    /** Para todos os hooks ativos */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    void StopAllHooks(bool bGraceful = true);

    /** Habilita/desabilita um hook */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|VFXHooks")
    void SetHookEnabled(FName HookName, bool bEnabled);

    // ─── Query ─────────────────────────────────────────────────────────────

    /** Retorna todos os hooks ativos */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFXHooks")
    TArray<FKhaaosActiveVFXHook> GetActiveHooks() const;

    /** Retorna hooks registrados para um evento */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFXHooks")
    TArray<FKhaaosVFXHook> GetHooksForEvent(EKhaaosVFXHookEvent Event) const;

    // ─── Species Configuration ──────────────────────────────────────────────

    /** Espécie do owner (configurada externamente) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFXHooks")
    EKhaaosSpecies OwnerSpecies = EKhaaosSpecies::NONE;

    // ─── Delegates ─────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|VFXHooks")
    FOnVFXHookTriggered OnVFXHookTriggered;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|VFXHooks")
    FOnVFXHookStopped OnVFXHookStopped;

private:
    /** Hooks registrados (HookName → definição) */
    UPROPERTY()
    TMap<FName, FKhaaosVFXHook> RegisteredHooks;

    /** Hooks ativos (HookName → instância ativa) */
    UPROPERTY()
    TMap<FName, FKhaaosActiveVFXHook> ActiveHooksFiring;

    /** Timer para cleanup de hooks expirados */
    float CleanupTimer = 0.0f;

    /** Intervalo de cleanup (segundos) */
    static constexpr float CLEANUP_INTERVAL = 1.0f;

    // ─── Internal ──────────────────────────────────────────────────────────

    /** Registra hooks pré-construídos para cada espécie */
    void RegisterSpeciesHooks();

    /** Verifica se hook é compatível com a espécie */
    bool IsHookCompatibleWithSpecies(const FKhaaosVFXHook& Hook, EKhaaosSpecies Species) const;

    /** Spawn do Niagara component para um hook */
    UNiagaraComponent* SpawnVFXForHook(const FKhaaosVFXHook& Hook);

    /** Cleanup de hooks que já terminaram */
    void CleanupExpiredHooks();
};
