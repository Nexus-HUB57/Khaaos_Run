// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Game/UI/Widgets/KhaaosAbilitySlotWidget.generated.h"

/**
 * UKhaaosAbilitySlotWidget
 *
 * Single ability cooldown slot widget for the HUD.
 * Displays an ability icon, cooldown overlay, and keybind text.
 *
 * Features:
 *   - UpdateCooldown: Set remaining/total cooldown for overlay
 *   - SetAbilityIcon: Set the icon brush for this ability
 *   - SetKeybindText: Set the keybind label (e.g., "Q", "E", "R")
 *   - CooldownPercent: Bindable property for UMG progress bar
 *   - bOnCooldown: Bindable property for UMG visibility binding
 *
 * Layout:
 *   ┌─────────────┐
 *   │  [Icon]     │
 *   │  ┌───────┐  │
 *   │  │Cooldown│  │
 *   │  │Overlay │  │
 *   │  └───────┘  │
 *   │  [Keybind]  │
 *   └─────────────┘
 */
UCLASS(Abstract, Blueprintable, meta = (Category = "Khaaos|UI"))
class UKhaaosAbilitySlotWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UKhaaosAbilitySlotWidget();

	// ─── Cooldown ─────────────────────────────────────────────────────────────

	/**
	 * Update cooldown display.
	 * @param Remaining  Seconds remaining on cooldown
	 * @param Total      Total cooldown duration in seconds
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySlot")
	void UpdateCooldown(float Remaining, float Total);

	/** Clear cooldown (ability ready). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySlot")
	void ClearCooldown();

	// ─── Icon ─────────────────────────────────────────────────────────────────

	/** Set the ability icon brush. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySlot")
	void SetAbilityIcon(const FSlateBrush& Icon);

	/** Clear the ability icon. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySlot")
	void ClearAbilityIcon();

	// ─── Keybind ──────────────────────────────────────────────────────────────

	/** Set the keybind text (e.g., "Q", "LMB", "RMB"). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilitySlot")
	void SetKeybindText(const FText& Key);

	// ─── Bindable Properties ──────────────────────────────────────────────────

	/** Whether the ability is currently on cooldown. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AbilitySlot")
	uint8 bOnCooldown : 1;

	/** Cooldown progress as a percentage [0, 1]. 1 = full cooldown, 0 = ready. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AbilitySlot")
	float CooldownPercent;

	/** Cooldown time remaining (seconds). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AbilitySlot")
	float CooldownRemaining;

	/** Total cooldown duration (seconds). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AbilitySlot")
	float CooldownTotal;

	/** The ability icon brush. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AbilitySlot")
	FSlateBrush AbilityIcon;

	/** The keybind label text. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|AbilitySlot")
	FText KeybindText;
};
