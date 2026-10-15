// Copyright Nexus-HUB57. All Rights Reserved.

#include "CIGKV/Zu1ChoiceWidget.h"
#include "CIGKV/Zu1CigkvImpact.h"

void UZu1ChoiceWidget::NativeConstruct()
{
	Super::NativeConstruct();
	// Bind dos botões deve ser feito no Blueprint (OnClicked → ChooseSeatbelt / ChooseNoSeatbelt)
}

void UZu1ChoiceWidget::ChooseSeatbelt()
{
	OnChoice.Broadcast(true);

	if (OwningImpactActor)
	{
		OwningImpactActor->OnPlayerChoice(true);
	}

	RemoveFromParent();
}

void UZu1ChoiceWidget::ChooseNoSeatbelt()
{
	OnChoice.Broadcast(false);

	if (OwningImpactActor)
	{
		OwningImpactActor->OnPlayerChoice(false);
	}

	RemoveFromParent();
}
