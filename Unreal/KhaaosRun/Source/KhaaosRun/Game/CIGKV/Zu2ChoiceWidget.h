// Copyright Nexus-HUB57. All Rights Reserved.
// Widget de escolha do Zu 2 – Saltar / Permanecer

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Zu2ChoiceWidget.generated.h"

class AZu2CigkvImpact;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZu2WidgetChoice, bool, bJumped);

UCLASS()
class KHAOSRUN_API UZu2ChoiceWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintReadWrite, Category = "Zu2")
	AZu2CigkvImpact* OwningImpactActor = nullptr;

	UPROPERTY(BlueprintAssignable, Category = "Zu2")
	FOnZu2WidgetChoice OnChoice;

	UFUNCTION(BlueprintCallable, Category = "Zu2")
	void ChooseJump();

	UFUNCTION(BlueprintCallable, Category = "Zu2")
	void ChooseStay();

protected:
	virtual void NativeConstruct() override;
};
