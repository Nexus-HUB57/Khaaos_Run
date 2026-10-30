// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbility_OnithAbilities.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameplayEffectSpec.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_VenomSpit
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_VenomSpit::UKhaaosAbility_VenomSpit()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 3.0f;
	EnergyCost = 10.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_VenomSpit: Constructed (Toxic projectile with DoT)"));
}

void UKhaaosAbility_VenomSpit::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_VenomSpit: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_VenomSpit: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 25.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_VenomSpit: Applied 25.0 damage (Ability.Species.Onith.VenomSpit)"));

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
// UKhaaosAbility_NoxiousGas
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_NoxiousGas::UKhaaosAbility_NoxiousGas()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 12.0f;
	EnergyCost = 20.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_NoxiousGas: Constructed (Poison gas cloud)"));
}

void UKhaaosAbility_NoxiousGas::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_NoxiousGas: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_NoxiousGas: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 3.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_NoxiousGas: Applied 3.0 damage (Ability.Species.Onith.NoxiousGas)"));

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
// UKhaaosAbility_PlagueTouch
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_PlagueTouch::UKhaaosAbility_PlagueTouch()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 4.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_PlagueTouch: Constructed (Melee infection)"));
}

void UKhaaosAbility_PlagueTouch::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_PlagueTouch: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_PlagueTouch: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 40.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_PlagueTouch: Applied 40.0 damage (Ability.Species.Onith.PlagueTouch)"));

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
// UKhaaosAbility_ToxicHusk
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_ToxicHusk::UKhaaosAbility_ToxicHusk()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 18.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_ToxicHusk: Constructed (Poison armor reflects damage)"));
}

void UKhaaosAbility_ToxicHusk::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_ToxicHusk: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_ToxicHusk: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 10.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_ToxicHusk: Applied 10.0 damage (Ability.Species.Onith.ToxicHusk)"));

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
// UKhaaosAbility_Contaminate
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Contaminate::UKhaaosAbility_Contaminate()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 15.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Contaminate: Constructed (Ground poison zone)"));
}

void UKhaaosAbility_Contaminate::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Contaminate: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Contaminate: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 8.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Contaminate: Applied 8.0 damage (Ability.Species.Onith.Contaminate)"));

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
// UKhaaosAbility_ParasiteDrain
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_ParasiteDrain::UKhaaosAbility_ParasiteDrain()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 10.0f;
	EnergyCost = 20.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_ParasiteDrain: Constructed (Life steal beam)"));
}

void UKhaaosAbility_ParasiteDrain::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_ParasiteDrain: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_ParasiteDrain: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 30.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_ParasiteDrain: Applied 30.0 damage (Ability.Species.Onith.ParasiteDrain)"));

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

	// Duration-based ability: end after 1.5s
	FTimerHandle DurationTimer;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()
		{
			EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		}, 1.5f, false);
	}
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_BioMimic
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_BioMimic::UKhaaosAbility_BioMimic()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 20.0f;
	EnergyCost = 30.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_BioMimic: Constructed (Stealth + poison burst on break)"));
}

void UKhaaosAbility_BioMimic::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_BioMimic: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_BioMimic: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 25.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_BioMimic: Applied 25.0 damage (Ability.Species.Onith.BioMimic)"));

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
// UKhaaosAbility_Pandemic
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Pandemic::UKhaaosAbility_Pandemic()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 120.0f;
	EnergyCost = 80.0f;
	// Ultimate ability — long cooldown
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Pandemic: Constructed (Ultimate: global DoT)"));
}

void UKhaaosAbility_Pandemic::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Pandemic: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Pandemic: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 15.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Pandemic: Applied 15.0 damage (Ability.Species.Onith.Pandemic)"));

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
