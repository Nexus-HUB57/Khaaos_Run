/**
 * KhaaosDiscordWebhooks.h
 * Khaaos Run -- Discord Webhook Notification System
 *
 * Sends structured embed notifications to Discord channels for:
 *   - Anti-cheat alerts (player banned, suspicious activity)
 *   - Economy anomaly notifications (large KRC transfers, fraud detection)
 *   - Match results (winner, top 3, kills, world progression)
 *   - Ranked/Tournament events (rank up, bracket advance, tournament start/end)
 *   - CI/CD deploy notifications
 *   - Server status (maintenance, DDoS, region down)
 *
 * Each channel has its own webhook URL and per-channel rate limiting.
 * In production, payloads are POSTed via FHttpModule; in development
 * they are logged for verification without sending.
 *
 * Discord Webhooks API: https://discord.com/developers/docs/resources/webhook
 *
 * ===========================================================================
 *  Khaaos Run - Multi-World Battle Royale - UE5.8 C++ Dedicated Server
 * ===========================================================================
 */

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "Subsystems/EngineSubsystem.h"
#include "Discord/KhaaosDiscordWebhooks.generated.h"

// -- Channel Enum ------------------------------------------------------------

/**
 * EKhaaosWebhookChannel
 * Identifies the Discord channel / webhook endpoint to target.
 * Each channel maps to one webhook URL in the config.
 */
UENUM(BlueprintType)
enum class EKhaaosWebhookChannel : uint8
{
	AntiCheat     UMETA(DisplayName = "Anti-Cheat"),
	Economy       UMETA(DisplayName = "Economy"),
	MatchResults  UMETA(DisplayName = "Match Results"),
	Ranked        UMETA(DisplayName = "Ranked"),
	Deploy        UMETA(DisplayName = "Deploy"),
	ServerStatus  UMETA(DisplayName = "Server Status")
};

// -- Data Structures ---------------------------------------------------------

/**
 * FKhaaosDiscordWebhookConfig
 * Configuration for the webhook subsystem.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordWebhookConfig
{
	GENERATED_BODY()

	/** Map of channel enum to Discord webhook URL. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	TMap<EKhaaosWebhookChannel, FString> WebhookUrls;

	/** Master enable toggle. False suppresses all sends. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	bool bEnabled = true;

	/** Minimum severity level to send (lower = more verbose). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	int32 MinSeverityLevel = 0;

	/** Max webhook sends per channel within the rate-limit window. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	int32 RateLimitPerChannel = 5;

	/** Username override for the webhook bot. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString UsernameOverride = TEXT("Khaaos Run");
};

/**
 * FKhaaosDiscordEmbedField
 * A single name+value field within a Discord embed.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordEmbedField
{
	GENERATED_BODY()

	/** Field title / name. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Title;

	/** Field value. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Value;
};

/**
 * FKhaaosDiscordEmbed
 * A Discord embed object with title, description, color, fields, footer, timestamp.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordEmbed
{
	GENERATED_BODY()

	/** Embed title. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Title;

	/** Embed description (main body text). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Description;

	/** Embed color as a raw RGB integer (e.g. 0xFF0000 for red). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	int32 Color = 0;

	/** Inline fields within the embed. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	TArray<FKhaaosDiscordEmbedField> Fields;

	/** Footer text. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString FooterText;

	/** ISO-8601 timestamp string (set automatically if left empty). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Timestamp;
};

/**
 * FKhaaosDiscordWebhookPayload
 * Full payload for a Discord webhook message.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordWebhookPayload
{
	GENERATED_BODY()

	/** Plain-text content (shown above embeds). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Content;

	/** Embed objects (up to 10 per Discord API). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	TArray<FKhaaosDiscordEmbed> Embeds;

	/** Username override for this message. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString Username;
};

// -- Delegates ---------------------------------------------------------------

/** Broadcast after a webhook send attempt (success or failure). */
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnWebhookSent, EKhaaosWebhookChannel, Channel, bool, bSuccess);

// -- UKhaaosDiscordWebhooks --------------------------------------------------

/**
 * UKhaaosDiscordWebhooks
 *
 * Engine subsystem that manages Discord webhook notifications for Khaaos Run.
 *
 * Lifecycle:
 *   1. InitializeWebhooks(Config) -- load webhook URLs, enable subsystem
 *   2. Send*() convenience methods -- build typed embeds, route to channel
 *   3. SendWebhook() -- rate-limit check, JSON serialize, POST
 *   4. ShutdownWebhooks() -- reset state
 *
 * Rate Limiting:
 *   Each channel tracks a send counter and a reset timestamp.
 *   If more than RateLimitPerChannel sends occur within 60 seconds,
 *   further sends are dropped until the window resets.
 */
UCLASS(BlueprintType, Blueprintable, Category = "Khaaos|Discord")
class KHAAOSRUN_API UKhaaosDiscordWebhooks : public UEngineSubsystem
{
	GENERATED_BODY()

public:

	// -- Lifecycle ------------------------------------------------------------

	/**
	 * Initialize the webhook subsystem with the given configuration.
	 * At least one webhook URL must be present for initialization to succeed.
	 * @param Config  Webhook URLs, rate limits, and feature flags.
	 * @return True if at least one webhook URL was configured and subsystem is ready.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	bool InitializeWebhooks(const FKhaaosDiscordWebhookConfig& Config);

	/** Shut down the webhook subsystem and reset all state. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void ShutdownWebhooks();

	/** Returns true if the subsystem has been initialized. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
	bool IsInitialized() const;

	// -- Core Send ------------------------------------------------------------

	/**
	 * Send a raw webhook payload to the specified channel.
	 * Applies rate limiting per channel before sending.
	 * @param Channel  Target Discord channel.
	 * @param Payload  Message payload (content + embeds + username).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendWebhook(EKhaaosWebhookChannel Channel, const FKhaaosDiscordWebhookPayload& Payload);

	// -- Convenience Senders --------------------------------------------------

	/**
	 * Send an anti-cheat alert (red embed) to the AntiCheat channel.
	 * @param PlayerId  ID of the flagged player.
	 * @param Reason    Ban / detection reason.
	 * @param Details   Additional context.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendAntiCheatAlert(const FString& PlayerId, const FString& Reason, const FString& Details);

	/**
	 * Send an economy anomaly alert (orange embed) to the Economy channel.
	 * @param TransactionType  Type of transaction (e.g. "KRC Transfer", "Forgery").
	 * @param Details          Anomaly details.
	 * @param Amount           Transaction amount.
	 * @param Currency         Currency code (e.g. "KRC").
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendEconomyAlert(const FString& TransactionType, const FString& Details, float Amount, const FString& Currency);

	/**
	 * Send a match result (green embed) to the MatchResults channel.
	 * @param MatchId       Match identifier.
	 * @param WinnerId      Winning player ID.
	 * @param TotalKills    Total kills in the match.
	 * @param WinningWorld  World where the winner prevailed.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendMatchResult(const FString& MatchId, const FString& WinnerId, int32 TotalKills, const FString& WinningWorld);

	/**
	 * Send a ranked update (blue embed) to the Ranked channel.
	 * @param PlayerId  Player whose rank changed.
	 * @param OldELO    Previous ELO value.
	 * @param NewELO    New ELO value.
	 * @param RankName  New rank name.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendRankedUpdate(const FString& PlayerId, int32 OldELO, int32 NewELO, const FString& RankName);

	/**
	 * Send a tournament event (purple embed) to the Ranked channel.
	 * @param TournamentId  Tournament identifier.
	 * @param EventDesc     Event description (start, bracket advance, end, etc.).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendTournamentEvent(const FString& TournamentId, const FString& EventDesc);

	/**
	 * Send a deploy notification (cyan embed) to the Deploy channel.
	 * @param Version  Build version string.
	 * @param Region   Deployment region.
	 * @param bSuccess Whether the deploy succeeded.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendDeployNotification(const FString& Version, const FString& Region, bool bSuccess);

	/**
	 * Send a server status notification to the ServerStatus channel.
	 * Critical = red embed; non-critical = yellow embed.
	 * @param Status    Status label (e.g. "Maintenance", "DDoS", "Region Down").
	 * @param Details   Additional context.
	 * @param bCritical Whether this is a critical alert.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SendServerStatus(const FString& Status, const FString& Details, bool bCritical);

	// -- Channel URL Accessors -------------------------------------------------

	/** Get the configured webhook URL for a channel. Empty if not configured. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
	FString GetChannelUrl(EKhaaosWebhookChannel Channel) const;

	/** Set or update the webhook URL for a channel at runtime. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void SetChannelUrl(EKhaaosWebhookChannel Channel, const FString& Url);

	// -- Delegates ------------------------------------------------------------

	/** Broadcast after each webhook send attempt. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
	FOnWebhookSent OnWebhookSent;

private:

	// -- Internal State -------------------------------------------------------

	/** True after InitializeWebhooks succeeds. */
	bool bInitialized = false;

	/** Active webhook configuration. */
	FKhaaosDiscordWebhookConfig CurrentConfig;

	/** Per-channel send count for rate limiting. */
	UPROPERTY()
	TMap<EKhaaosWebhookChannel, int32> RateLimitCounters;

	/** Per-channel timestamp of the last rate-limit window reset. */
	UPROPERTY()
	TMap<EKhaaosWebhookChannel, FDateTime> RateLimitResetTimes;

	// -- Internal Helpers -----------------------------------------------------

	/**
	 * Check and enforce per-channel rate limiting.
	 * @param Channel  Channel to check.
	 * @return True if the send is allowed; false if rate-limited.
	 */
	bool CheckRateLimit(EKhaaosWebhookChannel Channel);

	/** Build a JSON string from a webhook payload for the HTTP POST body. */
	FString BuildJsonPayload(const FKhaaosDiscordWebhookPayload& Payload) const;

	/** Generate an ISO-8601 timestamp string for the current UTC time. */
	FString GetISO8601Timestamp() const;
};
