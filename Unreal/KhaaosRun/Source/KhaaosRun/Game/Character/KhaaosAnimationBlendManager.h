// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosAnimationBlendManager
// PROPÓSITO: Gerenciamento de blending de animações por espécie com suporte a
//            physics-driven animations para traits específicos:
//            - Onith: cauda réptil com physics simulation (chain of bones)
//            - Skeetw: asas/penas com flap physics (feather simulation)
//            - Venex: membros cybernéticos com blended procedural anim
//            - Khael: cristais flutuantes com spring physics
//            - Huran: membranas com soft-body approximation
//            - Zheers: orelhas com subtle bounce physics
//            Usa Animation Modifier + Montage Blending para smooth transitions.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosAnimationBlendManager.generated.h"

UENUM(BlueprintType)
enum class EKhaaosAnimBlendType : uint8
{
    LocomotionOverride,  // Override de locomoção base (run/jump/swim/climb)
    PhysicsSimulation,   // Physics-driven animation (tail, wings, crystals)
    ProceduralAdditive,  // Anim procedural aditiva (cyber-limb twitch, gill pulse)
    MontageBlend,        // Montage blending suave (emotes, abilities)
    IKCorrection         // Inverse Kinematics correction (species-specific)
};

UENUM(BlueprintType)
enum class EKhaaosPhysicsAnimPart : uint8
{
    None,
    Tail,           // Onith tail (chain of 6-8 bones)
    Wings,          // Skeetw wings/feathers (symmetric pair)
    FloatingCrystal,// Khael crystal orbit
    GillPulse,      // Huran gill breathing
    CyberLimb,      // Venex prosthetic limb
    EarBounce,      // Zheers ear physics
    Membrane        // Huran webbed membrane
};

USTRUCT(BlueprintType)
struct FKhaaosPhysicsAnimConfig
{
    GENERATED_BODY()

    /** Parte do corpo animada por physics */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosPhysicsAnimPart Part = EKhaaosPhysicsAnimPart::None;

    /** Nome do bone root para a cadeia de physics */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName RootBoneName;

    /** Nomes dos bones na cadeia (tail: tip→base, wings: L_Wing→L_WingTip) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<FName> BoneChain;

    /** Massa em kg por bone */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.01", ClampMax = "10.0"))
    float BoneMass = 0.5f;

    /** Stiffness da spring (mais alto = mais rígido) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.1", ClampMax = "100.0"))
    float Stiffness = 10.0f;

    /** Damping (0-1, mais alto = menos oscilação) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Damping = 0.7f;

    /** Gravidade aplicada (0 = sem gravidade, para cristais flutuantes) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float Gravity = -980.0f;

    /** Constrain rotation em graus (limite de rotação por bone) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "180.0"))
    float RotationConstraint = 45.0f;

    /** Custo estimado em ms de CPU time por frame */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    float EstimatedCPUTimeMs = 0.1f;

    /** Habilitado */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnabled = true;
};

USTRUCT(BlueprintType)
struct FKhaaosAnimBlendEntry
{
    GENERATED_BODY()

    /** Tipo de blending */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosAnimBlendType BlendType = EKhaaosAnimBlendType::LocomotionOverride;

    /** Slot de animação */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName AnimSlot;

    /** Peso de blending (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float BlendWeight = 1.0f;

    /** Velocidade de transição de blending */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.1", ClampMax = "20.0"))
    float BlendSpeed = 5.0f;
};

/**
 * FKhaaosBoneSpringState
 * Persistent 2-DOF rotational spring state for one bone in a physics chain.
 * Pitch/Yaw offsets are applied on top of the evaluated animation pose in
 * component space (post-physics tick), giving tails/wings/crystals the
 * delayed, springy secondary motion that reads as organic.
 */
USTRUCT(BlueprintType)
struct FKhaaosBoneSpringState
{
    GENERATED_BODY()

    /** Current rotational offset (deg): X = pitch, Y = yaw. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FVector2D OffsetDeg = FVector2D::ZeroVector;

    /** Spring angular velocity (deg/s): X = pitch, Y = yaw. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FVector2D VelocityDeg = FVector2D::ZeroVector;
};

UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosAnimationBlendManager : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosAnimationBlendManager();

    /** Inicializa physics animations para a espécie do owner */
    void InitializeForSpecies(EKhaaosSpecies Species);

    /** Tick principal — atualiza physics simulations e blending */
    virtual void TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Ativa uma physics animation part */
    void EnablePhysicsPart(EKhaaosPhysicsAnimPart Part, bool bEnable = true);

    /** Obtém config de physics para uma part */
    const FKhaaosPhysicsAnimConfig* GetPhysicsConfig(EKhaaosPhysicsAnimPart Part) const;

    /** Define peso de blending para um slot */
    void SetBlendWeight(const FName& Slot, float Weight, float BlendSpeed = 5.0f);

    /** Obtém peso de blending atual */
    float GetBlendWeight(const FName& Slot) const;

    /** Reage a evento de gameplay (ability activation, damage, etc.) */
    void OnGameplayEvent(const FName& EventName, float Intensity = 1.0f);

    /** Obtém custo total de CPU time das physics animations */
    float GetTotalCPUTimeMs() const { return TotalCPUTimeMs; }

    /** Debug: dump estado das physics animations */
    void DumpPhysicsState() const;

protected:

    /** Constrói configs de physics animation para cada espécie */
    TArray<FKhaaosPhysicsAnimConfig> BuildSpeciesPhysicsConfigs(EKhaaosSpecies Species) const;

    /** Atualiza physics simulation para uma part */
    void UpdatePhysicsPart(FKhaaosPhysicsAnimConfig& Config, float DeltaTime);

    /** Aplica resultado de physics aos bones do skeletal mesh */
    void ApplyPhysicsToBones(const FKhaaosPhysicsAnimConfig& Config);

private:
    /** Espécie atual */
    EKhaaosSpecies CurrentSpecies = EKhaaosSpecies::NONE;

    /** Configs de physics ativas */
    TArray<FKhaaosPhysicsAnimConfig> ActivePhysicsConfigs;

    /** Blending entries ativos */
    TMap<FName, FKhaaosAnimBlendEntry> ActiveBlends;

    /** Custo total de CPU time */
    float TotalCPUTimeMs = 0.0f;

    /** Inicializado */
    bool bInitialized = false;

    /** Cache de bone transforms para physics */
    TMap<FName, FTransform> CachedBoneTransforms;

    /** Velocidade do owner para reaction dynamics */
    FVector OwnerVelocity = FVector::ZeroVector;

    /** Velocidade do owner no frame anterior (derivada = aceleração). */
    FVector PrevOwnerVelocity = FVector::ZeroVector;

    /** Aceleração local do owner (X = forward, Y = lateral, Z = up) em uu/s^2. */
    FVector OwnerLocalAccel = FVector::ZeroVector;

    /** Taxa de rotação yaw do owner (deg/s) — dirige a reação de cauda/asas a curvas. */
    float OwnerYawRateDeg = 0.0f;

    /** Yaw do owner no frame anterior (para derivar yaw rate por instância). */
    float PrevOwnerYawDeg = 0.0f;

    /** Primeira amostra de yaw já capturada? */
    bool bOwnerYawInitialized = false;

    /** Estado persistente de spring por bone (chave = bone name). */
    TMap<FName, FKhaaosBoneSpringState> BoneSpringStates;

    /** Calcula aceleração local e yaw rate do owner. */
    void ComputeOwnerDynamics(float DeltaTime);
};
