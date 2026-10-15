// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Data/KhaaosWeaponDataAsset.h"
#include "KhaaosKillFeedComponent.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosKillFeedEntry
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    FString VictimName;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    FString EliminatorName;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    FString Cause;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    FName WeaponID;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    uint8 bIsHeadshot : 1;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    float DistanceM = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    float Timestamp = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    EKhaaosRarity WeaponRarity = EKhaaosRarity::Comum;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKillFeedUpdated, const FKhaaosKillFeedEntry&, NewEntry);

UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosKillFeedComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosKillFeedComponent();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|KillFeed")
    void AddKillEntry(const FKhaaosKillFeedEntry& Entry);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|KillFeed")
    const TArray<FKhaaosKillFeedEntry>& GetRecentKills() const { return RecentKills; }

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    int32 MaxEntries = 20;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    float EntryLifetimeSeconds = 15.0f;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|KillFeed")
    FOnKillFeedUpdated OnKillFeedUpdated;

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|KillFeed")
    TArray<FKhaaosKillFeedEntry> RecentKills;
};
