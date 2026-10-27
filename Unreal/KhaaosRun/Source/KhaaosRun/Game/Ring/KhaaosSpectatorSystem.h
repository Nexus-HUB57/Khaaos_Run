#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Ring/KhaaosRingManager.h"
#include "Ring/KhaaosSpectatorSystem.generated.h"

UENUM(BlueprintType)
enum class ESpectatorCameraMode : uint8
{
    FREECAM       UMETA(DisplayName = "Free Camera"),
    FOLLOW_PLAYER UMETA(DisplayName = "Follow Player"),
    OVERHEAD      UMETA(DisplayName = "Overhead"),
    RING_CENTER   UMETA(DisplayName = "Ring Center")
};

UCLASS()
class UKhaaosSpectatorSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionInitializeParams& DeinitParams) override;

    /** Set the spectator camera mode. */
    void SetSpectatorCameraMode(ESpectatorCameraMode Mode);

    /** Broadcast a ring event to Discord/Twitch/YouTube + spectators. */
    void BroadcastRingEvent(ERingEventType Event, const FString& Data);

    /** Trigger AI commentator voice for a ring event. */
    void TriggerCommentary(ERingEventType Event);

    /** Update picture-in-picture viewport for spectators. */
    void UpdatePictureInPicture();

private:
    /** Send event embed to Discord webhook via HTTP POST. */
    UFUNCTION()
    void BroadcastToDiscord_Implementation(ERingEventType Event, const FString& Data);

    UPROPERTY()
    ESpectatorCameraMode CurrentCameraMode = ESpectatorCameraMode::RING_CENTER;

    UPROPERTY()
    int32 SpectatorDelaySeconds = 10;

    UPROPERTY()
    bool bBroadcastEnabled = true;

    UPROPERTY()
    FString DiscordWebhookUrl;
};
