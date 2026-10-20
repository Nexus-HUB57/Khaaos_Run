// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayTagContainer.h"
#include "KhaaosAbilityComponent.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosAbilityAction;

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when an ability action starts. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAbilityStarted, UKhaaosAbilityAction*, Action, AActor*, Instigator);

/** Broadcast when an ability action stops. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAbilityStopped, UKhaaosAbilityAction*, Action, AActor*, Instigator);

/**
 * UKhaaosAbilityComponent
 *
 * Gameplay ability component following ActionRoguelike pattern.
 * Manages ability activation/deactivation via GameplayTags.
 *
 * Design:
 *   - Abilities are UObjects registered by tag
 *   - StartAction/StopAction with tag-based activation
 *   - Blocking tags prevent ability activation (e.g., "Stunned" blocks "Attack")
 *   - CancelActions removes all active abilities matching a tag
 *   - TMap of active abilities for O(1) lookup
 */
UCLASS(Abstract, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosAbilityComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosAbilityComponent();

	// ─── Ability Activation ─────────────────────────────────────────────────

	/**
	 * Start an ability action by tag.
	 * Checks blocking tags — returns false if any blocker is active.
	 * Ported from ActionRoguelike SActionComponent::StartActionByName.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ability")
	bool StartAction(AActor* Instigator, const FGameplayTag& ActionTag);

	/**
	 * Stop an ability action by tag.
	 * Returns false if the action is not active.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ability")
	bool StopAction(AActor* Instigator, const FGameplayTag& ActionTag);

	/**
	 * Cancel all active abilities that have any of the given tags.
	 * Used for stun, death, etc.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ability")
	void CancelActionsWithTags(const FGameplayTagContainer& CancelTags);

	/** Cancel all active abilities. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ability")
	void CancelAllActions();

	// ─── Queries ────────────────────────────────────────────────────────────

	/** Check if an ability with the given tag is currently active. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ability")
	bool IsActionActive(const FGameplayTag& ActionTag) const;

	/** Get all currently active ability tags. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ability")
	FGameplayTagContainer GetActiveActionTags() const;

	/** Check if any active ability has any of the given blocking tags. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Ability")
	bool HasAnyBlockingTag(const FGameplayTagContainer& Tags) const;

	// ─── Registration ───────────────────────────────────────────────────────

	/** Register an ability action class for a given tag. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ability")
	void RegisterAbility(TSubclassOf<UKhaaosAbilityAction> AbilityClass, const FGameplayTag& ActionTag);

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when an ability starts. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability")
	FOnAbilityStarted OnAbilityStarted;

	/** Broadcast when an ability stops. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ability")
	FOnAbilityStopped OnAbilityStopped;

	// ─── Replication ────────────────────────────────────────────────────────

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

	/** Map of registered ability classes by tag. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability")
	TMap<FGameplayTag, TSubclassOf<UKhaaosAbilityAction>> RegisteredAbilities;

	/** Currently active ability instances (tag → instance). */
	UPROPERTY()
	TMap<FGameplayTag, UKhaaosAbilityAction*> ActiveAbilities;

	/** Replicated container of active tags (for client-side queries). */
	UPROPERTY(Replicated)
	FGameplayTagContainer ReplicatedActiveTags;
};

/**
 * UKhaaosAbilityAction
 *
 * Base class for ability actions (ActionRoguelike SAction pattern).
 * Subclass for specific abilities: attack, dash, heal, etc.
 */
UCLASS(Abstract, Blueprintable, EditInlineNew, DefaultToInstanced)
class UKhaaosAbilityAction : public UObject
{
	GENERATED_BODY()

public:
	UKhaaosAbilityAction();

	/** Start this ability (called by ability component). */
	UFUNCTION(BlueprintNativeEvent, Category = "Khaaos|Ability")
	bool StartAction(AActor* Instigator);

	/** Stop this ability (called by ability component). */
	UFUNCTION(BlueprintNativeEvent, Category = "Khaaos|Ability")
	bool StopAction(AActor* Instigator);

	/** The tag that identifies this ability. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability")
	FGameplayTag AbilityTag;

	/** Tags that block this ability from activating. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability")
	FGameplayTagContainer BlockedTags;

	/** Tags granted to the owner while this ability is active. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability")
	FGameplayTagContainer GrantedTags;

	/** Whether this ability can be activated. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ability")
	uint8 bIsEnabled : 1;

	/** Whether this ability is currently active. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ability")
	uint8 bIsActive : 1;

	/** Owning ability component. */
	UPROPERTY()
	TObjectPtr<UKhaaosAbilityComponent> OwningComponent;
};
