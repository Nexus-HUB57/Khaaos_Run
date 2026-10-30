// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "NiagaraSystem.h"
#include "KhaaosAbility_Movement.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UCharacterMovementComponent;

/**
 * UKhaaosAbility_Sprint
 *
 * Sprint ability: overrides movement speed, consumes energy per tick,
 * cancels on damage.
 *
 * NetExecutionPolicy = LocalPredicted (movement is client-predicted).
 * InstancingPolicy = InstancedPerActor.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Sprint"))
class UKhaaosAbility_Sprint : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Sprint();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Sprint Configuration ─────────────────────────────────────────────

        /** Sprint speed multiplier (applied on top of base walk speed). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Sprint")
        float SprintSpeedMultiplier;

        /** Energy consumed per second while sprinting. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Sprint")
        float EnergyDrainPerSecond;

        /** Minimum energy required to start sprinting. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Sprint")
        float MinEnergyToActivate;

        // ─── VFX References ─────────────────────────────────────────────────

        /** Sprint speed trail Niagara VFX. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Sprint|VFX")
        TSoftObjectPtr<UNiagaraSystem> SprintTrailVFX;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Apply sprint speed. */
        UFUNCTION(Server, Reliable)
        void ServerApplySprintSpeed(float SpeedMultiplier);

        /** Server: Remove sprint speed. */
        UFUNCTION(Server, Reliable)
        void ServerRemoveSprintSpeed();

private:

        /** Tick for energy drain. */
        void OnSprintTick(float DeltaTime);

        /** Handle for the sprint tick timer. */
        FTimerHandle SprintTickHandle;

        /** Cached original walk speed. */
        float CachedWalkSpeed;
};

/**
 * UKhaaosAbility_Jump
 *
 * Simple jump ability with energy cost.
 * NetExecutionPolicy = LocalPredicted (client-predicted jump).
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Jump"))
class UKhaaosAbility_Jump : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Jump();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Jump Configuration ───────────────────────────────────────────────

        /** Jump Z velocity override (0 = use character default). */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Jump")
        float JumpZVelocity;

        /** Energy cost per jump. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Jump")
        float JumpEnergyCost;
};

/**
 * UKhaaosAbility_Slide
 *
 * Slide ability: crouch + speed boost, enter slide state,
 * auto-cancel after duration. Common in BR movement kits.
 *
 * NetExecutionPolicy = LocalPredicted.
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Slide"))
class UKhaaosAbility_Slide : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_Slide();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Slide Configuration ──────────────────────────────────────────────

        /** Slide speed multiplier. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Slide")
        float SlideSpeedMultiplier;

        /** Slide duration in seconds before auto-cancel. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Slide")
        float SlideDuration;

        /** Energy cost to initiate slide. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Slide")
        float SlideEnergyCost;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Apply slide speed and crouch state. */
        UFUNCTION(Server, Reliable)
        void ServerEnterSlideState(float SpeedMultiplier);

        /** Server: Exit slide state. */
        UFUNCTION(Server, Reliable)
        void ServerExitSlideState();

private:

        /** Timer handle for auto-cancel after SlideDuration. */
        FTimerHandle SlideDurationHandle;

        /** Cached original walk speed. */
        float CachedWalkSpeed;
};

/**
 * UKhaaosAbility_GrapplingHook
 *
 * Grappling hook: launches projectile hook, pulls player toward anchor,
 * cancels on collision with terrain/obstacle.
 *
 * NetExecutionPolicy = ServerInitiated (projectile spawn must be server-auth).
 */
UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = "Khaaos Grappling Hook"))
class UKhaaosAbility_GrapplingHook : public UKhaaosGameplayAbility
{
        GENERATED_BODY()

public:
        UKhaaosAbility_GrapplingHook();

        virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                const FGameplayEventData* TriggerEventData) override;

        virtual void EndAbility(const FGameplayAbilitySpecHandle Handle,
                const FGameplayAbilityActorInfo* ActorInfo,
                const FGameplayAbilityActivationInfo ActivationInfo,
                bool bReplicateEndAbility, bool bWasCancelled) override;

        // ─── Grapple Configuration ────────────────────────────────────────────

        /** Grappling hook projectile class. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Grapple")
        TSubclassOf<AActor> HookProjectileClass;

        /** Pull speed toward anchor. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Grapple")
        float PullSpeed;

        /** Maximum grapple distance. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Grapple")
        float MaxGrappleDistance;

        /** Maximum grapple duration before auto-release. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Grapple")
        float MaxGrappleDuration;

        /** Energy cost per grapple. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Grapple")
        float GrappleEnergyCost;

        // ─── VFX References ─────────────────────────────────────────────────

        /** Grapple rope Niagara VFX. */
        UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability|Grapple|VFX")
        TSoftObjectPtr<UNiagaraSystem> GrappleRopeVFX;

        // ─── Server RPC ────────────────────────────────────────────────────────

        /** Server: Spawn hook projectile. */
        UFUNCTION(Server, Reliable)
        void ServerSpawnHook(const FVector& Origin, const FVector& Direction);

        /** Server: Begin pulling player toward anchor. */
        UFUNCTION(Server, Reliable)
        void ServerBeginPull(const FVector& AnchorPoint);

        /** Server: Release grapple. */
        UFUNCTION(Server, Reliable)
        void ServerReleaseGrapple();

        // ─── Client RPC (VFX only) ────────────────────────────────────────────

        /** Client: Spawn grappling hook VFX (rope, etc.). */
        UFUNCTION(Client, Unreliable)
        void ClientSpawnGrappleVFX(const FVector& StartPoint, const FVector& AnchorPoint);

        /** Client: Remove grappling hook VFX. */
        UFUNCTION(Client, Unreliable)
        void ClientRemoveGrappleVFX();

private:

        /** Timer handle for max grapple duration. */
        FTimerHandle GrappleDurationHandle;

        /** Anchor point we're pulling toward. */
        UPROPERTY()
        FVector GrappleAnchor;

        /** Hook projectile instance. */
        UPROPERTY()
        TObjectPtr<AActor> HookProjectile;

        /** Tick for pull movement. */
        void OnGrappleTick(float DeltaTime);

        /** Handle for the grapple tick timer. */
        FTimerHandle GrappleTickHandle;
};
