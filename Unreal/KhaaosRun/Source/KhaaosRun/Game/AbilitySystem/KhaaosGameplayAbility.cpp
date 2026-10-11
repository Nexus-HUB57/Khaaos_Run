// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"
#include "GameplayEffect.h"

// ─── UKhaaosGameplayAbility ────────────────────────────────────────────────────

UKhaaosGameplayAbility::UKhaaosGameplayAbility()
{
        // Instancing: one ability instance per actor (required for stateful abilities)
        InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;

        // Net execution: server initiates, client receives replication
        NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;

        // Default behavior
        CooldownDuration = 0.0f;
        EnergyCost = 0.0f;
        CreditCost = 0;
        bIsToggleAbility = false;
        bCancelOnMovement = false;
        bCancelOnDamage = false;
        bCooldownCommitted = false;
}

bool UKhaaosGameplayAbility::CanActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayTagContainer* SourceTags,
        const FGameplayTagContainer* TargetTags,
        OUT FGameplayTagContainer* OptionalRelevantTags) const
{
        // Base class check (authority, not on cooldown, etc.)
        if (!Super::CanActivateAbility(Handle, ActorInfo, SourceTags, TargetTags, OptionalRelevantTags))
        {
                return false;
        }

        if (!ActorInfo || !ActorInfo->AbilitySystemComponent.IsValid())
        {
                return false;
        }

        UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();

        // ─── Blocked Tags Check ────────────────────────────────────────────────
        // If ANY blocked tag is present on the ASC, activation is denied.
        if (BlockedTags.IsValid() && ASC->HasAnyTags(BlockedTags))
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosGameplayAbility::CanActivateAbility - Blocked by tags for %s"), *GetName());
                return false;
        }

        // ─── Required Tags Check ──────────────────────────────────────────────
        // ALL required tags must be present for activation.
        if (RequiredTags.IsValid() && !ASC->HasAllTags(RequiredTags))
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosGameplayAbility::CanActivateAbility - Missing required tags for %s"), *GetName());
                return false;
        }

        return true;
}

void UKhaaosGameplayAbility::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData)
{
        // ─── Commit Cost & Cooldown ────────────────────────────────────────────
        if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosGameplayAbility::ActivateAbility - Commit failed for %s"), *GetName());
                EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
                return;
        }

        bCooldownCommitted = true;

        // ─── Apply Gameplay Effects ─────────────────────────────────────────────
        if (ActorInfo && ActorInfo->AbilitySystemComponent.IsValid())
        {
                UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();

                // Apply cooldown effect if specified
                if (CooldownGameplayEffectClass && CooldownDuration > 0.0f)
                {
                        FGameplayEffectSpecHandle CooldownSpec = ASC->MakeOutgoingSpec(
                                CooldownGameplayEffectClass, GetAbilityLevel(), ASC->MakeEffectContext());
                        if (CooldownSpec.IsValid())
                        {
                                CooldownSpec.Data.Get()->SetDuration(CooldownDuration, false);
                                FActiveGameplayEffectHandle ActiveHandle = ASC->ApplyGameplayEffectSpecToSelf(*CooldownSpec.Data.Get());
                                ActiveEffectHandles.Add(ActiveHandle);
                        }
                }

                // Apply cost effect if specified
                if (CostGameplayEffectClass)
                {
                        FGameplayEffectSpecHandle CostSpec = ASC->MakeOutgoingSpec(
                                CostGameplayEffectClass, GetAbilityLevel(), ASC->MakeEffectContext());
                        if (CostSpec.IsValid())
                        {
                                FActiveGameplayEffectHandle ActiveHandle = ASC->ApplyGameplayEffectSpecToSelf(*CostSpec.Data.Get());
                                ActiveEffectHandles.Add(ActiveHandle);
                        }
                }
        }

        // ─── Broadcast Activation ──────────────────────────────────────────────
        FGameplayTagContainer ActivatedTags;
        if (GetAssetTags().IsValid())
        {
                ActivatedTags = GetAssetTags();
        }
        OnAbilityActivated.Broadcast(this, ActivatedTags);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameplayAbility::ActivateAbility - %s activated"), *GetName());
}

void UKhaaosGameplayAbility::EndAbility(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        bool bReplicateEndAbility, bool bWasCancelled)
{
        // ─── Remove Active Gameplay Effects ────────────────────────────────────
        if (ActorInfo && ActorInfo->AbilitySystemComponent.IsValid())
        {
                UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
                for (const FActiveGameplayEffectHandle& EffectHandle : ActiveEffectHandles)
                {
                        ASC->RemoveActiveGameplayEffect(EffectHandle);
                }
        }
        ActiveEffectHandles.Empty();

        // ─── Broadcast End ─────────────────────────────────────────────────────
        OnAbilityEnded.Broadcast(this, bWasCancelled);

        bCooldownCommitted = false;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosGameplayAbility::EndAbility - %s ended (cancelled: %s)"),
                *GetName(), bWasCancelled ? TEXT("true") : TEXT("false"));

        // ─── Call Super ────────────────────────────────────────────────────────
        Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}

void UKhaaosGameplayAbility::ApplyCost(const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo) const
{
        // ─── Server Authority: Custom cost application ─────────────────────────
        if (!HasAuthorityOrPredictionKey(ActorInfo, &ActivationInfo))
        {
                return;
        }

        if (!ActorInfo || !ActorInfo->AbilitySystemComponent.IsValid())
        {
                return;
        }

        UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();

        // Apply cost gameplay effect if specified
        if (CostGameplayEffectClass)
        {
                FGameplayEffectSpecHandle CostSpec = ASC->MakeOutgoingSpec(
                        CostGameplayEffectClass, GetAbilityLevel(), ASC->MakeEffectContext());
                if (CostSpec.IsValid())
                {
                        ASC->ApplyGameplayEffectSpecToSelf(*CostSpec.Data.Get());
                }
        }

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosGameplayAbility::ApplyCost - Applied cost for %s (Energy: %.1f, Credits: %d)"),
                *GetName(), EnergyCost, CreditCost);
}
