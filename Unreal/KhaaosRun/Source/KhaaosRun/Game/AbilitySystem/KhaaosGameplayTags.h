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
 * Tag Hierarchy:
 *   State.Match / State.Player / State.Zone / State.Loot / State.Pulso
 *   Ability.Sprint / Ability.Jump / Ability.Slide / Ability.GrapplingHook / Ability.Shield / Ability.Heal
 *   Ability.Combat.Shoot / Reload / Melee / Throw / Ultimate
 *   Ability.Passive.Species.{Zheers,Onith,Skeetw,Huran,Venex,Khael}
 *   Ability.Passive.World.{CIGKV,Barburhen,Priadus,Ckesalth,Arukheea}
 *   Cooldown.{Sprint,Shield,Heal,Ultimate}
 *   Effect.Damage.{Bullet,Explosion,Fire,Melee,Zone,Pulso}
 *   Effect.Buff.{Shielded,SpeedBoost,HealOverTime,Overclock,Adaptabilidade}
 *   Effect.Debuff.{Slowed,Burning,ZoneDamage}
 *   Input.{Move,Look,Jump,Sprint,Slide,Shoot,Reload,Melee,ADS,Interact,Ultimate}
 *   Loot.Rarity.{Comum,Incomum,Raro,Epico,Lendario,Mitico}
 *   Loot.Type.{Weapon,Armor,Consumable,Ability,Recurso}
 *   Weapon.Category.{Pistol,SMG,AssaultRifle,Carbine,Sniper,DMR,Shotgun,LMG,Knife,Sword,Exotic}
 *   Species.{Zheers,Onith,Skeetw,Huran,Venex,Khael}
 *   World.{CIGKV,Barburhen,Priadus,Ckesalth,Arukheea}
 *   AI.State.{Patrol,Chase,Attack,Retreat,Dead}
 *   AI.Difficulty.{Easy,Medium,Hard,Elite}
 */
USTRUCT(BlueprintType)
struct FKhaaosGameplayTags
{
	GENERATED_BODY()

public:
	/** Singleton accessor. */
	static const FKhaaosGameplayTags& Get() { return GameplayTags; }
	/** Initialize all tags. Call once from module startup. */
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
	FGameplayTag State_Match_WorldTransition;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Match")
	FGameplayTag State_Match_PulsoKhaaos;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Match")
	FGameplayTag State_Match_Finished;

	// ─── State.Player ────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Alive;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Dead;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Downed;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Player")
	FGameplayTag State_Player_Spectating;

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

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Loot")
	FGameplayTag State_Loot_Dropped;

	// ─── State.Pulso ─────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Pulso")
	FGameplayTag State_Pulso_Active;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Pulso")
	FGameplayTag State_Pulso_Inactive;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Pulso")
	FGameplayTag State_Pulso_Warning;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|State|Pulso")
	FGameplayTag State_Pulso_LootBoost;

	// ─── Ability (Movement + Defense) ────────────────────────────────────
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

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Combat")
	FGameplayTag Ability_Combat_ADS;

	// ─── Ability.Passive.Species ──────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|Species")
	FGameplayTag Ability_Passive_Species_Zheers;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|Species")
	FGameplayTag Ability_Passive_Species_Onith;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|Species")
	FGameplayTag Ability_Passive_Species_Skeetw;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|Species")
	FGameplayTag Ability_Passive_Species_Huran;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|Species")
	FGameplayTag Ability_Passive_Species_Venex;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|Species")
	FGameplayTag Ability_Passive_Species_Khael;

	// ─── Ability.Passive.World ───────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|World")
	FGameplayTag Ability_Passive_World_CIGKV;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|World")
	FGameplayTag Ability_Passive_World_Barburhen;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|World")
	FGameplayTag Ability_Passive_World_Priadus;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|World")
	FGameplayTag Ability_Passive_World_Ckesalth;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Ability|Passive|World")
	FGameplayTag Ability_Passive_World_Arukheea;

	// ─── Cooldown ────────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Sprint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Shield;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Heal;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_Ultimate;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Cooldown")
	FGameplayTag Cooldown_GrapplingHook;

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

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Pulso;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Damage")
	FGameplayTag Effect_Damage_Fall;

	// ─── Effect.Buff ─────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Shielded;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_SpeedBoost;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_HealOverTime;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Overclock;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Adaptabilidade;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Glide;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Regen;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Buff")
	FGameplayTag Effect_Buff_Canalizacao;

	// ─── Effect.Debuff ───────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_Slowed;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_Burning;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_ZoneDamage;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_Disarmed;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Effect|Debuff")
	FGameplayTag Effect_Debuff_Silenced;

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
	FGameplayTag Loot_Rarity_Comum;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Incomum;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Raro;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Epico;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Lendario;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Rarity")
	FGameplayTag Loot_Rarity_Mitico;

	// ─── Loot.Type ───────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Curativo;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Defesa;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Utilidade;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Recurso;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Weapon;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Loot|Type")
	FGameplayTag Loot_Type_Armor;

	// ─── Weapon.Category ─────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Pistol;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_SMG;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_AssaultRifle;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Carbine;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Sniper;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_DMR;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Shotgun;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_LMG;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Knife;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Sword;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Weapon|Category")
	FGameplayTag Weapon_Category_Exotic;

	// ─── Species ─────────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Species")
	FGameplayTag Species_Zheers;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Species")
	FGameplayTag Species_Onith;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Species")
	FGameplayTag Species_Skeetw;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Species")
	FGameplayTag Species_Huran;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Species")
	FGameplayTag Species_Venex;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|Species")
	FGameplayTag Species_Khael;

	// ─── World ───────────────────────────────────────────────────────────
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|World")
	FGameplayTag World_CIGKV;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|World")
	FGameplayTag World_Barburhen;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|World")
	FGameplayTag World_Priadus;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|World")
	FGameplayTag World_Ckesalth;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Tags|World")
	FGameplayTag World_Arukheea;

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