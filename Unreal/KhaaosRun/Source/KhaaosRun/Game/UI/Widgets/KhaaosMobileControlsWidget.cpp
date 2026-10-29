// Khaaos Run - Mobile touch controls base | UE5.8
#include "Game/UI/Widgets/KhaaosMobileControlsWidget.h"

#include "InputActionValue.h"
#include "Player/KhaaosPlayerController.h"

AKhaaosPlayerController* UKhaaosMobileControlsWidget::GetKhaaosPlayerController() const
{
	return Cast<AKhaaosPlayerController>(GetOwningPlayer());
}

void UKhaaosMobileControlsWidget::SetMoveAxis(FVector2D Axis)
{
	if (Axis.SizeSquared() > 1.0f)
	{
		Axis.Normalize();
	}

	if (AKhaaosPlayerController* Controller = GetKhaaosPlayerController())
	{
		Controller->SetMobileTouchMoveAxis(Axis);
	}
}

void UKhaaosMobileControlsWidget::AddLookDelta(FVector2D Delta)
{
	if (AKhaaosPlayerController* Controller = GetKhaaosPlayerController())
	{
		const FVector2D ScaledDelta = Delta * LookSensitivity;
		Controller->HandleLook(FInputActionValue(ScaledDelta));
	}
}

void UKhaaosMobileControlsWidget::SetActionPressed(EKhaaosTouchAction Action, int32 TouchPointerId, bool bPressed)
{
	AKhaaosPlayerController* Controller = GetKhaaosPlayerController();
	if (!Controller)
	{
		return;
	}

	if (bPressed)
	{
		TSet<int32>& ActivePointers = PressedPointers.FindOrAdd(Action);
		const bool bWasAlreadyHeld = ActivePointers.Num() > 0;
		ActivePointers.Add(TouchPointerId);
		if (!bWasAlreadyHeld)
		{
			DispatchPressed(Action, Controller);
		}
		return;
	}

	TSet<int32>* ActivePointers = PressedPointers.Find(Action);
	if (!ActivePointers || ActivePointers->Remove(TouchPointerId) == 0)
	{
		return;
	}
	if (ActivePointers->Num() == 0)
	{
		DispatchReleased(Action, Controller);
		PressedPointers.Remove(Action);
	}
}

void UKhaaosMobileControlsWidget::NativeDestruct()
{
	if (AKhaaosPlayerController* Controller = GetKhaaosPlayerController())
	{
		Controller->SetMobileTouchMoveAxis(FVector2D::ZeroVector);
		for (const TPair<EKhaaosTouchAction, TSet<int32>>& Entry : PressedPointers)
		{
			if (Entry.Value.Num() > 0)
			{
				DispatchReleased(Entry.Key, Controller);
			}
		}
	}
	PressedPointers.Empty();
	Super::NativeDestruct();
}

void UKhaaosMobileControlsWidget::DispatchPressed(EKhaaosTouchAction Action, AKhaaosPlayerController* Controller)
{
	const FInputActionValue PressedValue(true);
	switch (Action)
	{
	case EKhaaosTouchAction::Jump:          Controller->HandleJump(PressedValue); break;
	case EKhaaosTouchAction::Fire:          Controller->HandleFire(PressedValue); break;
	case EKhaaosTouchAction::Reload:        Controller->HandleReload(PressedValue); break;
	case EKhaaosTouchAction::Sprint:        Controller->HandleSprint(PressedValue); break;
	case EKhaaosTouchAction::Slide:         Controller->HandleSlide(PressedValue); break;
	case EKhaaosTouchAction::Crouch:        Controller->HandleCrouch(PressedValue); break;
	case EKhaaosTouchAction::AimDownSights: Controller->HandleADS(PressedValue); break;
	case EKhaaosTouchAction::Melee:         Controller->HandleMelee(PressedValue); break;
	case EKhaaosTouchAction::Interact:      Controller->HandleInteract(PressedValue); break;
	case EKhaaosTouchAction::Ultimate:      Controller->HandleUltimate(PressedValue); break;
	case EKhaaosTouchAction::Shield:        Controller->HandleUseItem(PressedValue); break;
	case EKhaaosTouchAction::Heal:          Controller->HandleUseItem(PressedValue); break;
	case EKhaaosTouchAction::GrapplingHook: Controller->HandleInteract(PressedValue); break;
	case EKhaaosTouchAction::Scoreboard:    Controller->HandleScoreboard(PressedValue); break;
	default: break;
	}
}

void UKhaaosMobileControlsWidget::DispatchReleased(EKhaaosTouchAction Action, AKhaaosPlayerController* Controller)
{
	const FInputActionValue ReleasedValue(false);
	switch (Action)
	{
	case EKhaaosTouchAction::Fire:          Controller->HandleStopFire(ReleasedValue); break;
	case EKhaaosTouchAction::Sprint:        Controller->HandleSprintRelease(ReleasedValue); break;
	case EKhaaosTouchAction::Crouch:        Controller->HandleCrouchRelease(ReleasedValue); break;
	case EKhaaosTouchAction::AimDownSights: Controller->HandleADSRelease(ReleasedValue); break;
	case EKhaaosTouchAction::Scoreboard:    Controller->HandleScoreboardRelease(ReleasedValue); break;
	default: break;
	}
}
