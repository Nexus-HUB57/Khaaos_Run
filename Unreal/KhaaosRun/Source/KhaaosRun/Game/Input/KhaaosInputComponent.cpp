// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Input/KhaaosInputComponent.h"

UKhaaosInputComponent::UKhaaosInputComponent()
{
	// EnhancedInputComponent base handles priority and stacking.
}

void UKhaaosInputComponent::RemoveBinds(TArray<uint32>& BindHandles)
{
	for (const uint32& Handle : BindHandles)
	{
		if (Handle != InvalidBindHandle)
		{
			RemoveActionBinding(Handle);
		}
	}
	BindHandles.Empty();
}
