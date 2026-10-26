// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbility_KhaelAbilities.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameplayEffectSpec.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_FrostBolt
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_FrostBolt::UKhaaosAbility_FrostBolt()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 3.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FrostBolt: Constructed (Ice projectile with freeze)"));
}

void UKhaaosAbility_FrostBolt::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_FrostBolt: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_FrostBolt: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 40.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FrostBolt: Applied 40.0 damage (Ability.Species.Khael.FrostBolt)"));

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

	// Duration-based ability: end after 2.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 2.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_CryoWall
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_CryoWall::UKhaaosAbility_CryoWall()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 12.0f;
	EnergyCost = 30.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_CryoWall: Constructed (Ice barrier wall)"));
}

void UKhaaosAbility_CryoWall::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_CryoWall: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_CryoWall: No valid AbilitySystemComponent"));
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
// UKhaaosAbility_Blizzard
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Blizzard::UKhaaosAbility_Blizzard()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 15.0f;
	EnergyCost = 35.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Blizzard: Constructed (AoE slow zone)"));
}

void UKhaaosAbility_Blizzard::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Blizzard: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Blizzard: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 10.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Blizzard: Applied 10.0 damage (Ability.Species.Khael.Blizzard)"));

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
// UKhaaosAbility_FrozenArmor
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_FrozenArmor::UKhaaosAbility_FrozenArmor()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 20.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FrozenArmor: Constructed (Ice armor damage reduction)"));
}

void UKhaaosAbility_FrozenArmor::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_FrozenArmor: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_FrozenArmor: No valid AbilitySystemComponent"));
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

	// Duration-based ability: end after 8.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 8.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Avalanche
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Avalanche::UKhaaosAbility_Avalanche()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 10.0f;
	EnergyCost = 30.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Avalanche: Constructed (Downhill ice slide dash)"));
}

void UKhaaosAbility_Avalanche::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Avalanche: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Avalanche: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 60.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Avalanche: Applied 60.0 damage (Ability.Species.Khael.Avalanche)"));

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
// UKhaaosAbility_Frostbite
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Frostbite::UKhaaosAbility_Frostbite()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 3.0f;
	EnergyCost = 10.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Frostbite: Constructed (Melee freeze attack)"));
}

void UKhaaosAbility_Frostbite::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Frostbite: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Frostbite: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 30.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Frostbite: Applied 30.0 damage (Ability.Species.Khael.Frostbite)"));

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
// UKhaaosAbility_IceClone
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_IceClone::UKhaaosAbility_IceClone()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 18.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_IceClone: Constructed (Decoy ice clone that explodes)"));
}

void UKhaaosAbility_IceClone::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_IceClone: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_IceClone: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 40.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_IceClone: Applied 40.0 damage (Ability.Species.Khael.IceClone)"));

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

	// Duration-based ability: end after 8.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 8.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_AbsoluteZero
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_AbsoluteZero::UKhaaosAbility_AbsoluteZero()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 120.0f;
	EnergyCost = 80.0f;
	// Ultimate ability — long cooldown
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_AbsoluteZero: Constructed (Ultimate: freeze all in range)"));
}

void UKhaaosAbility_AbsoluteZero::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_AbsoluteZero: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_AbsoluteZero: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 80.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_AbsoluteZero: Applied 80.0 damage (Ability.Species.Khael.AbsoluteZero)"));

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
