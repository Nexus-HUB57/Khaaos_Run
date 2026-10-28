// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Player/KhaaosPlayerController.h"
#include "KhaaosRun.h"

#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpectatorPawn.h"
#include "Engine/World.h"

#include "Player/KhaaosCharacter.h"
#include "Player/KhaaosPlayerState.h"
#include "Game/UI/KhaaosHUD.h"
#include "Game/Input/KhaaosInputConfig.h"
#include "Game/Input/KhaaosInputTags.h"
#include "Game/Spectator/KhaaosSpectatorComponent.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "Game/Data/KhaaosWeaponComponent.h"
#include "Game/Combat/KhaaosADSComponent.h"
#include "Game/AntiCheat/KhaaosMovementValidator.h"
#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.h"
#include "Game/UI/Widgets/KhaaosMobileControlsWidget.h"
#include "Game/World/CIGKV/KhaaosZuCinematicComponent.h"
#include "Kismet/GameplayStatics.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosPlayerController::AKhaaosPlayerController()
{
	// ── Disable default navigation avoidance ──
	bIsLocalPlayerController = false;

	// ── State ──
	bIsSpectating = false;
	bShowScoreboard = false;
	MovementViolations = 0;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Constructed"));
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosPlayerController::BeginPlay()
{
	Super::BeginPlay();

	// ── Create HUD ──
	CreateHUD();
	// A custom UMG subclass owns the mobile layout; the default virtual joystick
	// stays disabled to avoid presenting two competing touch-control schemes.
#if PLATFORM_ANDROID || PLATFORM_IOS
	if (IsLocalController() && MobileTouchControlsClass)
	{
		MobileTouchControls = CreateWidget<UKhaaosMobileControlsWidget>(this, MobileTouchControlsClass);
		if (MobileTouchControls)
		{
			MobileTouchControls->AddToPlayerScreen(100);
			UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Mobile touch HUD created"));
		}
	}
#endif

	// ── Cache character reference ──
	CacheCharacterRef();

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: BeginPlay for %s"), *GetName());
}

void AKhaaosPlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	// CharacterMovement consumes pending input every movement frame. Reapply the
	// virtual-stick value while the custom HUD is alive so a stationary finger
	// continues to move the character.
	if (IsLocalController() && MobileTouchControls && CachedCharacter && !CachedCharacter->bIsDead)
	{
		HandleMove(FInputActionValue(MobileTouchMoveAxis));
	}
	if (IsLocalController() && bLocalFireHeld && GetWorld())
	{
		const double Now = GetWorld()->GetTimeSeconds();
		if (Now >= NextFireHeartbeatTimestamp)
		{
			ServerSetFireHeld(true);
			NextFireHeartbeatTimestamp = Now + 0.25; // 4 Hz; do not enqueue an RPC every frame.
		}
	}

	// ── Server-side movement validation (anti-cheat) ──
	if (HasAuthority())
	{
		const double Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
		if (bServerFireButtonDown && (Now - LastFireInputTimestamp) > 2.0)
		{
			// A suspended mobile app or dead connection may never deliver release.
			bServerFireHeld = false;
			bServerFireButtonDown = false;
		}
		else if (bServerFireHeld && GetPawn())
		{
			TryServerFireShot();
		}
		if (GetPawn())
		{
			ValidateMovement(DeltaSeconds);
		}
	}
}

void AKhaaosPlayerController::OnRep_Pawn()
{
	Super::OnRep_Pawn();

	CacheCharacterRef();

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: OnRep_Pawn for %s"), *GetName());
}

// ─── Input Setup ─────────────────────────────────────────────────────────────────

void AKhaaosPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	// ── Add Input Mapping Context ──
	if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
		ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		if (InputMappingContext.IsValid())
		{
			UInputMappingContext* Context = InputMappingContext.LoadSynchronous();
			if (Context)
			{
				Subsystem->AddMappingContext(Context, InputMappingPriority);
				UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Input mapping context added"));
			}
		}
	}

	// ── Bind Enhanced Input Actions ──
	UEnhancedInputComponent* EnhancedInputComp = Cast<UEnhancedInputComponent>(InputComponent);
	if (!EnhancedInputComp)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosPlayerController: EnhancedInputComponent not found"));
		return;
	}

	// Load input config
	const FKhaaosInputTags& IT = FKhaaosInputTags::Get();

	// ── Native (always-bound) actions ──
	if (IT.Move)
	{
		EnhancedInputComp->BindAction(IT.Move, ETriggerEvent::Triggered, this, &AKhaaosPlayerController::HandleMove);
	}
	if (IT.Look)
	{
		EnhancedInputComp->BindAction(IT.Look, ETriggerEvent::Triggered, this, &AKhaaosPlayerController::HandleLook);
	}
	if (IT.Jump)
	{
		EnhancedInputComp->BindAction(IT.Jump, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleJump);
	}

	// ── Ability actions ──
	if (IT.Shoot)
	{
		EnhancedInputComp->BindAction(IT.Shoot, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleFire);
		EnhancedInputComp->BindAction(IT.Shoot, ETriggerEvent::Completed, this, &AKhaaosPlayerController::HandleStopFire);
	}
	if (IT.Reload)
	{
		EnhancedInputComp->BindAction(IT.Reload, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleReload);
	}
	if (IT.Sprint)
	{
		EnhancedInputComp->BindAction(IT.Sprint, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleSprint);
		EnhancedInputComp->BindAction(IT.Sprint, ETriggerEvent::Completed, this, &AKhaaosPlayerController::HandleSprintRelease);
	}
	if (IT.Slide)
	{
		EnhancedInputComp->BindAction(IT.Slide, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleSlide);
	}
	if (IT.ADS)
	{
		EnhancedInputComp->BindAction(IT.ADS, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleADS);
		EnhancedInputComp->BindAction(IT.ADS, ETriggerEvent::Completed, this, &AKhaaosPlayerController::HandleADSRelease);
	}
	if (IT.Melee)
	{
		EnhancedInputComp->BindAction(IT.Melee, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleMelee);
	}
	if (IT.Interact)
	{
		EnhancedInputComp->BindAction(IT.Interact, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleInteract);
	}
	if (IT.Ultimate)
	{
		EnhancedInputComp->BindAction(IT.Ultimate, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleUltimate);
	}
	if (IT.Shield)
	{
		EnhancedInputComp->BindAction(IT.Shield, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleUseItem);
	}
	if (IT.Heal)
	{
		EnhancedInputComp->BindAction(IT.Heal, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleUseItem);
	}
	if (IT.GrapplingHook)
	{
		EnhancedInputComp->BindAction(IT.GrapplingHook, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleInteract);
	}
	if (IT.PauseMenu)
	{
		EnhancedInputComp->BindAction(IT.PauseMenu, ETriggerEvent::Started, this, &AKhaaosPlayerController::HandleScoreboard);
		EnhancedInputComp->BindAction(IT.PauseMenu, ETriggerEvent::Completed, this, &AKhaaosPlayerController::HandleScoreboardRelease);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Input bindings complete"));
}

// ─── Input Handlers ──────────────────────────────────────────────────────────────

void AKhaaosPlayerController::HandleMove(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}

	const FVector2D MoveVector = Value.Get<FVector2D>();
	CachedCharacter->MoveForward(MoveVector.Y);
	CachedCharacter->MoveRight(MoveVector.X);
}

void AKhaaosPlayerController::HandleLook(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}

	const FVector2D LookVector = Value.Get<FVector2D>();
	CachedCharacter->Turn(LookVector.X);
	CachedCharacter->LookUp(LookVector.Y);
}

void AKhaaosPlayerController::SetMobileTouchMoveAxis(FVector2D Axis)
{
	if (Axis.SizeSquared() > 1.0f)
	{
		Axis.Normalize();
	}
	MobileTouchMoveAxis = Axis;
}

void AKhaaosPlayerController::HandleJump(const FInputActionValue& Value)
{
	if (CachedCharacter && !CachedCharacter->bIsDead)
	{
		CachedCharacter->Jump();
	}
}

void AKhaaosPlayerController::HandleFire(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	bLocalFireHeld = true;
	NextFireHeartbeatTimestamp = GetWorld() ? GetWorld()->GetTimeSeconds() + 0.25 : 0.0;
	ServerSetFireHeld(true);
}

void AKhaaosPlayerController::HandleStopFire(const FInputActionValue& Value)
{
	bLocalFireHeld = false;
	ServerStopFire();
}

void AKhaaosPlayerController::HandleReload(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	ServerReload();
}

void AKhaaosPlayerController::HandleSprint(const FInputActionValue& Value)
{
	if (CachedCharacter && !CachedCharacter->bIsDead)
	{
		CachedCharacter->StartSprint();
	}
}

void AKhaaosPlayerController::HandleSprintRelease(const FInputActionValue& Value)
{
	if (CachedCharacter)
	{
		CachedCharacter->StopSprint();
	}
}

void AKhaaosPlayerController::HandleCrouch(const FInputActionValue& Value)
{
	if (CachedCharacter && !CachedCharacter->bIsDead)
	{
		if (CachedCharacter->IsCrouching())
		{
			CachedCharacter->StopCrouch();
		}
		else
		{
			CachedCharacter->StartCrouch();
		}
	}
}

void AKhaaosPlayerController::HandleCrouchRelease(const FInputActionValue& Value)
{
	// For hold-to-crouch: release stops crouch
	// For toggle: this is a no-op
}

void AKhaaosPlayerController::HandleSlide(const FInputActionValue& Value)
{
	if (CachedCharacter && !CachedCharacter->bIsDead)
	{
		CachedCharacter->StartSlide();
	}
}

void AKhaaosPlayerController::HandleADS(const FInputActionValue& Value)
{
	if (CachedCharacter && !CachedCharacter->bIsDead)
	{
		if (UKhaaosADSComponent* ADS = CachedCharacter->GetADSComponent())
		{
			ADS->EnterADS();
		}
	}
}

void AKhaaosPlayerController::HandleADSRelease(const FInputActionValue& Value)
{
	if (CachedCharacter)
	{
		if (UKhaaosADSComponent* ADS = CachedCharacter->GetADSComponent())
		{
			ADS->ExitADS();
		}
	}
}

void AKhaaosPlayerController::HandleToggleCamera(const FInputActionValue& Value)
{
	if (CachedCharacter)
	{
		CachedCharacter->ToggleCamera();
	}
}

void AKhaaosPlayerController::HandleInteract(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	ServerInteract();
}

void AKhaaosPlayerController::HandleUseItem(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	// Use item from active inventory slot
	if (UKhaaosInventoryComponent* Inv = CachedCharacter->GetInventoryComponent())
	{
		FName ActiveItem = Inv->GetActiveWeaponId();
		if (ActiveItem != NAME_None)
		{
			ServerUseItem(ActiveItem);
		}
	}
}

void AKhaaosPlayerController::HandleNextWeapon(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	ServerNextWeapon();
}

void AKhaaosPlayerController::HandlePrevWeapon(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	ServerPrevWeapon();
}

void AKhaaosPlayerController::HandleSpectateNext(const FInputActionValue& Value)
{
	if (bIsSpectating)
	{
		SpectateNext();
	}
}

void AKhaaosPlayerController::HandleScoreboard(const FInputActionValue& Value)
{
	bShowScoreboard = true;
	if (KhaaosHUD)
	{
		KhaaosHUD->ShowScoreboard();
	}
}

void AKhaaosPlayerController::HandleScoreboardRelease(const FInputActionValue& Value)
{
	bShowScoreboard = false;
	if (KhaaosHUD)
	{
		KhaaosHUD->HideScoreboard();
	}
}

void AKhaaosPlayerController::HandleUltimate(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	// Activate species ultimate via GAS
	if (UKhaaosAbilityComponent* AbilityComp = CachedCharacter->GetAbilityComponent())
	{
		const FKhaaosInputTags& IT = FKhaaosInputTags::Get();
		if (IT.Tag_Input_Ultimate.IsValid())
		{
			AbilityComp->StartAction(CachedCharacter, IT.Tag_Input_Ultimate);
		}
	}
}

void AKhaaosPlayerController::HandleMelee(const FInputActionValue& Value)
{
	if (!CachedCharacter || CachedCharacter->bIsDead)
	{
		return;
	}
	// Melee attack via GAS
	if (UKhaaosAbilityComponent* AbilityComp = CachedCharacter->GetAbilityComponent())
	{
		const FKhaaosInputTags& IT = FKhaaosInputTags::Get();
		if (IT.Tag_Input_Melee.IsValid())
		{
			AbilityComp->StartAction(CachedCharacter, IT.Tag_Input_Melee);
		}
	}
}

// ─── Server RPCs ─────────────────────────────────────────────────────────────────

void AKhaaosPlayerController::ServerFire_Implementation()
{
	TryServerFireShot();
}

bool AKhaaosPlayerController::ServerFire_Validate()
{
	return true;
}

void AKhaaosPlayerController::ServerSetFireHeld_Implementation(bool bHeld)
{
	if (!bHeld)
	{
		bServerFireHeld = false;
		bServerFireButtonDown = false;
		return;
	}

	const bool bWasButtonDown = bServerFireButtonDown;
	bServerFireButtonDown = true;
	LastFireInputTimestamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	if (!bWasButtonDown)
	{
		bServerFireHeld = true;
		TryServerFireShot();
	}
	else if (!bServerFireHeld)
	{
		AKhaaosCharacter* Character = Cast<AKhaaosCharacter>(GetPawn());
		UKhaaosWeaponComponent* WeaponComponent = Character ? Character->GetWeaponComponent() : nullptr;
		if (WeaponComponent
			&& WeaponComponent->GetActiveFireMode() == EWeaponFireMode::Auto
			&& WeaponComponent->CanFire())
		{
			bServerFireHeld = true;
		}
	}
}

bool AKhaaosPlayerController::ServerSetFireHeld_Validate(bool bHeld)
{
	return true;
}

void AKhaaosPlayerController::TryServerFireShot()
{
	AKhaaosCharacter* Character = Cast<AKhaaosCharacter>(GetPawn());
	if (!Character || Character->bIsDead)
	{
		bServerFireHeld = false;
		return;
	}

	UKhaaosWeaponComponent* WeaponComponent = Character->GetWeaponComponent();
	const UKhaaosWeaponDataAsset* WeaponData = WeaponComponent ? WeaponComponent->GetCurrentWeapon() : nullptr;
	if (!WeaponComponent || !WeaponData)
	{
		bServerFireHeld = false;
		return;
	}

	const double Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	const double MinimumInterval = 60.0 / static_cast<double>(FMath::Max(WeaponData->FireRate, 1));
	if (bHasServerFired && (Now - LastServerFireTimestamp) + KINDA_SMALL_NUMBER < MinimumInterval)
	{
		return;
	}

	if (!WeaponComponent->ConsumeAmmo())
	{
		bServerFireHeld = false;
		return;
	}

	WeaponComponent->AddRecoil();
	LastServerFireTimestamp = Now;
	bHasServerFired = true;
	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosPlayerController: ServerFire at authoritative weapon cadence"));

	// Only automatic mode repeats on server tick. Semi/burst/charge modes fire
	// once per press until their dedicated burst/charge processing is added.
	bServerFireHeld = bServerFireButtonDown
		&& WeaponComponent->GetActiveFireMode() == EWeaponFireMode::Auto;
}

void AKhaaosPlayerController::ServerStopFire_Implementation()
{
	bServerFireHeld = false;
	bServerFireButtonDown = false;
	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosPlayerController: ServerStopFire"));
}

bool AKhaaosPlayerController::ServerStopFire_Validate()
{
	return true;
}

void AKhaaosPlayerController::ServerReload_Implementation()
{
	AKhaaosCharacter* Char = Cast<AKhaaosCharacter>(GetPawn());
	if (!Char || Char->bIsDead)
	{
		return;
	}

	if (UKhaaosWeaponComponent* WeaponComp = Char->GetWeaponComponent())
	{
		WeaponComp->StartReload();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: ServerReload"));
	}
}

bool AKhaaosPlayerController::ServerReload_Validate()
{
	return true;
}

void AKhaaosPlayerController::ServerUseItem_Implementation(FName ItemID)
{
	AKhaaosCharacter* Char = Cast<AKhaaosCharacter>(GetPawn());
	if (!Char || Char->bIsDead)
	{
		return;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: ServerUseItem %s"), *ItemID.ToString());
}

bool AKhaaosPlayerController::ServerUseItem_Validate(FName ItemID)
{
	return true;
}

void AKhaaosPlayerController::ServerInteract_Implementation()
{
	AKhaaosCharacter* Char = Cast<AKhaaosCharacter>(GetPawn());
	if (!Char || Char->bIsDead)
	{
		return;
	}

	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosPlayerController: ServerInteract"));
}

bool AKhaaosPlayerController::ServerInteract_Validate()
{
	return true;
}

void AKhaaosPlayerController::ServerRequestSpectate_Implementation(const FString& TargetPlayerId)
{
	if (!bIsSpectating)
	{
		return;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: ServerRequestSpectate -> %s"), *TargetPlayerId);
}

bool AKhaaosPlayerController::ServerRequestSpectate_Validate(const FString& TargetPlayerId)
{
	return true;
}

void AKhaaosPlayerController::ServerNextWeapon_Implementation()
{
	AKhaaosCharacter* Char = Cast<AKhaaosCharacter>(GetPawn());
	if (!Char || Char->bIsDead)
	{
		return;
	}

	if (UKhaaosInventoryComponent* Inv = Char->GetInventoryComponent())
	{
		Inv->CycleActiveWeapon();
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: ServerNextWeapon"));
	}
}

bool AKhaaosPlayerController::ServerNextWeapon_Validate()
{
	return true;
}

void AKhaaosPlayerController::ServerPrevWeapon_Implementation()
{
	// For now, prev weapon also cycles (2-weapon system)
	ServerNextWeapon_Implementation();
}

bool AKhaaosPlayerController::ServerPrevWeapon_Validate()
{
	return true;
}

// ─── Client RPCs ─────────────────────────────────────────────────────────────────

void AKhaaosPlayerController::ClientShowDamageNumber_Implementation(float DamageAmount, FVector_NetQuantize WorldLocation, bool bIsCrit)
{
	// Delegate to HUD for damage number display
	if (KhaaosHUD)
	{
		UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosPlayerController: DamageNumber %.1f at %s (Crit=%d)"),
			DamageAmount, *WorldLocation.ToString(), bIsCrit ? 1 : 0);
	}
}

void AKhaaosPlayerController::ClientNotifyKill_Implementation(const FString& VictimName, const FString& KillerName)
{
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Kill notification -- %s eliminated %s"), *KillerName, *VictimName);
}

void AKhaaosPlayerController::ClientMatchEnded_Implementation(const FString& WinnerId, int32 Placement)
{
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Match ended -- Winner=%s, Placement=%d"), *WinnerId, Placement);
}

void AKhaaosPlayerController::ClientWorldTransition_Implementation(FName NewWorldId)
{
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: World transition -> %s"), *NewWorldId.ToString());
}

// ─── Spectator ───────────────────────────────────────────────────────────────────

void AKhaaosPlayerController::EnterSpectateMode()
{
	if (bIsSpectating)
	{
		return;
	}

	bIsSpectating = true;

	// Use spectator component on character
	if (CachedCharacter)
	{
		if (UKhaaosSpectatorComponent* SpecComp = CachedCharacter->GetSpectatorComponent())
		{
			SpecComp->SetSpectatorMode(ESpectatorMode::FollowPlayer);
		}
	}

	// Change to spectator pawn
	if (HasAuthority())
	{
		// Server: switch state to spectator
		if (AKhaaosPlayerState* PS = Cast<AKhaaosPlayerState>(PlayerState))
		{
			PS->SetPlayerStatus(EPlayerStatus::Espectador);
		}
	}

	OnPlayerDied.Broadcast();
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Entered spectate mode"));
}

void AKhaaosPlayerController::SpectateNext()
{
	if (!bIsSpectating)
	{
		return;
	}

	if (CachedCharacter)
	{
		if (UKhaaosSpectatorComponent* SpecComp = CachedCharacter->GetSpectatorComponent())
		{
			SpecComp->FollowNextAlive();
			UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: SpectateNext"));
		}
	}
}

void AKhaaosPlayerController::SpectateKiller(const FString& KillerId)
{
	if (!bIsSpectating)
	{
		return;
	}

	if (CachedCharacter)
	{
		if (UKhaaosSpectatorComponent* SpecComp = CachedCharacter->GetSpectatorComponent())
		{
			SpecComp->FollowKiller(KillerId);
			OnSpectateTargetChanged.Broadcast(KillerId);
			UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: SpectateKiller -> %s"), *KillerId);
		}
	}
}

// ─── Anti-Cheat: Movement Validation ─────────────────────────────────────────────

bool AKhaaosPlayerController::ValidateMovement(float DeltaSeconds)
{
	if (!HasAuthority() || !GetPawn())
	{
		return true;
	}

	APawn* Pawn = GetPawn();
	FVector CurrentLocation = Pawn->GetActorLocation();
	FVector Velocity = Pawn->GetVelocity();
	float Speed = Velocity.Size();

	// ── Speed check ──
	if (Speed > MaxAllowedSpeed)
	{
		MovementViolations++;
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosPlayerController: Speed hack detected! Speed=%.1f > Max=%.1f (Violations=%d)"),
			Speed, MaxAllowedSpeed, MovementViolations);

		if (MovementViolations >= MaxMovementViolations)
		{
			UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosPlayerController: Kicking player for movement violations"));
			// In production: kick the player
			return false;
		}
	}

	// ── Teleport check ──
	if (!LastValidatedPosition.IsZero())
	{
		float Displacement = FVector::Dist(CurrentLocation, LastValidatedPosition);
		float MaxExpected = MaxAllowedSpeed * DeltaSeconds + MaxDisplacementPerTick;

		if (Displacement > MaxExpected)
		{
			MovementViolations++;
			UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosPlayerController: Teleport detected! Disp=%.1f > Max=%.1f (Violations=%d)"),
				Displacement, MaxExpected, MovementViolations);
		}
	}

	LastValidatedPosition = CurrentLocation;

	// Reset violations if movement is clean (decay)
	if (Speed <= MaxAllowedSpeed && MovementViolations > 0)
	{
		MovementViolations = FMath::Max(0, MovementViolations - 1);
	}

	return MovementViolations < MaxMovementViolations;
}

// ─── Internal Methods ────────────────────────────────────────────────────────────

void AKhaaosPlayerController::CreateHUD()
{
if (IsLocalPlayerController())
	{
KhaaosHUD = Cast<AKhaaosHUD>(GetHUD());
		if (KhaaosHUD)
		{
			KhaaosHUD->SetupHUD();
			UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: HUD created"));
		}
	}
}

void AKhaaosPlayerController::CacheCharacterRef()
{
	CachedCharacter = Cast<AKhaaosCharacter>(GetPawn());

	if (CachedCharacter)
	{
		// Bind to character death delegate
		CachedCharacter->OnDeath.AddDynamic(this, &AKhaaosPlayerController::OnCharacterDeath);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Cached character %s"), *CachedCharacter->GetName());
	}
}

void AKhaaosPlayerController::OnCharacterDeath()
{
	// Auto-enter spectate mode on death
	EnterSpectateMode();

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerController: Character died -- entering spectate"));
}

// ─── Console Commands ────────────────────────────────────────────────────────────

void AKhaaosPlayerController::SetCameraMode(FString Mode)
{
	if (!CachedCharacter)
	{
		return;
	}

	if (Mode.Compare(TEXT("FirstPerson"), ESearchCase::IgnoreCase) == 0)
	{
		CachedCharacter->SetCameraMode(ECameraMode::FirstPerson);
	}
	else if (Mode.Compare(TEXT("ThirdPerson"), ESearchCase::IgnoreCase) == 0)
	{
		CachedCharacter->SetCameraMode(ECameraMode::ThirdPerson);
	}
	else
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("SetCameraMode: Unknown mode '%s'. Use FirstPerson or ThirdPerson."), *Mode);
	}
}

void AKhaaosPlayerController::DumpPlayerState()
{
	UE_LOG(LogKhaaosRun, Log, TEXT("=== KhaaosPlayerController Dump ==="));
	UE_LOG(LogKhaaosRun, Log, TEXT("  Controller: %s"), *GetName());
	UE_LOG(LogKhaaosRun, Log, TEXT("  IsSpectating: %s"), bIsSpectating ? TEXT("true") : TEXT("false"));
	UE_LOG(LogKhaaosRun, Log, TEXT("  MovementViolations: %d"), MovementViolations);

	if (CachedCharacter)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("  Character: %s"), *CachedCharacter->GetName());
		UE_LOG(LogKhaaosRun, Log, TEXT("  Health: %.1f / %.1f"), CachedCharacter->Health, CachedCharacter->MaxHealth);
		UE_LOG(LogKhaaosRun, Log, TEXT("  Shield: %.1f / %.1f"), CachedCharacter->Shield, CachedCharacter->MaxShield);
		UE_LOG(LogKhaaosRun, Log, TEXT("  Energy: %.1f / %.1f"), CachedCharacter->Energy, CachedCharacter->MaxEnergy);
		UE_LOG(LogKhaaosRun, Log, TEXT("  Stamina: %.1f / %.1f"), CachedCharacter->Stamina, CachedCharacter->MaxStamina);
		UE_LOG(LogKhaaosRun, Log, TEXT("  IsSprinting: %s"), CachedCharacter->bIsSprinting ? TEXT("true") : TEXT("false"));
		UE_LOG(LogKhaaosRun, Log, TEXT("  IsCrouching: %s"), CachedCharacter->bIsCrouching ? TEXT("true") : TEXT("false"));
		UE_LOG(LogKhaaosRun, Log, TEXT("  IsSliding: %s"), CachedCharacter->bIsSliding ? TEXT("true") : TEXT("false"));
		UE_LOG(LogKhaaosRun, Log, TEXT("  IsDead: %s"), CachedCharacter->bIsDead ? TEXT("true") : TEXT("false"));
	}

	if (AKhaaosPlayerState* PS = Cast<AKhaaosPlayerState>(PlayerState))
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("  PlayerName: %s"), *PS->GetPlayerName());
		UE_LOG(LogKhaaosRun, Log, TEXT("  Kills: %d"), PS->Kills);
		UE_LOG(LogKhaaosRun, Log, TEXT("  Rating: %d"), PS->Rating);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("=== End Dump ==="));
}

// CIGKV entry flow remains on the same controller as the match/input features.
void AKhaaosPlayerController::ServerSubmitZuChoice_Implementation(uint8 ChoiceIndex)
{
    if (!HasAuthority())
    {
        return;
    }

    AKhaaosCIGKVLevel* CIGKVLevel = Cast<AKhaaosCIGKVLevel>(
        UGameplayStatics::GetActorOfClass(this, AKhaaosCIGKVLevel::StaticClass()));
    if (!CIGKVLevel || !CIGKVLevel->ResolveZuDecision(this, ChoiceIndex))
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Ignored Zu choice without an active entry"));
    }
}

void AKhaaosPlayerController::ClientBeginZuEntry_Implementation(
    uint8 VariantIndex,
    FText Prompt,
    FText OptionA,
    FText OptionB,
    float CinematicDuration,
    float ResponseTimeout)
{
    // 1) Spawn (or reuse) the local-only cinematic component and drive it.
    //    Component lives on the PlayerController so the cinematic survives a
    //    pawn swap (pawn is teleported by the level on BeginPlay).
    UKhaaosZuCinematicComponent* Cinematic = FindComponentByClass<UKhaaosZuCinematicComponent>();
    if (!Cinematic)
    {
        Cinematic = NewObject<UKhaaosZuCinematicComponent>(this, TEXT("KhaaosZuCinematic"));
        Cinematic->RegisterComponent();
    }
    if (Cinematic)
    {
        const EKhaaosZuCinematicVariant Variant =
            UKhaaosZuCinematicComponent::VariantFromByte(VariantIndex);
        Cinematic->BeginCinematic(this, Variant, CinematicDuration);
    }

    // 2) BP override still fires so existing Blueprints (if any) keep working.
    PlayZuEntryCinematic(VariantIndex, CinematicDuration);

    // 3) HUD prompt (existing behaviour — unchanged).
    if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(GetHUD()))
    {
        if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
        {
            HUDWidget->ShowZuEntryPrompt(VariantIndex, Prompt, OptionA, OptionB, CinematicDuration, ResponseTimeout);
            return;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[CIGKV] HUD widget is unavailable; Zu prompt could not be displayed"));
}

void AKhaaosPlayerController::ClientEndZuEntry_Implementation()
{
    if (UKhaaosZuCinematicComponent* Cinematic = FindComponentByClass<UKhaaosZuCinematicComponent>())
    {
        Cinematic->EndCinematic();
    }

    if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(GetHUD()))
    {
        if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
        {
            HUDWidget->HideZuEntryPrompt();
        }
    }
}
