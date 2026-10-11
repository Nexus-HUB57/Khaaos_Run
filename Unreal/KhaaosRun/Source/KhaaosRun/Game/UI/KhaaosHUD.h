// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "Game/UI/KhaaosHUD.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosHUDWidget;
class UKhaaosScoreboardWidget;
class UKhaaosMinimapWidget;
class UKhaaosPlayerState;

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnMatchStarted);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnMatchEnded);

/**
 * AKhaaosHUD
 *
 * Main HUD actor for Khaaos Run. Manages the creation and lifecycle
 * of all UI widgets: HUD overlay, scoreboard, and minimap.
 *
 * Design:
 *   - Creates widgets on BeginPlay and adds to viewport
 *   - Toggles scoreboard visibility on input
 *   - Binds to game state delegates for match lifecycle
 *   - Widgets use CommonUI (UCommonActivatableWidget) for
 *     input handling, focus, and activation
 *
 * Widget Architecture:
 *   ┌──────────────────────────────────────┐
 *   │  KhaaosHUDWidget (Overlay)           │
 *   │  ┌──────────┐  ┌──────────────────┐  │
 *   │  │ Minimap  │  │ Health/Shield/   │  │
 *   │  │          │  │ Energy/Ammo      │  │
 *   │  └──────────┘  └──────────────────┘  │
 *   │  ┌──────────────────────────────────┐│
 *   │  │ Ability Slots │ Kill Feed │ Ping ││
 *   │  └──────────────────────────────────┘│
 *   └──────────────────────────────────────┘
 *   ┌──────────────────────────────────────┐
 *   │  KhaaosScoreboardWidget (Tab toggle) │
 *   └──────────────────────────────────────┘
 */
UCLASS(Abstract)
class AKhaaosHUD : public AHUD
{
	GENERATED_BODY()

public:
	AKhaaosHUD();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	// ─── Widget Access ────────────────────────────────────────────────────────

	/** Get the main HUD overlay widget. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HUD")
	UKhaaosHUDWidget* GetHUDWidget() const { return HUDWidget; }

	/** Get the scoreboard widget. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HUD")
	UKhaaosScoreboardWidget* GetScoreboard() const { return Scoreboard; }

	/** Get the minimap widget. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|HUD")
	UKhaaosMinimapWidget* GetMinimap() const { return Minimap; }

	// ─── Visibility ───────────────────────────────────────────────────────────

	/** Show the scoreboard overlay. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void ShowScoreboard();

	/** Hide the scoreboard overlay. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void HideScoreboard();

	/** Toggle scoreboard visibility. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void ToggleScoreboard();

	/** Set HUD visibility. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void SetHUDVisible(bool bVisible);

	/** Set minimap visibility. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void SetMinimapVisible(bool bVisible);

	// ─── Setup ────────────────────────────────────────────────────────────────

	/**
	 * Create and add all HUD widgets to the viewport.
	 * Called automatically on BeginPlay.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void SetupHUD();

	/** Remove and cleanup all HUD widgets. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|HUD")
	void RemoveHUD();

	// ─── State ────────────────────────────────────────────────────────────────

	/** Whether the HUD is currently shown. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	uint8 bShowHUD : 1;

	/** Whether the scoreboard is currently shown. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	uint8 bShowScoreboard : 1;

	/** Whether the minimap is shown. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|HUD")
	uint8 bShowMinimap : 1;

	// ─── Widget Class References ──────────────────────────────────────────────

	/** HUD overlay widget class to instantiate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|HUD")
	TSubclassOf<UKhaaosHUDWidget> HUDWidgetClass;

	/** Scoreboard widget class to instantiate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|HUD")
	TSubclassOf<UKhaaosScoreboardWidget> ScoreboardWidgetClass;

	/** Minimap widget class to instantiate. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|HUD")
	TSubclassOf<UKhaaosMinimapWidget> MinimapWidgetClass;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when match starts (HUD setup). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|HUD")
	FOnMatchStarted OnMatchStarted;

	/** Broadcast when match ends (HUD teardown). */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|HUD")
	FOnMatchEnded OnMatchEnded;

protected:

	// ─── Widget Instances ─────────────────────────────────────────────────────

	/** Main HUD overlay widget. */
	UPROPERTY()
	TObjectPtr<UKhaaosHUDWidget> HUDWidget;

	/** Scoreboard widget. */
	UPROPERTY()
	TObjectPtr<UKhaaosScoreboardWidget> Scoreboard;

	/** Minimap widget. */
	UPROPERTY()
	TObjectPtr<UKhaaosMinimapWidget> Minimap;
};
