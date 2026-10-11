// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Input/KhaaosInputTags.h"
#include "GameplayTagsManager.h"

// ─── Static Instance ──────────────────────────────────────────────────────────

FKhaaosInputTags FKhaaosInputTags::InputTags;
bool FKhaaosInputTags::bTagsInitialized = false;

// ─── Initialization ───────────────────────────────────────────────────────────

void FKhaaosInputTags::InitializeInputTags()
{
	if (bTagsInitialized)
	{
		return;
	}

	// Helper lambda for tag registration
	auto RequestTag = [](const ANSICHAR* TagName) -> FGameplayTag
	{
		FGameplayTag Tag = FGameplayTag::RequestGameplayTag(FName(TagName));
		if (!Tag.IsValid())
		{
			UE_LOG(LogTemp, Warning, TEXT("KhaaosInputTags: Tag '%s' not found in dictionary"), *FString(TagName));
		}
		return Tag;
	};

	// ─── GameplayTag Mappings ──────────────────────────────────────────────

	InputTags.Tag_Input_Move           = RequestTag("Input.Move");
	InputTags.Tag_Input_Look           = RequestTag("Input.Look");
	InputTags.Tag_Input_Jump           = RequestTag("Input.Jump");
	InputTags.Tag_Input_Sprint         = RequestTag("Input.Sprint");
	InputTags.Tag_Input_Slide          = RequestTag("Input.Slide");
	InputTags.Tag_Input_Shoot          = RequestTag("Input.Shoot");
	InputTags.Tag_Input_Reload         = RequestTag("Input.Reload");
	InputTags.Tag_Input_Melee          = RequestTag("Input.Melee");
	InputTags.Tag_Input_ADS            = RequestTag("Input.ADS");
	InputTags.Tag_Input_Interact       = RequestTag("Input.Interact");
	InputTags.Tag_Input_Ultimate       = RequestTag("Input.Ultimate");
	InputTags.Tag_Input_GrapplingHook  = RequestTag("Input.GrapplingHook");
	InputTags.Tag_Input_Shield         = RequestTag("Input.Shield");
	InputTags.Tag_Input_Heal           = RequestTag("Input.Heal");
	InputTags.Tag_Input_PauseMenu      = RequestTag("Input.PauseMenu");

	// Note: UInputAction* pointers (Move, Look, Shoot, etc.) are resolved
	// at runtime from the DA_KhaaosInputConfig data asset. They cannot be
	// resolved at module startup since asset loading is deferred.
	// The GameInstance or PlayerController should load the config and call
	// a setup method to populate these pointers.

	bTagsInitialized = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosInputTags: All input tags initialized successfully"));
}
