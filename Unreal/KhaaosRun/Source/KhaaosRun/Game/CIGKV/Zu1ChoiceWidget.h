// Copyright Nexus-HUB57. All Rights Reserved.
// Widget de escolha do Zu 1 – Cinto / Sem Cinto

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Zu1ChoiceWidget.generated.h"

class AZu1CigkvImpact;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnZu1WidgetChoice, bool, bSeatbeltFastened);

/**
 * Widget simples de decisão para o Zu 1.
 * Dois botões: "Apertar Cinto" e "Não Apertar".
 * Texto + voz do Marechal.
 */
UCLASS()
class KHAOSRUN_API UZu1ChoiceWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** Referência ao Actor que criou o widget (para chamar OnPlayerChoice) */
	UPROPERTY(BlueprintReadWrite, Category = "Zu1")
	AZu1CigkvImpact* OwningImpactActor = nullptr;

	/** Evento Blueprint-friendly */
	UPROPERTY(BlueprintAssignable, Category = "Zu1")
	FOnZu1WidgetChoice OnChoice;

	/** Chamado pelo botão "Apertar Cinto" */
	UFUNCTION(BlueprintCallable, Category = "Zu1")
	void ChooseSeatbelt();

	/** Chamado pelo botão "Não Apertar" */
	UFUNCTION(BlueprintCallable, Category = "Zu1")
	void ChooseNoSeatbelt();

protected:
	virtual void NativeConstruct() override;
};
