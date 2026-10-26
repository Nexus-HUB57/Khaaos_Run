// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosReviveSystem.generated.h"

UENUM(BlueprintType)
enum class EKhaaosReviveState : uint8
{
    Alive       UMETA(DisplayName = "ALIVE"),
    Downed      UMETA(DisplayName = "DOWNED"),
    Revivable   UMETA(DisplayName = "REVIVABLE"),
    Dead        UMETA(DisplayName = "DEAD")
};

USTRUCT(BlueprintType)
struct FKhaaosReviveStation
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    FName StationID;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    FVector Location = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    uint8 bIsActive : 1;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    float CooldownRemaining = 0.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlayerDowned, const FString&, PlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlayerRevived, const FString&, PlayerId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnReviveStationUsed, FName, StationID);

// ─── Replicated Player-Revive Pair (TMap cannot replicate directly) ─────────────

USTRUCT(BlueprintType)
struct FKhaaosPlayerRevivePair
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    FString PlayerId;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    EKhaaosReviveState State = EKhaaosReviveState::Alive;
};

UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosReviveSystemComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosReviveSystemComponent();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Revive")
    void DownPlayer(const FString& PlayerId);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Revive")
    void RevivePlayer(const FString& PlayerId, const FString& ReviverId);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Revive")
    void KillDownedPlayer(const FString& PlayerId);

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Revive")
    bool UseReviveStation(FName StationID, const FString& RequestingPlayerId, const FString& TargetPlayerId);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Revive")
    EKhaaosReviveState GetReviveState(const FString& PlayerId) const;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Revive")
    float DownedTimeLimit = 60.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Revive")
    float ReviveInteractionTime = 5.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Revive")
    float ReviveStationCooldown = 120.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Revive")
    float ReviveStationRadius = 300.0f;

    UPROPERTY(Replicated, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    TArray<FKhaaosReviveStation> ReviveStations;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Revive")
    FOnPlayerDowned OnPlayerDowned;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Revive")
    FOnPlayerRevived OnPlayerRevived;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Revive")
    FOnReviveStationUsed OnReviveStationUsed;

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

    /** Replicated array mirroring PlayerReviveStates (TMap can't replicate directly). */
    UPROPERTY(ReplicatedUsing = OnRep_PlayerReviveStates, VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Revive")
    TArray<FKhaaosPlayerRevivePair> ReplicatedPlayerStates;

    /** Client-side callback: rebuild PlayerReviveStates from replicated array. */
    UFUNCTION()
    void OnRep_PlayerReviveStates();

    /** Server-side: sync ReplicatedPlayerStates from PlayerReviveStates map. */
    void SyncReplicatedPlayerStates();

    TMap<FString, EKhaaosReviveState> PlayerReviveStates;

    TMap<FString, float> DownedTimers;
};
