// Khaaos Run — CIGKV player controller
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "KhaaosPlayerController.generated.h"

/** Owning-client choice RPC for the CIGKV entry sequence. */
UCLASS(Blueprintable)
class KHAAOSRUN_API AKhaaosPlayerController : public APlayerController
{
    GENERATED_BODY()

public:
    /** Button index: 0 is the protective option; 1 is the unsafe option. */
    UFUNCTION(Server, Reliable, BlueprintCallable, Category = "Khaaos|CIGKV|Zu")
    void ServerSubmitZuChoice(uint8 ChoiceIndex);

    /** Blueprint hook to sequence the selected entry's camera, audio, and world effects. */
    UFUNCTION(BlueprintImplementableEvent, Category = "Khaaos|CIGKV|Zu")
    void PlayZuEntryCinematic(uint8 VariantIndex, float Duration);

    /** Deliver the server-selected entry and display copy to the owning client. */
    UFUNCTION(Client, Reliable)
    void ClientBeginZuEntry(uint8 VariantIndex, FText Prompt, FText OptionA, FText OptionB, float CinematicDuration, float ResponseTimeout);

    /** Hide the local prompt after resolution. */
    UFUNCTION(Client, Reliable)
    void ClientEndZuEntry();
};
