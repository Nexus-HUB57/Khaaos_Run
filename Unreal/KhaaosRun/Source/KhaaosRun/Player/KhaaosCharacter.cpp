// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Player/KhaaosCharacter.h"
#include "KhaaosRun.h"

#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Components/ChildActorComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "AbilitySystemComponent.h"
#include "Net/UnrealNetwork.h"

#include "Player/KhaaosPlayerState.h"
#include "Player/KhaaosPlayerController.h"
#include "Game/AbilitySystem/KhaaosAbility_SpeciesPassives.h"
#include "Game/AbilitySystem/KhaaosAbilityComponent.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "Game/Data/KhaaosWeaponComponent.h"
#include "Game/Combat/KhaaosADSComponent.h"
#include "Game/Spectator/KhaaosSpectatorComponent.h"
#include "Game/Data/KhaaosSpeciesDataAsset.h"
#include "Engine/SkeletalMesh.h"
#include "Game/Graphics/KhaaosCharacterLODSystem.h"
#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "Game/Character/KhaaosSpeciesMeshRegistry.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosCharacter::AKhaaosCharacter()
{
	// ── Network ──
	bReplicates = true;
	SetReplicateMovement(true);

	// ── Don't rotate character with camera ──
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	// ── Camera Boom (Third Person) ──
	SpringArmComp = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArmComp"));
	SpringArmComp->SetupAttachment(RootComponent);
	SpringArmComp->TargetArmLength = CameraBoomTargetArmLength;
	SpringArmComp->SocketOffset = FVector(0.0f, 0.0f, CameraBoomSocketOffsetZ);
	SpringArmComp->bUsePawnControlRotation = true;
	SpringArmComp->bDoCollisionTest = true;
	SpringArmComp->bEnableCameraLag = true;
	SpringArmComp->CameraLagSpeed = 10.0f;

	// ── Camera ──
	CameraComp = CreateDefaultSubobject<UCameraComponent>(TEXT("CameraComp"));
	CameraComp->SetupAttachment(SpringArmComp);
	CameraComp->FieldOfView = ThirdPersonFOV;
	CameraComp->bUsePawnControlRotation = false;

	// ── Weapon Child Actor ──
	WeaponChildActor = CreateDefaultSubobject<UChildActorComponent>(TEXT("WeaponChildActor"));
	WeaponChildActor->SetupAttachment(GetMesh(), TEXT("WeaponSocket"));

	// ── GAS Ability Component ──
	AbilityComp = CreateDefaultSubobject<UKhaaosAbilityComponent>(TEXT("AbilityComp"));

	// ── Attribute Set ──
	AttributeSet = CreateDefaultSubobject<UKhaaosAttributeSet>(TEXT("AttributeSet"));

	// ── Inventory ──
	InventoryComp = CreateDefaultSubobject<UKhaaosInventoryComponent>(TEXT("InventoryComp"));

	// ── Weapon Component ──
	WeaponComp = CreateDefaultSubobject<UKhaaosWeaponComponent>(TEXT("WeaponComp"));

	// ── ADS Component ──
	ADSComp = CreateDefaultSubobject<UKhaaosADSComponent>(TEXT("ADSComp"));

	// ── Spectator Component ──
	SpectatorComp = CreateDefaultSubobject<UKhaaosSpectatorComponent>(TEXT("SpectatorComp"));

	// ── Movement Component Setup ──
	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	if (MoveComp)
	{
		MoveComp->MaxWalkSpeed = WalkSpeed;
		MoveComp->MaxWalkSpeedCrouched = CrouchSpeed;
		MoveComp->JumpZVelocity = JumpHeight;
		MoveComp->AirControl = 0.2f;
		MoveComp->NavAgentProps.bCanCrouch = true;
		MoveComp->bOrientRotationToMovement = true;
		MoveComp->RotationRate.Yaw = 540.0f;
	}

	// ── Default Attribute Values ──
	Health = 100.0f;
	MaxHealth = 100.0f;
	Shield = 0.0f;
	MaxShield = 50.0f;
	Energy = 100.0f;
	MaxEnergy = 100.0f;
	Stamina = MaxStamina;

	// ── Movement Flags ──
	bIsSprinting = false;
	bIsCrouching = false;
	bIsSliding = false;
	bIsDowned = false;
	bIsDead = false;

	// ── Camera Mode ──
	CameraMode = ECameraMode::ThirdPerson;

	// ── Movement State ──
	MovementState = EMovementState::Walk;

	// ── Internal Timers ──
	SlideTimeRemaining = 0.0f;
	TimeSinceLastDamage = 0.0f;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Constructed"));
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosCharacter::BeginPlay()
{
	Super::BeginPlay();

	// Cache controller and player state
	CachedPC = Cast<AKhaaosPlayerController>(GetController());
	CachedPS = Cast<AKhaaosPlayerState>(GetPlayerState());

	// Initialize GAS if available
	if (AbilityComp)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: AbilityComponent initialized for %s"), *GetName());
	}

	if (UWorld* World = GetWorld()) { if (UKhaaosCharacterLODSystem* LODSys = World->GetSubsystem<UKhaaosCharacterLODSystem>()) { LODSys->RegisterCharacter(this); if (IsLocallyControlled()) LODSys->ForceHighLOD(this, true); } }
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: BeginPlay for %s"), *GetName());
}

void AKhaaosCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (bIsDead)
	{
		return;
	}

	// ── Stamina management ──
	TickStamina(DeltaSeconds);

	// ── Regen (health, shield, energy) ──
	TickRegen(DeltaSeconds);

	// ── Slide timeout ──
	TickSlide(DeltaSeconds);
	TickGlide(DeltaSeconds);
	TickSpeciesWater(DeltaSeconds);
	UpdateMovementState();
	if (UWorld* World = GetWorld())
	{
		if (UKhaaosCharacterLODSystem* LODSys = World->GetSubsystem<UKhaaosCharacterLODSystem>())
		{
			const EKhaaosCharacterLOD L = LODSys->GetCharacterLOD(this);
			int32 MeshLOD = 0;
			if (L == EKhaaosCharacterLOD::MEDIUM) MeshLOD = 1;
			else if (L == EKhaaosCharacterLOD::LOW) MeshLOD = 2;
			else if (L == EKhaaosCharacterLOD::CULLED) MeshLOD = 3;
			UpdateSpeciesMeshLOD(static_cast<float>(MeshLOD));
		}
	}
}

void AKhaaosCharacter::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);

	CachedPC = Cast<AKhaaosPlayerController>(NewController);
	CachedPS = Cast<AKhaaosPlayerState>(GetPlayerState());
	if (CachedPS && CachedPS->GetAbilitySystemComponent())
	{
		CachedPS->GetAbilitySystemComponent()->InitAbilityActorInfo(CachedPS, this);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: PossessedBy %s"), *GetNameSafe(NewController));
}

void AKhaaosCharacter::OnRep_PlayerState()
{
	Super::OnRep_PlayerState();

	CachedPS = Cast<AKhaaosPlayerState>(GetPlayerState());
	if (CachedPS && CachedPS->GetAbilitySystemComponent())
	{
		CachedPS->GetAbilitySystemComponent()->InitAbilityActorInfo(CachedPS, this);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: OnRep_PlayerState for %s"), *GetName());
}

// ─── Input Handlers ─────────────────────────────────────────────────────────────

void AKhaaosCharacter::MoveForward(float Value)
{
	if (bIsDead || FMath::IsNearlyZero(Value))
	{
		return;
	}

	// Get control rotation (yaw only for ground movement)
	const FRotator Rotation = Controller ? Controller->GetControlRotation() : FRotator::ZeroRotator;
	const FRotator YawRotation(0.0f, Rotation.Yaw, 0.0f);
	const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);

	AddMovementInput(Direction, Value);
}

void AKhaaosCharacter::MoveRight(float Value)
{
	if (bIsDead || FMath::IsNearlyZero(Value))
	{
		return;
	}

	const FRotator Rotation = Controller ? Controller->GetControlRotation() : FRotator::ZeroRotator;
	const FRotator YawRotation(0.0f, Rotation.Yaw, 0.0f);
	const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

	AddMovementInput(Direction, Value);
}

void AKhaaosCharacter::Turn(float Value)
{
	if (bIsDead)
	{
		return;
	}
	AddControllerYawInput(Value);
}

void AKhaaosCharacter::LookUp(float Value)
{
	if (bIsDead)
	{
		return;
	}
	AddControllerPitchInput(Value);
}


void AKhaaosCharacter::Jump()
{
	if (bIsDead || bIsDowned) return;
	if (bIsSliding) EndSlide();
	Super::Jump();
	TryStartGlide();
}

void AKhaaosCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);
	EndGlide();
}

void AKhaaosCharacter::TryStartGlide()
{
	if (bIsDead || bIsGliding) return;
	CachedPS = CachedPS ? CachedPS : Cast<AKhaaosPlayerState>(GetPlayerState());
	float AirBonus = (CachedPS && CachedPS->KhaaosAttributeSet) ? CachedPS->KhaaosAttributeSet->GetAirSpeedBonus() : 0.f;
	if (AirBonus <= 0.f) return;
	float Dur = 3.f;
	if (const UKhaaosAbility_SkeetwPassive* Sk = GetDefault<UKhaaosAbility_SkeetwPassive>()) Dur = Sk->GlideDuration;
	bIsGliding = true; GlideTimeRemaining = Dur;
	if (UCharacterMovementComponent* M = GetCharacterMovement())
	{
		DefaultGravityScale = M->GravityScale; DefaultAirControl = M->AirControl;
		M->GravityScale = FMath::Max(0.15f, DefaultGravityScale * 0.25f);
		M->AirControl = FMath::Clamp(DefaultAirControl + AirBonus, 0.f, 1.f);
	}
}

void AKhaaosCharacter::EndGlide()
{
	if (!bIsGliding) return;
	bIsGliding = false; GlideTimeRemaining = 0.f;
	if (UCharacterMovementComponent* M = GetCharacterMovement())
	{ M->GravityScale = DefaultGravityScale; M->AirControl = DefaultAirControl; }
}

void AKhaaosCharacter::TickGlide(float DeltaSeconds)
{
	if (!bIsGliding) return;
	UCharacterMovementComponent* M = GetCharacterMovement();
	if (!M) { EndGlide(); return; }
	GlideTimeRemaining -= DeltaSeconds;
	if (GlideTimeRemaining <= 0.f || M->IsMovingOnGround() || M->IsSwimming()) { EndGlide(); return; }
	CachedPS = CachedPS ? CachedPS : Cast<AKhaaosPlayerState>(GetPlayerState());
	const float AirBonus = (CachedPS && CachedPS->KhaaosAttributeSet) ? CachedPS->KhaaosAttributeSet->GetAirSpeedBonus() : 0.f;
	if (AirBonus > 0.f && M->IsFalling())
	{
		M->AddForce(GetActorForwardVector() * (WalkSpeed * AirBonus * 2.f));
		if (M->Velocity.Z < -400.f) M->Velocity.Z = FMath::Lerp(M->Velocity.Z, -200.f, FMath::Clamp(DeltaSeconds * 4.f, 0.f, 1.f));
	}
}

void AKhaaosCharacter::TickSpeciesWater(float DeltaSeconds)
{
	if (!HasAuthority() || bIsDead) return;
	UCharacterMovementComponent* M = GetCharacterMovement();
	if (!M || !M->IsSwimming()) return;
	CachedPS = CachedPS ? CachedPS : Cast<AKhaaosPlayerState>(GetPlayerState());
	if (!CachedPS || !CachedPS->KhaaosAttributeSet) return;
	const float R = CachedPS->KhaaosAttributeSet->GetWaterRegenPerSecond();
	if (R <= 0.f) return;
	const float Applied = CachedPS->KhaaosAttributeSet->Heal(R * DeltaSeconds);
	if (Applied > 0.f) { Health = CachedPS->KhaaosAttributeSet->GetHealth(); OnHealthChanged.Broadcast(Health, Applied); }
}

void AKhaaosCharacter::ApplySpeciesPresentation(FName SpeciesId)
{
	CachedSpeciesId = SpeciesId;
	UGameInstance* GI = GetGameInstance();
	if (!GI) return;
	EKhaaosSpecies Species = EKhaaosSpecies::NONE;
	if (SpeciesId.IsEqual(FName(TEXT("Huran")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::HURAN;
	else if (SpeciesId.IsEqual(FName(TEXT("Khael")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::KHAEL;
	else if (SpeciesId.IsEqual(FName(TEXT("Venex")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::VENEX;
	else if (SpeciesId.IsEqual(FName(TEXT("Onith")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::ONITH;
	else if (SpeciesId.IsEqual(FName(TEXT("Zheers")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::ZHEERS;
	else if (SpeciesId.IsEqual(FName(TEXT("Skeetw")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::SKEETW;
	if (Species == EKhaaosSpecies::NONE) return;
	if (UKhaaosSpeciesMeshRegistry* MeshReg = GI->GetSubsystem<UKhaaosSpeciesMeshRegistry>())
	{
		MeshReg->AsyncLoadSpeciesMeshes(Species);
		CurrentSpeciesMeshLOD = -1;
		UpdateSpeciesMeshLOD(0.f);
	}
	if (UKhaaosSpeciesVFXRegistry* VFXReg = GI->GetSubsystem<UKhaaosSpeciesVFXRegistry>())
	{
		FName VfxName = NAME_None;
		switch (Species) {
		case EKhaaosSpecies::HURAN: VfxName = FName(TEXT("RegenGlow")); break;
		case EKhaaosSpecies::KHAEL: VfxName = FName(TEXT("CryoShield")); break;
		case EKhaaosSpecies::VENEX: VfxName = FName(TEXT("CyberneticGlow")); break;
		case EKhaaosSpecies::ONITH: VfxName = FName(TEXT("ToxicAura")); break;
		case EKhaaosSpecies::ZHEERS: VfxName = FName(TEXT("RadGlow")); break;
		case EKhaaosSpecies::SKEETW: VfxName = FName(TEXT("Bioluminescence")); break;
		default: break;
		}
		if (!VfxName.IsNone() && GetMesh()) VFXReg->SpawnSpeciesVFX(Species, VfxName, GetMesh());
	}
}

void AKhaaosCharacter::UpdateSpeciesMeshLOD(float MeshLODLevel)
{
	const int32 Desired = FMath::Clamp(FMath::RoundToInt(MeshLODLevel), 0, 3);
	if (Desired == CurrentSpeciesMeshLOD || CachedSpeciesId.IsNone()) return;
	UGameInstance* GI = GetGameInstance();
	if (!GI) return;
	EKhaaosSpecies Species = EKhaaosSpecies::NONE;
	if (CachedSpeciesId.IsEqual(FName(TEXT("Huran")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::HURAN;
	else if (CachedSpeciesId.IsEqual(FName(TEXT("Khael")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::KHAEL;
	else if (CachedSpeciesId.IsEqual(FName(TEXT("Venex")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::VENEX;
	else if (CachedSpeciesId.IsEqual(FName(TEXT("Onith")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::ONITH;
	else if (CachedSpeciesId.IsEqual(FName(TEXT("Zheers")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::ZHEERS;
	else if (CachedSpeciesId.IsEqual(FName(TEXT("Skeetw")), ENameCase::IgnoreCase)) Species = EKhaaosSpecies::SKEETW;
	if (Species == EKhaaosSpecies::NONE) return;
	if (UKhaaosSpeciesMeshRegistry* MeshReg = GI->GetSubsystem<UKhaaosSpeciesMeshRegistry>())
	{
		TSoftObjectPtr<USkeletalMesh> Soft = MeshReg->GetSkeletalMeshForLOD(Species, Desired);
		if (USkeletalMeshComponent* Skel = GetMesh())
		{
			USkeletalMesh* Mesh = Soft.Get();
			if (!Mesh && !Soft.ToSoftObjectPath().IsNull()) Mesh = Soft.LoadSynchronous();
			if (Mesh) { Skel->SetSkeletalMesh(Mesh); CurrentSpeciesMeshLOD = Desired; }
		}
	}
}


// ─── Sprint ─────────────────────────────────────────────────────────────────────

void AKhaaosCharacter::StartSprint()
{
	if (bIsDead || bIsDowned || bIsSliding)
	{
		return;
	}

	// Need minimum stamina to start sprint
	if (Stamina < 5.0f)
	{
		UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCharacter: Cannot sprint -- insufficient stamina (%.1f)"), Stamina);
		return;
	}

	if (HasAuthority())
	{
		bIsSprinting = true;
		bIsCrouching = false;
		UpdateMovementSpeed();
		OnSprintStart.Broadcast();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Sprint started"));
	}
	else
	{
		ServerSprint(true);
	}
}

void AKhaaosCharacter::StopSprint()
{
	if (!bIsSprinting)
	{
		return;
	}

	if (HasAuthority())
	{
		bIsSprinting = false;
		UpdateMovementSpeed();
		OnSprintEnd.Broadcast();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Sprint stopped"));
	}
	else
	{
		ServerSprint(false);
	}
}

// ─── Crouch ─────────────────────────────────────────────────────────────────────

void AKhaaosCharacter::StartCrouch()
{
	if (bIsDead || bIsDowned || bIsSliding)
	{
		return;
	}

	if (HasAuthority())
	{
		bIsCrouching = true;
		bIsSprinting = false;
		Crouch();
		UpdateMovementSpeed();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Crouch started"));
	}
	else
	{
		ServerCrouch(true);
	}
}

void AKhaaosCharacter::StopCrouch()
{
	if (!bIsCrouching)
	{
		return;
	}

	if (HasAuthority())
	{
		bIsCrouching = false;
		UnCrouch();
		UpdateMovementSpeed();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Crouch stopped"));
	}
	else
	{
		ServerCrouch(false);
	}
}

// ─── Slide (Free Fire) ──────────────────────────────────────────────────────────

void AKhaaosCharacter::StartSlide()
{
	if (bIsDead || bIsDowned || bIsSliding)
	{
		return;
	}

	// Slide requires crouching or sprinting (Free Fire: sprint -> slide)
	if (!bIsCrouching && !bIsSprinting)
	{
		return;
	}

	// Need minimum stamina
	if (Stamina < 10.0f)
	{
		UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCharacter: Cannot slide -- insufficient stamina"));
		return;
	}

	if (HasAuthority())
	{
		bIsSliding = true;
		bIsSprinting = false;
		bIsCrouching = false;
		SlideTimeRemaining = SlideDuration;

		// Lower camera for slide
		if (SpringArmComp)
		{
			SpringArmComp->SocketOffset.Z = 10.0f;
		}

		UpdateMovementSpeed();
		OnSlideStart.Broadcast();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Slide started (%.1fs duration)"), SlideDuration);
	}
	else
	{
		ServerSlide();
	}
}

void AKhaaosCharacter::EndSlide()
{
	if (!bIsSliding)
	{
		return;
	}

	bIsSliding = false;
	SlideTimeRemaining = 0.0f;

	// Restore camera height
	if (SpringArmComp)
	{
		SpringArmComp->SocketOffset.Z = CameraBoomSocketOffsetZ;
	}

	UpdateMovementSpeed();
	OnSlideEnd.Broadcast();
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Slide ended"));
}

// ─── Camera Toggle ──────────────────────────────────────────────────────────────

void AKhaaosCharacter::ToggleCamera()
{
	ECameraMode NewMode = (CameraMode == ECameraMode::ThirdPerson)
		? ECameraMode::FirstPerson
		: ECameraMode::ThirdPerson;
	SetCameraMode(NewMode);
}

void AKhaaosCharacter::SetCameraMode(ECameraMode NewMode)
{
	if (CameraMode == NewMode)
	{
		return;
	}

	CameraMode = NewMode;

	if (CameraMode == ECameraMode::FirstPerson)
	{
		// First person: attach camera to mesh head socket, hide body
		if (CameraComp && GetMesh())
		{
			CameraComp->AttachToComponent(GetMesh(), FAttachmentTransformRules::KeepRelativeTransform, TEXT("HeadSocket"));
			CameraComp->FieldOfView = FirstPersonFOV;
		}
		if (GetMesh())
		{
			GetMesh()->SetOwnerNoSee(true);
			GetMesh()->SetOnlyOwnerSee(false);
		}
	}
	else
	{
		// Third person: attach camera to spring arm, show body
		if (CameraComp && SpringArmComp)
		{
			CameraComp->AttachToComponent(SpringArmComp, FAttachmentTransformRules::KeepRelativeTransform);
			CameraComp->FieldOfView = ThirdPersonFOV;
		}
		if (GetMesh())
		{
			GetMesh()->SetOwnerNoSee(false);
			GetMesh()->SetOnlyOwnerSee(true);
		}
	}

	OnCameraModeChanged.Broadcast(NewMode);
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Camera mode set to %s"),
		NewMode == ECameraMode::FirstPerson ? TEXT("FirstPerson") : TEXT("ThirdPerson"));
}

// ─── Species Integration ────────────────────────────────────────────────────────

void AKhaaosCharacter::ApplySpecies(const UKhaaosSpeciesDataAsset* SpeciesAsset)
{
	if (!SpeciesAsset || !HasAuthority())
	{
		return;
	}

	AppliedSpeciesAsset = SpeciesAsset;

	// ── Apply stats from species ──
	MaxHealth = static_cast<float>(SpeciesAsset->BaseHealth);
	Health = MaxHealth;
	MaxEnergy = static_cast<float>(SpeciesAsset->BaseEnergy);
	Energy = MaxEnergy;
	MaxStamina = static_cast<float>(SpeciesAsset->BaseStamina);
	Stamina = MaxStamina;
	MaxShield = static_cast<float>(SpeciesAsset->ShieldCapacity);
	Shield = MaxShield;

	// ── Apply movement speed from species ──
	WalkSpeed = 600.0f * SpeciesAsset->BaseSpeed;
	SprintSpeed = 900.0f * SpeciesAsset->BaseSpeed;

	UpdateMovementSpeed();

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: Species %s applied -- Health=%.0f, Speed=%.1f"),
		*SpeciesAsset->SpeciesID.ToString(), MaxHealth, WalkSpeed);

	// Species passives are UGameplayAbility specs on PlayerState's GAS ASC,
	// not UKhaaosAbilityAction entries in the Character's custom AbilityComp.
	CachedPS = CachedPS ? CachedPS : Cast<AKhaaosPlayerState>(GetPlayerState());
	if (CachedPS)
	{
		const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
		const bool bIsOnith = SpeciesAsset->SpeciesID.IsEqual(FName(TEXT("Onith")), ENameCase::IgnoreCase) ||
			(SpeciesAsset->PassiveAbilityTag.IsValid() && Tags.Ability_Passive_Species_Onith.IsValid() &&
				SpeciesAsset->PassiveAbilityTag == Tags.Ability_Passive_Species_Onith);
		CachedPS->SetSpeciesPassiveAbility(
			bIsOnith ? UKhaaosAbility_OnithPassive::StaticClass() : nullptr);
	}
}

// ─── Damage / Death ─────────────────────────────────────────────────────────────

float AKhaaosCharacter::ApplyDamage(float DamageAmount, AActor* DamageInstigator, const FGameplayTag& DamageType)
{
	if (!HasAuthority() || bIsDead || DamageAmount <= 0.0f)
	{
		return 0.0f;
	}

	CachedPS = CachedPS ? CachedPS : Cast<AKhaaosPlayerState>(GetPlayerState());
	if (CachedPS && CachedPS->KhaaosAttributeSet)
	{
		DamageAmount = UKhaaosAttributeSet::CalculateSpeciesMitigatedDamage(
			DamageAmount,
			DamageType,
			CachedPS->KhaaosAttributeSet->GetOnithProjectileDamageReduction(),
			CachedPS->KhaaosAttributeSet->GetOnithExplosionDamageReduction());
	}
	if (DamageAmount <= 0.0f)
	{
		return 0.0f;
	}

	// Record time of damage for out-of-combat regen
	TimeSinceLastDamage = 0.0f;

	float ActualDamage = InternalApplyDamage(DamageAmount, DamageInstigator);

	// Check for death
	if (Health <= 0.0f && !bIsDead)
	{
		Die(DamageInstigator);
	}

	return ActualDamage;
}

float AKhaaosCharacter::InternalApplyDamage(float DamageAmount, AActor* DamageInstigator)
{
	float RemainingDamage = DamageAmount;

	// ── Shield absorbs damage first ──
	if (Shield > 0.0f && RemainingDamage > 0.0f)
	{
		float OldShield = Shield;
		Shield = FMath::Clamp(Shield - RemainingDamage, 0.0f, MaxShield);
		float ShieldAbsorbed = OldShield - Shield;
		RemainingDamage -= ShieldAbsorbed;

		OnShieldChanged.Broadcast(Shield, -ShieldAbsorbed);
	}

	// ── Remaining damage goes to health ──
	if (RemainingDamage > 0.0f)
	{
		float OldHealth = Health;
		Health = FMath::Clamp(Health - RemainingDamage, 0.0f, MaxHealth);
		float HealthDamage = OldHealth - Health;

		OnHealthChanged.Broadcast(Health, -HealthDamage);
	}

	return DamageAmount - RemainingDamage;
}

float AKhaaosCharacter::Heal(float HealAmount)
{
	if (!HasAuthority() || HealAmount <= 0.0f || bIsDead)
	{
		return 0.0f;
	}

	float OldHealth = Health;
	Health = FMath::Clamp(Health + HealAmount, 0.0f, MaxHealth);
	float ActualHeal = Health - OldHealth;

	OnHealthChanged.Broadcast(Health, ActualHeal);
	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCharacter: Healed %.1f (Health=%.1f)"), ActualHeal, Health);

	return ActualHeal;
}

float AKhaaosCharacter::RepairShield(float Amount)
{
	if (!HasAuthority() || Amount <= 0.0f || bIsDead)
	{
		return 0.0f;
	}

	float OldShield = Shield;
	Shield = FMath::Clamp(Shield + Amount, 0.0f, MaxShield);
	float ActualRepair = Shield - OldShield;

	OnShieldChanged.Broadcast(Shield, ActualRepair);
	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosCharacter: Shield repaired %.1f (Shield=%.1f)"), ActualRepair, Shield);

	return ActualRepair;
}

void AKhaaosCharacter::Die(AActor* Killer)
{
	if (!HasAuthority() || bIsDead)
	{
		return;
	}

	bIsDead = true;
	bIsSprinting = false;
	bIsCrouching = false;
	bIsSliding = false;
	Health = 0.0f;

	// Set PlayerStatus to Eliminado
	if (CachedPS)
	{
		CachedPS->SetPlayerStatus(EPlayerStatus::Eliminado);
		if (Killer)
		{
			CachedPS->EliminatorId = Killer->GetUniqueID().ToString();
		}
	}

	// Disable movement
	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	if (MoveComp)
	{
		MoveComp->StopMovementImmediately();
		MoveComp->DisableMovement();
	}

	// Ragdoll
	if (GetMesh())
	{
		GetMesh()->SetCollisionProfileName(TEXT("Ragdoll"));
		GetMesh()->SetSimulatePhysics(true);
	}

	OnDeath.Broadcast();
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosCharacter: %s died (Killer=%s)"), *GetName(), *GetNameSafe(Killer));
}

// ─── RepNotify Callbacks ─────────────────────────────────────────────────────────

void AKhaaosCharacter::OnRep_Health(float OldHealth)
{
	float Delta = Health - OldHealth;
	OnHealthChanged.Broadcast(Health, Delta);
}

void AKhaaosCharacter::OnRep_Shield(float OldShield)
{
	float Delta = Shield - OldShield;
	OnShieldChanged.Broadcast(Shield, Delta);
}

void AKhaaosCharacter::OnRep_Energy(float OldEnergy)
{
	float Delta = Energy - OldEnergy;
	OnEnergyChanged.Broadcast(Energy, Delta);
}

void AKhaaosCharacter::OnRep_Stamina(float OldStamina)
{
	float Delta = Stamina - OldStamina;
	OnStaminaChanged.Broadcast(Stamina, Delta);
}

void AKhaaosCharacter::OnRep_CameraMode()
{
	// Reapply camera setup on client
	SetCameraMode(CameraMode);
}

// ─── Server RPCs ─────────────────────────────────────────────────────────────────

void AKhaaosCharacter::ServerSprint_Implementation(bool bWantsToSprint)
{
	if (bWantsToSprint)
	{
		StartSprint();
	}
	else
	{
		StopSprint();
	}
}

bool AKhaaosCharacter::ServerSprint_Validate(bool bWantsToSprint)
{
	return true;
}

void AKhaaosCharacter::ServerCrouch_Implementation(bool bWantsToCrouch)
{
	if (bWantsToCrouch)
	{
		StartCrouch();
	}
	else
	{
		StopCrouch();
	}
}

bool AKhaaosCharacter::ServerCrouch_Validate(bool bWantsToCrouch)
{
	return true;
}

void AKhaaosCharacter::ServerSlide_Implementation()
{
	StartSlide();
}

bool AKhaaosCharacter::ServerSlide_Validate()
{
	return true;
}

// ─── Internal Tick Functions ─────────────────────────────────────────────────────

void AKhaaosCharacter::UpdateMovementSpeed()
{
	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	if (!MoveComp)
	{
		return;
	}

	float TargetSpeed = WalkSpeed;

	if (bIsSliding)
	{
		TargetSpeed = SlideSpeed;
	}
	else if (bIsSprinting)
	{
		TargetSpeed = SprintSpeed;
	}
	else if (bIsCrouching)
	{
		TargetSpeed = CrouchSpeed;
	}

	// ADS reduces movement speed
	if (ADSComp && ADSComp->IsAiming())
	{
		TargetSpeed *= ADSComp->GetMovementSpeedModifier();
	}

	MoveComp->MaxWalkSpeed = TargetSpeed;
}

void AKhaaosCharacter::TickStamina(float DeltaSeconds)
{
	if (!HasAuthority())
	{
		return;
	}

	float OldStamina = Stamina;

	if (bIsSprinting)
	{
		// Drain stamina
		Stamina = FMath::Clamp(Stamina - StaminaDrainRate * DeltaSeconds, 0.0f, MaxStamina);

		// Auto-stop sprint when stamina depleted
		if (Stamina <= 0.0f)
		{
			StopSprint();
		}
	}
	else if (bIsSliding)
	{
		// Slides drain stamina at 1.5x rate
		Stamina = FMath::Clamp(Stamina - StaminaDrainRate * 1.5f * DeltaSeconds, 0.0f, MaxStamina);
	}
	else
	{
		// Regenerate stamina when not sprinting/sliding
		Stamina = FMath::Clamp(Stamina + StaminaRegenRate * DeltaSeconds, 0.0f, MaxStamina);
	}

	if (!FMath::IsNearlyEqual(OldStamina, Stamina))
	{
		OnStaminaChanged.Broadcast(Stamina, Stamina - OldStamina);
	}
}

void AKhaaosCharacter::TickRegen(float DeltaSeconds)
{
	if (!HasAuthority() || bIsDead)
	{
		return;
	}

	TimeSinceLastDamage += DeltaSeconds;

	// Only regen health/shield out of combat
	if (TimeSinceLastDamage >= OutOfCombatThreshold)
	{
		// Health regen
		if (HealthRegenRate > 0.0f && Health < MaxHealth)
		{
			float OldHealth = Health;
			Health = FMath::Clamp(Health + HealthRegenRate * DeltaSeconds, 0.0f, MaxHealth);
			OnHealthChanged.Broadcast(Health, Health - OldHealth);
		}

		// Shield regen
		if (ShieldRegenRate > 0.0f && Shield < MaxShield)
		{
			float OldShield = Shield;
			Shield = FMath::Clamp(Shield + ShieldRegenRate * DeltaSeconds, 0.0f, MaxShield);
			OnShieldChanged.Broadcast(Shield, Shield - OldShield);
		}
	}

	// Energy always regens
	if (EnergyRegenRate > 0.0f && Energy < MaxEnergy)
	{
		float OldEnergy = Energy;
		Energy = FMath::Clamp(Energy + EnergyRegenRate * DeltaSeconds, 0.0f, MaxEnergy);
		OnEnergyChanged.Broadcast(Energy, Energy - OldEnergy);
	}
}

void AKhaaosCharacter::TickSlide(float DeltaSeconds)
{
	if (!bIsSliding || !HasAuthority())
	{
		return;
	}

	SlideTimeRemaining -= DeltaSeconds;
	if (SlideTimeRemaining <= 0.0f)
	{
		EndSlide();
	}
}

void AKhaaosCharacter::UpdateMovementState()
{
	EMovementState NewState = EMovementState::Walk;

	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	if (!MoveComp)
	{
		return;
	}

	if (bIsSliding)
	{
		NewState = EMovementState::Slide;
	}
	else if (bIsSprinting)
	{
		NewState = EMovementState::Sprint;
	}
	else if (bIsCrouching)
	{
		NewState = EMovementState::Crouch;
	}
	else if (MoveComp->IsSwimming())
	{
		NewState = EMovementState::Swim;
	}
	else
	{
		NewState = EMovementState::Walk;
	}

	if (MovementState != NewState)
	{
		MovementState = NewState;
	}
}

// ─── Replication ─────────────────────────────────────────────────────────────────

void AKhaaosCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	// Replicated attributes
	DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosCharacter, Health, COND_None, REPNOTIFY_Always);
	DOREPLIFETIME(AKhaaosCharacter, MaxHealth);
	DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosCharacter, Shield, COND_None, REPNOTIFY_Always);
	DOREPLIFETIME(AKhaaosCharacter, MaxShield);
	DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosCharacter, Energy, COND_None, REPNOTIFY_Always);
	DOREPLIFETIME(AKhaaosCharacter, MaxEnergy);
	DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosCharacter, Stamina, COND_None, REPNOTIFY_Always);

	// Movement flags
	DOREPLIFETIME(AKhaaosCharacter, bIsSprinting);
	DOREPLIFETIME(AKhaaosCharacter, bIsCrouching);
	DOREPLIFETIME(AKhaaosCharacter, bIsSliding);
	DOREPLIFETIME(AKhaaosCharacter, bIsDowned);
	DOREPLIFETIME(AKhaaosCharacter, bIsDead);

	// Camera & movement state
	DOREPLIFETIME(AKhaaosCharacter, CameraMode);
	DOREPLIFETIME(AKhaaosCharacter, MovementState);
}
