// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Discord/KhaaosDiscordOAuth2.h"
#include "KhaaosRun.h"

// --- InitializeOAuth2 ---------------------------------------------------------

bool UKhaaosDiscordOAuth2::InitializeOAuth2(const FKhaaosDiscordOAuth2Config& Config)
{
	if (bInitialized)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordOAuth2::InitializeOAuth2 - Already initialized"));
		return true;
	}

	// Validate required configuration
	if (Config.ClientId.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::InitializeOAuth2 - ClientId is empty, cannot initialize"));
		return false;
	}

	if (Config.RedirectUri.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordOAuth2::InitializeOAuth2 - RedirectUri is empty, auth flow will fail"));
	}

	if (Config.GuildId == 0)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordOAuth2::InitializeOAuth2 - GuildId is 0, role checks will fail"));
	}

	if (Config.BetaRoleId == 0)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordOAuth2::InitializeOAuth2 - BetaRoleId is 0, role checks will fail"));
	}

	CurrentConfig = Config;
	bInitialized = true;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::InitializeOAuth2 - Initialized with ClientId: %s, GuildId: %lld, BetaRoleId: %lld, RequireBetaRole: %s"),
		*CurrentConfig.ClientId,
		CurrentConfig.GuildId,
		CurrentConfig.BetaRoleId,
		CurrentConfig.bRequireBetaRole ? TEXT("true") : TEXT("false"));

	return true;
}

// --- ShutdownOAuth2 ----------------------------------------------------------

void UKhaaosDiscordOAuth2::ShutdownOAuth2()
{
	if (!bInitialized)
	{
		return;
	}

	DiscordLinkMap.Empty();
	AccessToken.Empty();
	RefreshToken.Empty();
	TokenExpiryTime = 0;
	bInitialized = false;

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::ShutdownOAuth2 - OAuth2 subsystem shut down"));
}

// --- IsInitialized -----------------------------------------------------------

bool UKhaaosDiscordOAuth2::IsInitialized() const
{
	return bInitialized;
}

// --- StartAuthFlow -----------------------------------------------------------

void UKhaaosDiscordOAuth2::StartAuthFlow()
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::StartAuthFlow - Not initialized"));
		return;
	}

	// Construct the Discord OAuth2 authorize URL
	// Scope: identify (user info), guilds (server list), guilds.members.read (role info)
	const FString AuthorizeUrl = FString::Printf(
		TEXT("https://discord.com/api/oauth2/authorize?client_id=%s&redirect_uri=%s&response_type=code&scope=identify+guilds+guilds.members.read"),
		*CurrentConfig.ClientId,
		*CurrentConfig.RedirectUri
	);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::StartAuthFlow - Opening Discord OAuth2 URL: %s"), *AuthorizeUrl);

	// In production, this would open the URL in the player's browser:
	//   FPlatformProcess::LaunchURL(TCHAR_TO_UTF8(*AuthorizeUrl), nullptr, nullptr);
	//
	// On a dedicated server, this is a no-op; the client handles the browser
	// redirect and sends the authorization code back via a game RPC.
}

// --- CompleteAuthFlow --------------------------------------------------------

bool UKhaaosDiscordOAuth2::CompleteAuthFlow(const FString& AuthorizationCode)
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::CompleteAuthFlow - Not initialized"));
		return false;
	}

	if (AuthorizationCode.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::CompleteAuthFlow - Authorization code is empty"));
		OnDiscordAuthComplete.Broadcast(false, FString());
		return false;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::CompleteAuthFlow - Exchanging authorization code for token"));

	// In production, this would POST to https://discord.com/api/oauth2/token:
	//   POST /oauth2/token
	//   Content-Type: application/x-www-form-urlencoded
	//
	//   client_id=<ClientId>
	//   client_secret=<ClientSecret>
	//   grant_type=authorization_code
	//   code=<AuthorizationCode>
	//   redirect_uri=<RedirectUri>
	//
	// Response JSON:
	//   {
	//     "access_token": "...",
	//     "token_type": "Bearer",
	//     "expires_in": 604800,
	//     "refresh_token": "...",
	//     "scope": "identify guilds guilds.members.read"
	//   }
	//
	// Then with the access token, call:
	//   GET /users/@me  (with Authorization: Bearer <access_token>)
	// to retrieve the Discord user ID and username.

	// Placeholder: create a pending link entry for the authenticated user.
	// The real implementation would parse the token response and user info.
	const FString PlaceholderDiscordUserId = TEXT("pending_") + AuthorizationCode;

	FKhaaosDiscordLinkInfo NewLink;
	NewLink.DiscordUserId = PlaceholderDiscordUserId;
	NewLink.DiscordUsername = FString();
	NewLink.EOSProductUserId = FString();
	NewLink.LinkState = EKhaaosDiscordLinkState::Pending;
	NewLink.HasBetaRole = false;
	NewLink.LinkedTimestamp = FDateTime::UtcNow().ToIso8601();

	// Store with a temporary key; will be updated when linked to EOS.
	DiscordLinkMap.Add(PlaceholderDiscordUserId, NewLink);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::CompleteAuthFlow - Auth flow completed for Discord user: %s"),
		*PlaceholderDiscordUserId);

	OnDiscordAuthComplete.Broadcast(true, PlaceholderDiscordUserId);
	return true;
}

// --- LinkDiscordToEOS --------------------------------------------------------

bool UKhaaosDiscordOAuth2::LinkDiscordToEOS(const FString& DiscordUserId, const FString& EOSProductUserId)
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::LinkDiscordToEOS - Not initialized"));
		return false;
	}

	if (DiscordUserId.IsEmpty() || EOSProductUserId.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::LinkDiscordToEOS - DiscordUserId or EOSProductUserId is empty"));
		OnDiscordLinkComplete.Broadcast(false, EOSProductUserId);
		return false;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::LinkDiscordToEOS - Linking Discord user %s to EOS user %s"),
		*DiscordUserId, *EOSProductUserId);

	// Check if there is an existing pending entry from the auth flow
	FKhaaosDiscordLinkInfo LinkInfo;
	if (DiscordLinkMap.Contains(DiscordUserId))
	{
		LinkInfo = DiscordLinkMap[DiscordUserId];
	}

	// Update or create the link info
	LinkInfo.DiscordUserId = DiscordUserId;
	LinkInfo.EOSProductUserId = EOSProductUserId;
	LinkInfo.LinkState = EKhaaosDiscordLinkState::Linked;
	LinkInfo.LinkedTimestamp = FDateTime::UtcNow().ToIso8601();

	// Store under the EOS ProductUserId as the primary key for lookups
	DiscordLinkMap.Add(EOSProductUserId, LinkInfo);

	// Also update the DiscordUserId-keyed entry if it exists
	if (DiscordLinkMap.Contains(DiscordUserId) && DiscordUserId != EOSProductUserId)
	{
		DiscordLinkMap[DiscordUserId] = LinkInfo;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::LinkDiscordToEOS - Link established: Discord %s <-> EOS %s"),
		*DiscordUserId, *EOSProductUserId);

	OnDiscordLinkComplete.Broadcast(true, EOSProductUserId);
	return true;
}

// --- UnlinkDiscordFromEOS ----------------------------------------------------

bool UKhaaosDiscordOAuth2::UnlinkDiscordFromEOS(const FString& EOSProductUserId)
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::UnlinkDiscordFromEOS - Not initialized"));
		return false;
	}

	if (EOSProductUserId.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::UnlinkDiscordFromEOS - EOSProductUserId is empty"));
		return false;
	}

	// Look up the link info to also remove the DiscordUserId-keyed entry
	if (FKhaaosDiscordLinkInfo* LinkInfo = DiscordLinkMap.Find(EOSProductUserId))
	{
		const FString DiscordUserId = LinkInfo->DiscordUserId;

		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::UnlinkDiscordFromEOS - Unlinking Discord %s from EOS %s"),
			*DiscordUserId, *EOSProductUserId);

		DiscordLinkMap.Remove(EOSProductUserId);

		// Also remove the DiscordUserId-keyed entry if present
		if (!DiscordUserId.IsEmpty() && DiscordUserId != EOSProductUserId)
		{
			DiscordLinkMap.Remove(DiscordUserId);
		}

		return true;
	}

	UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordOAuth2::UnlinkDiscordFromEOS - No link found for EOS user: %s"),
		*EOSProductUserId);
	return false;
}

// --- GetDiscordLinkInfo ------------------------------------------------------

FKhaaosDiscordLinkInfo UKhaaosDiscordOAuth2::GetDiscordLinkInfo(const FString& EOSProductUserId) const
{
	if (const FKhaaosDiscordLinkInfo* LinkInfo = DiscordLinkMap.Find(EOSProductUserId))
	{
		return *LinkInfo;
	}

	// Return an empty/unlinked info struct if not found
	FKhaaosDiscordLinkInfo EmptyInfo;
	EmptyInfo.LinkState = EKhaaosDiscordLinkState::Unlinked;
	return EmptyInfo;
}

// --- CheckBetaRole -----------------------------------------------------------

void UKhaaosDiscordOAuth2::CheckBetaRole(const FString& DiscordUserId)
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::CheckBetaRole - Not initialized"));
		OnDiscordRoleCheckComplete.Broadcast(false);
		return;
	}

	if (DiscordUserId.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::CheckBetaRole - DiscordUserId is empty"));
		OnDiscordRoleCheckComplete.Broadcast(false);
		return;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::CheckBetaRole - Checking beta role for Discord user: %s in guild: %lld"),
		*DiscordUserId, CurrentConfig.GuildId);

	// In production, this would call the Discord API:
	//   GET /guilds/{guild.id}/members/{user.id}
	//   Authorization: Bot <bot_token>
	//
	// Response JSON contains a "roles" array of role ID snowflakes.
	// Check if BetaRoleId is present in the roles array.
	//
	// Example HTTP request using UE HTTP module:
	//   TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	//   Request->SetURL(FString::Printf(TEXT("https://discord.com/api/guilds/%lld/members/%s"),
	//       CurrentConfig.GuildId, *DiscordUserId));
	//   Request->SetHeader(TEXT("Authorization"), TEXT("Bot ") + BotToken);
	//   Request->OnProcessRequestComplete().BindLambda([this](FHttpRequestPtr, FHttpResponsePtr Response, bool bSuccess) {
	//       if (bSuccess && Response.IsValid())
	//       {
	//           TSharedPtr<FJsonObject> Json;
	//           TJsonReader<>::Create(Response->GetContentAsString())->AsObject(Json);
	//           const TArray<TSharedPtr<FJsonValue>>* Roles;
	//           if (Json->TryGetArrayField(TEXT("roles"), Roles))
	//           {
	//               bool bHasRole = false;
	//               for (const auto& Role : *Roles)
	//               {
	//                   if (FCString::Atoi64(*Role->AsString()) == CurrentConfig.BetaRoleId)
	//                   {
	//                       bHasRole = true;
	//                       break;
	//                   }
	//               }
	//               OnDiscordRoleCheckComplete.Broadcast(bHasRole);
	//           }
	//       }
	//   });
	//   Request->ProcessRequest();

	// Placeholder: check if we already have role info cached in the link map
	bool bHasBetaRole = false;
	for (const TPair<FString, FKhaaosDiscordLinkInfo>& Pair : DiscordLinkMap)
	{
		if (Pair.Value.DiscordUserId == DiscordUserId)
		{
			bHasBetaRole = Pair.Value.HasBetaRole;
			break;
		}
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::CheckBetaRole - Beta role check for %s: %s"),
		*DiscordUserId, bHasBetaRole ? TEXT("true") : TEXT("false"));

	OnDiscordRoleCheckComplete.Broadcast(bHasBetaRole);
}

// --- IsBetaAccessAllowed -----------------------------------------------------

bool UKhaaosDiscordOAuth2::IsBetaAccessAllowed(const FString& EOSProductUserId) const
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordOAuth2::IsBetaAccessAllowed - Not initialized, denying access"));
		return false;
	}

	// If beta role is not required, all players are allowed
	if (!CurrentConfig.bRequireBetaRole)
	{
		return true;
	}

	// Look up the Discord link info for this EOS user
	const FKhaaosDiscordLinkInfo LinkInfo = GetDiscordLinkInfo(EOSProductUserId);

	if (LinkInfo.LinkState != EKhaaosDiscordLinkState::Linked)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::IsBetaAccessAllowed - EOS user %s is not linked to Discord"),
			*EOSProductUserId);
		return false;
	}

	if (!LinkInfo.HasBetaRole)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::IsBetaAccessAllowed - Linked Discord user for %s does not have the beta role"),
			*EOSProductUserId);
		return false;
	}

	return true;
}

// --- RefreshDiscordToken -----------------------------------------------------

void UKhaaosDiscordOAuth2::RefreshDiscordToken()
{
	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::RefreshDiscordToken - Not initialized"));
		return;
	}

	if (RefreshToken.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::RefreshDiscordToken - No refresh token available"));
		return;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::RefreshDiscordToken - Refreshing OAuth2 access token"));

	// In production, this would POST to https://discord.com/api/oauth2/token:
	//   POST /oauth2/token
	//   Content-Type: application/x-www-form-urlencoded
	//
	//   client_id=<ClientId>
	//   client_secret=<ClientSecret>
	//   grant_type=refresh_token
	//   refresh_token=<RefreshToken>
	//
	// Response JSON:
	//   {
	//     "access_token": "...",
	//     "token_type": "Bearer",
	//     "expires_in": 604800,
	//     "refresh_token": "...",
	//     "scope": "identify guilds guilds.members.read"
	//   }
	//
	// On success, update AccessToken, RefreshToken, and TokenExpiryTime.
	// On failure (e.g. invalid_grant), the auth flow must be restarted.

	UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosDiscordOAuth2::RefreshDiscordToken - Token refresh initiated (production: POST /oauth2/token)"));
}

// --- GetDiscordUserRoles -----------------------------------------------------

TArray<int64> UKhaaosDiscordOAuth2::GetDiscordUserRoles(const FString& DiscordUserId)
{
	TArray<int64> Roles;

	if (!bInitialized)
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::GetDiscordUserRoles - Not initialized"));
		return Roles;
	}

	if (DiscordUserId.IsEmpty())
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordOAuth2::GetDiscordUserRoles - DiscordUserId is empty"));
		return Roles;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordOAuth2::GetDiscordUserRoles - Fetching roles for Discord user: %s in guild: %lld"),
		*DiscordUserId, CurrentConfig.GuildId);

	// In production, this would call the Discord API:
	//   GET /guilds/{guild.id}/members/{user.id}
	//   Authorization: Bot <bot_token>
	//
	// Parse the "roles" array from the response and convert to TArray<int64>.
	//
	// Example:
	//   TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	//   Request->SetURL(FString::Printf(TEXT("https://discord.com/api/guilds/%lld/members/%s"),
	//       CurrentConfig.GuildId, *DiscordUserId));
	//   Request->SetHeader(TEXT("Authorization"), TEXT("Bot ") + BotToken);
	//   Request->OnProcessRequestComplete().BindLambda([this](FHttpRequestPtr, FHttpResponsePtr Response, bool bSuccess) {
	//       // Parse roles array from JSON response
	//   });
	//   Request->ProcessRequest();

	// Placeholder: check if we have cached role info for this user
	// If the beta role is known, include it
	for (const TPair<FString, FKhaaosDiscordLinkInfo>& Pair : DiscordLinkMap)
	{
		if (Pair.Value.DiscordUserId == DiscordUserId && Pair.Value.HasBetaRole)
		{
			Roles.Add(CurrentConfig.BetaRoleId);
			break;
		}
	}

	return Roles;
}
