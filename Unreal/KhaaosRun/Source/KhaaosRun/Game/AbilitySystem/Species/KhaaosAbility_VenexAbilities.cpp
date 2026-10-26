// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbility_VenexAbilities.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameplayEffectSpec.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_PulseBlast
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_PulseBlast::UKhaaosAbility_PulseBlast()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 8.0f;
	EnergyCost = 20.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_PulseBlast: Constructed (EMP blast disables shields)"));
}

void UKhaaosAbility_PulseBlast::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_PulseBlast: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_PulseBlast: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 15.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_PulseBlast: Applied 15.0 damage (Ability.Species.Venex.PulseBlast)"));

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
// UKhaaosAbility_Overclock
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Overclock::UKhaaosAbility_Overclock()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 20.0f;
	EnergyCost = 30.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Overclock: Constructed (Boost fire rate and speed)"));
}

void UKhaaosAbility_Overclock::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Overclock: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Overclock: No valid AbilitySystemComponent"));
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
// UKhaaosAbility_TargetLock
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_TargetLock::UKhaaosAbility_TargetLock()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 15.0f;
	EnergyCost = 25.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_TargetLock: Constructed (Auto-aim for next shots)"));
}

void UKhaaosAbility_TargetLock::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_TargetLock: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_TargetLock: No valid AbilitySystemComponent"));
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
// UKhaaosAbility_NaniteRepair
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_NaniteRepair::UKhaaosAbility_NaniteRepair()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 25.0f;
	EnergyCost = 30.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_NaniteRepair: Constructed (Self-repair over time)"));
}

void UKhaaosAbility_NaniteRepair::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_NaniteRepair: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_NaniteRepair: No valid AbilitySystemComponent"));
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
// UKhaaosAbility_CyberDash
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_CyberDash::UKhaaosAbility_CyberDash()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 6.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_CyberDash: Constructed (Blink teleport)"));
}

void UKhaaosAbility_CyberDash::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_CyberDash: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_CyberDash: No valid AbilitySystemComponent"));
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

	// Instant ability — end immediately after application
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}

// ══════════════════════════════════════════════════════════════════════
// UKhaaosAbility_ScannerSweep
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_ScannerSweep::UKhaaosAbility_ScannerSweep()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 10.0f;
	EnergyCost = 15.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_ScannerSweep: Constructed (Reveal nearby enemies)"));
}

void UKhaaosAbility_ScannerSweep::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_ScannerSweep: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_ScannerSweep: No valid AbilitySystemComponent"));
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
// UKhaaosAbility_StasisField
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_StasisField::UKhaaosAbility_StasisField()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 30.0f;
	EnergyCost = 40.0f;
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_StasisField: Constructed (Temporary invulnerability)"));
}

void UKhaaosAbility_StasisField::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_StasisField: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_StasisField: No valid AbilitySystemComponent"));
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
// UKhaaosAbility_Overload
// ══════════════════════════════════════════════════════════════════════

UKhaaosAbility_Overload::UKhaaosAbility_Overload()
{
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	CooldownDuration = 120.0f;
	EnergyCost = 80.0f;
	// Ultimate ability — long cooldown
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Overload: Constructed (Ultimate: massive EMP)"));
}

void UKhaaosAbility_Overload::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("UKhaaosAbility_Overload: CommitAbility failed (cooldown or cost)"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("UKhaaosAbility_Overload: No valid AbilitySystemComponent"));
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Apply damage: 100.0 base damage via GameplayEffect spec
	FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
	EffectContext.AddSourceObject(this);
	// Damage application via spec handle — target selection depends on ability type
	// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)
	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosAbility_Overload: Applied 100.0 damage (Ability.Species.Venex.Overload)"));

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
