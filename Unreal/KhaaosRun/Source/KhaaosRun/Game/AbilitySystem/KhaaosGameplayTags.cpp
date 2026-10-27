// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "GameplayTagsManager.h"

FKhaaosGameplayTags FKhaaosGameplayTags::GameplayTags;
bool FKhaaosGameplayTags::bTagsInitialized = false;

void FKhaaosGameplayTags::InitializeTags()
{
	if (bTagsInitialized) return;

auto RequestTag = [](const FGameplayTag& Tag, const ANSICHAR* TagName) -> FGameplayTag
	{
if (Tag.IsValid())
{
return Tag;
}

		FGameplayTag RequestedTag = FGameplayTag::RequestGameplayTag(FName(TagName));
		if (!RequestedTag.IsValid())
		{
			UE_LOG(LogTemp, Warning, TEXT("KhaaosGameplayTags: Tag '%s' not found"), *FString(TagName));
		}
		return RequestedTag;
	};

	GameplayTags.State_Match_Lobby = RequestTag(GameplayTags.State_Match_Lobby, "State.Match.Lobby");
	GameplayTags.State_Match_Countdown = RequestTag(GameplayTags.State_Match_Countdown, "State.Match.Countdown");
	GameplayTags.State_Match_InProgress = RequestTag(GameplayTags.State_Match_InProgress, "State.Match.InProgress");
	GameplayTags.State_Match_WorldTransition = RequestTag(GameplayTags.State_Match_WorldTransition, "State.Match.WorldTransition");
	GameplayTags.State_Match_PulsoKhaaos = RequestTag(GameplayTags.State_Match_PulsoKhaaos, "State.Match.PulsoKhaaos");
	GameplayTags.State_Match_Finished = RequestTag(GameplayTags.State_Match_Finished, "State.Match.Finished");
	GameplayTags.State_Player_Alive = RequestTag(GameplayTags.State_Player_Alive, "State.Player.Alive");
	GameplayTags.State_Player_Dead = RequestTag(GameplayTags.State_Player_Dead, "State.Player.Dead");
	GameplayTags.State_Player_Downed = RequestTag(GameplayTags.State_Player_Downed, "State.Player.Downed");
	GameplayTags.State_Player_Spectating = RequestTag(GameplayTags.State_Player_Spectating, "State.Player.Spectating");
	GameplayTags.State_Zone_Shrinking = RequestTag(GameplayTags.State_Zone_Shrinking, "State.Zone.Shrinking");
	GameplayTags.State_Zone_Stable = RequestTag(GameplayTags.State_Zone_Stable, "State.Zone.Stable");
	GameplayTags.State_Zone_Waiting = RequestTag(GameplayTags.State_Zone_Waiting, "State.Zone.Waiting");
	GameplayTags.State_Loot_Available = RequestTag(GameplayTags.State_Loot_Available, "State.Loot.Available");
	GameplayTags.State_Loot_Consumed = RequestTag(GameplayTags.State_Loot_Consumed, "State.Loot.Consumed");
	GameplayTags.State_Loot_Dropped = RequestTag(GameplayTags.State_Loot_Dropped, "State.Loot.Dropped");
	GameplayTags.State_Pulso_Active = RequestTag(GameplayTags.State_Pulso_Active, "State.Pulso.Active");
	GameplayTags.State_Pulso_Inactive = RequestTag(GameplayTags.State_Pulso_Inactive, "State.Pulso.Inactive");
	GameplayTags.State_Pulso_Warning = RequestTag(GameplayTags.State_Pulso_Warning, "State.Pulso.Warning");
	GameplayTags.State_Pulso_LootBoost = RequestTag(GameplayTags.State_Pulso_LootBoost, "State.Pulso.LootBoost");
	GameplayTags.Ability_Sprint = RequestTag(GameplayTags.Ability_Sprint, "Ability.Sprint");
	GameplayTags.Ability_Jump = RequestTag(GameplayTags.Ability_Jump, "Ability.Jump");
	GameplayTags.Ability_Slide = RequestTag(GameplayTags.Ability_Slide, "Ability.Slide");
	GameplayTags.Ability_GrapplingHook = RequestTag(GameplayTags.Ability_GrapplingHook, "Ability.GrapplingHook");
	GameplayTags.Ability_Shield = RequestTag(GameplayTags.Ability_Shield, "Ability.Shield");
	GameplayTags.Ability_Heal = RequestTag(GameplayTags.Ability_Heal, "Ability.Heal");
	GameplayTags.Ability_Combat_Shoot = RequestTag(GameplayTags.Ability_Combat_Shoot, "Ability.Combat.Shoot");
	GameplayTags.Ability_Combat_Reload = RequestTag(GameplayTags.Ability_Combat_Reload, "Ability.Combat.Reload");
	GameplayTags.Ability_Combat_Melee = RequestTag(GameplayTags.Ability_Combat_Melee, "Ability.Combat.Melee");
	GameplayTags.Ability_Combat_Throw = RequestTag(GameplayTags.Ability_Combat_Throw, "Ability.Combat.Throw");
	GameplayTags.Ability_Combat_Ultimate = RequestTag(GameplayTags.Ability_Combat_Ultimate, "Ability.Combat.Ultimate");
	GameplayTags.Ability_Combat_ADS = RequestTag(GameplayTags.Ability_Combat_ADS, "Ability.Combat.ADS");
	GameplayTags.Ability_Passive_Species_Zheers = RequestTag(GameplayTags.Ability_Passive_Species_Zheers, "Ability.Passive.Species.Zheers.Adaptabilidade");
	GameplayTags.Ability_Passive_Species_Onith = RequestTag(GameplayTags.Ability_Passive_Species_Onith, "Ability.Passive.Species.Onith.PeleEscamosa");
	GameplayTags.Ability_Passive_Species_Skeetw = RequestTag(GameplayTags.Ability_Passive_Species_Skeetw, "Ability.Passive.Species.Skeetw.VooPlanador");
	GameplayTags.Ability_Passive_Species_Huran = RequestTag(GameplayTags.Ability_Passive_Species_Huran, "Ability.Passive.Species.Huran.RegeneracaoAquatica");
	GameplayTags.Ability_Passive_Species_Venex = RequestTag(GameplayTags.Ability_Passive_Species_Venex, "Ability.Passive.Species.Venex.OverclockNeural");
	GameplayTags.Ability_Passive_Species_Khael = RequestTag(GameplayTags.Ability_Passive_Species_Khael, "Ability.Passive.Species.Khael.CanalizacaoMistica");
	GameplayTags.Ability_Passive_World_CIGKV = RequestTag(GameplayTags.Ability_Passive_World_CIGKV, "Ability.Passive.World.CIGKV");
	GameplayTags.Ability_Passive_World_Barburhen = RequestTag(GameplayTags.Ability_Passive_World_Barburhen, "Ability.Passive.World.Barburhen");
	GameplayTags.Ability_Passive_World_Priadus = RequestTag(GameplayTags.Ability_Passive_World_Priadus, "Ability.Passive.World.Priadus");
	GameplayTags.Ability_Passive_World_Ckesalth = RequestTag(GameplayTags.Ability_Passive_World_Ckesalth, "Ability.Passive.World.Ckesalth");
	GameplayTags.Ability_Passive_World_Arukheea = RequestTag(GameplayTags.Ability_Passive_World_Arukheea, "Ability.Passive.World.Arukheea");
	GameplayTags.Cooldown_Sprint = RequestTag(GameplayTags.Cooldown_Sprint, "Cooldown.Sprint");
	GameplayTags.Cooldown_Shield = RequestTag(GameplayTags.Cooldown_Shield, "Cooldown.Shield");
	GameplayTags.Cooldown_Heal = RequestTag(GameplayTags.Cooldown_Heal, "Cooldown.Heal");
	GameplayTags.Cooldown_Ultimate = RequestTag(GameplayTags.Cooldown_Ultimate, "Cooldown.Ultimate");
	GameplayTags.Cooldown_GrapplingHook = RequestTag(GameplayTags.Cooldown_GrapplingHook, "Cooldown.GrapplingHook");
	GameplayTags.Effect_Damage_Bullet = RequestTag(GameplayTags.Effect_Damage_Bullet, "Effect.Damage.Bullet");
	GameplayTags.Effect_Damage_Explosion = RequestTag(GameplayTags.Effect_Damage_Explosion, "Effect.Damage.Explosion");
	GameplayTags.Effect_Damage_Fire = RequestTag(GameplayTags.Effect_Damage_Fire, "Effect.Damage.Fire");
	GameplayTags.Effect_Damage_Melee = RequestTag(GameplayTags.Effect_Damage_Melee, "Effect.Damage.Melee");
	GameplayTags.Effect_Damage_Zone = RequestTag(GameplayTags.Effect_Damage_Zone, "Effect.Damage.Zone");
	GameplayTags.Effect_Damage_Pulso = RequestTag(GameplayTags.Effect_Damage_Pulso, "Effect.Damage.Pulso");
	GameplayTags.Effect_Damage_Fall = RequestTag(GameplayTags.Effect_Damage_Fall, "Effect.Damage.Fall");
	GameplayTags.Effect_Buff_Shielded = RequestTag(GameplayTags.Effect_Buff_Shielded, "Effect.Buff.Shielded");
	GameplayTags.Effect_Buff_SpeedBoost = RequestTag(GameplayTags.Effect_Buff_SpeedBoost, "Effect.Buff.SpeedBoost");
	// ─── State.Match ─────────────────────────────────────────────────────

GameplayTags.GameplayCue_Damage_Zone = RequestTag(
GameplayTags.GameplayCue_Damage_Zone, "GameplayCue.Damage.Zone");

	GameplayTags.Effect_Buff_HealOverTime = RequestTag(GameplayTags.Effect_Buff_HealOverTime, "Effect.Buff.HealOverTime");
	GameplayTags.Effect_Buff_Overclock = RequestTag(GameplayTags.Effect_Buff_Overclock, "Effect.Buff.Overclock");
	GameplayTags.Effect_Buff_Adaptabilidade = RequestTag(GameplayTags.Effect_Buff_Adaptabilidade, "Effect.Buff.Adaptabilidade");
	GameplayTags.Effect_Buff_Glide = RequestTag(GameplayTags.Effect_Buff_Glide, "Effect.Buff.Glide");
	GameplayTags.Effect_Buff_Regen = RequestTag(GameplayTags.Effect_Buff_Regen, "Effect.Buff.Regen");
	GameplayTags.Effect_Buff_Canalizacao = RequestTag(GameplayTags.Effect_Buff_Canalizacao, "Effect.Buff.Canalizacao");
	GameplayTags.Effect_Debuff_Slowed = RequestTag(GameplayTags.Effect_Debuff_Slowed, "Effect.Debuff.Slowed");
	GameplayTags.Effect_Debuff_Burning = RequestTag(GameplayTags.Effect_Debuff_Burning, "Effect.Debuff.Burning");
	GameplayTags.Effect_Debuff_ZoneDamage = RequestTag(GameplayTags.Effect_Debuff_ZoneDamage, "Effect.Debuff.ZoneDamage");
	GameplayTags.Effect_Debuff_Disarmed = RequestTag(GameplayTags.Effect_Debuff_Disarmed, "Effect.Debuff.Disarmed");
	GameplayTags.Effect_Debuff_Silenced = RequestTag(GameplayTags.Effect_Debuff_Silenced, "Effect.Debuff.Silenced");
	GameplayTags.Input_Move = RequestTag(GameplayTags.Input_Move, "Input.Move");
	GameplayTags.Input_Look = RequestTag(GameplayTags.Input_Look, "Input.Look");
	GameplayTags.Input_Jump = RequestTag(GameplayTags.Input_Jump, "Input.Jump");
	GameplayTags.Input_Sprint = RequestTag(GameplayTags.Input_Sprint, "Input.Sprint");
	GameplayTags.Input_Slide = RequestTag(GameplayTags.Input_Slide, "Input.Slide");
	GameplayTags.Input_Shoot = RequestTag(GameplayTags.Input_Shoot, "Input.Shoot");
	GameplayTags.Input_Reload = RequestTag(GameplayTags.Input_Reload, "Input.Reload");
	GameplayTags.Input_Melee = RequestTag(GameplayTags.Input_Melee, "Input.Melee");
	GameplayTags.Input_ADS = RequestTag(GameplayTags.Input_ADS, "Input.ADS");
	GameplayTags.Input_Interact = RequestTag(GameplayTags.Input_Interact, "Input.Interact");
	GameplayTags.Input_Ultimate = RequestTag(GameplayTags.Input_Ultimate, "Input.Ultimate");
	GameplayTags.Loot_Rarity_Comum = RequestTag(GameplayTags.Loot_Rarity_Comum, "Loot.Rarity.Comum");
	GameplayTags.Loot_Rarity_Incomum = RequestTag(GameplayTags.Loot_Rarity_Incomum, "Loot.Rarity.Incomum");
	GameplayTags.Loot_Rarity_Raro = RequestTag(GameplayTags.Loot_Rarity_Raro, "Loot.Rarity.Raro");
	GameplayTags.Loot_Rarity_Epico = RequestTag(GameplayTags.Loot_Rarity_Epico, "Loot.Rarity.Epico");
	GameplayTags.Loot_Rarity_Lendario = RequestTag(GameplayTags.Loot_Rarity_Lendario, "Loot.Rarity.Lendario");
	GameplayTags.Loot_Rarity_Mitico = RequestTag(GameplayTags.Loot_Rarity_Mitico, "Loot.Rarity.Mitico");
	GameplayTags.Loot_Type_Curativo = RequestTag(GameplayTags.Loot_Type_Curativo, "Loot.Type.Curativo");
	GameplayTags.Loot_Type_Defesa = RequestTag(GameplayTags.Loot_Type_Defesa, "Loot.Type.Defesa");
	GameplayTags.Loot_Type_Utilidade = RequestTag(GameplayTags.Loot_Type_Utilidade, "Loot.Type.Utilidade");
	GameplayTags.Loot_Type_Recurso = RequestTag(GameplayTags.Loot_Type_Recurso, "Loot.Type.Recurso");
	GameplayTags.Loot_Type_Weapon = RequestTag(GameplayTags.Loot_Type_Weapon, "Loot.Type.Weapon");
	GameplayTags.Loot_Type_Armor = RequestTag(GameplayTags.Loot_Type_Armor, "Loot.Type.Armor");
	GameplayTags.Weapon_Category_Pistol = RequestTag(GameplayTags.Weapon_Category_Pistol, "Weapon.Category.Pistol");
	GameplayTags.Weapon_Category_SMG = RequestTag(GameplayTags.Weapon_Category_SMG, "Weapon.Category.SMG");
	GameplayTags.Weapon_Category_AssaultRifle = RequestTag(GameplayTags.Weapon_Category_AssaultRifle, "Weapon.Category.AssaultRifle");
	GameplayTags.Weapon_Category_Carbine = RequestTag(GameplayTags.Weapon_Category_Carbine, "Weapon.Category.Carbine");
	GameplayTags.Weapon_Category_Sniper = RequestTag(GameplayTags.Weapon_Category_Sniper, "Weapon.Category.Sniper");
	GameplayTags.Weapon_Category_DMR = RequestTag(GameplayTags.Weapon_Category_DMR, "Weapon.Category.DMR");
	GameplayTags.Weapon_Category_Shotgun = RequestTag(GameplayTags.Weapon_Category_Shotgun, "Weapon.Category.Shotgun");
	GameplayTags.Weapon_Category_LMG = RequestTag(GameplayTags.Weapon_Category_LMG, "Weapon.Category.LMG");
	GameplayTags.Weapon_Category_Knife = RequestTag(GameplayTags.Weapon_Category_Knife, "Weapon.Category.Knife");
	GameplayTags.Weapon_Category_Sword = RequestTag(GameplayTags.Weapon_Category_Sword, "Weapon.Category.Sword");
	GameplayTags.Weapon_Category_Exotic = RequestTag(GameplayTags.Weapon_Category_Exotic, "Weapon.Category.Exotic");
	GameplayTags.Species_Zheers = RequestTag(GameplayTags.Species_Zheers, "Species.Zheers");
	GameplayTags.Species_Onith = RequestTag(GameplayTags.Species_Onith, "Species.Onith");
	GameplayTags.Species_Skeetw = RequestTag(GameplayTags.Species_Skeetw, "Species.Skeetw");
	GameplayTags.Species_Huran = RequestTag(GameplayTags.Species_Huran, "Species.Huran");
	GameplayTags.Species_Venex = RequestTag(GameplayTags.Species_Venex, "Species.Venex");
	GameplayTags.Species_Khael = RequestTag(GameplayTags.Species_Khael, "Species.Khael");
	GameplayTags.World_CIGKV = RequestTag(GameplayTags.World_CIGKV, "World.CIGKV");
	GameplayTags.World_Barburhen = RequestTag(GameplayTags.World_Barburhen, "World.Barburhen");
	GameplayTags.World_Barburhen_AcidProtection = RequestTag(GameplayTags.World_Barburhen_AcidProtection, "World.Barburhen.AcidProtection");
	GameplayTags.World_Priadus = RequestTag(GameplayTags.World_Priadus, "World.Priadus");
	GameplayTags.World_Ckesalth = RequestTag(GameplayTags.World_Ckesalth, "World.Ckesalth");
	GameplayTags.World_Arukheea = RequestTag(GameplayTags.World_Arukheea, "World.Arukheea");
	GameplayTags.AI_State_Patrol = RequestTag(GameplayTags.AI_State_Patrol, "AI.State.Patrol");
	GameplayTags.AI_State_Chase = RequestTag(GameplayTags.AI_State_Chase, "AI.State.Chase");
	GameplayTags.AI_State_Attack = RequestTag(GameplayTags.AI_State_Attack, "AI.State.Attack");
	GameplayTags.AI_State_Retreat = RequestTag(GameplayTags.AI_State_Retreat, "AI.State.Retreat");
	GameplayTags.AI_State_Dead = RequestTag(GameplayTags.AI_State_Dead, "AI.State.Dead");
	GameplayTags.AI_Difficulty_Easy = RequestTag(GameplayTags.AI_Difficulty_Easy, "AI.Difficulty.Easy");
	GameplayTags.AI_Difficulty_Medium = RequestTag(GameplayTags.AI_Difficulty_Medium, "AI.Difficulty.Medium");
	GameplayTags.AI_Difficulty_Hard = RequestTag(GameplayTags.AI_Difficulty_Hard, "AI.Difficulty.Hard");
	GameplayTags.AI_Difficulty_Elite = RequestTag(GameplayTags.AI_Difficulty_Elite, "AI.Difficulty.Elite");

	bTagsInitialized = true;
UE_LOG(LogTemp, Log, TEXT("KhaaosGameplayTags: All %d gameplay tags initialized"), 122);
}