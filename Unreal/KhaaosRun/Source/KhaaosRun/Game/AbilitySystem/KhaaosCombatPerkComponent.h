// Khaaos Run - Authoritative operative combat perks
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayEffect.h"
#include "GameplayTagContainer.h"
#include "KhaaosCombatPerkComponent.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosCombatPerkDefinition
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks")
    FName PerkId;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks")
    FGameplayTag PerkTag;

    /** Server-applied GAS effect containing the perk's combat modifiers. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks")
    TSubclassOf<UGameplayEffect> GameplayEffect;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKhaaosPerkLoadoutChanged, const TArray<FName>&, PerkIds);

/** Server-authoritative perk loadout. Perks are authored as GameplayEffects in the operative/derived asset. */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosCombatPerkComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosCombatPerkComponent();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Perks")
    void RequestEquipPerk(FName PerkId);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Perks")
    void RequestRemovePerk(FName PerkId);

    UFUNCTION(BlueprintPure, Category = "Khaaos|Perks")
    const TArray<FName>& GetEquippedPerkIds() const { return EquippedPerkIds; }

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Perks")
    FOnKhaaosPerkLoadoutChanged OnPerkLoadoutChanged;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks", meta=(ClampMin="1", ClampMax="8"))
    int32 MaxEquippedPerks = 3;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks")
    TArray<FKhaaosCombatPerkDefinition> PerkCatalog;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Perks")
    TArray<FName> InitialPerkIds;

protected:
    virtual void BeginPlay() override;

    UPROPERTY(ReplicatedUsing=OnRep_EquippedPerkIds, VisibleInstanceOnly, BlueprintReadOnly, Category="Khaaos|Perks")
    TArray<FName> EquippedPerkIds;

    UFUNCTION()
    void OnRep_EquippedPerkIds();

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

private:
    bool EquipPerkAuthoritative(FName PerkId);
    bool RemovePerkAuthoritative(FName PerkId);
    const FKhaaosCombatPerkDefinition* FindDefinition(FName PerkId) const;

    UPROPERTY(Transient)
    TMap<FName, FActiveGameplayEffectHandle> ActivePerkEffects;
};
