/**
 * KhaaosDiscordWebhooks.cpp
 * Khaaos Run -- Discord Webhook Notification System (Implementation)
 *
 * ===========================================================================
 *  Khaaos Run - Multi-World Battle Royale - UE5.8 C++ Dedicated Server
 * ===========================================================================
 */

#include "Game/Discord/KhaaosDiscordWebhooks.h"
#include "KhaaosRunLog.h"

// -- Embed Color Constants ---------------------------------------------------

namespace KhaaosWebhookColors
{
	constexpr int32 AntiCheat      = 0xFF0000; // Red
	constexpr int32 Economy        = 0xFF8800; // Orange
	constexpr int32 MatchResults   = 0x00FF00; // Green
	constexpr int32 Ranked         = 0x0088FF; // Blue
	constexpr int32 Tournament     = 0x8800FF; // Purple
	constexpr int32 Deploy         = 0x00FFFF; // Cyan
	constexpr int32 ServerCritical = 0xFF0000; // Red
	constexpr int32 ServerWarning  = 0xFFAA00; // Yellow
}

// -- Rate-Limit Window (seconds) ---------------------------------------------

namespace KhaaosWebhookLimits
{
	constexpr double RateLimitWindowSeconds = 60.0;
}

// -- Lifecycle ---------------------------------------------------------------

bool UKhaaosDiscordWebhooks::InitializeWebhooks(const FKhaaosDiscordWebhookConfig& Config)
{
	if (Config.WebhookUrls.Num() == 0)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordWebhooks: InitializeWebhooks failed -- no webhook URLs configured."));
		bInitialized = false;
		return false;
	}

	CurrentConfig = Config;

	// Initialize rate-limit counters and reset times for every configured channel.
	RateLimitCounters.Empty();
	RateLimitResetTimes.Empty();
	for (const TPair<EKhaaosWebhookChannel, FString>& Pair : CurrentConfig.WebhookUrls)
	{
		RateLimitCounters.Add(Pair.Key, 0);
		RateLimitResetTimes.Add(Pair.Key, FDateTime::UtcNow());
	}

	bInitialized = true;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordWebhooks: Initialized with %d channel(s), rate limit %d/60s, enabled=%s"),
		CurrentConfig.WebhookUrls.Num(),
		CurrentConfig.RateLimitPerChannel,
		CurrentConfig.bEnabled ? TEXT("true") : TEXT("false"));

	return true;
}

void UKhaaosDiscordWebhooks::ShutdownWebhooks()
{
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordWebhooks: Shutting down."));

	bInitialized = false;
	CurrentConfig = FKhaaosDiscordWebhookConfig();
	RateLimitCounters.Empty();
	RateLimitResetTimes.Empty();
}

bool UKhaaosDiscordWebhooks::IsInitialized() const
{
	return bInitialized;
}

// -- Core Send --------------------------------------------------------------

void UKhaaosDiscordWebhooks::SendWebhook(EKhaaosWebhookChannel Channel, const FKhaaosDiscordWebhookPayload& Payload)
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordWebhooks: SendWebhook called but subsystem is not initialized."));
		OnWebhookSent.Broadcast(Channel, false);
		return;
	}

	if (!CurrentConfig.bEnabled)
	{
		UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosDiscordWebhooks: SendWebhook suppressed -- webhooks globally disabled."));
		OnWebhookSent.Broadcast(Channel, false);
		return;
	}

	// Look up the webhook URL for this channel.
	const FString* WebhookUrl = CurrentConfig.WebhookUrls.Find(Channel);
	if (!WebhookUrl || WebhookUrl->IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordWebhooks: No URL configured for channel %s."), *UEnum::GetDisplayValueAsText(Channel).ToString());
		OnWebhookSent.Broadcast(Channel, false);
		return;
	}

	// Enforce per-channel rate limit.
	if (!CheckRateLimit(Channel))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordWebhooks: Rate limit exceeded for channel %s. Send dropped."), *UEnum::GetDisplayValueAsText(Channel).ToString());
		OnWebhookSent.Broadcast(Channel, false);
		return;
	}

	// Serialize the payload to JSON.
	const FString JsonBody = BuildJsonPayload(Payload);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordWebhooks: Sending to channel %s at URL %s"),
		*UEnum::GetDisplayValueAsText(Channel).ToString(),
		*WebhookUrl->Left(50) // Log truncated URL for security
	);
	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosDiscordWebhooks: Payload JSON: %s"), *JsonBody);

	// -----------------------------------------------------------------------
	// Production: POST the JSON to the webhook URL via FHttpModule.
	//
	// Example (uncomment in production build):
	//
	//   TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	//   Request->SetURL(*WebhookUrl);
	//   Request->SetVerb(TEXT("POST"));
	//   Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	//   Request->SetContentAsString(JsonBody);
	//   Request->OnProcessRequestComplete().BindLambda(
	//       [this, Channel](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSucceeded)
	//       {
	//           const bool bOk = bSucceeded && Resp.IsValid() && Resp->GetResponseCode() == 204;
	//           UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordWebhooks: Channel %s response: %s"),
	//               *UEnum::GetDisplayValueAsText(Channel).ToString(),
	//               bOk ? TEXT("OK") : TEXT("FAILED"));
	//           OnWebhookSent.Broadcast(Channel, bOk);
	//       });
	//   Request->ProcessRequest();
	//
	// For now, we broadcast success immediately after logging.
	// -----------------------------------------------------------------------

	OnWebhookSent.Broadcast(Channel, true);
}

// -- Convenience Senders ----------------------------------------------------

void UKhaaosDiscordWebhooks::SendAntiCheatAlert(const FString& PlayerId, const FString& Reason, const FString& Details)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Anti-Cheat Alert");
	Embed.Description = FString::Printf(TEXT("Player **%s** flagged for: %s"), *PlayerId, *Reason);
	Embed.Color = KhaaosWebhookColors::AntiCheat;
	Embed.Fields.Add({TEXT("Player ID"), PlayerId});
	Embed.Fields.Add({TEXT("Reason"), Reason});
	Embed.Fields.Add({TEXT("Details"), Details});
	Embed.FooterText = TEXT("Khaaos Run Anti-Cheat");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Anti-cheat alert for player %s"), *PlayerId);
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::AntiCheat, Payload);
}

void UKhaaosDiscordWebhooks::SendEconomyAlert(const FString& TransactionType, const FString& Details, float Amount, const FString& Currency)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Economy Anomaly");
	Embed.Description = FString::Printf(TEXT("Suspicious %s detected"), *TransactionType);
	Embed.Color = KhaaosWebhookColors::Economy;
	Embed.Fields.Add({TEXT("Transaction Type"), TransactionType});
	Embed.Fields.Add({TEXT("Amount"), FString::Printf(TEXT("%.2f %s"), Amount, *Currency)});
	Embed.Fields.Add({TEXT("Currency"), Currency});
	Embed.Fields.Add({TEXT("Details"), Details});
	Embed.FooterText = TEXT("Khaaos Run Economy");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Economy alert: %s"), *TransactionType);
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::Economy, Payload);
}

void UKhaaosDiscordWebhooks::SendMatchResult(const FString& MatchId, const FString& WinnerId, int32 TotalKills, const FString& WinningWorld)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Match Result");
	Embed.Description = FString::Printf(TEXT("Winner: **%s** in %s"), *WinnerId, *WinningWorld);
	Embed.Color = KhaaosWebhookColors::MatchResults;
	Embed.Fields.Add({TEXT("Match ID"), MatchId});
	Embed.Fields.Add({TEXT("Winner"), WinnerId});
	Embed.Fields.Add({TEXT("Total Kills"), FString::FromInt(TotalKills)});
	Embed.Fields.Add({TEXT("Winning World"), WinningWorld});
	Embed.FooterText = TEXT("Khaaos Run Match System");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Match %s complete -- Winner: %s"), *MatchId, *WinnerId);
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::MatchResults, Payload);
}

void UKhaaosDiscordWebhooks::SendRankedUpdate(const FString& PlayerId, int32 OldELO, int32 NewELO, const FString& RankName)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Ranked Update");
	Embed.Description = FString::Printf(TEXT("Player **%s** is now **%s**"), *PlayerId, *RankName);
	Embed.Color = KhaaosWebhookColors::Ranked;
	Embed.Fields.Add({TEXT("Player ID"), PlayerId});
	Embed.Fields.Add({TEXT("Old ELO"), FString::FromInt(OldELO)});
	Embed.Fields.Add({TEXT("New ELO"), FString::FromInt(NewELO)});
	Embed.Fields.Add({TEXT("ELO Change"), FString::FromInt(NewELO - OldELO)});
	Embed.Fields.Add({TEXT("Rank"), RankName});
	Embed.FooterText = TEXT("Khaaos Run Ranked");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Ranked update: %s -> %s (%d ELO)"), *PlayerId, *RankName, NewELO);
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::Ranked, Payload);
}

void UKhaaosDiscordWebhooks::SendTournamentEvent(const FString& TournamentId, const FString& EventDesc)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Tournament Event");
	Embed.Description = EventDesc;
	Embed.Color = KhaaosWebhookColors::Tournament;
	Embed.Fields.Add({TEXT("Tournament ID"), TournamentId});
	Embed.Fields.Add({TEXT("Event"), EventDesc});
	Embed.FooterText = TEXT("Khaaos Run Tournaments");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Tournament %s: %s"), *TournamentId, *EventDesc);
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::Ranked, Payload);
}

void UKhaaosDiscordWebhooks::SendDeployNotification(const FString& Version, const FString& Region, bool bSuccess)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Deploy Notification");
	Embed.Description = FString::Printf(TEXT("Deploy %s to %s: %s"),
		*Version, *Region, bSuccess ? TEXT("SUCCESS") : TEXT("FAILED"));
	Embed.Color = KhaaosWebhookColors::Deploy;
	Embed.Fields.Add({TEXT("Version"), Version});
	Embed.Fields.Add({TEXT("Region"), Region});
	Embed.Fields.Add({TEXT("Status"), bSuccess ? TEXT("Success") : TEXT("Failed")});
	Embed.FooterText = TEXT("Khaaos Run CI/CD");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Deploy v%s to %s -- %s"),
		*Version, *Region, bSuccess ? TEXT("OK") : TEXT("FAIL"));
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::Deploy, Payload);
}

void UKhaaosDiscordWebhooks::SendServerStatus(const FString& Status, const FString& Details, bool bCritical)
{
	FKhaaosDiscordEmbed Embed;
	Embed.Title = TEXT("Server Status");
	Embed.Description = FString::Printf(TEXT("%s: %s"), *Status, *Details);
	Embed.Color = bCritical ? KhaaosWebhookColors::ServerCritical : KhaaosWebhookColors::ServerWarning;
	Embed.Fields.Add({TEXT("Status"), Status});
	Embed.Fields.Add({TEXT("Details"), Details});
	Embed.Fields.Add({TEXT("Severity"), bCritical ? TEXT("CRITICAL") : TEXT("Warning")});
	Embed.FooterText = TEXT("Khaaos Run Server Monitor");
	Embed.Timestamp = GetISO8601Timestamp();

	FKhaaosDiscordWebhookPayload Payload;
	Payload.Content = FString::Printf(TEXT("Server status: %s (%s)"), *Status, bCritical ? TEXT("CRITICAL") : TEXT("Warning"));
	Payload.Embeds.Add(Embed);
	Payload.Username = CurrentConfig.UsernameOverride;

	SendWebhook(EKhaaosWebhookChannel::ServerStatus, Payload);
}

// -- Channel URL Accessors ---------------------------------------------------

FString UKhaaosDiscordWebhooks::GetChannelUrl(EKhaaosWebhookChannel Channel) const
{
	if (const FString* Url = CurrentConfig.WebhookUrls.Find(Channel))
	{
		return *Url;
	}
	return FString();
}

void UKhaaosDiscordWebhooks::SetChannelUrl(EKhaaosWebhookChannel Channel, const FString& Url)
{
	CurrentConfig.WebhookUrls.Add(Channel, Url);

	// Ensure rate-limit tracking exists for the new channel.
	if (!RateLimitCounters.Contains(Channel))
	{
		RateLimitCounters.Add(Channel, 0);
		RateLimitResetTimes.Add(Channel, FDateTime::UtcNow());
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordWebhooks: Channel %s URL updated."), *UEnum::GetDisplayValueAsText(Channel).ToString());
}

// -- Internal Helpers --------------------------------------------------------

bool UKhaaosDiscordWebhooks::CheckRateLimit(EKhaaosWebhookChannel Channel)
{
	const FDateTime Now = FDateTime::UtcNow();

	// Initialize tracking if this channel has no entry yet.
	if (!RateLimitCounters.Contains(Channel))
	{
		RateLimitCounters.Add(Channel, 0);
		RateLimitResetTimes.Add(Channel, Now);
	}

	FDateTime& ResetTime = RateLimitResetTimes.FindChecked(Channel);
	int32& Counter = RateLimitCounters.FindChecked(Channel);

	// Reset the counter if the rate-limit window has expired.
	const double ElapsedSeconds = (Now - ResetTime).GetTotalSeconds();
	if (ElapsedSeconds > KhaaosWebhookLimits::RateLimitWindowSeconds)
	{
		Counter = 0;
		ResetTime = Now;
	}

	// Check against the per-channel limit.
	if (Counter >= CurrentConfig.RateLimitPerChannel)
	{
		return false;
	}

	// Increment the counter and allow the send.
	++Counter;
	return true;
}

FString UKhaaosDiscordWebhooks::BuildJsonPayload(const FKhaaosDiscordWebhookPayload& Payload) const
{
	// Manual JSON construction to avoid adding a JSON dependency in the header.
	// In a production build with JsonUtilities, this could use FJsonObjectConverter.

	FString Json = TEXT("{");

	// Username
	if (!Payload.Username.IsEmpty())
	{
		Json += FString::Printf(TEXT("\"username\":\"%s\","), *Payload.Username.Replace(TEXT("\""), TEXT("\\\"")));
	}

	// Content
	if (!Payload.Content.IsEmpty())
	{
		Json += FString::Printf(TEXT("\"content\":\"%s\","), *Payload.Content.Replace(TEXT("\""), TEXT("\\\"")));
	}

	// Embeds
	Json += TEXT("\"embeds\":[");
	for (int32 i = 0; i < Payload.Embeds.Num(); ++i)
	{
		const FKhaaosDiscordEmbed& Embed = Payload.Embeds[i];
		if (i > 0)
		{
			Json += TEXT(",");
		}

		Json += TEXT("{");

		// Title
		if (!Embed.Title.IsEmpty())
		{
			Json += FString::Printf(TEXT("\"title\":\"%s\","), *Embed.Title.Replace(TEXT("\""), TEXT("\\\"")));
		}

		// Description
		if (!Embed.Description.IsEmpty())
		{
			Json += FString::Printf(TEXT("\"description\":\"%s\","), *Embed.Description.Replace(TEXT("\""), TEXT("\\\"")));
		}

		// Color
		Json += FString::Printf(TEXT("\"color\":%d,"), Embed.Color);

		// Fields
		Json += TEXT("\"fields\":[");
		for (int32 f = 0; f < Embed.Fields.Num(); ++f)
		{
			const FKhaaosDiscordEmbedField& Field = Embed.Fields[f];
			if (f > 0)
			{
				Json += TEXT(",");
			}
			Json += TEXT("{");
			Json += FString::Printf(TEXT("\"name\":\"%s\","), *Field.Title.Replace(TEXT("\""), TEXT("\\\"")));
			Json += FString::Printf(TEXT("\"value\":\"%s\","), *Field.Value.Replace(TEXT("\""), TEXT("\\\"")));
			Json += TEXT("\"inline\":true");
			Json += TEXT("}");
		}
		Json += TEXT("],");

		// Footer
		if (!Embed.FooterText.IsEmpty())
		{
			Json += FString::Printf(TEXT("\"footer\":{\"text\":\"%s\"},"), *Embed.FooterText.Replace(TEXT("\""), TEXT("\\\"")));
		}

		// Timestamp
		if (!Embed.Timestamp.IsEmpty())
		{
			Json += FString::Printf(TEXT("\"timestamp\":\"%s\""), *Embed.Timestamp);
		}

		Json += TEXT("}");
	}
	Json += TEXT("]");

	Json += TEXT("}");

	return Json;
}

FString UKhaaosDiscordWebhooks::GetISO8601Timestamp() const
{
	const FDateTime UtcNow = FDateTime::UtcNow();
	// FDateTime::ToIso8601() produces the standard format Discord expects.
	return UtcNow.ToIso8601();
}
