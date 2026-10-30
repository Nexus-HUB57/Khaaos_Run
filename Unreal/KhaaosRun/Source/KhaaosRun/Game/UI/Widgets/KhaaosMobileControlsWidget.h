// Khaaos Run - Mobile touch controls base | UE5.8
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "KhaaosMobileControlsWidget.generated.h"

class AKhaaosPlayerController;

/** Gameplay actions exposed to a Blueprint-authored mobile HUD. */
UENUM(BlueprintType)
enum class EKhaaosTouchAction : uint8
{
	Jump,
	Fire,
	Reload,
	Sprint,
	Slide,
	Crouch,
	AimDownSights,
	Melee,
	Interact,
	Ultimate,
	Shield,
	Heal,
	GrapplingHook,
	Scoreboard
};

/**
 * Blueprint base for the game's custom touch HUD.
 * Build the visual layout in a UMG Blueprint subclass and call these methods
 * from joystick/touch events. All gameplay actions are routed through the
 * existing KhaaosPlayerController handlers rather than a parallel RPC path.
 */
UCLASS(Abstract, Blueprintable)
class KHAAOSRUN_API UKhaaosMobileControlsWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** Set the left virtual-stick axis in the normalized -1..1 range. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Mobile Input")
	void SetMoveAxis(FVector2D Axis);

	/** Forward a right-side touch drag delta to the existing look handler. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Mobile Input")
	void AddLookDelta(FVector2D Delta);

	/** Press/release an action. Pointer ids make overlapping touches safe. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Mobile Input")
	void SetActionPressed(EKhaaosTouchAction Action, int32 TouchPointerId, bool bPressed);

protected:
	virtual void NativeDestruct() override;

	/** Degrees/input units per screen pixel; tune with device playtests. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Mobile Input", meta = (ClampMin = "0.001", ClampMax = "1.0"))
	float LookSensitivity = 0.035f;

private:
	AKhaaosPlayerController* GetKhaaosPlayerController() const;
	void DispatchPressed(EKhaaosTouchAction Action, AKhaaosPlayerController* Controller);
	void DispatchReleased(EKhaaosTouchAction Action, AKhaaosPlayerController* Controller);

	/** Each action is dispatched on first press and final release only. */
	TMap<EKhaaosTouchAction, TSet<int32>> PressedPointers;
};
