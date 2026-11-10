// Khaaos Run — server-side bridge from GameMode to the train handover kernel.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/MatchFlow/KhaaosTrainHandover.h"
#include "KhaaosTrainIngressCoordinator.generated.h"

/**
 * Owns one handover controller per ingress id and connects the pure kernel to
 * real PIE/server player actors. The GameMode remains the authority that starts
 * a world transition; this component owns the asynchronous 3.4s deadline.
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosTrainIngressCoordinator : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosTrainIngressCoordinator();

    /** Reserve a destination and start the server-authoritative train ingress. */
    UFUNCTION(BlueprintCallable, Category="Khaaos|TrainIngress")
    FString BeginIngress(
        const FString& PlayerId,
        const FString& MatchId,
        const FVector& SpawnLocation,
        const FRotator& SpawnRotation);

    /** Client visual-ready/deadline entry point; safe to call more than once. */
    UFUNCTION(BlueprintCallable, Category="Khaaos|TrainIngress")
    bool CompleteIngress(const FString& IngressId, const FString& Reason);

    /** Debug/PIE helper that deliberately exercises duplicate callbacks. */
    UFUNCTION(Exec, Category="Khaaos|TrainIngress")
    void DebugCompleteIngressTwice(const FString& IngressId);

    virtual void TickComponent(
        float DeltaTime,
        ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

private:
    struct FRuntimeIngress
    {
        TSharedPtr<KhaaosTrainHandover::FController> Controller;
        FString PlayerId;
        double HandoverAtServerSeconds = 0.0;
    };

    class FEffects;

    FString MakePlayerKey(const FString& PlayerId) const;
    FString FindPlayerId(APlayerState* PlayerState) const;
    APlayerController* FindController(const FString& PlayerId) const;
    bool SetGameplayLocked(const FString& PlayerId, bool bLocked) const;
    void Emit(const FString& Name, const FString& IngressId, const FString& Reason) const;

    TSharedPtr<FEffects> Effects;
    TMap<FString, FRuntimeIngress> ActiveIngresses;
    int32 Sequence = 0;
};
