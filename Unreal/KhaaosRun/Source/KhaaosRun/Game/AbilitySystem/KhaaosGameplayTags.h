// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameplayTagContainer.h"
#include "KhaaosGameplayTags.generated.h"

/**
 * FKhaaosGameplayTags — Static singleton providing FGameplayTag references for every
 * tag used in Khaaos Run. Tags are resolved once at module startup via
 * FGameplayTag::RequestGameplayTag() and cached for zero-cost runtime access.
 *
 * Usage:
 *   const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
 *   if (AbilitySystemComp->HasTag(Tags.State_Player_Alive)) { ... }
 */
USTRUCT(BlueprintType)
struct FKhaaosGameplayTags
{
	GENERATED_BODY()

public:
	/** Singleton accessor — tags must be initialized first via InitializeTags(). */
	static const FKhaaosGameplayTags& Get() { return GameplayTags; }

	/** Initialize all tags from the gameplay tag dictionary. Call once from module startup. */
	static void InitializeTags();

	/** Check if tags have been initialized. */
	static bool AreTagsInitialized() { return bTagsInitialized; }

	// ─── State.Match ─────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Match")
	FGameplayTag State_Match_Lobby;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Match")
	FGameplayTag State_Match_Countdown;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Match")
	FGameplayTag State_Match_InProgress;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Match")
	FGameplayTag State_Match_Finished;

	// ─── State.Player ────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Alive;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Dead;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Downed;

	// ─── State.Zone ──────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Zone")
	FGameplayTag State_Zone_Shrinking;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Zone")
	FGameplayTag State_Zone_Stable;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Zone")
	FGameplayTag State_Zone_Waiting;

	// ─── State.Loot ──────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Loot")
	FGameplayTag State_Loot_Available;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Loot")
	FGameplayTag State_Loot_Consumed;

	// ─── Ability ─────────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability")
	FGameplayTag Ability_Sprint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability")
	FGameplayTag Ability_Jump;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability")
	FGameplayTag Ability_Slide;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability")
	FGameplayTag Ability_GrapplingHook;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability")
	FGameplayTag Ability_Shield;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability")
	FGameplayTag Ability_Heal;

	// ─── Ability.Combat ──────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Combat")
	FGameplayTag Ability_Combat_Shoot;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Combat")
	FGameplayTag Ability_Combat_Reload;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Combat")
	FGameplayTag Ability_Combat_Melee;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Combat")
	FGameplayTag Ability_Combat_Throw;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Combat")
	FGameplayTag Ability_Combat_Ultimate;

	// ─── Cooldown ────────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Sprint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Shield;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Heal;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Ultimate;

	// ─── Effect.Damage ───────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Bullet;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Explosion;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Fire;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Melee;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Zone;

	// ─── Effect.Buff ─────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Shielded;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_SpeedBoost;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_HealOverTime;

	// ─── Effect.Debuff ───────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_Slowed;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_Burning;

	// ─── Input ───────────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Move;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Look;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Jump;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Sprint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Slide;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Shoot;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Reload;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Melee;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_ADS;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Interact;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Input")
	FGameplayTag Input_Ultimate;

	// ─── Loot.Rarity ─────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Common;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Uncommon;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Rare;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Epic;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Legendary;

	// ─── Loot.Type ───────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Weapon;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Armor;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Consumable;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Ability;

	// ─── AI.State ────────────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|State")
	FGameplayTag AI_State_Patrol;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|State")
	FGameplayTag AI_State_Chase;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|State")
	FGameplayTag AI_State_Attack;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|State")
	FGameplayTag AI_State_Retreat;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|State")
	FGameplayTag AI_State_Dead;

	// ─── AI.Difficulty ───────────────────────────────────────────────────

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|Difficulty")
	FGameplayTag AI_Difficulty_Easy;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|Difficulty")
	FGameplayTag AI_Difficulty_Medium;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|Difficulty")
	FGameplayTag AI_Difficulty_Hard;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|AI|Difficulty")
	FGameplayTag AI_Difficulty_Elite;

private:
	/** Singleton instance. */
	static FKhaaosGameplayTags GameplayTags;

	/** Whether tags have been initialized. */
	static bool bTagsInitialized;
};
