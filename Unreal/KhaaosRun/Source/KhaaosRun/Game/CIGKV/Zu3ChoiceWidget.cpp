// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/CIGKV/Zu3ChoiceWidget.h"
#include "Game/CIGKV/Zu3CigkvImpact.h"

void UZu3ChoiceWidget::NativeConstruct()
{
	Super::NativeConstruct();
}

void UZu3ChoiceWidget::ChooseMask()
{
	OnChoice.Broadcast(true);
	if (OwningImpactActor)
	{
		OwningImpactActor->OnPlayerChoice(true);
	}
	RemoveFromParent();
}

void UZu3ChoiceWidget::ChooseNoMask()
{
	OnChoice.Broadcast(false);
	if (OwningImpactActor)
	{
		OwningImpactActor->OnPlayerChoice(false);
	}
	RemoveFromParent();
}
