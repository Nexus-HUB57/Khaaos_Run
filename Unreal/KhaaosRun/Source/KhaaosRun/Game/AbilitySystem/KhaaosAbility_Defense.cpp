// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosAbility_Defense.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "Net/UnrealNetwork.h"
#include "TimerManager.h"
#include "Game/VFX/KhaaosVFXManager.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraComponent.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Shield
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Shield::UKhaaosAbility_Shield()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        ShieldHealth = 100.0f;
        ShieldDuration = 5.0f;
        AbsorptionPercent = 1.0f;
        ShieldEnergyDrainPerSecond = 10.0f;
        ShieldEnergyCost = 30.0f;
        EnergyCost = 30.0f;

        ShieldHealthRemaining = 0.0f;
        bShieldActive = false;

        bIsToggleAbility = true;
        bCancelOnDamage = false; // Shield absorbs damage, doesn't cancel on it
}

void UKhaaosAbility_Shield::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        // Server: activate shield
        ServerActivateShield();

        // Client: spawn shield VFX
        ClientSpawnShieldVFX();

        // Duration-based auto-cancel
        if (ShieldDuration > 0.0f)
        {
                if (AActor* Owner = GetOwningActorFromActorInfo())
                {
                        FTimerDelegate EndDelegate;
                        EndDelegate.BindUObject(this, &UKhaaosAbility_Shield::EndAbility,
                                Handle, ActorInfo, ActivationInfo, true, false);
                        Owner->GetWorldTimerManager().SetTimer(ShieldDurationHandle, EndDelegate, ShieldDuration, false);
                }
        }

        // Start energy drain tick
        if (ShieldEnergyDrainPerSecond > 0.0f)
        {
                if (AActor* Owner = GetOwningActorFromActorInfo())
                {
                        FTimerDelegate DrainDelegate;
                        DrainDelegate.BindUObject(this, &UKhaaosAbility_Shield::OnShieldEnergyDrainTick, 0.1f);
                        Owner->GetWorldTimerManager().SetTimer(ShieldEnergyDrainHandle, DrainDelegate, 0.1f, true);
                }
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Shield::ActivateAbility - Shield activated (health: %.1f, duration: %.1fs)"),
                ShieldHealth, ShieldDuration);
}

void UKhaaosAbility_Shield::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        // Clear timers
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(ShieldDurationHandle);
                Owner->GetWorldTimerManager().ClearTimer(ShieldEnergyDrainHandle);
        }

        // Server: deactivate shield
        ServerDeactivateShield();

        // Client: remove shield VFX
        ClientRemoveShieldVFX();

        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Shield::EndAbility - Shield deactivated"));
}

void UKhaaosAbility_Shield::OnShieldEnergyDrainTick(float DeltaTime)
{
        // Drain energy while shield is active
        if (!HasAuthorityOrPredictionKey(GetCurrentActorInfo(), &GetCurrentActivationInfo()))
        {
                return;
        }

        float EnergyDrain = ShieldEnergyDrainPerSecond * DeltaTime;

        // If energy is depleted, end shield
        // (In full implementation, check actual energy attribute)
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Shield::OnShieldEnergyDrainTick - Draining %.2f energy"), EnergyDrain);
}

void UKhaaosAbility_Shield::ServerActivateShield_Implementation()
{
        bShieldActive = true;
        ShieldHealthRemaining = ShieldHealth;

        // Grant shielded buff tag
        UAbilitySystemComponent* ASC = GetAbilitySystemComponentFromActorInfo();
        if (ASC)
        {
                const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
                // Tag will be applied via gameplay effect in ActivateAbility
        }
}

void UKhaaosAbility_Shield::ServerDeactivateShield_Implementation()
{
        bShieldActive = false;
        ShieldHealthRemaining = 0.0f;
}

void UKhaaosAbility_Shield::OnRep_ShieldHealthRemaining()
{
        // Client replication callback for shield health UI
}

void UKhaaosAbility_Shield::OnRep_bShieldActive()
{
        // Client replication callback for shield active state
}

void UKhaaosAbility_Shield::ClientSpawnShieldVFX_Implementation()
{
        if (!ShieldBarrierVFX.IsNull())
        {
                UNiagaraSystem* NiagaraSys = ShieldBarrierVFX.LoadSynchronous();
                if (NiagaraSys)
                {
                        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
                        if (Character && Character->GetMesh())
                        {
                                UNiagaraFunctionLibrary::SpawnSystemAttached(
                                        NiagaraSys, Character->GetMesh(), FName(TEXT("SpineSocket")),
                                        FVector::ZeroVector, FRotator::ZeroRotator,
                                        EAttachLocation::KeepRelativeOffset, false, true,
                                        ENiagaraEffectPoolPolicy::Auto, true);
                        }
                }
        }
}

void UKhaaosAbility_Shield::ClientRemoveShieldVFX_Implementation()
{
        // Shield VFX will auto-destroy or be cleaned up via VFXManager
        if (auto* VFXMgr = GetWorld()->GetSubsystem<UKhaaosVFXManager>())
        {
                VFXMgr->StopAllVFX(FName(TEXT("ShieldBarrier")), true);
        }
}

void UKhaaosAbility_Shield::ClientShieldBreakVFX_Implementation()
{
        if (!ShieldBreakVFX.IsNull())
        {
                UNiagaraSystem* NiagaraSys = ShieldBreakVFX.LoadSynchronous();
                if (NiagaraSys)
                {
                        AActor* Owner = GetOwningActorFromActorInfo();
                        if (Owner)
                        {
                                UNiagaraFunctionLibrary::SpawnSystemAtLocation(
                                        GetWorld(), NiagaraSys, Owner->GetActorLocation(),
                                        FRotator::ZeroRotator, FVector::OneVector,
                                        true, true, ENiagaraEffectPoolPolicy::Auto, true);
                        }
                }
        }
}

void UKhaaosAbility_Shield::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME(UKhaaosAbility_Shield, ShieldHealthRemaining);
        DOREPLIFETIME(UKhaaosAbility_Shield, bShieldActive);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAbility_Heal
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAbility_Heal::UKhaaosAbility_Heal()
{
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        HealAmount = 50.0f;
        HealDuration = 3.0f;
        HealTickInterval = 0.5f;
        HealEnergyCost = 25.0f;
        EnergyCost = 25.0f;
        HealRemaining = 0.0f;
        HealPerTick = 0.0f;

        bIsToggleAbility = false;
        bCancelOnMovement = true;
        bCancelOnDamage = true;
}

void UKhaaosAbility_Heal::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // Base activation (commit cost, apply effects)
        Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);

        // Calculate heal per tick
        int32 NumTicks = FMath::Max(1, FMath::FloorToInt(HealDuration / HealTickInterval));
        HealPerTick = HealAmount / NumTicks;
        HealRemaining = HealAmount;

        // Client: spawn heal VFX
        ClientSpawnHealVFX();

        // Start heal tick timer
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().SetTimer(HealTickHandle, this,
                        &UKhaaosAbility_Heal::OnHealTickCallback, HealTickInterval, true);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Heal::ActivateAbility - Heal started (total: %.1f, duration: %.1fs, tick: %.1f)"),
                HealAmount, HealDuration, HealPerTick);
}

void UKhaaosAbility_Heal::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        // Clear heal tick timer
        if (AActor* Owner = GetOwningActorFromActorInfo())
        {
                Owner->GetWorldTimerManager().ClearTimer(HealTickHandle);
        }

        // Client: remove heal VFX
        ClientRemoveHealVFX();

        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbility_Heal::EndAbility - Heal ended (remaining: %.1f, cancelled: %s)"),
                HealRemaining, bWasCancelled ? TEXT("true") : TEXT("false"));
}

void UKhaaosAbility_Heal::OnHealTickCallback()
{
        if (!HasAuthorityOrPredictionKey(GetCurrentActorInfo(), &GetCurrentActivationInfo()))
        {
                return;
        }

        // Apply heal tick
        ServerApplyHealTick(HealPerTick);

        HealRemaining -= HealPerTick;
        OnHealTick.Broadcast(HealPerTick, HealRemaining);

        // End if healing is complete
        if (HealRemaining <= 0.0f)
        {
                HealRemaining = 0.0f;
                EndAbility(GetCurrentAbilitySpecHandle(), GetCurrentActorInfo(),
                        GetCurrentActivationInfo(), true, false);
        }
}

void UKhaaosAbility_Heal::ServerApplyHealTick_Implementation(float InHealPerTick)
{
        // Server: apply heal via AttributeSet or GAS gameplay effect
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbility_Heal::ServerApplyHealTick - Healed %.1f"), InHealPerTick);

        // In full implementation:
        // UAbilitySystemComponent* ASC = GetAbilitySystemComponentFromActorInfo();
        // Apply healing gameplay effect or directly modify health attribute
}

void UKhaaosAbility_Heal::OnRep_HealRemaining()
{
        // Client replication callback for heal progress UI
}

void UKhaaosAbility_Heal::ClientSpawnHealVFX_Implementation()
{
        if (!HealParticleVFX.IsNull())
        {
                UNiagaraSystem* NiagaraSys = HealParticleVFX.LoadSynchronous();
                if (NiagaraSys)
                {
                        ACharacter* Character = Cast<ACharacter>(GetOwningActorFromActorInfo());
                        if (Character && Character->GetMesh())
                        {
                                UNiagaraFunctionLibrary::SpawnSystemAttached(
                                        NiagaraSys, Character->GetMesh(), FName(TEXT("SpineSocket")),
                                        FVector::ZeroVector, FRotator::ZeroRotator,
                                        EAttachLocation::KeepRelativeOffset, false, true,
                                        ENiagaraEffectPoolPolicy::Auto, true);
                        }
                }
        }
}

void UKhaaosAbility_Heal::ClientRemoveHealVFX_Implementation()
{
        if (auto* VFXMgr = GetWorld()->GetSubsystem<UKhaaosVFXManager>())
        {
                VFXMgr->StopAllVFX(FName(TEXT("HealParticle")), true);
        }
}

void UKhaaosAbility_Heal::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME(UKhaaosAbility_Heal, HealRemaining);
}
