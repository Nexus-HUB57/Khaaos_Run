// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "InputAction.h"
#include "KhaaosInputConfig.generated.h"

// ─── Input Action Mapping Struct ───────────────────────────────────────────────

/** Maps an Enhanced Input Action to a GameplayTag for ability/movement binding. */
USTRUCT(BlueprintType)
struct FKhaaosInputAction
{
	GENERATED_BODY()

	/** The Enhanced Input Action asset (IA_Move, IA_Shoot, etc.). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> InputAction = nullptr;

	/** GameplayTag that maps to this input (Input.Move, Input.Shoot, etc.). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag InputTag;
};

/**
 * UKhaaosInputConfig
 *
 * PrimaryDataAsset that holds mappings between UInputAction assets and
 * FGameplayTag identifiers. Split into NativeInputActions (movement, look)
 * and AbilityInputActions (shoot, sprint, reload, etc.).
 *
 * Loaded at runtime by the Hero or PlayerController to bind inputs via
 * UKhaaosInputComponent.
 *
 * Usage:
 *   UKhaaosInputConfig* Config = LoadObject<UKhaaosInputConfig>(...);
 *   UInputAction* MoveAction = Config->GetInputActionForTag(Tag_Input_Move);
 */
UCLASS(BlueprintType, Const)
class UKhaaosInputConfig : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:

	/** Native (always-bound) input actions: Move, Look, etc. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Input")
	TArray<FKhaaosInputAction> NativeInputActions;

	/** Ability input actions: Shoot, Sprint, Reload, etc. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Input")
	TArray<FKhaaosInputAction> AbilityInputActions;

	/**
	 * Find the UInputAction mapped to a given GameplayTag.
	 * Searches NativeInputActions first, then AbilityInputActions.
	 * Returns nullptr if no mapping found.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Input")
	UInputAction* GetInputActionForTag(const FGameplayTag& InputTag) const;
};
