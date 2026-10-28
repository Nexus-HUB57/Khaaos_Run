// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Componente: UKhaaosAnimBPProxy
// Propósito: Gerenciamento de switching de Animation Blueprints e physics blend
//            por espécie. Controla máquina de estados de animação (Idle, Locomotion,
//            Combat, Ability, Emote, Death, Knocked, Reviving), blend weights
//            por parte do corpo, combat layer toggle, e LOD-based tick rate.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "Game/Character/KhaaosAnimationBlendManager.h"
#include "KhaaosAnimBPProxy.generated.h"

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * EKhaaosAnimState
 * Estados da máquina de animação para operatives.
 * Ordem de prioridade crescente: Idle < Locomotion < Combat < Ability < Emote < Knocked < Reviving < Death
 */
UENUM(BlueprintType)
enum class EKhaaosAnimState : uint8
{
    Idle       UMETA(DisplayName = "Idle"),
    Locomotion UMETA(DisplayName = "Locomotion"),
    Combat     UMETA(DisplayName = "Combat"),
    Ability    UMETA(DisplayName = "Ability"),
    Emote      UMETA(DisplayName = "Emote"),
    Death      UMETA(DisplayName = "Death"),
    Knocked    UMETA(DisplayName = "Knocked"),
    Reviving   UMETA(DisplayName = "Reviving")
};

// ─── Structs ──────────────────────────────────────────────────────────────────

/**
 * FKhaaosAnimStateTransition
 * Regra de transição entre estados de animação.
 * Define blend time, se pode ser interrompida, e prioridade.
 */
USTRUCT(BlueprintType)
struct FKhaaosAnimStateTransition
{
    GENERATED_BODY()

    /** Estado de origem */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Transition")
    EKhaaosAnimState FromState = EKhaaosAnimState::Idle;

    /** Estado de destino */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Transition")
    EKhaaosAnimState ToState = EKhaaosAnimState::Idle;

    /** Tempo de blending em segundos */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Transition", meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float BlendTime = 0.2f;

    /** Se esta transição pode ser interrompida por outra de maior prioridade */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Transition")
    bool bCanInterrupt = true;

    /** Prioridade da transição (maior = mais importante) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Transition", meta = (ClampMin = "0"))
    int32 Priority = 0;
};

/**
 * FKhaaosPhysicsBlendWeights
 * Pesos de physics blend por parte do corpo para a espécie.
 * Usado para controlar quanto cada parte do corpo é influenciada por
 * physics-driven animation vs. animation-driven.
 */
USTRUCT(BlueprintType)
struct FKhaaosPhysicsBlendWeights
{
    GENERATED_BODY()

    /** Peso para parte superior do corpo (0 = anim-driven, 1 = physics-driven) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float UpperBody = 0.0f;

    /** Peso para parte inferior do corpo */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float LowerBody = 0.0f;

    /** Peso para cauda (Onith) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Tail = 0.0f;

    /** Peso para asas (Skeetw) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Wings = 0.0f;

    /** Peso para cristais flutuantes (Khael) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float FloatingParts = 0.0f;

    /** Peso para orelhas (Zheers) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Ears = 0.0f;

    /** Peso para membros cybernéticos (Venex) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float CyberLimbs = 0.0f;

    /** Peso para membranas (Huran) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Physics", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Membranes = 0.0f;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast quando estado de animação muda */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAnimStateChanged, EKhaaosAnimState, OldState, EKhaaosAnimState, NewState);

/** Broadcast quando combat layer é ativado/desativado */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCombatLayerToggled, bool, bEnabled);

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * UKhaaosAnimBPProxy
 *
 * Gerencia Animation Blueprint switching e physics blend para espécie.
 * Responsabilidades:
 *   - Setup de AnimBP e physics blend por espécie
 *   - Máquina de estados de animação com transições blendadas
 *   - Physics blend weights por parte do corpo
 *   - Combat animation layer toggle
 *   - LOD-based tick rate adjustment
 *
 * Usa UKhaaosAnimationBlendManager para physics-driven parts:
 *   - Onith: cauda (Tail physics)
 *   - Skeetw: asas/penas (Wings physics)
 *   - Khael: cristais flutuantes (FloatingCrystal physics)
 *   - Venex: membros cybernéticos (CyberLimb physics)
 *   - Huran: membranas (Membrane physics)
 *   - Zheers: orelhas (EarBounce physics)
 */
UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosAnimBPProxy : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosAnimBPProxy();

    // ─── Initialization ──────────────────────────────────────────────────

    /**
     * Inicializa AnimBP e physics blend para a espécie.
     * Carrega o AnimBP correto, configura physics parts no BlendManager,
     * e define pesos iniciais de physics blend.
     * @param Species  Espécie para configurar
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Proxy")
    void InitializeForSpecies(EKhaaosSpecies Species);

    // ─── State Machine ───────────────────────────────────────────────────

    /**
     * Solicita transição de estado de animação com blending.
     * Verifica regras de transição, prioridade e interrupção.
     * @param TargetState  Estado de destino
     * @return True se a transição foi aceita
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Proxy")
    bool RequestStateTransition(EKhaaosAnimState TargetState);

    /**
     * Retorna o estado de animação ativo atual.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Anim|Proxy")
    EKhaaosAnimState GetActiveAnimState() const { return CurrentAnimState; }

    // ─── Physics Blend ───────────────────────────────────────────────────

    /**
     * Define peso de physics blend para uma parte do corpo.
     * @param Part   Parte do corpo (via EKhaaosPhysicsAnimPart)
     * @param Weight Peso 0-1 (0 = anim-driven, 1 = physics-driven)
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Proxy")
    void SetPhysicsBlendWeight(EKhaaosPhysicsAnimPart Part, float Weight);

    /**
     * Obtém pesos de physics blend atuais.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Anim|Proxy")
    FKhaaosPhysicsBlendWeights GetPhysicsBlendWeights() const { return BlendWeights; }

    // ─── Tick Rate / LOD ─────────────────────────────────────────────────

    /**
     * Define tick rate baseado na distância LOD do jogador local.
     * @param LODDistance  Distância ao jogador local em cm
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Proxy")
    void SetAnimTickRate(float LODDistance);

    /**
     * Obtém o tick rate atual.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Anim|Proxy")
    float GetAnimTickRate() const { return AnimTickRate; }

    // ─── Combat Layer ────────────────────────────────────────────────────

    /**
     * Ativa camada de animação de combate.
     * Adiciona combat overlay ao AnimBP e ajusta physics blend.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Proxy")
    void EnableCombatLayer();

    /**
     * Desativa camada de animação de combate.
     * Remove combat overlay e restaura physics blend para locomoção.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim|Proxy")
    void DisableCombatLayer();

    /**
     * Verifica se combat layer está ativo.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Anim|Proxy")
    bool IsCombatLayerActive() const { return bCombatLayerActive; }

    // ─── Delegates ───────────────────────────────────────────────────────

    /** Disparado quando estado de animação muda */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Anim|Proxy")
    FOnAnimStateChanged OnAnimStateChanged;

    /** Disparado quando combat layer é toggled */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Anim|Proxy")
    FOnCombatLayerToggled OnCombatLayerToggled;

    // ─── Properties ──────────────────────────────────────────────────────

    /** Espécie ativa (set em InitializeForSpecies) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Proxy")
    EKhaaosSpecies ActiveSpecies = EKhaaosSpecies::NONE;

    /** Estado de animação atual */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Proxy")
    EKhaaosAnimState CurrentAnimState = EKhaaosAnimState::Idle;

    /** Combat layer ativo? */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Proxy")
    bool bCombatLayerActive = false;

    /** Tick rate atual (1.0 = full, 0.0 = frozen) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Proxy", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float AnimTickRate = 1.0f;

protected:

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    // ─── Blend Manager Reference ─────────────────────────────────────────

    /** Referência ao AnimationBlendManager do owner */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Proxy")
    TObjectPtr<UKhaaosAnimationBlendManager> BlendManager;

private:

    // ─── Internal State ───────────────────────────────────────────────────

    /** Pesos de physics blend por parte do corpo */
    UPROPERTY()
    FKhaaosPhysicsBlendWeights BlendWeights;

    /** Transições de estado registradas */
    UPROPERTY()
    TArray<FKhaaosAnimStateTransition> StateTransitions;

    /** Estado de animação anterior (para blending) */
    UPROPERTY()
    EKhaaosAnimState PreviousAnimState = EKhaaosAnimState::Idle;

    /** Progresso da transição atual (0-1) */
    UPROPERTY()
    float TransitionProgress = 1.0f;

    /** BlendTime da transição atual em segundos */
    UPROPERTY()
    float CurrentBlendTime = 0.0f;

    /** Inicializado? */
    UPROPERTY()
    bool bInitialized = false;

    // ─── Helpers ──────────────────────────────────────────────────────────

    /** Encontra transição válida entre dois estados */
    const FKhaaosAnimStateTransition* FindTransition(EKhaaosAnimState From, EKhaaosAnimState To) const;

    /** Obtém prioridade default de um estado (maior = mais importante) */
    int32 GetStatePriority(EKhaaosAnimState State) const;

    /** Constrói transições padrão para a máquina de estados */
    void BuildDefaultTransitions();

    /** Configura pesos de physics blend default para a espécie */
    void SetSpeciesDefaultBlendWeights(EKhaaosSpecies Species);

    /** Mapeia EKhaaosPhysicsAnimPart para o campo correspondente em BlendWeights */
    float GetBlendWeightForPart(EKhaaosPhysicsAnimPart Part) const;

    /** Aplica peso de blend ao campo correspondente em BlendWeights */
    void ApplyBlendWeightToPart(EKhaaosPhysicsAnimPart Part, float Weight);

    /** Encontra o BlendManager no owner */
    UKhaaosAnimationBlendManager* FindBlendManager();
};
