// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosHUDWidget.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosHUDWidget
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosHUDWidget::UKhaaosHUDWidget()
	: CurrentHealth(100.0f)
	, MaxHealth(100.0f)
	, CurrentShield(0.0f)
	, MaxShield(50.0f)
	, CurrentEnergy(100.0f)
	, MaxEnergy(100.0f)
	, CurrentAmmo(30)
	, ReserveAmmo(90)
	, CurrentPing(0)
	, CurrentCredits(0)
	, ZoneWarningText(FText::GetEmpty())
{
	// CommonUI widget setup
	// BP implements the visual layout and UpdateHealth/UpdateShield/etc.
	// events are dispatched to BP for UMG property updates.
}
