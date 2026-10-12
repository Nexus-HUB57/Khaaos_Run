// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Input/KhaaosInputConfig.h"

UInputAction* UKhaaosInputConfig::GetInputActionForTag(const FGameplayTag& InputTag) const
{
	if (!InputTag.IsValid())
	{
		return nullptr;
	}

	// Search native input actions first
	for (const FKhaaosInputAction& Action : NativeInputActions)
	{
		if (Action.InputTag == InputTag && Action.InputAction)
		{
			return Action.InputAction;
		}
	}

	// Search ability input actions
	for (const FKhaaosInputAction& Action : AbilityInputActions)
	{
		if (Action.InputTag == InputTag && Action.InputAction)
		{
			return Action.InputAction;
		}
	}

	return nullptr;
}
