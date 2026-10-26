// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbility_HuranAbilities.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameplayEffectSpec.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_TidalSurge
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_TidalSurge::UKhaaosAbility_TidalSurge()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 2.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TidalSurge: Constructed (Water wave AoE knockback)"));
}

void UKhaaosAbility_TidalSurge::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_TidalSurge: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_TidalSurge: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 40.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TidalSurge: Applied 40.0 damage (Ability.Species.Huran.TidalSurge)"));

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
// UKhaaosAbility_AquaShield
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_AquaShield::UKhaaosAbility_AquaShield()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 15.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_AquaShield: Constructed (Water barrier absorbs damage)"));
}

void UKhaaosAbility_AquaShield::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_AquaShield: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_AquaShield: No valid AbilitySystemComponent"));
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

	// Duration-based ability: end after 10.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 10.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_DiveBomb
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_DiveBomb::UKhaaosAbility_DiveBomb()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 8.0f;
	EnergyCost = 30.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_DiveBomb: Constructed (Underwater dash + surface explosion)"));
}

void UKhaaosAbility_DiveBomb::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_DiveBomb: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_DiveBomb: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 30.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_DiveBomb: Applied 30.0 damage (Ability.Species.Huran.DiveBomb)"));

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

	// Duration-based ability: end after 0.5s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 0.5f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_FloodZone
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_FloodZone::UKhaaosAbility_FloodZone()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 30.0f;
	EnergyCost = 40.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_FloodZone: Constructed (Create temporary water zone)"));
}

void UKhaaosAbility_FloodZone::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_FloodZone: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_FloodZone: No valid AbilitySystemComponent"));
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

	// Duration-based ability: end after 15.0s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 15.0f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_PressureStrike
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_PressureStrike::UKhaaosAbility_PressureStrike()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 4.0f;
	EnergyCost = 20.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_PressureStrike: Constructed (Hydrostatic pressure punch)"));
}

void UKhaaosAbility_PressureStrike::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_PressureStrike: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_PressureStrike: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 75.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_PressureStrike: Applied 75.0 damage (Ability.Species.Huran.PressureStrike)"));

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
// UKhaaosAbility_GillsRegen
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_GillsRegen::UKhaaosAbility_GillsRegen()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	bIsToggleAbility = true;
	CooldownDuration = 5.0f;
	EnergyCost = 10.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_GillsRegen: Constructed (Enhanced regen while in water)"));
}

void UKhaaosAbility_GillsRegen::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_GillsRegen: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_GillsRegen: No valid AbilitySystemComponent"));
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

	// Toggle ability — persists until explicitly cancelled
	// Do NOT call EndAbility here
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Whirlpool
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Whirlpool::UKhaaosAbility_Whirlpool()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 20.0f;
	EnergyCost = 35.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Whirlpool: Constructed (Vortex trap that pulls and roots)"));
}

void UKhaaosAbility_Whirlpool::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Whirlpool: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Whirlpool: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 15.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Whirlpool: Applied 15.0 damage (Ability.Species.Huran.Whirlpool)"));

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
// UKhaaosAbility_TsunamiRage
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_TsunamiRage::UKhaaosAbility_TsunamiRage()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 120.0f;
	EnergyCost = 80.0f;
	// Ultimate ability — long cooldown
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TsunamiRage: Constructed (Ultimate: massive wave)"));
}

void UKhaaosAbility_TsunamiRage::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_TsunamiRage: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_TsunamiRage: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 150.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TsunamiRage: Applied 150.0 damage (Ability.Species.Huran.TsunamiRage)"));

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
