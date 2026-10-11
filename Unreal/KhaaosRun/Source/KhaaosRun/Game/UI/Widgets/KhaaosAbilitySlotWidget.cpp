// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosAbilitySlotWidget.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbilitySlotWidget
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbilitySlotWidget::UKhaaosAbilitySlotWidget()
	: bOnCooldown(false)
	, CooldownPercent(0.0f)
	, CooldownRemaining(0.0f)
	, CooldownTotal(0.0f)
	, KeybindText(FText::GetEmpty())
{
}

void UKhaaosAbilitySlotWidget::UpdateCooldown(float Remaining, float Total)
{
	CooldownRemaining = FMath::Max(0.0f, Remaining);
	CooldownTotal = FMath::Max(0.0f, Total);

	if (CooldownTotal > 0.0f && CooldownRemaining > 0.0f)
	{
		bOnCooldown = true;
		CooldownPercent = CooldownRemaining / CooldownTotal;
	}
	else
	{
		bOnCooldown = false;
		CooldownPercent = 0.0f;
	}
}

void UKhaaosAbilitySlotWidget::ClearCooldown()
{
	bOnCooldown = false;
	CooldownPercent = 0.0f;
	CooldownRemaining = 0.0f;
	CooldownTotal = 0.0f;
}

void UKhaaosAbilitySlotWidget::SetAbilityIcon(const FSlateBrush& Icon)
{
	AbilityIcon = Icon;
}

void UKhaaosAbilitySlotWidget::ClearAbilityIcon()
{
	AbilityIcon = FSlateBrush();
}

void UKhaaosAbilitySlotWidget::SetKeybindText(const FText& Key)
{
	KeybindText = Key;
}
