// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/AnimInstance.h"
#include "Game/Animation/KhaaosSpeciesAnimInstance.generated.h"

// ─── Species Animation Constants ───────────────────────────────────────────────

/**
 * EKhaaosSpecies
 * All 6 Khaaos Run species for animation set selection.
 */
UENUM(BlueprintType)
enum class EKhaaosSpecies : uint8
{
        Zheers  UMETA(DisplayName = "ZHEERS"),
        Onith   UMETA(DisplayName = "ONITH"),
        Skeetw  UMETA(DisplayName = "SKEETW"),
        Huran   UMETA(DisplayName = "HURAN"),
        Venex   UMETA(DisplayName = "VENEX"),
        Khael   UMETA(DisplayName = "KHAEL")
};

/**
 * EKhaaosMovementState
 * Movement state for animation blending.
 */
UENUM(BlueprintType)
enum class EKhaaosMovementState : uint8
{
        Idle      UMETA(DisplayName = "IDLE"),
        Walk      UMETA(DisplayName = "WALK"),
        Run       UMETA(DisplayName = "RUN"),
        Sprint    UMETA(DisplayName = "SPRINT"),
        Crouch    UMETA(DisplayName = "CROUCH"),
        Slide     UMETA(DisplayName = "SLIDE"),
        Jump      UMETA(DisplayName = "JUMP"),
        Fall      UMETA(DisplayName = "FALL"),
        Swim      UMETA(DisplayName = "SWIM"),
        Vehicle   UMETA(DisplayName = "VEHICLE"),
        Downed    UMETA(DisplayName = "DOWNED"),
        Parachute UMETA(DisplayName = "PARACHUTE")
};

/**
 * EKhaaosCombatState
 * Combat animation state.
 */
UENUM(BlueprintType)
enum class EKhaaosCombatState : uint8
{
        Relaxed     UMETA(DisplayName = "RELAXED"),
        ADS         UMETA(DisplayName = "ADS"),
        Firing      UMETA(DisplayName = "FIRING"),
        Reloading   UMETA(DisplayName = "RELOADING"),
        Melee       UMETA(DisplayName = "MELEE"),
        Throwing    UMETA(DisplayName = "THROWING"),
        Reviving    UMETA(DisplayName = "REVIVING"),
        Healing     UMETA(DisplayName = "HEALING")
};

/**
 * UKhaaosSpeciesAnimInstance
 *
 * Per-species animation blueprint with 6 species-specific anim sets.
 * Each species has unique proportions, movement patterns, and combat
 * animations that reflect their lore and gameplay characteristics.
 *
 * Species Animation Profiles:
 *   Zheers:  Heavy armored, slow turns, powerful melee reach
 *   Onith:   Agile, quick direction changes, dual-wield stances
 *   Skeetw:  Mechanical precision, rigid movements, LMG bracing
 *   Huran:   Military training, efficient transitions, cover animations
 *   Venex:   Fluid and deceptive, dash animations, poison attacks
 *   Khael:   Mystical, float idles, energy channeling, shield stances
 *
 * Blend Tree:
 *   Movement: Idle→Walk→Run→Sprint (speed-based, with additive turn-in-place)
 *   Combat: Relaxed↔ADS (aim curve), Firing (additive), Reload (full-body override)
 *   Upper/Lower: Split for movement+combat blending
 *   IK: Foot placement IK for uneven terrain, hand IK for weapon holds
 *
 * Console Optimization:
 *   - Animation budget: 2ms per character on PS5/XSX
 *   - LOD: Full anim within 50m, reduced beyond 50m, billboard beyond 100m
 *   - Motion matching disabled on Switch2 (uses state machine only)
 */
UCLASS(Abstract, BlueprintType, meta=(BlueprintType))
class UKhaaosSpeciesAnimInstance : public UAnimInstance
{
        GENERATED_BODY()

public:

        UKhaaosSpeciesAnimInstance();

        virtual void NativeInitializeAnimation() override;
        virtual void NativeUpdateAnimation(float DeltaSeconds) override;

        // ─── Species Selection ──────────────────────────────────────────────────

        /** Set the active species (switches animation set). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim")
        void SetSpecies(EKhaaosSpecies InSpecies);

        /** Get current species. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Anim")
        EKhaaosSpecies GetSpecies() const { return Species; }

        // ─── State Updates ──────────────────────────────────────────────────────

        /** Update movement state. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim")
        void SetMovementState(EKhaaosMovementState State);

        /** Update combat state. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim")
        void SetCombatState(EKhaaosCombatState State);

        /** Set aim pitch for aim offset blending. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim")
        void SetAimPitch(float Pitch);

        /** Set aim yaw for turn-in-place. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Anim")
        void SetAimYaw(float Yaw);

        // ─── Animation Parameters ───────────────────────────────────────────────

        /** Movement speed (for blend tree). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        float MovementSpeed;

        /** Movement direction (for strafing blend). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        float MovementDirection;

        /** Aim pitch (-90 to 90). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        float AimPitch;

        /** Aim yaw (-180 to 180). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        float AimYaw;

        /** Current species. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        EKhaaosSpecies Species;

        /** Current movement state. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        EKhaaosMovementState MovementState;

        /** Current combat state. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        EKhaaosCombatState CombatState;

        /** Is character downed? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        uint8 bIsDowned : 1;

        /** Is character in vehicle? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        uint8 bIsInVehicle : 1;

        /** Is character parachuting? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim")
        uint8 bIsParachuting : 1;

        // ─── Species-Specific Parameters ────────────────────────────────────────

        /** Turn-in-place threshold (degrees before turning). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Species")
        float TurnInPlaceThreshold;

        /** Sprint speed multiplier (species-dependent). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Species")
        float SprintSpeedMultiplier;

        /** Melee reach (for animation distance). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Species")
        float MeleeReach;

        // ─── Natural Locomotion (anti-robotization outputs) ─────────────────

        /** Smoothed body roll lean (deg) — additive spine layer. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalLeanRoll = 0.0f;

        /** Smoothed body pitch lean (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalLeanPitch = 0.0f;

        /** Procedural stride phase (0..1) — gait-synced footsteps. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalStridePhase = 0.0f;

        /** Landing absorption spring (approx -1..1). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalLandRecovery = 0.0f;

        /** Breathing output (approx -1..1) — idle life. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalBreath = 0.0f;

        /** Head look yaw (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalHeadLookYaw = 0.0f;

        /** Head look pitch (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalHeadLookPitch = 0.0f;

        /** Foot IK vertical offsets (cm). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalFootIKOffsetL = 0.0f;

        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalFootIKOffsetR = 0.0f;

        /** Eased turn-in-place state and pending yaw offset (deg). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        bool bNaturalTurningInPlace = false;

        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Anim|Natural")
        float NaturalTurnYawOffset = 0.0f;

private:

        /** Apply species-specific defaults. */
        void ApplySpeciesProfile(EKhaaosSpecies InSpecies);

        /** Update movement parameters from owner. */
        void UpdateMovementParams();
};
