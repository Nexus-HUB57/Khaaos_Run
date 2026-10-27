// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Spectator System — Broadcast, Discord integration, AI commentator

#include "Game/Ring/KhaaosSpectatorSystem.h"#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonSerializer.h"

void UKhaaosSpectatorSystem::Initialize(FSubsystemCollectionInitializeParams& DeinitParams)
{
    Super::Initialize(DeinitParams);

    // Load Discord webhook URL from config
    GConfig->GetString(TEXT("Khaaos.Spectator"), TEXT("DiscordWebhookUrl"), DiscordWebhookUrl, GGameIni);

    // Check if broadcast is enabled
    int32 Enabled = 1;
    GConfig->GetInt(TEXT("Khaaos.Spectator"), TEXT("BroadcastEnabled"), Enabled, GGameIni);
    bBroadcastEnabled = (Enabled != 0);

    UE_LOG(LogTemp, Log,
        TEXT("SpectatorSystem: Initialized (broadcast=%s, discord=%s)"),
        bBroadcastEnabled ? TEXT("ON") : TEXT("OFF"),
        DiscordWebhookUrl.IsEmpty() ? TEXT("none") : TEXT("configured"));
}

void UKhaaosSpectatorSystem::SetSpectatorCameraMode(ESpectatorCameraMode Mode)
{
    CurrentCameraMode = Mode;

    UE_LOG(LogTemp, Log,
        TEXT("SpectatorSystem: Camera mode changed to %s"),
        *UEnum::GetValueAsString(Mode));
}

void UKhaaosSpectatorSystem::BroadcastRingEvent(ERingEventType Event, const FString& Data)
{
    if (!bBroadcastEnabled) return;

    // ─── Discord Webhook ──────────────────────────────────────────────────────
    if (!DiscordWebhookUrl.IsEmpty())
    {
        BroadcastToDiscord(Event, Data);
    }

    // ─── Internal Event Dispatch ──────────────────────────────────────────────
    // Notify all spectators of the event
    // This would iterate ActiveSpectators and push via replicated state

    UE_LOG(LogTemp, Log,
        TEXT("SpectatorSystem: Broadcasting event %s with data: %s"),
        *UEnum::GetValueAsString(Event), *Data);
}

void UKhaaosSpectatorSystem::BroadcastToDiscord_Implementation(ERingEventType Event, const FString& Data)
{
    if (DiscordWebhookUrl.IsEmpty()) return;

    // Build Discord embed JSON
    FString EventName;
    int32 EmbedColor = 65280; // Green default

    switch (Event)
    {
        case ERingEventType::RING_START:
            EventName = TEXT("Ring Iniciando");
            EmbedColor = 65280; // Green
            break;
        case ERingEventType::RING_SHRINKING:
            EventName = TEXT("Ring Fechando");
            EmbedColor = 16776960; // Yellow
            break;
        case ERingEventType::RING_CLOSED:
            EventName = TEXT("Ring Fechou");
            EmbedColor = 16711680; // Red
            break;
        case ERingEventType::WORLD_TRANSITION:
            EventName = TEXT("Portal Khaaos Ativo");
            EmbedColor = 4915330; // Purple
            break;
        case ERingEventType::FINAL_RING:
            EventName = TEXT("RING FINAL");
            EmbedColor = 16711680; // Red
            break;
    }

    // Construct JSON payload
    FString JsonPayload;
    JsonPayload += TEXT("{\"embeds\":[{\"title\":\"Khaaos Run\",\"description\":\"");
    JsonPayload += EventName;
    JsonPayload += TEXT("\",\"color\":");
    JsonPayload += FString::FromInt(EmbedColor);
    JsonPayload += TEXT(",\"fields\":[{\"name\":\"Evento\",\"value\":\"");
    JsonPayload += Data;
    JsonPayload += TEXT("\",\"inline\":true}]}]}");

    // Send HTTP POST to Discord webhook
    TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(DiscordWebhookUrl);
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(JsonPayload);
    Request->ProcessRequest();
}

void UKhaaosSpectatorSystem::TriggerCommentary(ERingEventType Event)
{
    // AI commentator voice lines based on event type
    FString CommentaryText;

    switch (Event)
    {
        case ERingEventType::RING_SHRINKING:
            CommentaryText = TEXT("O ring esta fechando! Movam-se para a zona segura!");
            break;
        case ERingEventType::RING_CLOSED:
            CommentaryText = TEXT("O ring fechou! Cuidado com a zona de perigo!");
            break;
        case ERingEventType::WORLD_TRANSITION:
            CommentaryText = TEXT("Portal Khaaos ativo! Transfira para o proximo mundo!");
            break;
        case ERingEventType::FINAL_RING:
            CommentaryText = TEXT("Circulo final! Quem sobrevive, vence!");
            break;
        default:
            return;
    }

    UE_LOG(LogTemp, Log, TEXT("Commentator: %s"), *CommentaryText);

    // Play commentary audio via MetaSound
    // UAudioManager* Audio = GetGameInstance()->GetSubsystem<UAudioManager>();
    // Audio->PlayCommentary(CommentaryText);
}

void UKhaaosSpectatorSystem::UpdatePictureInPicture()
{
    // Update PiP viewport for spectators
    // Renders secondary view at reduced resolution in corner of screen
    // This would use SceneCaptureComponent2D
}
