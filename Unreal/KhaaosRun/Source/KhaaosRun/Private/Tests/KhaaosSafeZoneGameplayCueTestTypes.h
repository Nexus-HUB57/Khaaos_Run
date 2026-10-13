// Khaaos Run - Automation Test support
#pragma once

#include "CoreMinimal.h"
#include "AbilitySystemInterface.h"
#include "GameplayCueInterface.h"
#include "GameFramework/Actor.h"
#include "KhaaosSafeZoneGameplayCueTestTypes.generated.h"

class UAbilitySystemComponent;
class UKhaaosAttributeSet;

UCLASS()
class AKhaaosSafeZoneGameplayCueTestTarget : public AActor, public IAbilitySystemInterface, public IGameplayCueInterface
{
	GENERATED_BODY()

public:
	AKhaaosSafeZoneGameplayCueTestTarget();

	virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override;
	virtual void HandleGameplayCue(
		AActor* Self,
		FGameplayTag GameplayCueTag,
		EGameplayCueEvent::Type EventType,
		const FGameplayCueParameters& Parameters) override;

	UPROPERTY()
	TObjectPtr<UAbilitySystemComponent> AbilitySystemComponent;

	UPROPERTY()
	TObjectPtr<UKhaaosAttributeSet> AttributeSet;

	int32 ZoneCueExecutionCount = 0;
	FGameplayTag LastCueTag;
	EGameplayCueEvent::Type LastCueEvent = EGameplayCueEvent::Executed;
	TWeakObjectPtr<AActor> LastEffectCauser;
};
