// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosAnimationBlendManager
// Species-specific physics animation blending com spring simulation.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosAnimationBlendManager.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"

#include <cmath>

namespace
{
    /**
     * Semi-implicit damped spring step for a scalar rotational DOF.
     * Sub-stepped for stability on hitch frames. Returns new offset,
     * writes new velocity. Fully deterministic.
     */
    float SpringDof(float Offset, float& Velocity, float Target, float Stiffness, float DampingRatio, float Dt)
    {
        const float Critical = 2.0f * std::sqrt(std::fabs(Stiffness));
        const float Damping = Critical * DampingRatio;
        float Remaining = FMath::Clamp(Dt, 0.0f, 0.25f);
        const float MaxStep = 1.0f / 30.0f;
        while (Remaining > 0.0f)
        {
            const float H = (Remaining > MaxStep) ? MaxStep : Remaining;
            Remaining -= H;
            const float Accel = -Stiffness * (Offset - Target) - Damping * Velocity;
            Velocity += Accel * H;
            Offset += Velocity * H;
        }
        return Offset;
    }
}

UKhaaosAnimationBlendManager::UKhaaosAnimationBlendManager()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = ETickingGroup::TG_PostPhysics;
}

void UKhaaosAnimationBlendManager::InitializeForSpecies(EKhaaosSpecies Species)
{
    CurrentSpecies = Species;
    ActivePhysicsConfigs = BuildSpeciesPhysicsConfigs(Species);
    bInitialized = true;

    UE_LOG(LogTemp, Display, TEXT("[AnimBlend] Inicializado para espécie %s. %d physics parts."),
        *UEnum::GetDisplayValueAsText(Species).ToString(),
        ActivePhysicsConfigs.Num());
}

void UKhaaosAnimationBlendManager::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (!bInitialized) return;

    // Cache owner velocity e dinâmica (aceleração local + yaw rate) para
    // as reações de secondary motion — é a dinâmica que torna cauda/asas
    // orgânicas em vez de ornamentos estáticos.
    if (ACharacter* OwnerChar = Cast<ACharacter>(GetOwner()))
    {
        OwnerVelocity = OwnerChar->GetVelocity();
    }
    ComputeOwnerDynamics(DeltaTime);

    TotalCPUTimeMs = 0.0f;

    // Atualizar physics simulations
    for (FKhaaosPhysicsAnimConfig& Config : ActivePhysicsConfigs)
    {
        if (Config.bEnabled)
        {
            UpdatePhysicsPart(Config, DeltaTime);
            ApplyPhysicsToBones(Config);
            TotalCPUTimeMs += Config.EstimatedCPUTimeMs;
        }
    }

    // Atualizar blending weights (interpolar para target)
    for (auto& Pair : ActiveBlends)
    {
        FKhaaosAnimBlendEntry& Blend = Pair.Value;
        // Blending é gerenciado pelo Anim Blueprint via GetBlendWeight
    }
}

void UKhaaosAnimationBlendManager::ComputeOwnerDynamics(float DeltaTime)
{
    if (DeltaTime <= KINDA_SMALL_NUMBER)
    {
        return;
    }

    ACharacter* OwnerChar = Cast<ACharacter>(GetOwner());
    if (!OwnerChar)
    {
        return;
    }

    // Aceleração local (derivada da velocidade) — projeta o impulso que
    // cauda/asas/cristais devem reagir contra.
    const FVector Accel = (OwnerVelocity - PrevOwnerVelocity) / DeltaTime;
    PrevOwnerVelocity = OwnerVelocity;

    const FRotator YawRot(0.0f, OwnerChar->GetActorRotation().Yaw, 0.0f);
    const FVector Forward = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X);
    const FVector Right = FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y);

    OwnerLocalAccel.X = static_cast<float>(FVector::DotProduct(Accel, Forward));
    OwnerLocalAccel.Y = static_cast<float>(FVector::DotProduct(Accel, Right));
    OwnerLocalAccel.Z = static_cast<float>(Accel.Z);

    // Yaw rate via delta de rotação do actor (estado por instância).
    const float CurrentYaw = OwnerChar->GetActorRotation().Yaw;
    if (!bOwnerYawInitialized)
    {
        PrevOwnerYawDeg = CurrentYaw;
        bOwnerYawInitialized = true;
        OwnerYawRateDeg = 0.0f;
    }
    else
    {
        OwnerYawRateDeg = FMath::FindDeltaAngleDegrees(PrevOwnerYawDeg, CurrentYaw) / DeltaTime;
        PrevOwnerYawDeg = CurrentYaw;
    }
}

void UKhaaosAnimationBlendManager::EnablePhysicsPart(EKhaaosPhysicsAnimPart Part, bool bEnable)
{
    for (FKhaaosPhysicsAnimConfig& Config : ActivePhysicsConfigs)
    {
        if (Config.Part == Part)
        {
            Config.bEnabled = bEnable;
            UE_LOG(LogTemp, Display, TEXT("[AnimBlend] Physics part %s %s"),
                *UEnum::GetDisplayValueAsText(Part).ToString(),
                bEnable ? TEXT("habilitado") : TEXT("desabilitado"));
            return;
        }
    }
}

const FKhaaosPhysicsAnimConfig* UKhaaosAnimationBlendManager::GetPhysicsConfig(EKhaaosPhysicsAnimPart Part) const
{
    for (const FKhaaosPhysicsAnimConfig& Config : ActivePhysicsConfigs)
    {
        if (Config.Part == Part) return &Config;
    }
    return nullptr;
}

void UKhaaosAnimationBlendManager::SetBlendWeight(const FName& Slot, float Weight, float BlendSpeed)
{
    FKhaaosAnimBlendEntry Entry;
    Entry.BlendType = EKhaaosAnimBlendType::LocomotionOverride;
    Entry.AnimSlot = Slot;
    Entry.BlendWeight = FMath::Clamp(Weight, 0.0f, 1.0f);
    Entry.BlendSpeed = BlendSpeed;

    ActiveBlends.Add(Slot, Entry);
}

float UKhaaosAnimationBlendManager::GetBlendWeight(const FName& Slot) const
{
    if (const FKhaaosAnimBlendEntry* Entry = ActiveBlends.Find(Slot))
    {
        return Entry->BlendWeight;
    }
    return 0.0f;
}

void UKhaaosAnimationBlendManager::OnGameplayEvent(const FName& EventName, float Intensity)
{
    // Reações de physics a eventos de gameplay
    if (EventName == FName("TakeDamage"))
    {
        // Onith: tail whip reaction
        if (CurrentSpecies == EKhaaosSpecies::ONITH)
        {
            EnablePhysicsPart(EKhaaosPhysicsAnimPart::Tail, true);
            // Aumentar stiffness temporariamente para reação
            for (FKhaaosPhysicsAnimConfig& Config : ActivePhysicsConfigs)
            {
                if (Config.Part == EKhaaosPhysicsAnimPart::Tail)
                {
                    Config.Stiffness = 25.0f * Intensity;
                }
            }
        }

        // Skeetw: wing flap reaction
        if (CurrentSpecies == EKhaaosSpecies::SKEETW)
        {
            EnablePhysicsPart(EKhaaosPhysicsAnimPart::Wings, true);
        }
    }
    else if (EventName == FName("AbilityActivated"))
    {
        // Khael: crystal orbit speedup
        if (CurrentSpecies == EKhaaosSpecies::KHAEL)
        {
            for (FKhaaosPhysicsAnimConfig& Config : ActivePhysicsConfigs)
            {
                if (Config.Part == EKhaaosPhysicsAnimPart::FloatingCrystal)
                {
                    Config.Stiffness *= 1.5f; // Aumentar rotação
                }
            }
        }
    }
    else if (EventName == FName("EnteringWater"))
    {
        // Huran: gill pulse acceleration
        if (CurrentSpecies == EKhaaosSpecies::HURAN)
        {
            EnablePhysicsPart(EKhaaosPhysicsAnimPart::GillPulse, true);
        }
    }
}

void UKhaaosAnimationBlendManager::DumpPhysicsState() const
{
    UE_LOG(LogTemp, Display, TEXT("[AnimBlend] === Physics Anim State (CPU: %.2fms) ==="), TotalCPUTimeMs);
    for (const FKhaaosPhysicsAnimConfig& Config : ActivePhysicsConfigs)
    {
        UE_LOG(LogTemp, Display, TEXT("  %s | Bones=%d | Stiffness=%.1f | Damping=%.2f | Enabled=%s"),
            *UEnum::GetDisplayValueAsText(Config.Part).ToString(),
            Config.BoneChain.Num(),
            Config.Stiffness, Config.Damping,
            Config.bEnabled ? TEXT("YES") : TEXT("NO"));
    }
}

TArray<FKhaaosPhysicsAnimConfig> UKhaaosAnimationBlendManager::BuildSpeciesPhysicsConfigs(EKhaaosSpecies Species) const
{
    TArray<FKhaaosPhysicsAnimConfig> Configs;

    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
    {
        // Brânquias com pulse breathing
        FKhaaosPhysicsAnimConfig GillConfig;
        GillConfig.Part = EKhaaosPhysicsAnimPart::GillPulse;
        GillConfig.RootBoneName = FName("Gill_L");
        GillConfig.BoneChain = { FName("Gill_L"), FName("Gill_R") };
        GillConfig.BoneMass = 0.1f;
        GillConfig.Stiffness = 5.0f;
        GillConfig.Damping = 0.8f;
        GillConfig.Gravity = 0.0f;     // Sem gravidade (breathing)
        GillConfig.RotationConstraint = 30.0f;
        GillConfig.EstimatedCPUTimeMs = 0.05f;
        Configs.Add(GillConfig);

        // Membranas com soft-body approximation
        FKhaaosPhysicsAnimConfig MembraneConfig;
        MembraneConfig.Part = EKhaaosPhysicsAnimPart::Membrane;
        MembraneConfig.RootBoneName = FName("Hand_L");
        MembraneConfig.BoneChain = { FName("Hand_L"), FName("Elbow_L"), FName("Hand_R"), FName("Elbow_R") };
        MembraneConfig.BoneMass = 0.05f;
        MembraneConfig.Stiffness = 3.0f;
        MembraneConfig.Damping = 0.9f;
        MembraneConfig.Gravity = 0.0f;
        MembraneConfig.RotationConstraint = 20.0f;
        MembraneConfig.EstimatedCPUTimeMs = 0.08f;
        Configs.Add(MembraneConfig);
        break;
    }

    case EKhaaosSpecies::KHAEL:
    {
        // Cristais flutuantes com spring physics (órbita)
        FKhaaosPhysicsAnimConfig CrystalConfig;
        CrystalConfig.Part = EKhaaosPhysicsAnimPart::FloatingCrystal;
        CrystalConfig.RootBoneName = FName("Crystal_01");
        CrystalConfig.BoneChain = { FName("Crystal_01"), FName("Crystal_02"), FName("Crystal_03") };
        CrystalConfig.BoneMass = 0.3f;
        CrystalConfig.Stiffness = 8.0f;   // Spring orbit
        CrystalConfig.Damping = 0.6f;
        CrystalConfig.Gravity = 0.0f;     // Anti-gravidade (flutuante)
        CrystalConfig.RotationConstraint = 360.0f; // Rotação livre
        CrystalConfig.EstimatedCPUTimeMs = 0.10f;
        Configs.Add(CrystalConfig);
        break;
    }

    case EKhaaosSpecies::VENEX:
    {
        // Membro cybernético com procedural twitch
        FKhaaosPhysicsAnimConfig CyberConfig;
        CyberConfig.Part = EKhaaosPhysicsAnimPart::CyberLimb;
        CyberConfig.RootBoneName = FName("UpperArm_R");
        CyberConfig.BoneChain = { FName("UpperArm_R"), FName("LowerArm_R"), FName("Hand_R") };
        CyberConfig.BoneMass = 0.8f;
        CyberConfig.Stiffness = 15.0f;
        CyberConfig.Damping = 0.85f;
        CyberConfig.Gravity = -980.0f;
        CyberConfig.RotationConstraint = 60.0f;
        CyberConfig.EstimatedCPUTimeMs = 0.06f;
        Configs.Add(CyberConfig);
        break;
    }

    case EKhaaosSpecies::ONITH:
    {
        // Cauda réptil com chain physics (6-8 bones)
        FKhaaosPhysicsAnimConfig TailConfig;
        TailConfig.Part = EKhaaosPhysicsAnimPart::Tail;
        TailConfig.RootBoneName = FName("Tail_01");
        TailConfig.BoneChain = {
            FName("Tail_01"), FName("Tail_02"), FName("Tail_03"),
            FName("Tail_04"), FName("Tail_05"), FName("Tail_06")
        };
        TailConfig.BoneMass = 0.4f;
        TailConfig.Stiffness = 12.0f;
        TailConfig.Damping = 0.75f;
        TailConfig.Gravity = -980.0f;
        TailConfig.RotationConstraint = 45.0f;
        TailConfig.EstimatedCPUTimeMs = 0.15f;  // Mais caro (6 bones)
        Configs.Add(TailConfig);
        break;
    }

    case EKhaaosSpecies::ZHEERS:
    {
        // Orelhas com subtle bounce
        FKhaaosPhysicsAnimConfig EarConfig;
        EarConfig.Part = EKhaaosPhysicsAnimPart::EarBounce;
        EarConfig.RootBoneName = FName("Ear_L");
        EarConfig.BoneChain = { FName("Ear_L"), FName("Ear_R") };
        EarConfig.BoneMass = 0.05f;
        EarConfig.Stiffness = 6.0f;
        EarConfig.Damping = 0.85f;
        EarConfig.Gravity = -980.0f;
        EarConfig.RotationConstraint = 25.0f;
        EarConfig.EstimatedCPUTimeMs = 0.04f;
        Configs.Add(EarConfig);
        break;
    }

    case EKhaaosSpecies::SKEETW:
    {
        // Asas/penas com flap physics (par simétrico)
        FKhaaosPhysicsAnimConfig WingConfig;
        WingConfig.Part = EKhaaosPhysicsAnimPart::Wings;
        WingConfig.RootBoneName = FName("Wing_L");
        WingConfig.BoneChain = {
            FName("Wing_L"), FName("Wing_L_Tip"),
            FName("Wing_R"), FName("Wing_R_Tip")
        };
        WingConfig.BoneMass = 0.2f;
        WingConfig.Stiffness = 7.0f;
        WingConfig.Damping = 0.65f;
        WingConfig.Gravity = -500.0f;     // Reduzida (aves)
        WingConfig.RotationConstraint = 90.0f;
        WingConfig.EstimatedCPUTimeMs = 0.12f;
        Configs.Add(WingConfig);
        break;
    }

    default:
        break;
    }

    return Configs;
}

void UKhaaosAnimationBlendManager::UpdatePhysicsPart(FKhaaosPhysicsAnimConfig& Config, float DeltaTime)
{
    // ── Secondary motion real: spring-damper por bone na cadeia ──
    // Cada bone reage com atraso progressivo (fim da cadeia deflete mais)
    // a: aceleração forward/lateral do owner, taxa de curva (yaw rate) e
    // gravidade relativa para partes pendulares.

    if (!Cast<ACharacter>(GetOwner()))
    {
        return;
    }

    const int32 ChainLen = FMath::Max(Config.BoneChain.Num(), 1);
    const float Stiffness = FMath::Max(Config.Stiffness, 0.1f);
    const float DampingRatio = FMath::Clamp(Config.Damping, 0.05f, 1.0f);

    // Alvos de deflexão (deg) derivados da dinâmica do owner.
    // Escalas empíricas: 1000 uu/s^2 de aceleração ≈ 6 graus de reação.
    const float AccelScale = 6.0f / 1000.0f;
    const float YawRateScale = 12.0f / 360.0f;

    const float PitchTargetBase = FMath::Clamp(-OwnerLocalAccel.X * AccelScale, -Config.RotationConstraint, Config.RotationConstraint);
    const float YawTargetBase   = FMath::Clamp(-OwnerLocalAccel.Y * AccelScale - OwnerYawRateDeg * YawRateScale * 10.0f,
                                               -Config.RotationConstraint, Config.RotationConstraint);

    for (int32 i = 0; i < Config.BoneChain.Num(); ++i)
    {
        const FName& BoneName = Config.BoneChain[i];

        // Atenuação progressiva: o fim da cadeia (cauda, ponta da asa)
        // reage com mais amplitude e menos stiffness — como molas em série.
        const float ChainT = static_cast<float>(i + 1) / static_cast<float>(ChainLen);
        const float ChainStiffness = Stiffness * FMath::Lerp(1.0f, 0.45f, ChainT);
        const float Amplitude = FMath::Lerp(0.6f, 1.6f, ChainT);

        const float TargetPitch = PitchTargetBase * Amplitude;
        const float TargetYaw = YawTargetBase * Amplitude;

        FKhaaosBoneSpringState& S = BoneSpringStates.FindOrAdd(BoneName);
        S.OffsetDeg.X = SpringDof(S.OffsetDeg.X, S.VelocityDeg.X, TargetPitch, ChainStiffness, DampingRatio, DeltaTime);
        S.OffsetDeg.Y = SpringDof(S.OffsetDeg.Y, S.VelocityDeg.Y, TargetYaw, ChainStiffness, DampingRatio, DeltaTime);

        // Constraints duros (nunca deforma o rig além do artístico).
        S.OffsetDeg.X = FMath::Clamp(S.OffsetDeg.X, -Config.RotationConstraint, Config.RotationConstraint);
        S.OffsetDeg.Y = FMath::Clamp(S.OffsetDeg.Y, -Config.RotationConstraint, Config.RotationConstraint);
    }
}

void UKhaaosAnimationBlendManager::ApplyPhysicsToBones(const FKhaaosPhysicsAnimConfig& Config)
{
    // ── Aplica os offsets de spring sobre a pose avaliada da animação ──
    // O componente ticka em TG_PostPhysics: a pose do frame já foi
    // avaliada, então GetBoneTransform devolve a pose final e
    // SetBoneTransformByName aplica o delta rotacional que será
    // renderizado neste frame. Nenhum estado de anim é corrompido.

    if (ACharacter* OwnerChar = Cast<ACharacter>(GetOwner()))
    {
        if (USkeletalMeshComponent* MeshComp = OwnerChar->GetMesh())
        {
            for (const FName& BoneName : Config.BoneChain)
            {
                FKhaaosBoneSpringState* State = BoneSpringStates.Find(BoneName);
                if (!State)
                {
                    continue;
                }
                if (FMath::IsNearlyZero(State->OffsetDeg.X, KINDA_SMALL_NUMBER) &&
                    FMath::IsNearlyZero(State->OffsetDeg.Y, KINDA_SMALL_NUMBER))
                {
                    continue; // Pose original sem custo de escrita.
                }

                const int32 BoneIdx = MeshComp->GetBoneIndex(BoneName);
                if (BoneIdx == INDEX_NONE)
                {
                    continue; // Skeleton variante sem o bone — degrada em silêncio.
                }

                const FTransform BoneTransform = MeshComp->GetBoneTransform(BoneIdx, EBoneSpaces::ComponentSpace);
                FRotator Rot = BoneTransform.GetRotation().Rotator();
                Rot.Pitch += State->OffsetDeg.X;
                Rot.Yaw += State->OffsetDeg.Y;
                Rot.Roll = FMath::Clamp(Rot.Roll + State->OffsetDeg.Y * 0.25f, -Config.RotationConstraint, Config.RotationConstraint);

                FTransform NewTransform(BoneTransform);
                NewTransform.SetRotation(Rot.Quaternion());
                MeshComp->SetBoneTransformByName(BoneName, NewTransform, EBoneSpaces::ComponentSpace);
            }
        }
    }
}
