// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
//
// Implementation of UKhaaosNaturalLocomotionComponent.
// Engine-side sampling only: all motion math lives in the unit-tested
// KhaaosLocomotionCore kernel.

#include "Game/Animation/KhaaosNaturalLocomotionComponent.h"

#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "CollisionQueryParams.h"
#include "KhaaosRun.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosNaturalLocomotionComponent::UKhaaosNaturalLocomotionComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = ETickingGroup::TG_PrePhysics;
    PrimaryComponentTick.bStartWithTickEnabled = true;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosNaturalLocomotionComponent::BeginPlay()
{
    Super::BeginPlay();

    CachedCharacter = Cast<ACharacter>(GetOwner());

    // Organic noise seed derived from the owner so a hundred characters
    // never breathe in unison (the "synchronized soldiers" tell).
    if (AActor* Owner = GetOwner())
    {
        const FString Name = Owner->GetName();
        uint32 Seed = 2166136261u;
        for (const TCHAR C : Name)
        {
            Seed ^= static_cast<uint32>(C);
            Seed *= 16777619u;
        }
        Config.NoiseSeed = Seed;
    }

    // Default profile until the gameplay layer declares the species.
    ApplySpeciesProfile(EKhaaosSpecies::HURAN);
    bProfileApplied = true;
}

void UKhaaosNaturalLocomotionComponent::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (!bEnabled)
    {
        return;
    }

    KhaaosLoco::FKhaaosLocomotionInput Input;
    SampleEngineState(DeltaTime, Input);

    KhaaosLoco::Step(Config, Core, Input);
    PublishOutputs();

    // Route procedural foot plants to gameplay (audio/VFX).
    const int32_t FootEvent = KhaaosLoco::ConsumeFootEvent(Core);
    if (FootEvent != 0)
    {
        OnFootstepPhase.Broadcast(FootEvent == 1);
    }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

void UKhaaosNaturalLocomotionComponent::ApplySpeciesProfile(EKhaaosSpecies Species)
{
    // Species locomotion identity (matches the lore-driven anim profiles in
    // KhaaosSpeciesAnimInstance): heavy species lean less and stride longer,
    // agile species lean more with quicker cadence.
    switch (Species)
    {
    case EKhaaosSpecies::ZHEERS:
        // Heavy armored: deliberate, grounded.
        Config.LeanRollMaxDeg = 7.0f;
        Config.LeanPitchMaxDeg = 5.0f;
        Config.LeanAccelFullRoll = 3000.0f;
        Config.StrideLengthCm = 180.0f;
        Config.BreathFrequencyHz = 0.18f;
        Config.LandStiffness = 130.0f; // stiffer knees (armor)
        break;

    case EKhaaosSpecies::ONITH:
        // Agile reptile: expressive lean, quick springy steps.
        Config.LeanRollMaxDeg = 13.0f;
        Config.LeanPitchMaxDeg = 9.0f;
        Config.LeanAccelFullRoll = 1600.0f;
        Config.StrideLengthCm = 140.0f;
        Config.BreathFrequencyHz = 0.26f;
        Config.LandStiffness = 75.0f;
        break;

    case EKhaaosSpecies::SKEETW:
        // Mechanical precision: minimal lean, metronome cadence kept
        // intentionally rigid — this species IS the uncanny one.
        Config.LeanRollMaxDeg = 5.0f;
        Config.LeanPitchMaxDeg = 4.0f;
        Config.LeanAccelFullRoll = 3200.0f;
        Config.StrideLengthCm = 165.0f;
        Config.BreathFrequencyHz = 0.0f; // no breathing (machine)
        break;

    case EKhaaosSpecies::HURAN:
        // Military baseline: Free Fire parity defaults.
        Config.LeanRollMaxDeg = 10.0f;
        Config.LeanPitchMaxDeg = 7.0f;
        Config.LeanAccelFullRoll = 2200.0f;
        Config.StrideLengthCm = 160.0f;
        Config.BreathFrequencyHz = 0.22f;
        Config.LandStiffness = 90.0f;
        break;

    case EKhaaosSpecies::VENEX:
        // Fluid & deceptive: max lean authority, whisper cadence.
        Config.LeanRollMaxDeg = 14.0f;
        Config.LeanPitchMaxDeg = 10.0f;
        Config.LeanAccelFullRoll = 1500.0f;
        Config.StrideLengthCm = 150.0f;
        Config.BreathFrequencyHz = 0.24f;
        Config.LandStiffness = 70.0f;
        break;

    case EKhaaosSpecies::KHAEL:
        // Mystical float: low lean, slow breath, soft landings.
        Config.LeanRollMaxDeg = 6.0f;
        Config.LeanPitchMaxDeg = 5.0f;
        Config.LeanAccelFullRoll = 2600.0f;
        Config.StrideLengthCm = 170.0f;
        Config.BreathFrequencyHz = 0.15f;
        Config.LandStiffness = 55.0f;
        Config.LandImpulseMax = 0.9f;
        break;

    case EKhaaosSpecies::NONE:
    default:
        break;
    }

    bProfileApplied = true;
}

void UKhaaosNaturalLocomotionComponent::SetNoiseSeed(int32 Seed)
{
    Config.NoiseSeed = static_cast<uint32_t>(Seed);
}

// ─── Runtime overrides ────────────────────────────────────────────────────────

void UKhaaosNaturalLocomotionComponent::NotifyLanding(float LandingSpeed)
{
    Core.LandRecoveryVelocity -= Config.LandImpulseMax *
        KhaaosLoco::ClampFloat(LandingSpeed / Config.LandVelocitySaturation, 0.0f, 1.0f) * 10.0f;
}

void UKhaaosNaturalLocomotionComponent::NotifyImpulse(float LateralAccel, float ForwardAccel)
{
    // Inject a one-frame acceleration spike (ability dashes, hits).
    Core.LeanRollVelocity += LateralAccel * 0.0005f;
    Core.LeanPitchVelocity += ForwardAccel * 0.0005f;
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

bool UKhaaosNaturalLocomotionComponent::DetectLanding(float& OutLandingSpeed)
{
    ACharacter* Char = CachedCharacter.Get();
    if (!Char)
    {
        return false;
    }

    const UCharacterMovementComponent* MoveComp = Char->GetCharacterMovement();
    const bool bFalling = MoveComp && MoveComp->IsFalling();

    if (bFalling)
    {
        FallingSpeedPeak = FMath::Max(FallingSpeedPeak, FMath::Abs(Char->GetVelocity().Z));
    }

    const bool bJustLanded = bPrevFalling && !bFalling;
    if (bJustLanded)
    {
        OutLandingSpeed = FallingSpeedPeak;
        FallingSpeedPeak = 0.0f;
    }

    bPrevFalling = bFalling;
    return bJustLanded;
}

void UKhaaosNaturalLocomotionComponent::ComputeAcceleration(float DeltaTime, float& OutLateral, float& OutForward)
{
    OutLateral = 0.0f;
    OutForward = 0.0f;

    ACharacter* Char = CachedCharacter.Get();
    if (!Char || DeltaTime <= KINDA_SMALL_NUMBER)
    {
        return;
    }

    const FVector Velocity = Char->GetVelocity();
    const FVector Acceleration = (Velocity - PrevVelocity) / DeltaTime;
    PrevVelocity = Velocity;

    // Project world acceleration into the character's local frame.
    const FRotator YawRot(0.0f, Char->GetActorRotation().Yaw, 0.0f);
    const FVector Right = FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y);
    const FVector Forward = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X);

    OutLateral = static_cast<float>(FVector::DotProduct(Acceleration, Right));
    OutForward = static_cast<float>(FVector::DotProduct(Acceleration, Forward));
}

void UKhaaosNaturalLocomotionComponent::TraceFoot(const FName& SocketName, float& OutGroundDeltaCm, float& OutTiltDeg)
{
    OutGroundDeltaCm = 0.0f;
    OutTiltDeg = 0.0f;

    ACharacter* Char = CachedCharacter.Get();
    if (!Char || !bEnableFootIK)
    {
        return;
    }

    USkeletalMeshComponent* Mesh = Char->GetMesh();
    if (!Mesh || !Mesh->DoesSocketExist(SocketName))
    {
        return;
    }

    const FVector FootLocation = Mesh->GetSocketLocation(SocketName);

    // LOD gate: stop tracing for far characters (spring state keeps integrating).
    const APlayerController* LocalPC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
    if (LocalPC && LocalPC->GetPawn())
    {
        const float DistSq = FVector::DistSquared(LocalPC->GetPawn()->GetActorLocation(), Char->GetActorLocation());
        if (DistSq > AnimLODFarDistanceCm * AnimLODFarDistanceCm)
        {
            return;
        }
    }

    FCollisionQueryParams Params(SCENE_QUERY_STAT(KhaaosFootIK), /*bTraceComplex*/ false);
    Params.AddIgnoredActor(Char);

    // Trace down from slightly above the foot to below the capsule half height.
    const float TraceStart = 15.0f;
    const float TraceDepth = 60.0f;
    FHitResult Hit;
    const bool bHit = GetWorld()->LineTraceSingleByChannel(
        Hit,
        FootLocation + FVector(0.0f, 0.0f, TraceStart),
        FootLocation - FVector(0.0f, 0.0f, TraceDepth),
        ECC_Visibility,
        Params);

    if (!bHit)
    {
        return;
    }

    // Height delta: how far the ground is from the foot's rest height.
    OutGroundDeltaCm = static_cast<float>(Hit.Location.Z - FootLocation.Z);

    // Tilt from the ground normal (roll around the character's forward axis).
    const float GroundPitch = FMath::RadiansToDegrees(FMath::Atan2(Hit.ImpactNormal.X, Hit.ImpactNormal.Z));
    OutTiltDeg = GroundPitch;
}

void UKhaaosNaturalLocomotionComponent::SampleEngineState(float DeltaTime, KhaaosLoco::FKhaaosLocomotionInput& Input)
{
    ACharacter* Char = CachedCharacter.Get();
    if (!Char)
    {
        // Detached: decay everything gracefully toward neutral.
        Input.DeltaTime = DeltaTime;
        Input.bSimulatedProxy = false;
        return;
    }

    Input.DeltaTime = DeltaTime;
    Input.TimeSeconds = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
    Input.bSimulatedProxy = !Char->HasAuthority() && !Char->IsLocallyControlled();

    // ── Planar speed & direction relative to facing ──
    const FVector Velocity = Char->GetVelocity();
    FVector Planar(Velocity.X, Velocity.Y, 0.0f);
    Input.RawSpeed = static_cast<float>(Planar.Size());

    if (Input.RawSpeed > KINDA_SMALL_NUMBER)
    {
        const FRotator ActorRot = Char->GetActorRotation();
        const FRotator YawRot(0.0f, ActorRot.Yaw, 0.0f);
        const FVector Forward = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X);
        const FVector Right = FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y);

        const float Fwd = static_cast<float>(FVector::DotProduct(Planar, Forward));
        const float Rgt = static_cast<float>(FVector::DotProduct(Planar, Right));
        Input.RawDirectionDeg = FMath::RadiansToDegrees(FMath::Atan2(Rgt, Fwd));
    }
    else
    {
        Input.RawDirectionDeg = Core.SmoothedDirectionDeg; // hold last direction
    }

    // ── Acceleration (lean) ──
    ComputeAcceleration(DeltaTime, Input.LateralAccel, Input.ForwardAccel);

    // ── Air state & landing ──
    const UCharacterMovementComponent* MoveComp = Char->GetCharacterMovement();
    Input.bInAir = MoveComp && MoveComp->IsFalling();
    Input.bJustLanded = DetectLanding(Input.LandingSpeed);

    // ── Residual yaw for turn-in-place ──
    if (const AController* Ctl = Char->GetController())
    {
        const float ControlYaw = Ctl->GetControlRotation().Yaw;
        Input.ResidualYawDeg = FMath::FindDeltaAngleDegrees(Char->GetActorRotation().Yaw, ControlYaw);
    }

    // ── Head look target (camera-driven for players, focus for AI) ──
    if (const AController* Ctl = Char->GetController())
    {
        const FRotator Control = Ctl->GetControlRotation();
        const FRotator Actor = Char->GetActorRotation();
        Input.HeadLookTargetYawDeg = FMath::FindDeltaAngleDegrees(Actor.Yaw, Control.Yaw);
        Input.HeadLookTargetPitchDeg = Control.Pitch * 0.5f; // damp: head ≠ camera
    }

    // ── Foot IK traces ──
    if (!Input.bInAir)
    {
        TraceFoot(FootLeftSocket, Input.FootGroundDeltaL, Input.FootGroundTiltL);
        TraceFoot(FootRightSocket, Input.FootGroundDeltaR, Input.FootGroundTiltR);
    }
}

void UKhaaosNaturalLocomotionComponent::PublishOutputs()
{
    SmoothedSpeed         = Core.SmoothedSpeed;
    SmoothedDirectionDeg  = Core.SmoothedDirectionDeg;
    StopEase              = Core.StopEase;
    LeanRollDeg           = Core.LeanRollDeg;
    LeanPitchDeg          = Core.LeanPitchDeg;
    StridePhase           = Core.StridePhase;
    LandRecovery          = Core.LandRecovery;
    bTurningInPlace       = Core.bTurningInPlace;
    TurnYawOffsetDeg      = Core.TurnYawOffsetDeg;
    HeadLookYawDeg        = Core.HeadLookYawDeg;
    HeadLookPitchDeg      = Core.HeadLookPitchDeg;
    Breath                = Core.Breath;
    FootOffsetLeftCm      = Core.FootLeft.HeightOffsetCm;
    FootOffsetRightCm     = Core.FootRight.HeightOffsetCm;
    FootTiltLeftDeg       = Core.FootLeft.TiltDeg;
    FootTiltRightDeg      = Core.FootRight.TiltDeg;
    NetworkSmoothedSpeed  = Core.NetworkSmoothedSpeed;
}
