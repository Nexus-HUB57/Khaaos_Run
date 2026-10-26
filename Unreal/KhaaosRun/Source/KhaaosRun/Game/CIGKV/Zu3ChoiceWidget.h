// Copyright Nexus-HUB57. All Rights Reserved.
// Widget de escolha do Zu 3 – Máscara / Sem Máscara

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Zu3ChoiceWidget.generated.h"

class AZu3CigkvImpact;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZu3WidgetChoice, bool, bUsedMask);

UCLASS()
class KHAOSRUN_API UZu3ChoiceWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintReadWrite, Category = "Zu3")
	AZu3CigkvImpact* OwningImpactActor = nullptr;

	UPROPERTY(BlueprintAssignable, Category = "Zu3")
	FOnZu3WidgetChoice OnChoice;

	UFUNCTION(BlueprintCallable, Category = "Zu3")
	void ChooseMask();

	UFUNCTION(BlueprintCallable, Category = "Zu3")
	void ChooseNoMask();

protected:
	virtual void NativeConstruct() override;
};
