// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Player/KhaaosPlayerAnimInstance.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosCharacter;
class UKhaaosADSComponent;
class UKhaaosNaturalLocomotionComponent;

// ─── Equip Slot Enum (for animation blending) ─────────────────────────────────

UENUM(BlueprintType)
enum class EAnimEquipSlot : uint8
{
        None      UMETA(DisplayName = "NONE"),
        Primary   UMETA(DisplayName = "PRIMARY"),
        Secondary UMETA(DisplayName = "SECONDARY"),
        Melee     UMETA(DisplayName = "MELEE")
};

/**
 * UKhaaosPlayerAnimInstance
 *
 * PhD-Level AnimInstance for KhaaosCharacter.
 *
 * Features:
 *   - Blueprint-updateable properties for all animation states
 *   - NativeUpdateAnimation computes all params from character state
 *   - Direction calculation: ATan2 for strafe/forward blend
 *   - Layered animation: upper/lower body split for ADS aim offset
 *   - State machine transitions: Idle->Walk->Sprint, Idle->Crouch->Slide
 *   - Turn-in-place support
 *   - Equip slot tracking for weapon-specific animations
 *
 * Anim Graph Integration:
 *   ┌─────────────────────────────────────────────┐
 *   │  Locomotion SM (Idle/Walk/Sprint/Crouch/Slide)│
 *   │  → Speed, Direction, bIsSprinting, etc.      │
 *   ├─────────────────────────────────────────────┤
 *   │  Upper Body Overlay (ADS Aim Offset)         │
 *   │  → bIsAiming, Pitch for aim offset          │
 *   ├─────────────────────────────────────────────┤
 *   │  Combat Layer (Fire/Reload/Melee)            │
 *   │  → bIsFiring, bIsReloading, EquipSlot       │
 *   ├─────────────────────────────────────────────┤
 *   │  Death/Downed Layer                          │
 *   │  → bIsDowned, bIsDead                       │
 *   └─────────────────────────────────────────────┘
 */
UCLASS(Abstract, BlueprintType, Blueprintable)
class UKhaaosPlayerAnimInstance : public UAnimInstance
{
        GENERATED_BODY()

public:
        UKhaaosPlayerAnimInstance();

        // ─── Lifecycle ──────────────────────────────────────────────────────────

        virtual void NativeInitializeAnimation() override;
        virtual void NativeUpdateAnimation(float DeltaSeconds) override;

        // ─── Blueprint-Updateable Animation Properties ──────────────────────────

        /** Movement speed (units/sec). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Locomotion")
        float Speed = 0.0f;

        /** Movement direction in degrees (-180 to 180). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Locomotion")
        float Direction = 0.0f;

        /** Is the character sprinting? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Locomotion")
        uint8 bIsSprinting : 1;

        /** Is the character crouching? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Locomotion")
        uint8 bIsCrouching : 1;

        /** Is the character sliding (Free Fire slide)? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Locomotion")
        uint8 bIsSliding : 1;

        /** Is the character in the air (jumping/falling)? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Locomotion")
        uint8 bIsInAir : 1;

        /** Is the character aiming down sights? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Combat")
        uint8 bIsAiming : 1;

        /** Is the character firing? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Combat")
        uint8 bIsFiring : 1;

        /** Is the character reloading? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Combat")
        uint8 bIsReloading : 1;

        /** Is the character downed (awaiting revive)? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|State")
        uint8 bIsDowned : 1;

        /** Is the character dead? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|State")
        uint8 bIsDead : 1;

        /** Currently equipped weapon slot. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Combat")
        EAnimEquipSlot EquipSlot = EAnimEquipSlot::None;

        // ─── Aim Offset (Layered Upper Body) ────────────────────────────────────

        /** Controller pitch for aim offset (clamped -90 to 90). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|AimOffset")
        float AimPitch = 0.0f;

        /** Controller yaw for turn-in-place. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|AimOffset")
        float AimYaw = 0.0f;

        /** Turn-in-place threshold (degrees). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Anim|AimOffset")
        float TurnInPlaceThreshold = 90.0f;

        /** Is the character in a turn-in-place animation? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|AimOffset")
        uint8 bIsTurningInPlace : 1;

        // ─── Layered Blending ────────────────────────────────────────────────────

        /** Upper body blend weight for ADS aim offset (0) = full body, 1.0 = upper only). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Layered")
        float UpperBodyBlendWeight = 0.0f;

        /** ADS aim offset interpolation speed. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Anim|Layered")
        float AimOffsetInterpSpeed = 10.0f;

        // ─── Natural Locomotion (anti-robotization outputs) ───────────────────

        /** Smoothed speed from the natural locomotion kernel (use in blend spaces INSTEAD of raw speed). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float SmoothedSpeed = 0.0f;

        /** Smoothed movement direction (deg) — shortest-path wrapped, no parameter jumps. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float SmoothedDirection = 0.0f;

        /** 1 = moving, 0 = fully stopped (eased) — gate for stop/start transitions. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float StopEase = 1.0f;

        /** Body roll lean (deg) — apply additively to the spine root. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float LeanRoll = 0.0f;

        /** Body pitch lean (deg) — apply additively to the spine root. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float LeanPitch = 0.0f;

        /** Procedural stride phase (0..1) — drives gait-synced foot IK/audio. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float StridePhase = 0.0f;

        /** Landing absorption spring (approx -1..1) — blend land recovery anims. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float LandRecovery = 0.0f;

        /** True while an eased turn-in-place root rotation is in progress. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        bool bNaturalTurningInPlace = false;

        /** Pending turn yaw offset (deg) — feeds the turn-in-place anim node. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float TurnYawOffset = 0.0f;

        /** Head look yaw (deg) — apply to head bone via TwoBone/look-at node. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float HeadLookYaw = 0.0f;

        /** Head look pitch (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float HeadLookPitch = 0.0f;

        /** Breathing output (approx -1..1) — idle chest/spine additive layer. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float IdleBreath = 0.0f;

        /** Left foot IK vertical offset (cm). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float FootIKOffsetLeft = 0.0f;

        /** Right foot IK vertical offset (cm). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float FootIKOffsetRight = 0.0f;

        /** Left foot tilt (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float FootIKTiltLeft = 0.0f;

        /** Right foot tilt (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float FootIKTiltRight = 0.0f;

protected:

        /** Cached character reference. */
        UPROPERTY()
        TObjectPtr<AKhaaosCharacter> CachedCharacter;

        /** Cached ADS component. */
        UPROPERTY()
        TObjectPtr<UKhaaosADSComponent> CachedADSComp;

        /** Previous speed (for state change detection). */
        float PrevSpeed = 0.0f;

        /** Previous movement state (for transition logging). */
        uint8 PrevMovementState = 0;

        /** Update locomotion properties from character. */
        void UpdateLocomotion(float DeltaSeconds);

        /** Update combat properties from character. */
        void UpdateCombat(float DeltaSeconds);

        /** Update aim offset (turn-in-place + ADS layer). */
        void UpdateAimOffset(float DeltaSeconds);

        /** Update state machine transitions (log state changes). */
        void UpdateStateMachine();
};
