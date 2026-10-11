// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameplayTagContainer.h"
#include "InputAction.h"
#include "KhaaosInputTags.generated.h"

/**
 * FKhaaosInputTags
 *
 * Static singleton providing UInputAction* references and FGameplayTag mappings
 * for every Enhanced Input action in Khaaos Run.
 *
 * InputAction pointers are resolved once at module startup from the input
 * config data asset. Tags are resolved via FGameplayTag::RequestGameplayTag().
 *
 * Usage:
 *   const FKhaaosInputTags& IT = FKhaaosInputTags::Get();
 *   if (InputAction == IT.Move) { HandleMovement(); }
 */
USTRUCT(BlueprintType)
struct FKhaaosInputTags
{
	GENERATED_BODY()

public:

	/** Singleton accessor. */
	static const FKhaaosInputTags& Get() { return InputTags; }

	/** Initialize all input action references and tags. Call once from module startup. */
	static void InitializeInputTags();

	/** Check if tags have been initialized. */
	static bool AreTagsInitialized() { return bTagsInitialized; }

	// ─── Native Input Actions (always-bound) ────────────────────────────────

	/** Movement input (WASD / left stick). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Move = nullptr;

	/** Camera look input (mouse / right stick). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Look = nullptr;

	/** Jump input. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Jump = nullptr;

	// ─── Ability Input Actions ─────────────────────────────────────────────

	/** Sprint input. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Sprint = nullptr;

	/** Slide input. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Slide = nullptr;

	/** Shoot / fire weapon. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Shoot = nullptr;

	/** Reload weapon. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Reload = nullptr;

	/** Melee attack. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Melee = nullptr;

	/** Aim down sights. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> ADS = nullptr;

	/** Interact with world objects. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Interact = nullptr;

	/** Ultimate ability. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Ultimate = nullptr;

	/** Grappling hook. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> GrapplingHook = nullptr;

	/** Shield ability. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Shield = nullptr;

	/** Heal ability. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> Heal = nullptr;

	/** Pause menu. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	TObjectPtr<UInputAction> PauseMenu = nullptr;

	// ─── GameplayTag Mappings ──────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Move;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Look;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Jump;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Sprint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Slide;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Shoot;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Reload;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Melee;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_ADS;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Interact;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Ultimate;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_GrapplingHook;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Shield;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_Heal;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Input")
	FGameplayTag Tag_Input_PauseMenu;

private:

	/** Singleton instance. */
	static FKhaaosInputTags InputTags;

	/** Whether tags have been initialized. */
	static bool bTagsInitialized;
};
