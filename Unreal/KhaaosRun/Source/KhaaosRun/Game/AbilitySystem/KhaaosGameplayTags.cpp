// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "GameplayTagsManager.h"

// ─── Static Instance ─────────────────────────────────────────────────────────

FKhaaosGameplayTags FKhaaosGameplayTags::GameplayTags;
bool FKhaaosGameplayTags::bTagsInitialized = false;

// ─── Initialization ──────────────────────────────────────────────────────────

void FKhaaosGameplayTags::InitializeTags()
{
	if (bTagsInitialized)
	{
		return;
	}

	UGameplayTagsManager& Manager = UGameplayTagsManager::Get();

	// Helper lambda for tag registration with validation
	auto RequestTag = [&Manager](const FGameplayTag& Tag, const ANSICHAR* TagName) -> FGameplayTag
	{
		FGameplayTag RequestedTag = FGameplayTag::RequestGameplayTag(FName(TagName));
		if (!RequestedTag.IsValid())
		{
			UE_LOG(LogTemp, Warning, TEXT("KhaaosGameplayTags: Tag '%s' not found in dictionary"), *FString(TagName));
		}
		return RequestedTag;
	};

	// ─── State.Match ─────────────────────────────────────────────────────

	GameplayTags.State_Match_Lobby        = RequestTag(GameplayTags.State_Match_Lobby,        "State.Match.Lobby");
	GameplayTags.State_Match_Countdown    = RequestTag(GameplayTags.State_Match_Countdown,    "State.Match.Countdown");
	GameplayTags.State_Match_InProgress   = RequestTag(GameplayTags.State_Match_InProgress,   "State.Match.InProgress");
	GameplayTags.State_Match_Finished     = RequestTag(GameplayTags.State_Match_Finished,     "State.Match.Finished");

	// ─── State.Player ────────────────────────────────────────────────────

	GameplayTags.State_Player_Alive       = RequestTag(GameplayTags.State_Player_Alive,       "State.Player.Alive");
	GameplayTags.State_Player_Dead        = RequestTag(GameplayTags.State_Player_Dead,        "State.Player.Dead");
	GameplayTags.State_Player_Downed      = RequestTag(GameplayTags.State_Player_Downed,      "State.Player.Downed");

	// ─── State.Zone ──────────────────────────────────────────────────────

	GameplayTags.State_Zone_Shrinking     = RequestTag(GameplayTags.State_Zone_Shrinking,     "State.Zone.Shrinking");
	GameplayTags.State_Zone_Stable        = RequestTag(GameplayTags.State_Zone_Stable,        "State.Zone.Stable");
	GameplayTags.State_Zone_Waiting       = RequestTag(GameplayTags.State_Zone_Waiting,       "State.Zone.Waiting");

	// ─── State.Loot ──────────────────────────────────────────────────────

	GameplayTags.State_Loot_Available     = RequestTag(GameplayTags.State_Loot_Available,     "State.Loot.Available");
	GameplayTags.State_Loot_Consumed      = RequestTag(GameplayTags.State_Loot_Consumed,      "State.Loot.Consumed");

	// ─── Ability ─────────────────────────────────────────────────────────

	GameplayTags.Ability_Sprint           = RequestTag(GameplayTags.Ability_Sprint,           "Ability.Sprint");
	GameplayTags.Ability_Jump             = RequestTag(GameplayTags.Ability_Jump,             "Ability.Jump");
	GameplayTags.Ability_Slide            = RequestTag(GameplayTags.Ability_Slide,            "Ability.Slide");
	GameplayTags.Ability_GrapplingHook    = RequestTag(GameplayTags.Ability_GrapplingHook,    "Ability.GrapplingHook");
	GameplayTags.Ability_Shield           = RequestTag(GameplayTags.Ability_Shield,           "Ability.Shield");
	GameplayTags.Ability_Heal             = RequestTag(GameplayTags.Ability_Heal,             "Ability.Heal");

	// ─── Ability.Combat ──────────────────────────────────────────────────

	GameplayTags.Ability_Combat_Shoot     = RequestTag(GameplayTags.Ability_Combat_Shoot,     "Ability.Combat.Shoot");
	GameplayTags.Ability_Combat_Reload    = RequestTag(GameplayTags.Ability_Combat_Reload,    "Ability.Combat.Reload");
	GameplayTags.Ability_Combat_Melee     = RequestTag(GameplayTags.Ability_Combat_Melee,     "Ability.Combat.Melee");
	GameplayTags.Ability_Combat_Throw     = RequestTag(GameplayTags.Ability_Combat_Throw,     "Ability.Combat.Throw");
	GameplayTags.Ability_Combat_Ultimate  = RequestTag(GameplayTags.Ability_Combat_Ultimate,  "Ability.Combat.Ultimate");

	// ─── Cooldown ────────────────────────────────────────────────────────

	GameplayTags.Cooldown_Sprint          = RequestTag(GameplayTags.Cooldown_Sprint,          "Cooldown.Sprint");
	GameplayTags.Cooldown_Shield          = RequestTag(GameplayTags.Cooldown_Shield,          "Cooldown.Shield");
	GameplayTags.Cooldown_Heal            = RequestTag(GameplayTags.Cooldown_Heal,            "Cooldown.Heal");
	GameplayTags.Cooldown_Ultimate        = RequestTag(GameplayTags.Cooldown_Ultimate,        "Cooldown.Ultimate");

	// ─── Effect.Damage ───────────────────────────────────────────────────

	GameplayTags.Effect_Damage_Bullet     = RequestTag(GameplayTags.Effect_Damage_Bullet,     "Effect.Damage.Bullet");
	GameplayTags.Effect_Damage_Explosion  = RequestTag(GameplayTags.Effect_Damage_Explosion,  "Effect.Damage.Explosion");
	GameplayTags.Effect_Damage_Fire       = RequestTag(GameplayTags.Effect_Damage_Fire,       "Effect.Damage.Fire");
	GameplayTags.Effect_Damage_Melee      = RequestTag(GameplayTags.Effect_Damage_Melee,      "Effect.Damage.Melee");
	GameplayTags.Effect_Damage_Zone       = RequestTag(GameplayTags.Effect_Damage_Zone,       "Effect.Damage.Zone");

	// ─── Effect.Buff ─────────────────────────────────────────────────────

	GameplayTags.Effect_Buff_Shielded     = RequestTag(GameplayTags.Effect_Buff_Shielded,     "Effect.Buff.Shielded");
	GameplayTags.Effect_Buff_SpeedBoost   = RequestTag(GameplayTags.Effect_Buff_SpeedBoost,   "Effect.Buff.SpeedBoost");
	GameplayTags.Effect_Buff_HealOverTime = RequestTag(GameplayTags.Effect_Buff_HealOverTime, "Effect.Buff.HealOverTime");

	// ─── Effect.Debuff ───────────────────────────────────────────────────

	GameplayTags.Effect_Debuff_Slowed     = RequestTag(GameplayTags.Effect_Debuff_Slowed,     "Effect.Debuff.Slowed");
	GameplayTags.Effect_Debuff_Burning    = RequestTag(GameplayTags.Effect_Debuff_Burning,    "Effect.Debuff.Burning");

	// ─── Input ───────────────────────────────────────────────────────────

	GameplayTags.Input_Move               = RequestTag(GameplayTags.Input_Move,               "Input.Move");
	GameplayTags.Input_Look               = RequestTag(GameplayTags.Input_Look,               "Input.Look");
	GameplayTags.Input_Jump               = RequestTag(GameplayTags.Input_Jump,               "Input.Jump");
	GameplayTags.Input_Sprint             = RequestTag(GameplayTags.Input_Sprint,             "Input.Sprint");
	GameplayTags.Input_Slide              = RequestTag(GameplayTags.Input_Slide,              "Input.Slide");
	GameplayTags.Input_Shoot              = RequestTag(GameplayTags.Input_Shoot,              "Input.Shoot");
	GameplayTags.Input_Reload             = RequestTag(GameplayTags.Input_Reload,             "Input.Reload");
	GameplayTags.Input_Melee              = RequestTag(GameplayTags.Input_Melee,              "Input.Melee");
	GameplayTags.Input_ADS                = RequestTag(GameplayTags.Input_ADS,                "Input.ADS");
	GameplayTags.Input_Interact           = RequestTag(GameplayTags.Input_Interact,           "Input.Interact");
	GameplayTags.Input_Ultimate           = RequestTag(GameplayTags.Input_Ultimate,           "Input.Ultimate");

	// ─── Loot.Rarity ─────────────────────────────────────────────────────

	GameplayTags.Loot_Rarity_Common       = RequestTag(GameplayTags.Loot_Rarity_Common,       "Loot.Rarity.Common");
	GameplayTags.Loot_Rarity_Uncommon     = RequestTag(GameplayTags.Loot_Rarity_Uncommon,     "Loot.Rarity.Uncommon");
	GameplayTags.Loot_Rarity_Rare         = RequestTag(GameplayTags.Loot_Rarity_Rare,         "Loot.Rarity.Rare");
	GameplayTags.Loot_Rarity_Epic         = RequestTag(GameplayTags.Loot_Rarity_Epic,         "Loot.Rarity.Epic");
	GameplayTags.Loot_Rarity_Legendary    = RequestTag(GameplayTags.Loot_Rarity_Legendary,    "Loot.Rarity.Legendary");

	// ─── Loot.Type ───────────────────────────────────────────────────────

	GameplayTags.Loot_Type_Weapon         = RequestTag(GameplayTags.Loot_Type_Weapon,         "Loot.Type.Weapon");
	GameplayTags.Loot_Type_Armor          = RequestTag(GameplayTags.Loot_Type_Armor,          "Loot.Type.Armor");
	GameplayTags.Loot_Type_Consumable     = RequestTag(GameplayTags.Loot_Type_Consumable,     "Loot.Type.Consumable");
	GameplayTags.Loot_Type_Ability        = RequestTag(GameplayTags.Loot_Type_Ability,        "Loot.Type.Ability");

	// ─── AI.State ────────────────────────────────────────────────────────

	GameplayTags.AI_State_Patrol          = RequestTag(GameplayTags.AI_State_Patrol,          "AI.State.Patrol");
	GameplayTags.AI_State_Chase           = RequestTag(GameplayTags.AI_State_Chase,           "AI.State.Chase");
	GameplayTags.AI_State_Attack          = RequestTag(GameplayTags.AI_State_Attack,          "AI.State.Attack");
	GameplayTags.AI_State_Retreat         = RequestTag(GameplayTags.AI_State_Retreat,         "AI.State.Retreat");
	GameplayTags.AI_State_Dead            = RequestTag(GameplayTags.AI_State_Dead,            "AI.State.Dead");

	// ─── AI.Difficulty ───────────────────────────────────────────────────

	GameplayTags.AI_Difficulty_Easy       = RequestTag(GameplayTags.AI_Difficulty_Easy,       "AI.Difficulty.Easy");
	GameplayTags.AI_Difficulty_Medium     = RequestTag(GameplayTags.AI_Difficulty_Medium,     "AI.Difficulty.Medium");
	GameplayTags.AI_Difficulty_Hard       = RequestTag(GameplayTags.AI_Difficulty_Hard,       "AI.Difficulty.Hard");
	GameplayTags.AI_Difficulty_Elite      = RequestTag(GameplayTags.AI_Difficulty_Elite,      "AI.Difficulty.Elite");

	bTagsInitialized = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosGameplayTags: All gameplay tags initialized successfully"));
}
