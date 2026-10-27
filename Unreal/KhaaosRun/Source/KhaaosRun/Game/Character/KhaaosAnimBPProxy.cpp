// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Implementação: UKhaaosAnimBPProxy
// Máquina de estados de animação, physics blend, combat layer e LOD tick rate.

#include "Game/Character/KhaaosAnimBPProxy.h"
#include "KhaaosRun.h"
#include "Game/Character/KhaaosAnimationBlendManager.h"
#include "Game/Character/KhaaosSpeciesMeshRegistry.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"

// ─── Constructor ───────────────────────────────────────────────────────────────

UKhaaosAnimBPProxy::UKhaaosAnimBPProxy()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = ETickingGroup::TG_PrePhysics;
}

// ─── BeginPlay ────────────────────────────────────────────────────────────────

void UKhaaosAnimBPProxy::BeginPlay()
{
    Super::BeginPlay();

    // Constrói transições padrão da máquina de estados
    BuildDefaultTransitions();

    // Encontra o BlendManager no owner
    BlendManager = FindBlendManager();
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

void UKhaaosAnimBPProxy::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Atualiza progresso de transição de animação
    if (TransitionProgress < 1.0f && CurrentBlendTime > 0.0f)
    {
        TransitionProgress = FMath::Clamp(TransitionProgress + (DeltaTime / CurrentBlendTime), 0.0f, 1.0f);

        // Quando blending completa, notifica o BlendManager
        if (TransitionProgress >= 1.0f && BlendManager)
        {
            BlendManager->OnGameplayEvent(FName("AnimTransitionComplete"), 1.0f);
        }
    }
}

// ─── Initialization ───────────────────────────────────────────────────────────

void UKhaaosAnimBPProxy::InitializeForSpecies(EKhaaosSpecies Species)
{
    if (Species == EKhaaosSpecies::NONE)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("AnimBPProxy: InitializeForSpecies chamado com espécie NONE — ignorado"));
        return;
    }

    ActiveSpecies = Species;

    // Carrega e aplica o AnimBP correto via SpeciesMeshRegistry
    if (UGameInstance* GI = GetWorld()->GetGameInstance())
    {
        if (UKhaaosSpeciesMeshRegistry* MeshRegistry = GI->GetSubsystem<UKhaaosSpeciesMeshRegistry>())
        {
            TSoftObjectPtr<UAnimBlueprint> AnimBPSoft = MeshRegistry->GetAnimBPForSpecies(Species);
            if (AnimBPSoft.IsValid())
            {
                // Carrega sincronamente se necessário (primeira vez)
                if (!AnimBPSoft.IsLoaded())
                {
                    AnimBPSoft.LoadSynchronous();
                }

                if (UAnimBlueprint* AnimBP = AnimBPSoft.Get())
                {
                    // Aplica o AnimBP ao skeletal mesh do owner
                    if (ACharacter* OwnerCharacter = Cast<ACharacter>(GetOwner()))
                    {
                        if (USkeletalMeshComponent* MeshComp = OwnerCharacter->GetMesh())
                        {
                            // Usa o anim class generated do blueprint
                            MeshComp->SetAnimInstanceClass(AnimBP->GetAnimClassForRendering());
                            UE_LOG(LogKhaaosRun, Log, TEXT("AnimBPProxy: AnimBP '%s' aplicado para espécie %s"),
                                *AnimBP->GetName(),
                                *UEnum::GetDisplayValueAsText(Species).ToString());
                        }
                    }
                }
            }
            else
            {
                UE_LOG(LogKhaaosRun, Warning, TEXT("AnimBPProxy: AnimBP não encontrado no registry para espécie %s"),
                    *UEnum::GetDisplayValueAsText(Species).ToString());
            }
        }
    }

    // Inicializa o BlendManager para physics-driven animations da espécie
    if (BlendManager)
    {
        BlendManager->InitializeForSpecies(Species);
    }

    // Configura pesos de physics blend default para a espécie
    SetSpeciesDefaultBlendWeights(Species);

    // Reset de estado
    CurrentAnimState = EKhaaosAnimState::Idle;
    PreviousAnimState = EKhaaosAnimState::Idle;
    bCombatLayerActive = false;
    TransitionProgress = 1.0f;
    bInitialized = true;

    UE_LOG(LogKhaaosRun, Log, TEXT("AnimBPProxy: Inicializado para espécie %s"),
        *UEnum::GetDisplayValueAsText(Species).ToString());
}

// ─── State Machine ────────────────────────────────────────────────────────────

bool UKhaaosAnimBPProxy::RequestStateTransition(EKhaaosAnimState TargetState)
{
    // Transição para o mesmo estado — ignorado
    if (TargetState == CurrentAnimState)
    {
        return false;
    }

    // Death é estado terminal — não pode ser interrompido (exceto Reviving)
    if (CurrentAnimState == EKhaaosAnimState::Death && TargetState != EKhaaosAnimState::Reviving)
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("AnimBPProxy: Transição de Death bloqueada (target: %s)"),
            *UEnum::GetDisplayValueAsText(TargetState).ToString());
        return false;
    }

    // Verifica se a transição está em progresso e não pode ser interrompida
    if (TransitionProgress < 1.0f)
    {
        // Verifica se a transição atual pode ser interrompida
        const FKhaaosAnimStateTransition* CurrentTransition = FindTransition(PreviousAnimState, CurrentAnimState);
        if (CurrentTransition && !CurrentTransition->bCanInterrupt)
        {
            // Permite interrupção se a nova transição tem prioridade maior
            int32 TargetPriority = GetStatePriority(TargetState);
            int32 CurrentTransitionPriority = CurrentTransition->Priority;
            if (TargetPriority <= CurrentTransitionPriority)
            {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("AnimBPProxy: Transição em progresso não pode ser interrompida (target: %s, prio: %d <= %d)"),
                    *UEnum::GetDisplayValueAsText(TargetState).ToString(),
                    TargetPriority, CurrentTransitionPriority);
                return false;
            }
        }
    }

    // Verifica prioridade — só permite se target tem prioridade >= current
    // (exceto para transições explícitas na tabela)
    int32 TargetPriority = GetStatePriority(TargetState);
    int32 CurrentPriority = GetStatePriority(CurrentAnimState);

    // Procura transição explícita
    const FKhaaosAnimStateTransition* Transition = FindTransition(CurrentAnimState, TargetState);
    if (Transition)
    {
        // Transição explícita encontrada — usa blend time e prioridade dela
        CurrentBlendTime = Transition->BlendTime;
    }
    else
    {
        // Sem transição explícita — permite se prioridade é maior ou é fallback para Idle
        if (TargetState == EKhaaosAnimState::Idle || TargetPriority >= CurrentPriority)
        {
            CurrentBlendTime = 0.25f; // BlendTime default para transições implícitas
        }
        else
        {
            UE_LOG(LogKhaaosRun, Verbose, TEXT("AnimBPProxy: Transição %s -> %s bloqueada por prioridade (%d < %d)"),
                *UEnum::GetDisplayValueAsText(CurrentAnimState).ToString(),
                *UEnum::GetDisplayValueAsText(TargetState).ToString(),
                TargetPriority, CurrentPriority);
            return false;
        }
    }

    // Executa a transição
    PreviousAnimState = CurrentAnimState;
    CurrentAnimState = TargetState;
    TransitionProgress = 0.0f;

    // Notifica BlendManager sobre mudança de estado
    if (BlendManager)
    {
        const FName EventName = *FString::Printf(TEXT("AnimState_%s"), *UEnum::GetDisplayValueAsText(TargetState).ToString());
        BlendManager->OnGameplayEvent(EventName, 1.0f);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("AnimBPProxy: Transição %s -> %s (BlendTime: %.3fs)"),
        *UEnum::GetDisplayValueAsText(PreviousAnimState).ToString(),
        *UEnum::GetDisplayValueAsText(CurrentAnimState).ToString(),
        CurrentBlendTime);

    OnAnimStateChanged.Broadcast(PreviousAnimState, CurrentAnimState);

    return true;
}

// ─── Physics Blend ────────────────────────────────────────────────────────────

void UKhaaosAnimBPProxy::SetPhysicsBlendWeight(EKhaaosPhysicsAnimPart Part, float Weight)
{
    const float ClampedWeight = FMath::Clamp(Weight, 0.0f, 1.0f);
    ApplyBlendWeightToPart(Part, ClampedWeight);

    // Propaga ao BlendManager
    if (BlendManager)
    {
        BlendManager->SetBlendWeight(
            FName(*UEnum::GetDisplayValueAsText(Part).ToString()),
            ClampedWeight,
            5.0f // BlendSpeed default
        );

        // Habilita/desabilita physics part baseado no peso
        BlendManager->EnablePhysicsPart(Part, ClampedWeight > 0.0f);
    }

    UE_LOG(LogKhaaosRun, Verbose, TEXT("AnimBPProxy: Physics blend weight para %s = %.3f"),
        *UEnum::GetDisplayValueAsText(Part).ToString(), ClampedWeight);
}

// ─── Tick Rate / LOD ──────────────────────────────────────────────────────────

void UKhaaosAnimBPProxy::SetAnimTickRate(float LODDistance)
{
    // Distância LOD para tick rate mapping:
    //   0-10m:    Full rate (1.0)
    //   10-25m:   High rate (0.5)
    //   25-50m:   Medium rate (0.25)
    //   50-100m:  Low rate (0.1)
    //   100m+:    Minimum rate (0.05) — quase frozen para distant operatives

    if (LODDistance <= 1000.0f)       // 10m
    {
        AnimTickRate = 1.0f;
    }
    else if (LODDistance <= 2500.0f) // 25m
    {
        AnimTickRate = 0.5f;
    }
    else if (LODDistance <= 5000.0f) // 50m
    {
        AnimTickRate = 0.25f;
    }
    else if (LODDistance <= 10000.0f) // 100m
    {
        AnimTickRate = 0.1f;
    }
    else
    {
        AnimTickRate = 0.05f;
    }

    // Aplica ao skeletal mesh component do owner
    if (ACharacter* OwnerCharacter = Cast<ACharacter>(GetOwner()))
    {
        if (USkeletalMeshComponent* MeshComp = OwnerCharacter->GetMesh())
        {
            // Ajusta tick interval baseado no rate
            // Full rate = every frame, half rate = every other frame, etc.
            const float TickInterval = (AnimTickRate >= 1.0f) ? 0.0f : (1.0f / FMath::Max(AnimTickRate * 60.0f, 1.0f));
            MeshComp->SetComponentTickInterval(TickInterval);
        }
    }

    // Reduz physics simulation para operatives distantes
    if (BlendManager && AnimTickRate < 0.5f)
    {
        // Desabilita physics parts caros para operatives distantes
        if (ActiveSpecies == EKhaaosSpecies::ONITH)
        {
            BlendManager->EnablePhysicsPart(EKhaaosPhysicsAnimPart::Tail, AnimTickRate > 0.15f);
        }
        if (ActiveSpecies == EKhaaosSpecies::SKEETW)
        {
            BlendManager->EnablePhysicsPart(EKhaaosPhysicsAnimPart::Wings, AnimTickRate > 0.15f);
        }
        if (ActiveSpecies == EKhaaosSpecies::KHAEL)
        {
            BlendManager->EnablePhysicsPart(EKhaaosPhysicsAnimPart::FloatingCrystal, AnimTickRate > 0.15f);
        }
    }
}

// ─── Combat Layer ─────────────────────────────────────────────────────────────

void UKhaaosAnimBPProxy::EnableCombatLayer()
{
    if (bCombatLayerActive)
    {
        return;
    }

    bCombatLayerActive = true;

    // Transiciona para estado de combate se em locomoção ou idle
    if (CurrentAnimState == EKhaaosAnimState::Idle || CurrentAnimState == EKhaaosAnimState::Locomotion)
    {
        RequestStateTransition(EKhaaosAnimState::Combat);
    }

    // Ajusta physics blend para combate:
    // - Upper body mais anim-driven para precisão de armas
    // - Parts específicos mantidos physics-driven para realismo
    BlendWeights.UpperBody = 0.2f; // Maior controle de anim para armas
    BlendWeights.LowerBody = 0.6f; // Physics-driven para foot placement

    // Habilita combat-specific physics parts
    if (BlendManager)
    {
        BlendManager->OnGameplayEvent(FName("CombatLayerEnabled"), 1.0f);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("AnimBPProxy: Combat layer ativado para espécie %s"),
        *UEnum::GetDisplayValueAsText(ActiveSpecies).ToString());

    OnCombatLayerToggled.Broadcast(true);
}

void UKhaaosAnimBPProxy::DisableCombatLayer()
{
    if (!bCombatLayerActive)
    {
        return;
    }

    bCombatLayerActive = false;

    // Retorna para locomoção se em combate
    if (CurrentAnimState == EKhaaosAnimState::Combat)
    {
        RequestStateTransition(EKhaaosAnimState::Locomotion);
    }

    // Restaura physics blend para locomoção default
    SetSpeciesDefaultBlendWeights(ActiveSpecies);

    if (BlendManager)
    {
        BlendManager->OnGameplayEvent(FName("CombatLayerDisabled"), 1.0f);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("AnimBPProxy: Combat layer desativado para espécie %s"),
        *UEnum::GetDisplayValueAsText(ActiveSpecies).ToString());

    OnCombatLayerToggled.Broadcast(false);
}

// ─── State Transition Helpers ─────────────────────────────────────────────────

const FKhaaosAnimStateTransition* UKhaaosAnimBPProxy::FindTransition(EKhaaosAnimState From, EKhaaosAnimState To) const
{
    for (const FKhaaosAnimStateTransition& Transition : StateTransitions)
    {
        if (Transition.FromState == From && Transition.ToState == To)
        {
            return &Transition;
        }
    }
    return nullptr;
}

int32 UKhaaosAnimBPProxy::GetStatePriority(EKhaaosAnimState State) const
{
    // Prioridade crescente: Idle < Locomotion < Combat < Ability < Emote < Knocked < Reviving < Death
    switch (State)
    {
        case EKhaaosAnimState::Idle:       return 0;
        case EKhaaosAnimState::Locomotion: return 1;
        case EKhaaosAnimState::Combat:     return 2;
        case EKhaaosAnimState::Ability:    return 3;
        case EKhaaosAnimState::Emote:      return 4;
        case EKhaaosAnimState::Knocked:    return 5;
        case EKhaaosAnimState::Reviving:   return 6;
        case EKhaaosAnimState::Death:      return 7;
        default:                           return 0;
    }
}

void UKhaaosAnimBPProxy::BuildDefaultTransitions()
{
    StateTransitions.Empty();

    // Idle -> * (transições de saída do idle)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Idle;
        T.ToState = EKhaaosAnimState::Locomotion;
        T.BlendTime = 0.15f;
        T.bCanInterrupt = true;
        T.Priority = 1;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Idle;
        T.ToState = EKhaaosAnimState::Combat;
        T.BlendTime = 0.1f;
        T.bCanInterrupt = true;
        T.Priority = 2;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Idle;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }

    // Locomotion -> * (transições de saída da locomoção)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Locomotion;
        T.ToState = EKhaaosAnimState::Idle;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 0;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Locomotion;
        T.ToState = EKhaaosAnimState::Combat;
        T.BlendTime = 0.1f;
        T.bCanInterrupt = true;
        T.Priority = 2;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Locomotion;
        T.ToState = EKhaaosAnimState::Ability;
        T.BlendTime = 0.15f;
        T.bCanInterrupt = false;
        T.Priority = 3;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Locomotion;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Locomotion;
        T.ToState = EKhaaosAnimState::Knocked;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 5;
        StateTransitions.Add(T);
    }

    // Combat -> * (transições de saída do combate)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Combat;
        T.ToState = EKhaaosAnimState::Locomotion;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 1;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Combat;
        T.ToState = EKhaaosAnimState::Ability;
        T.BlendTime = 0.1f;
        T.bCanInterrupt = false;
        T.Priority = 3;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Combat;
        T.ToState = EKhaaosAnimState::Knocked;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 5;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Combat;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }

    // Ability -> * (abilities podem ser interrompidas por knock/death)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Ability;
        T.ToState = EKhaaosAnimState::Combat;
        T.BlendTime = 0.15f;
        T.bCanInterrupt = true;
        T.Priority = 2;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Ability;
        T.ToState = EKhaaosAnimState::Locomotion;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 1;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Ability;
        T.ToState = EKhaaosAnimState::Knocked;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 5;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Ability;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }

    // Emote -> * (emotes podem ser cancelados por qualquer ação)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Emote;
        T.ToState = EKhaaosAnimState::Idle;
        T.BlendTime = 0.15f;
        T.bCanInterrupt = true;
        T.Priority = 0;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Emote;
        T.ToState = EKhaaosAnimState::Locomotion;
        T.BlendTime = 0.15f;
        T.bCanInterrupt = true;
        T.Priority = 1;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Emote;
        T.ToState = EKhaaosAnimState::Combat;
        T.BlendTime = 0.1f;
        T.bCanInterrupt = true;
        T.Priority = 2;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Emote;
        T.ToState = EKhaaosAnimState::Knocked;
        T.BlendTime = 0.2f;
        T.bCanInterrupt = true;
        T.Priority = 5;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Emote;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }

    // Death -> Reviving (única saída do Death)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Death;
        T.ToState = EKhaaosAnimState::Reviving;
        T.BlendTime = 0.5f;
        T.bCanInterrupt = false;
        T.Priority = 6;
        StateTransitions.Add(T);
    }

    // Knocked -> * (pode ser revivido ou morrer)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Knocked;
        T.ToState = EKhaaosAnimState::Reviving;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = true;
        T.Priority = 6;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Knocked;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }

    // Reviving -> * (pode voltar ao idle ou morrer de novo)
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Reviving;
        T.ToState = EKhaaosAnimState::Idle;
        T.BlendTime = 0.4f;
        T.bCanInterrupt = true;
        T.Priority = 0;
        StateTransitions.Add(T);
    }
    {
        FKhaaosAnimStateTransition T;
        T.FromState = EKhaaosAnimState::Reviving;
        T.ToState = EKhaaosAnimState::Death;
        T.BlendTime = 0.3f;
        T.bCanInterrupt = false;
        T.Priority = 7;
        StateTransitions.Add(T);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("AnimBPProxy: %d transições de estado registradas"), StateTransitions.Num());
}

// ─── Species Default Blend Weights ────────────────────────────────────────────

void UKhaaosAnimBPProxy::SetSpeciesDefaultBlendWeights(EKhaaosSpecies Species)
{
    // Reset todos os pesos
    BlendWeights = FKhaaosPhysicsBlendWeights();

    switch (Species)
    {
        case EKhaaosSpecies::HURAN:
            // Huran: membranas com soft-body, corpo mais anim-driven
            BlendWeights.UpperBody = 0.1f;
            BlendWeights.LowerBody = 0.3f;
            BlendWeights.Membranes = 0.8f; // Membranas fortemente physics-driven
            break;

        case EKhaaosSpecies::KHAEL:
            // Khael: cristais flutuantes com spring physics, corpo anim-driven
            BlendWeights.UpperBody = 0.1f;
            BlendWeights.LowerBody = 0.3f;
            BlendWeights.FloatingParts = 0.9f; // Cristais quase totalmente physics
            break;

        case EKhaaosSpecies::VENEX:
            // Venex: membros cybernéticos com procedural anim, corpo mixed
            BlendWeights.UpperBody = 0.2f;
            BlendWeights.LowerBody = 0.3f;
            BlendWeights.CyberLimbs = 0.7f; // Cyber limbs parcialmente physics
            break;

        case EKhaaosSpecies::ONITH:
            // Onith: cauda réptil com chain physics, corpo pesado
            BlendWeights.UpperBody = 0.1f;
            BlendWeights.LowerBody = 0.2f;
            BlendWeights.Tail = 0.9f; // Cauda quase totalmente physics-driven
            break;

        case EKhaaosSpecies::ZHEERS:
            // Zheers: orelhas com subtle bounce, corpo anim-driven
            BlendWeights.UpperBody = 0.1f;
            BlendWeights.LowerBody = 0.3f;
            BlendWeights.Ears = 0.5f; // Orelhas com physics sutil
            break;

        case EKhaaosSpecies::SKEETW:
            // Skeetw: asas/penas com flap physics, corpo leve
            BlendWeights.UpperBody = 0.2f;
            BlendWeights.LowerBody = 0.4f;
            BlendWeights.Wings = 0.85f; // Asas fortemente physics-driven
            break;

        default:
            // Espécie NONE ou desconhecida — tudo anim-driven
            break;
    }
}

// ─── Blend Weight Field Access ────────────────────────────────────────────────

float UKhaaosAnimBPProxy::GetBlendWeightForPart(EKhaaosPhysicsAnimPart Part) const
{
    switch (Part)
    {
        case EKhaaosPhysicsAnimPart::Tail:            return BlendWeights.Tail;
        case EKhaaosPhysicsAnimPart::Wings:           return BlendWeights.Wings;
        case EKhaaosPhysicsAnimPart::FloatingCrystal: return BlendWeights.FloatingParts;
        case EKhaaosPhysicsAnimPart::CyberLimb:       return BlendWeights.CyberLimbs;
        case EKhaaosPhysicsAnimPart::EarBounce:       return BlendWeights.Ears;
        case EKhaaosPhysicsAnimPart::Membrane:        return BlendWeights.Membranes;
        case EKhaaosPhysicsAnimPart::GillPulse:       return BlendWeights.Membranes; // Gill usa membrane weight
        default:                                       return 0.0f;
    }
}

void UKhaaosAnimBPProxy::ApplyBlendWeightToPart(EKhaaosPhysicsAnimPart Part, float Weight)
{
    switch (Part)
    {
        case EKhaaosPhysicsAnimPart::Tail:
            BlendWeights.Tail = Weight;
            break;
        case EKhaaosPhysicsAnimPart::Wings:
            BlendWeights.Wings = Weight;
            break;
        case EKhaaosPhysicsAnimPart::FloatingCrystal:
            BlendWeights.FloatingParts = Weight;
            break;
        case EKhaaosPhysicsAnimPart::CyberLimb:
            BlendWeights.CyberLimbs = Weight;
            break;
        case EKhaaosPhysicsAnimPart::EarBounce:
            BlendWeights.Ears = Weight;
            break;
        case EKhaaosPhysicsAnimPart::Membrane:
        case EKhaaosPhysicsAnimPart::GillPulse:
            BlendWeights.Membranes = Weight;
            break;
        default:
            break;
    }
}

// ─── Find BlendManager ────────────────────────────────────────────────────────

UKhaaosAnimationBlendManager* UKhaaosAnimBPProxy::FindBlendManager()
{
    AActor* OwnerActor = GetOwner();
    if (!OwnerActor)
    {
        return nullptr;
    }

    return OwnerActor->FindComponentByClass<UKhaaosAnimationBlendManager>();
}
