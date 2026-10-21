// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "InputMappingContext.h"
#include "EnhancedInputComponent.h"
#include "GameplayTagContainer.h"
#include "Game/Input/KhaaosInputConfig.h"
#include "KhaaosInputComponent.generated.h"

/**
 * UKhaaosInputComponent
 *
 * Custom EnhancedInputComponent that binds UInputActions to GameplayTag-identified
 * callbacks. Separates Native bindings (movement, look — always active) from
 * Ability bindings (shoot, sprint — toggled by ability system).
 *
 * Design follows Lyra's LyraInputComponent pattern:
 *   - BindNativeAction: for movement/camera (always-bound, Triggered)
 *   - BindAbilityAction: for abilities (started/completed/triggered)
 *   - RemoveBinds: cleanup on possession change
 *
 * Usage:
 *   UKhaaosInputComponent* IC = Cast<UKhaaosInputComponent>(PlayerInputComponent);
 *   IC->BindNativeAction(InputConfig, Tag_Input_Move, ETriggerEvent::Triggered, this, &AMyHero::Move);
 *   IC->BindAbilityAction(InputConfig, Tag_Input_Shoot, ETriggerEvent::Started, this, &AMyHero::StartShoot);
 */
UCLASS(BlueprintType)
class UKhaaosInputComponent : public UEnhancedInputComponent
{
	GENERATED_BODY()

public:

	UKhaaosInputComponent();

	// ─── Bind Native Action ───────────────────────────────────────────────────

	/**
	 * Bind a native input action (movement, look) to a member function.
	 * Uses ETriggerEvent::Triggered by default for continuous input.
	 * Returns the bind handle for later removal.
	 */
	template<typename UserClass, typename FuncType>
	uint32 BindNativeAction(UKhaaosInputConfig* Config, const FGameplayTag& InputTag, ETriggerEvent TriggerEvent, UserClass* Object, FuncType Func);

	// ─── Bind Ability Action ──────────────────────────────────────────────────

	/**
	 * Bind an ability input action to a member function.
	 * Uses ETriggerEvent::Started by default for one-shot abilities.
	 * Returns the bind handle for later removal.
	 */
	template<typename UserClass, typename FuncType>
	uint32 BindAbilityAction(UKhaaosInputConfig* Config, const FGameplayTag& InputTag, ETriggerEvent TriggerEvent, UserClass* Object, FuncType Func);

	// ─── Remove Binds ─────────────────────────────────────────────────────────

	/** Remove all bindings stored in the given handle array and clear it. */
	void RemoveBinds(TArray<uint32>& BindHandles);

	// ─── Stored Handles ───────────────────────────────────────────────────────

	/** Handles for native (movement) bindings. */
	TArray<uint32> NativeBindHandles;

	/** Handles for ability bindings. */
	TArray<uint32> AbilityBindHandles;
};

// ─── Template Implementations ─────────────────────────────────────────────────

template<typename UserClass, typename FuncType>
uint32 UKhaaosInputComponent::BindNativeAction(UKhaaosInputConfig* Config, const FGameplayTag& InputTag, ETriggerEvent TriggerEvent, UserClass* Object, FuncType Func)
{
	if (!Config || !InputTag.IsValid() || !Object)
	{
		return InvalidBindHandle;
	}

	UInputAction* InputAction = Config->GetInputActionForTag(InputTag);
	if (!InputAction)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosInputComponent::BindNativeAction - No InputAction for tag %s"), *InputTag.ToString());
		return InvalidBindHandle;
	}

	const uint32 Handle = BindAction(InputAction, TriggerEvent, Object, Func);
	NativeBindHandles.Add(Handle);
	return Handle;
}

template<typename UserClass, typename FuncType>
uint32 UKhaaosInputComponent::BindAbilityAction(UKhaaosInputConfig* Config, const FGameplayTag& InputTag, ETriggerEvent TriggerEvent, UserClass* Object, FuncType Func)
{
	if (!Config || !InputTag.IsValid() || !Object)
	{
		return InvalidBindHandle;
	}

	UInputAction* InputAction = Config->GetInputActionForTag(InputTag);
	if (!InputAction)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosInputComponent::BindAbilityAction - No InputAction for tag %s"), *InputTag.ToString());
		return InvalidBindHandle;
	}

	const uint32 Handle = BindAction(InputAction, TriggerEvent, Object, Func);
	AbilityBindHandles.Add(Handle);
	return Handle;
}
