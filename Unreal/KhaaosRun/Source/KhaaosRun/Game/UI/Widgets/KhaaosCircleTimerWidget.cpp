// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosCircleTimerWidget.h"
#include "KhaaosRun.h"

// ─── Native Lifecycle ──────────────────────────────────────────────────────────

void UKhaaosCircleTimerWidget::NativeConstruct()
{
	Super::NativeConstruct();

	CurrentPhase   = 1;
	TotalPhases    = 7;
	TimeRemaining  = 0.0f;
	DamagePerTick  = 1.0f;
	PredictionCenter = FVector2D::ZeroVector;
	PredictionRadius = 0.0f;
	UrgencyThreshold = 10.0f;
}

// ─── State Update ───────────────────────────────────────────────────────────────

void UKhaaosCircleTimerWidget::UpdateZoneTimer(int32 Phase, int32 InTotalPhases, float InTimeRemaining, float InDamagePerTick)
{
	CurrentPhase  = Phase;
	TotalPhases   = InTotalPhases;
	TimeRemaining = InTimeRemaining;
	DamagePerTick = InDamagePerTick;
}

void UKhaaosCircleTimerWidget::SetPredictionCircle(FVector2D Center, float Radius)
{
	PredictionCenter = Center;
	PredictionRadius = Radius;
}

FLinearColor UKhaaosCircleTimerWidget::GetUrgencyColor(float InTimeRemaining) const
{
	if (InTimeRemaining > 30.0f)
	{
		// Green: plenty of time
		return FLinearColor(0.2f, 0.8f, 0.2f, 1.0f);
	}
	else if (InTimeRemaining > 10.0f)
	{
		// Yellow: getting urgent
		float T = (InTimeRemaining - 10.0f) / 20.0f;
		return FLinearColor(0.2f + 0.8f * (1.0f - T), 0.8f, 0.2f, 1.0f);
	}
	else
	{
		// Red: urgent!
		return FLinearColor(0.9f, 0.2f, 0.2f, 1.0f);
	}
}

FString UKhaaosCircleTimerWidget::FormatTime(float Seconds)
{
	int32 TotalSeconds = FMath::Max(0, FMath::FloorToInt(Seconds));
	int32 Minutes = TotalSeconds / 60;
	int32 Secs = TotalSeconds % 60;
	return FString::Printf(TEXT("%d:%02d"), Minutes, Secs);
}
