// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosAbilityComponent.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

// ─── UKhaaosAbilityComponent ────────────────────────────────────────────────────

UKhaaosAbilityComponent::UKhaaosAbilityComponent()
{
        PrimaryComponentTick.bCanEverTick = false;
        PrimaryComponentTick.bStartWithTickEnabled = false;

        bWantsInitializeComponent = true;
        SetIsReplicatedByDefault(true);
}

bool UKhaaosAbilityComponent::StartAction(AActor* Instigator, const FGameplayTag& ActionTag)
{
        if (!ActionTag.IsValid())
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilityComponent::StartAction - Invalid tag"));
                return false;
        }

        // Check if already active
        if (ActiveAbilities.Contains(ActionTag))
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbilityComponent::StartAction - %s already active"), *ActionTag.ToString());
                return false;
        }

        // Find registered ability class
        TSubclassOf<UKhaaosAbilityAction>* AbilityClass = RegisteredAbilities.Find(ActionTag);
        if (!AbilityClass || !(*AbilityClass))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilityComponent::StartAction - No ability registered for %s"), *ActionTag.ToString());
                return false;
        }

        // Check blocking tags on the ability action
        UKhaaosAbilityAction* AbilityCDO = (*AbilityClass)->GetDefaultObject<UKhaaosAbilityAction>();
        if (AbilityCDO && AbilityCDO->BlockedTags.IsValid())
        {
                if (ReplicatedActiveTags.HasAny(AbilityCDO->BlockedTags))
                {
                        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosAbilityComponent::StartAction - %s blocked by active tags"), *ActionTag.ToString());
                        return false;
                }
        }

        // Create ability instance
        UKhaaosAbilityAction* NewAction = NewObject<UKhaaosAbilityAction>(GetOwner(), *AbilityClass);
        if (!NewAction)
        {
                UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosAbilityComponent::StartAction - Failed to create ability instance for %s"), *ActionTag.ToString());
                return false;
        }

        NewAction->OwningComponent = this;

        // Start the ability
        if (!NewAction->StartAction(Instigator))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilityComponent::StartAction - Ability %s StartAction returned false"), *ActionTag.ToString());
                return false;
        }

        // Register as active
        ActiveAbilities.Add(ActionTag, NewAction);
        NewAction->bIsActive = true;

        // Grant tags
        if (NewAction->GrantedTags.IsValid())
        {
                ReplicatedActiveTags.AppendTags(NewAction->GrantedTags);
        }

        // Broadcast
        OnAbilityStarted.Broadcast(NewAction, Instigator);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityComponent::StartAction - Started %s"), *ActionTag.ToString());
        return true;
}

bool UKhaaosAbilityComponent::StopAction(AActor* Instigator, const FGameplayTag& ActionTag)
{
        if (!ActionTag.IsValid())
        {
                return false;
        }

        UKhaaosAbilityAction** ActiveAction = ActiveAbilities.Find(ActionTag);
        if (!ActiveAction || !(*ActiveAction))
        {
                return false;
        }

        UKhaaosAbilityAction* Action = *ActiveAction;

        // Stop the ability
        Action->StopAction(Instigator);
        Action->bIsActive = false;

        // Remove granted tags
        if (Action->GrantedTags.IsValid())
        {
                ReplicatedActiveTags.RemoveTags(Action->GrantedTags);
        }

        // Remove from active map
        ActiveAbilities.Remove(ActionTag);

        // Broadcast
        OnAbilityStopped.Broadcast(Action, Instigator);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityComponent::StopAction - Stopped %s"), *ActionTag.ToString());
        return true;
}

void UKhaaosAbilityComponent::CancelActionsWithTags(const FGameplayTagContainer& CancelTags)
{
        if (!CancelTags.IsValid())
        {
                return;
        }

        // Collect actions to cancel (can't modify map while iterating)
        TArray<FGameplayTag> TagsToCancel;
        for (const auto& Pair : ActiveAbilities)
        {
                if (Pair.Value && Pair.Value->GrantedTags.HasAny(CancelTags))
                {
                        TagsToCancel.Add(Pair.Key);
                }
        }

        // Cancel collected actions
        AActor* Owner = GetOwner();
        for (const FGameplayTag& Tag : TagsToCancel)
        {
                StopAction(Owner, Tag);
        }
}

void UKhaaosAbilityComponent::CancelAllActions()
{
        AActor* Owner = GetOwner();

        // Collect all active tags
        TArray<FGameplayTag> TagsToCancel;
        for (const auto& Pair : ActiveAbilities)
        {
                TagsToCancel.Add(Pair.Key);
        }

        for (const FGameplayTag& Tag : TagsToCancel)
        {
                StopAction(Owner, Tag);
        }
}

bool UKhaaosAbilityComponent::IsActionActive(const FGameplayTag& ActionTag) const
{
        return ActiveAbilities.Contains(ActionTag);
}

FGameplayTagContainer UKhaaosAbilityComponent::GetActiveActionTags() const
{
        FGameplayTagContainer Result;
        for (const auto& Pair : ActiveAbilities)
        {
                Result.AddTag(Pair.Key);
        }
        return Result;
}

bool UKhaaosAbilityComponent::HasAnyBlockingTag(const FGameplayTagContainer& Tags) const
{
        if (!Tags.IsValid())
        {
                return false;
        }
        return ReplicatedActiveTags.HasAny(Tags);
}

void UKhaaosAbilityComponent::RegisterAbility(TSubclassOf<UKhaaosAbilityAction> AbilityClass, const FGameplayTag& ActionTag)
{
        if (!AbilityClass || !ActionTag.IsValid())
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilityComponent::RegisterAbility - Invalid class or tag"));
                return;
        }

        RegisteredAbilities.Add(ActionTag, AbilityClass);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityComponent::RegisterAbility - Registered %s"), *ActionTag.ToString());
}

void UKhaaosAbilityComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME(UKhaaosAbilityComponent, ReplicatedActiveTags);
}

// ─── UKhaaosAbilityAction ───────────────────────────────────────────────────────

UKhaaosAbilityAction::UKhaaosAbilityAction()
{
        bIsEnabled = true;
        bIsActive = false;
        OwningComponent = nullptr;
}

bool UKhaaosAbilityAction::StartAction_Implementation(AActor* Instigator)
{
        if (!bIsEnabled)
        {
                return false;
        }

        bIsActive = true;
        return true;
}

bool UKhaaosAbilityAction::StopAction_Implementation(AActor* Instigator)
{
        bIsActive = false;
        return true;
}
