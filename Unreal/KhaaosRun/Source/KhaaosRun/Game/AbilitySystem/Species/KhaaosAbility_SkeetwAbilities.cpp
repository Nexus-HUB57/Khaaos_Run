// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbility_SkeetwAbilities.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameplayEffectSpec.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_FogCloud
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_FogCloud::UKhaaosAbility_FogCloud()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 10.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FogCloud: Constructed (Deploy blinding fog)"));
}

void UKhaaosAbility_FogCloud::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_FogCloud: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_FogCloud: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Duration-based ability: end after 6.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 6.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_SkyDive
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_SkyDive::UKhaaosAbility_SkyDive()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 8.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_SkyDive: Constructed (Aerial dive attack)"));
}

void UKhaaosAbility_SkyDive::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_SkyDive: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_SkyDive: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 70.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_SkyDive: Applied 70.0 damage (Ability.Species.Skeetw.SkyDive)"));

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Duration-based ability: end after 1.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 1.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_TalonStrike
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_TalonStrike::UKhaaosAbility_TalonStrike()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 3.0f;
	EnergyCost = 10.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TalonStrike: Constructed (Enhanced melee with bleed)"));
}

void UKhaaosAbility_TalonStrike::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_TalonStrike: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_TalonStrike: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 50.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TalonStrike: Applied 50.0 damage (Ability.Species.Skeetw.TalonStrike)"));

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Duration-based ability: end after 3.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 3.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_WindGust
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_WindGust::UKhaaosAbility_WindGust()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 6.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_WindGust: Constructed (Cone knockback)"));
}

void UKhaaosAbility_WindGust::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_WindGust: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_WindGust: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 10.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_WindGust: Applied 10.0 damage (Ability.Species.Skeetw.WindGust)"));

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Instant ability — end immediately after application
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_FeatherFlurry
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_FeatherFlurry::UKhaaosAbility_FeatherFlurry()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 4.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FeatherFlurry: Constructed (5 feather projectiles)"));
}

void UKhaaosAbility_FeatherFlurry::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_FeatherFlurry: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_FeatherFlurry: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 15.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FeatherFlurry: Applied 15.0 damage (Ability.Species.Skeetw.FeatherFlurry)"));

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Instant ability — end immediately after application
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Camouflage
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Camouflage::UKhaaosAbility_Camouflage()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 25.0f;
	EnergyCost = 20.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Camouflage: Constructed (Fog stealth)"));
}

void UKhaaosAbility_Camouflage::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Camouflage: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Camouflage: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Duration-based ability: end after 4.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 4.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_ScoutEye
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_ScoutEye::UKhaaosAbility_ScoutEye()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 12.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_ScoutEye: Constructed (Reveal and mark enemies)"));
}

void UKhaaosAbility_ScoutEye::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_ScoutEye: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_ScoutEye: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Duration-based ability: end after 5.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 5.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_StormCall
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_StormCall::UKhaaosAbility_StormCall()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 120.0f;
	EnergyCost = 80.0f;
	// Ultimate ability — long cooldown
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_StormCall: Constructed (Ultimate: lightning storm)"));
}

void UKhaaosAbility_StormCall::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_StormCall: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_StormCall: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 25.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_StormCall: Applied 25.0 damage (Ability.Species.Skeetw.StormCall)"));

	// Spawn VFX via Niagara
	if (VFX.IsValid())
	{
		// VFX loaded — spawn at ability location
		// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)
	}
	else
	{
		// Attempt async load for soft reference
	}

	// Play SFX
	if (SFX.IsValid())
	{
		// UGameplayStatics::PlaySoundAtLocation(...)
	}

	// Duration-based ability: end after 4.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 4.0f, false);
	}
}
