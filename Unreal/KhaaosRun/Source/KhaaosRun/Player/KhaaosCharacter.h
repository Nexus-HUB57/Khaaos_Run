// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GameplayTagContainer.h"
#include "Player/KhaaosCharacter.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UCameraComponent;
class USpringArmComponent;
class UChildActorComponent;
class UKhaaosAbilityComponent;
class UKhaaosAttributeSet;
class UKhaaosInventoryComponent;
class UKhaaosWeaponComponent;
class UKhaaosADSComponent;
class UKhaaosSpectatorComponent;
class UKhaaosSpeciesDataAsset;
class AKhaaosPlayerController;
class AKhaaosPlayerState;

// ─── Camera Mode Enum ─────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ECameraMode : uint8
{
	ThirdPerson UMETA(DisplayName = "THIRD_PERSON"),
	FirstPerson UMETA(DisplayName = "FIRST_PERSON")
};

// ─── Movement State Enum ──────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EMovementState : uint8
{
	Walk    UMETA(DisplayName = "WALK"),
	Sprint  UMETA(DisplayName = "SPRINT"),
	Crouch  UMETA(DisplayName = "CROUCH"),
	Slide   UMETA(DisplayName = "SLIDE"),
	Vault   UMETA(DisplayName = "VAULT"),
	Swim    UMETA(DisplayName = "SWIM"),
	Climb   UMETA(DisplayName = "CLIMB")
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnHealthChanged, float, NewHealth, float, Delta);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnShieldChanged, float, NewShield, float, Delta);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnEnergyChanged, float, NewEnergy, float, Delta);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnStaminaChanged, float, NewStamina, float, Delta);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnDeath);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnSprintStart);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnSprintEnd);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnSlideStart);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnSlideEnd);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCameraModeChanged, ECameraMode, NewMode);

/**
 * AKhaaosCharacter
 *
 * PhD-Level Character for Multi-World Battle Royale (60-100 players).
 * Free Fire / Garena quality movement and combat framework.
 *
 * Architecture:
 *   - ACharacter base with camera boom + child weapon actor
 *   - GAS integration via KhaaosAbilityComponent + KhaaosAttributeSet
 *   - Species-driven stats from KhaaosSpeciesDataAsset
 *   - Server-authoritative health/shield/energy/stamina with OnRep
 *   - Free Fire movement: Walk, Sprint, Crouch, Slide, Vault, Swim, Climb
 *   - First/Third person camera toggle
 *   - Component-based inventory, weapon, ADS, spectator
 *   - Full replication with server authority on all mutations
 *
 * Movement Tuning (Free Fire parity):
 *   WalkSpeed=600, SprintSpeed=900, CrouchSpeed=300
 *   SlideSpeed=1200, JumpHeight=600
 *   MaxStamina=100, StaminaDrainRate=10, StaminaRegenRate=5
 *   SlideDuration=1.5s
 */
UCLASS(Abstract, config=Game)
class AKhaaosCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AKhaaosCharacter();

	// ─── Component Accessors ────────────────────────────────────────────────

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UCameraComponent* GetCameraComponent() const { return CameraComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	USpringArmComponent* GetSpringArmComponent() const { return SpringArmComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UChildActorComponent* GetWeaponChildActor() const { return WeaponChildActor; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UKhaaosInventoryComponent* GetInventoryComponent() const { return InventoryComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UKhaaosWeaponComponent* GetWeaponComponent() const { return WeaponComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UKhaaosADSComponent* GetADSComponent() const { return ADSComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UKhaaosSpectatorComponent* GetSpectatorComponent() const { return SpectatorComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UKhaaosAbilityComponent* GetAbilityComponent() const { return AbilityComp; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character")
	UKhaaosAttributeSet* GetAttributeSet() const { return AttributeSet; }

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	virtual void PossessedBy(AController* NewController) override;
	virtual void OnRep_PlayerState() override;

	// ─── Input Handlers (routed from AKhaaosPlayerController) ───────────────

	/** Move forward/backward. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Input")
	void MoveForward(float Value);

	/** Move right/left. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Input")
	void MoveRight(float Value);

	/** Turn (yaw). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Input")
	void Turn(float Value);

	/** Look up/down (pitch). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Input")
	void LookUp(float Value);

	/** Enhanced jump with species modifier. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Input")
	virtual void Jump() override;

	// ─── Sprint ─────────────────────────────────────────────────────────────

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Movement")
	void StartSprint();

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Movement")
	void StopSprint();

	// ─── Crouch ─────────────────────────────────────────────────────────────

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Movement")
	void StartCrouch();

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Movement")
	void StopCrouch();

	// ─── Slide (Free Fire) ─────────────────────────────────────────────────

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Movement")
	void StartSlide();

	/** Slide end (called by timer or speed threshold). */
	void EndSlide();

	// ─── Camera Toggle ──────────────────────────────────────────────────────

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Camera")
	void ToggleCamera();

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Camera")
	void SetCameraMode(ECameraMode NewMode);

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Camera")
	ECameraMode GetCameraMode() const { return CameraMode; }

	// ─── Species Integration ────────────────────────────────────────────────

	/** Apply species data asset: mesh, stats, passive ability. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Species")
	void ApplySpecies(const UKhaaosSpeciesDataAsset* SpeciesAsset);

	/** Get currently applied species. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Species")
	const UKhaaosSpeciesDataAsset* GetSpeciesAsset() const { return AppliedSpeciesAsset; }

	// ─── Damage / Death ─────────────────────────────────────────────────────

	/**
	 * Server-authoritative damage application.
	 * Applies typed species mitigation, then reduces Shield before Health.
	 * Returns actual damage dealt.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Combat")
	float ApplyDamage(float DamageAmount, AActor* DamageInstigator, const FGameplayTag& DamageType);

	/** Heal health (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Combat")
	float Heal(float HealAmount);

	/** Repair shield (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Combat")
	float RepairShield(float Amount);

	/** Check if alive. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Combat")
	bool IsAlive() const { return Health > 0.0f; }

	/** Check if downed (for revive system). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Combat")
	bool IsDowned() const { return bIsDowned; }

	/** Handle death: set status, ragdoll, broadcast. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Character|Combat")
	virtual void Die(AActor* Killer);

	// ─── Movement State Queries ─────────────────────────────────────────────

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Movement")
	bool IsSprinting() const { return bIsSprinting; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Movement")
	bool IsCrouching() const { return bIsCrouching; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Movement")
	bool IsSliding() const { return bIsSliding; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Character|Movement")
	EMovementState GetMovementState() const { return MovementState; }

	// ─── RepNotify Callbacks ────────────────────────────────────────────────

	UFUNCTION()
	void OnRep_Health(float OldHealth);

	UFUNCTION()
	void OnRep_Shield(float OldShield);

	UFUNCTION()
	void OnRep_Energy(float OldEnergy);

	UFUNCTION()
	void OnRep_Stamina(float OldStamina);

	// ─── Server RPCs ────────────────────────────────────────────────────────

	/** Server: request sprint state change. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerSprint(bool bWantsToSprint);

	/** Server: request crouch state change. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerCrouch(bool bWantsToCrouch);

	/** Server: request slide. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerSlide();

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when health changes (UI health bar). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character")
	FOnHealthChanged OnHealthChanged;

	/** Broadcast when shield changes (UI shield bar). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character")
	FOnShieldChanged OnShieldChanged;

	/** Broadcast when energy changes (UI energy bar). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character")
	FOnEnergyChanged OnEnergyChanged;

	/** Broadcast when stamina changes (UI stamina bar). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character")
	FOnStaminaChanged OnStaminaChanged;

	/** Broadcast on death. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character")
	FOnDeath OnDeath;

	/** Broadcast when sprint starts. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character|Movement")
	FOnSprintStart OnSprintStart;

	/** Broadcast when sprint ends. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character|Movement")
	FOnSprintEnd OnSprintEnd;

	/** Broadcast when slide starts. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character|Movement")
	FOnSlideStart OnSlideStart;

	/** Broadcast when slide ends. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character|Movement")
	FOnSlideEnd OnSlideEnd;

	/** Broadcast when camera mode changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Character|Camera")
	FOnCameraModeChanged OnCameraModeChanged;

	// ─── Configurable Movement Properties ───────────────────────────────────

	/** Walk speed (units/sec). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	float WalkSpeed = 600.0f;

	/** Sprint speed (units/sec). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	float SprintSpeed = 900.0f;

	/** Crouch speed (units/sec). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	float CrouchSpeed = 300.0f;

	/** Slide speed (units/sec) -- Free Fire slide boost. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	float SlideSpeed = 1200.0f;

	/** Jump height (units). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	float JumpHeight = 600.0f;

	/** Maximum stamina. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Stamina")
	float MaxStamina = 100.0f;

	/** Stamina drain rate per second while sprinting. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Stamina")
	float StaminaDrainRate = 10.0f;

	/** Stamina regeneration rate per second. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Stamina")
	float StaminaRegenRate = 5.0f;

	/** Slide duration in seconds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	float SlideDuration = 1.5f;

	/** Camera boom arm length (third person). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	float CameraBoomTargetArmLength = 300.0f;

	/** Camera boom socket offset Z (third person). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	float CameraBoomSocketOffsetZ = 75.0f;

	/** First person camera FOV. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	float FirstPersonFOV = 90.0f;

	/** Third person camera FOV. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	float ThirdPersonFOV = 90.0f;

	/** Health regeneration per second (out of combat). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Regen")
	float HealthRegenRate = 0.0f;

	/** Shield regeneration per second (out of combat). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Regen")
	float ShieldRegenRate = 0.0f;

	/** Energy regeneration per second. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Regen")
	float EnergyRegenRate = 1.0f;

	/** Out-of-combat timer threshold for regen (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Character|Regen")
	float OutOfCombatThreshold = 5.0f;

	// ─── Replicated Attributes ──────────────────────────────────────────────

	/** Current health. */
	UPROPERTY(ReplicatedUsing = OnRep_Health, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float Health;

	/** Maximum health. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float MaxHealth;

	/** Current shield (absorbs damage before health). */
	UPROPERTY(ReplicatedUsing = OnRep_Shield, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float Shield;

	/** Maximum shield. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float MaxShield;

	/** Current energy (for species abilities). */
	UPROPERTY(ReplicatedUsing = OnRep_Energy, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float Energy;

	/** Maximum energy. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float MaxEnergy;

	/** Current stamina (for sprint/slide). */
	UPROPERTY(ReplicatedUsing = OnRep_Stamina, BlueprintReadOnly, Category = "Khaaos|Character|Attributes")
	float Stamina;

	// ─── Replicated Movement Flags ──────────────────────────────────────────

	/** Is the character sprinting? */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	uint8 bIsSprinting : 1;

	/** Is the character crouching? */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	uint8 bIsCrouching : 1;

	/** Is the character sliding? */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	uint8 bIsSliding : 1;

	/** Is the character downed (awaiting revive)? */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Combat")
	uint8 bIsDowned : 1;

	/** Is the character dead? */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Combat")
	uint8 bIsDead : 1;

	/** Current camera mode. */
	UPROPERTY(ReplicatedUsing = OnRep_CameraMode, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	ECameraMode CameraMode;

	/** Current movement state. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Character|Movement")
	EMovementState MovementState;

protected:

	// ─── Components ─────────────────────────────────────────────────────────

	/** Camera component for view. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	TObjectPtr<UCameraComponent> CameraComp;

	/** Spring arm for third-person camera boom. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Camera")
	TObjectPtr<USpringArmComponent> SpringArmComp;

	/** Child actor for currently equipped weapon. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Weapon")
	TObjectPtr<UChildActorComponent> WeaponChildActor;

	/** GAS ability component. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|GAS")
	TObjectPtr<UKhaaosAbilityComponent> AbilityComp;

	/** AttributeSet for GAS attributes. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|GAS")
	TObjectPtr<UKhaaosAttributeSet> AttributeSet;

	/** Inventory component. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Inventory")
	TObjectPtr<UKhaaosInventoryComponent> InventoryComp;

	/** Weapon component (ammo, reload, recoil, fire mode). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Weapon")
	TObjectPtr<UKhaaosWeaponComponent> WeaponComp;

	/** ADS (Aim Down Sights) component. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|ADS")
	TObjectPtr<UKhaaosADSComponent> ADSComp;

	/** Spectator component (active after elimination). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Spectator")
	TObjectPtr<UKhaaosSpectatorComponent> SpectatorComp;

	// ─── Species ────────────────────────────────────────────────────────────

	/** Applied species data asset (drives mesh, stats, passive). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Character|Species")
	const UKhaaosSpeciesDataAsset* AppliedSpeciesAsset = nullptr;

	// ─── Internal State ─────────────────────────────────────────────────────

	/** Time remaining in current slide. */
	float SlideTimeRemaining = 0.0f;

	/** Time since last damage taken (for out-of-combat regen). */
	float TimeSinceLastDamage = 0.0f;

	/** Cached pointer to owning player controller. */
	UPROPERTY()
	TObjectPtr<AKhaaosPlayerController> CachedPC;

	/** Cached pointer to player state. */
	UPROPERTY()
	TObjectPtr<AKhaaosPlayerState> CachedPS;

	/** RepNotify for camera mode. */
	UFUNCTION()
	void OnRep_CameraMode();

	/** Update character movement speed based on current state. */
	void UpdateMovementSpeed();

	/** Tick stamina drain/regen. */
	void TickStamina(float DeltaSeconds);

	/** Tick health/shield/energy regeneration. */
	void TickRegen(float DeltaSeconds);

	/** Tick slide timeout. */
	void TickSlide(float DeltaSeconds);

	/** Update replicated movement state enum. */
	void UpdateMovementState();

	/** Server-only: apply damage to health after shield absorption. */
	float InternalApplyDamage(float DamageAmount, AActor* DamageInstigator);
};
