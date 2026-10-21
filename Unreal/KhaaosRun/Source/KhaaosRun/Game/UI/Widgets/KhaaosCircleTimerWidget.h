// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Game/UI/Widgets/KhaaosCircleTimerWidget.generated.h"

/**
 * UKhaaosCircleTimerWidget
 *
 * Zone circle countdown widget with prediction circle overlay.
 * Shows current zone phase, time until next shrink, and the
 * white prediction circle (Fortnite parity) showing where the
 * next zone will be.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │ ⏱ Phase 3/7   0:45     │
 *   │ Next shrink in 45s      │
 *   │ Damage: 8/tick          │
 *   └─────────────────────────┘
 *
 * Features:
 *   - Current zone phase (1-7)
 *   - Countdown to next shrink
 *   - Damage per tick display
 *   - Prediction circle on minimap (white ring)
 *   - Pulse animation when <10 seconds to shrink
 *   - Color transition: green→yellow→red as time decreases
 *   - Console-friendly large text
 */
UCLASS(Abstract, BlueprintType)
class UKhaaosCircleTimerWidget : public UUserWidget
{
	GENERATED_BODY()

public:

	virtual void NativeConstruct() override;

	// ─── State Update ───────────────────────────────────────────────────────

	/** Update zone timer display. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Circle")
	void UpdateZoneTimer(int32 Phase, int32 TotalPhases, float TimeRemaining, float DamagePerTick);

	/** Set prediction circle position and radius. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|Circle")
	void SetPredictionCircle(FVector2D Center, float Radius);

	/** Get the urgency color based on time remaining. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|UI|Circle")
	FLinearColor GetUrgencyColor(float TimeRemaining) const;

	/** Format time as MM:SS. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|UI|Circle")
	static FString FormatTime(float Seconds);

	// ─── State ──────────────────────────────────────────────────────────────

	/** Current zone phase. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	int32 CurrentPhase;

	/** Total zone phases. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	int32 TotalPhases;

	/** Time remaining until next shrink. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	float TimeRemaining;

	/** Damage per tick. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	float DamagePerTick;

	/** Prediction circle center (minimap space). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	FVector2D PredictionCenter;

	/** Prediction circle radius. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	float PredictionRadius;

	/** Urgency threshold for pulse animation. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|UI|Circle")
	float UrgencyThreshold;
};
