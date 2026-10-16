// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/CIGKV/Zu2ChoiceWidget.h"
#include "Game/CIGKV/Zu2CigkvImpact.h"

void UZu2ChoiceWidget::NativeConstruct()
{
	Super::NativeConstruct();
}

void UZu2ChoiceWidget::ChooseJump()
{
	OnChoice.Broadcast(true);
	if (OwningImpactActor)
	{
		OwningImpactActor->OnPlayerChoice(true);
	}
	RemoveFromParent();
}

void UZu2ChoiceWidget::ChooseStay()
{
	OnChoice.Broadcast(false);
	if (OwningImpactActor)
	{
		OwningImpactActor->OnPlayerChoice(false);
	}
	RemoveFromParent();
}
