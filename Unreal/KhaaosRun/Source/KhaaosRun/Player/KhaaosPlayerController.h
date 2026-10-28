// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "GameplayTagContainer.h"
#include "KhaaosPlayerController.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class AKhaaosHUD;
class AKhaaosCharacter;
class UKhaaosInputConfig;
class UKhaaosMobileControlsWidget;
class UInputAction;
class UInputMappingContext;

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnPlayerDied);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSpectateTargetChanged, const FString&, NewTargetId);

/**
 * AKhaaosPlayerController
 *
 * PhD-Level Player Controller for Multi-World Battle Royale.
 *
 * Responsibilities:
 *   - Enhanced Input routing (Move, Look, Jump, Fire, Reload, Sprint, Crouch,
 *     Slide, ToggleCamera, Interact, UseItem, NextWeapon, PrevWeapon,
 *     SpectateNext, Scoreboard)
 *   - Camera mode control (Third/First person toggle)
 *   - HUD reference management
 *   - Server RPCs for all player actions (fire, reload, use item, interact)
 *   - Client RPCs for UI updates (damage numbers, kill notifications)
 *   - Seamless spectate on death (auto-follow killer)
 *   - EOS session handling + voice chat integration
 *   - Anti-cheat: server-side movement validation
 *   - Console commands for debugging
 */
UCLASS(Blueprintable, config=Game)
class KHAAOSRUN_API AKhaaosPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AKhaaosPlayerController();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void OnRep_Pawn() override;

	// ─── Input Setup ────────────────────────────────────────────────────────

	/** Setup Enhanced Input bindings. Called from BeginPlay. */
	virtual void SetupInputComponent() override;

	// ─── Input Handlers (bound to Enhanced Input) ───────────────────────────

	/** Handle movement input (WASD / left stick). */
	void HandleMove(const struct FInputActionValue& Value);

	/** Handle look input (mouse / right stick). */
	void HandleLook(const FInputActionValue& Value);

	/** Handle jump. */
	void HandleJump(const FInputActionValue& Value);

	/** Handle fire (shoot weapon). */
	void HandleFire(const FInputActionValue& Value);

	/** Handle stop fire (release trigger). */
	void HandleStopFire(const FInputActionValue& Value);

	/** Handle reload. */
	void HandleReload(const FInputActionValue& Value);

	/** Handle sprint (hold or toggle). */
	void HandleSprint(const FInputActionValue& Value);

	/** Handle sprint release. */
	void HandleSprintRelease(const FInputActionValue& Value);

	/** Handle crouch. */
	void HandleCrouch(const FInputActionValue& Value);

	/** Handle crouch release. */
	void HandleCrouchRelease(const FInputActionValue& Value);

	/** Handle slide. */
	void HandleSlide(const FInputActionValue& Value);

	/** Handle ADS (aim down sights). */
	void HandleADS(const FInputActionValue& Value);

	/** Handle ADS release. */
	void HandleADSRelease(const FInputActionValue& Value);

	/** Handle camera toggle. */
	void HandleToggleCamera(const FInputActionValue& Value);

	/** Handle interact (doors, vehicles, loot). */
	void HandleInteract(const FInputActionValue& Value);

	/** Handle use item (consume heal/shield). */
	void HandleUseItem(const FInputActionValue& Value);

	/** Handle next weapon. */
	void HandleNextWeapon(const FInputActionValue& Value);

	/** Handle previous weapon. */
	void HandlePrevWeapon(const FInputActionValue& Value);

	/** Handle spectate next (dead player cycling). */
	void HandleSpectateNext(const FInputActionValue& Value);

	/** Handle scoreboard toggle. */
	void HandleScoreboard(const FInputActionValue& Value);

	/** Handle scoreboard release. */
	void HandleScoreboardRelease(const FInputActionValue& Value);

	/** Handle ultimate ability. */
	void HandleUltimate(const FInputActionValue& Value);
	void HandleAbilitySlot(int32 SlotIndex);
	void HandleAbilitySlot0(const FInputActionValue& Value);
	void HandleAbilitySlot1(const FInputActionValue& Value);
	void HandleAbilitySlot2(const FInputActionValue& Value);
	void HandleAbilitySlot3(const FInputActionValue& Value);
	void HandleAbilitySlot4(const FInputActionValue& Value);
	void HandleAbilitySlot5(const FInputActionValue& Value);
	void HandleAbilitySlot6(const FInputActionValue& Value);
	void HandleAbilitySlot7(const FInputActionValue& Value);

	/** Handle melee attack. */
	void HandleMelee(const FInputActionValue& Value);

	/** Called by the mobile HUD; consumed continuously from Tick for character movement. */
	void SetMobileTouchMoveAxis(FVector2D Axis);

	// ─── Server RPCs ────────────────────────────────────────────────────────

	/** Server: fire weapon. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerFire();
	/** Server: begin/end held fire; automatic shots are paced authoritatively. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerSetFireHeld(bool bHeld);

	/** Server: stop firing. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerStopFire();

	/** Server: reload weapon. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerReload();

	/** Server: use item from inventory. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerUseItem(FName ItemID);

	/** Server: interact with world object. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerInteract();

	/** Server: request spectate target change. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerRequestSpectate(const FString& TargetPlayerId);

	/** Server: cycle to next weapon slot. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerNextWeapon();

	/** Server: cycle to previous weapon slot. */
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerPrevWeapon();

	// ─── Client RPCs ────────────────────────────────────────────────────────

	/** Client: show damage number at screen position. */
	UFUNCTION(Client, Reliable)
	void ClientShowDamageNumber(float DamageAmount, FVector_NetQuantize WorldLocation, bool bIsCrit);

	/** Client: notify kill in feed. */
	UFUNCTION(Client, Reliable)
	void ClientNotifyKill(const FString& VictimName, const FString& KillerName);

	/** Client: match ended. */
	UFUNCTION(Client, Reliable)
	void ClientMatchEnded(const FString& WinnerId, int32 Placement);

	/** Client: world transition notification. */
	UFUNCTION(Client, Reliable)
	void ClientWorldTransition(FName NewWorldId);

	// ─── Spectator ──────────────────────────────────────────────────────────

	/** Enter spectate mode (called on death). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Controller|Spectator")
	void EnterSpectateMode();

	/** Cycle to next alive player in spectate. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Controller|Spectator")
	void SpectateNext();

	/** Auto-follow the player who killed this controller's pawn. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Controller|Spectator")
	void SpectateKiller(const FString& KillerId);

	/** Is this controller in spectate mode? */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Controller|Spectator")
	bool IsSpectating() const { return bIsSpectating; }

	// ─── Anti-Cheat: Movement Validation ────────────────────────────────────

	/**
	 * Validate movement on server.
	 * Checks speed, position validity, and reports anomalies.
	 * Returns true if movement is valid.
	 */
	bool ValidateMovement(float DeltaSeconds);

	/** Maximum allowed speed (server-enforced anti-cheat). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Controller|AntiCheat")
	float MaxAllowedSpeed = 1500.0f;

	/** Maximum allowed displacement per tick (anti-teleport). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Controller|AntiCheat")
	float MaxDisplacementPerTick = 50.0f;

	// ─── HUD ────────────────────────────────────────────────────────────────

	/** Get the HUD actor. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Controller|HUD")
	AKhaaosHUD* GetKhaaosHUD() const { return KhaaosHUD; }

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when the player dies (for spectator transition). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Controller")
	FOnPlayerDied OnPlayerDied;

	/** Broadcast when spectate target changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Controller|Spectator")
	FOnSpectateTargetChanged OnSpectateTargetChanged;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Input mapping context for gameplay. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Controller|Input")
	TSoftObjectPtr<UInputMappingContext> InputMappingContext;

	/** Input config data asset (maps actions to tags). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Controller|Input")
	TSoftObjectPtr<UKhaaosInputConfig> InputConfig;

	/** HUD class to spawn. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Controller|HUD")
	TSubclassOf<AKhaaosHUD> HUDClass;

	/** Optional UMG subclass containing the authored mobile touch layout. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Controller|HUD")
	TSubclassOf<UKhaaosMobileControlsWidget> MobileTouchControlsClass;

	/** Priority for input mapping context. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Controller|Input")
	int32 InputMappingPriority = 0;

private:
	/** Active UMG touch HUD, retained to keep its input state alive. */
	UPROPERTY(Transient)
	TObjectPtr<UKhaaosMobileControlsWidget> MobileTouchControls;

	/** Normalized left-stick input, replayed each local frame while HUD exists. */
	FVector2D MobileTouchMoveAxis = FVector2D::ZeroVector;

	/** Authoritative fire state and cadence tracking (server only). */
	bool bServerFireHeld = false;
	bool bServerFireButtonDown = false;
	bool bHasServerFired = false;
	double LastServerFireTimestamp = 0.0;
	double LastFireInputTimestamp = 0.0;
	bool bLocalFireHeld = false;
	double NextFireHeartbeatTimestamp = 0.0;
	void TryServerFireShot();

protected:

	// ─── Internal State ─────────────────────────────────────────────────────

	/** Whether we are in spectate mode. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Controller|Spectator")
	uint8 bIsSpectating : 1;

	/** Whether the scoreboard is currently visible. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Controller|HUD")
	uint8 bShowScoreboard : 1;

	/** Cached HUD reference. */
	UPROPERTY()
	TObjectPtr<AKhaaosHUD> KhaaosHUD;

	/** Cached character reference. */
	UPROPERTY()
	TObjectPtr<AKhaaosCharacter> CachedCharacter;

	/** Last validated position (for anti-cheat). */
	FVector LastValidatedPosition = FVector::ZeroVector;

	/** Number of movement violations detected (for kick threshold). */
	int32 MovementViolations = 0;

	/** Maximum movement violations before kick. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|Controller|AntiCheat")
	int32 MaxMovementViolations = 10;

	// ─── Internal Methods ───────────────────────────────────────────────────

	/** Create and setup HUD. */
	void CreateHUD();

	/** Cache character reference from possessed pawn. */
	void CacheCharacterRef();

	/** Bind a native input action by tag. */
	void BindNativeInputAction(UInputAction* Action, ETriggerEvent TriggerEvent,
		UObject* Object, FName FunctionName);

	/** Bind an ability input action by tag. */
	void BindAbilityInputAction(UInputAction* Action, ETriggerEvent TriggerEvent,
		UObject* Object, FName FunctionName);

	/** Called when the possessed character dies. */
	UFUNCTION()
	void OnCharacterDeath();

	// ─── Console Commands ───────────────────────────────────────────────────

	/** Console command: set camera mode (FirstPerson/ThirdPerson). */
	UFUNCTION(Exec)
	void SetCameraMode(FString Mode);

	/** Console command: dump player state to log. */
	UFUNCTION(Exec)
	void DumpPlayerState();

/** Button index: 0 is the protective option; 1 is the unsafe option. */
UFUNCTION(Server, Reliable, BlueprintCallable, Category = "Khaaos|CIGKV|Zu")
void ServerSubmitZuChoice(uint8 ChoiceIndex);

/** Blueprint hook to sequence the selected entry's camera, audio, and world effects. */
UFUNCTION(BlueprintImplementableEvent, Category = "Khaaos|CIGKV|Zu")
void PlayZuEntryCinematic(uint8 VariantIndex, float Duration);

/** Deliver the server-selected entry and display copy to the owning client. */
UFUNCTION(Client, Reliable)
void ClientBeginZuEntry(uint8 VariantIndex, FText Prompt, FText OptionA, FText OptionB, float CinematicDuration, float ResponseTimeout);

/** Hide the local prompt after resolution. */
UFUNCTION(Client, Reliable)
void ClientEndZuEntry();
};
