/**
 * KhaaosDiscordOAuth2.h
 * Khaaos Run -- Discord OAuth2 Integration
 *
 * Handles Discord OAuth2 login as an alternative to EOS authentication,
 * linking Discord accounts to EOS ProductUserId, and role-based access
 * control for the private beta (Discord server roles -> game permissions).
 *
 * Flow:
 *   1. InitializeOAuth2(Config)          -- validate and store OAuth2 config
 *   2. StartAuthFlow()                   -- open Discord authorize URL in browser
 *   3. CompleteAuthFlow(AuthorizationCode)-- exchange code for access token
 *   4. LinkDiscordToEOS(DiscordId, EOSId)-- bind Discord <-> EOS identity
 *   5. CheckBetaRole(DiscordId)          -- async role check, broadcasts delegate
 *   6. IsBetaAccessAllowed(EOSId)        -- gate entry based on linked Discord role
 *
 * Token lifecycle:
 *   - RefreshDiscordToken()              -- refresh OAuth2 access token before expiry
 *   - TokenExpiryTime tracked for proactive refresh
 *
 * Discord API references:
 *   - OAuth2:  https://discord.com/developers/docs/topics/oauth2
 *   - Guild Member: https://discord.com/developers/docs/resources/guild#get-guild-member
 *
 * ===========================================================================
 *  Khaaos Run | Multi-World Battle Royale | UE5.8 C++ Dedicated Server
 * ===========================================================================
 */

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "Subsystems/EngineSubsystem.h"
#include "Discord/KhaaosDiscordOAuth2.generated.h"

// --- Data Structures -------------------------------------------------------

/**
 * FKhaaosDiscordOAuth2Config
 * Configuration for Discord OAuth2 integration.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordOAuth2Config
{
	GENERATED_BODY()

	/** Discord Application Client ID (from Developer Portal -> OAuth2). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString ClientId;

	/** Discord Application Client Secret (server-side only, never shipped to client builds). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString ClientSecret;

	/** OAuth2 redirect URI (must match a registered redirect in the Discord application). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString RedirectUri;

	/** Discord Guild (server) ID for role-based beta access. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	int64 GuildId = 0;

	/** Role ID within the Guild that grants beta access. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	int64 BetaRoleId = 0;

	/** If true, players must have the beta role to enter matchmaking. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	bool bRequireBetaRole = true;
};

/**
 * EKhaaosDiscordLinkState
 * Current state of a Discord <-> EOS account link.
 */
UENUM(BlueprintType)
enum class EKhaaosDiscordLinkState : uint8
{
	Unlinked UMETA(DisplayName = "Unlinked"),
	Pending  UMETA(DisplayName = "Pending"),
	Linked   UMETA(DisplayName = "Linked"),
	Error    UMETA(DisplayName = "Error")
};

/**
 * FKhaaosDiscordLinkInfo
 * Stores the Discord <-> EOS identity mapping and link state.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordLinkInfo
{
	GENERATED_BODY()

	/** Discord user ID (snowflake as string). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString DiscordUserId;

	/** Discord username#discriminator or new unique username. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString DiscordUsername;

	/** EOS ProductUserId that this Discord account is linked to. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString EOSProductUserId;

	/** Current link state. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	EKhaaosDiscordLinkState LinkState = EKhaaosDiscordLinkState::Unlinked;

	/** True if the Discord user has the beta role in the configured guild. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	bool HasBetaRole = false;

	/** ISO-8601 timestamp of when the link was established. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
	FString LinkedTimestamp;
};

// --- Delegates -------------------------------------------------------------

/** Broadcast when Discord OAuth2 auth flow completes (success or failure). */
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnDiscordAuthComplete, bool, bSuccess, const FString&, DiscordUserId);

/** Broadcast when a Discord <-> EOS link operation completes. */
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnDiscordLinkComplete, bool, bSuccess, const FString&, EOSId);

/** Broadcast when a Discord role check completes. */
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnDiscordRoleCheckComplete, bool, bHasRole);

// --- UKhaaosDiscordOAuth2 --------------------------------------------------

/**
 * UKhaaosDiscordOAuth2
 *
 * Engine subsystem that manages Discord OAuth2 authentication, account
 * linking with EOS, and role-based beta access for Khaaos Run.
 *
 * Typical lifecycle:
 *   1. InitializeOAuth2() -- called from server startup or game mode init
 *   2. StartAuthFlow()    -- player clicks "Login with Discord"
 *   3. CompleteAuthFlow() -- redirect handler receives the authorization code
 *   4. LinkDiscordToEOS() -- bind the Discord identity to the EOS identity
 *   5. CheckBetaRole()    -- verify the player has beta access
 *
 * All Discord API calls that require the bot token or client secret must
 * run on the dedicated server only. The client build never receives
 * ClientSecret or bot credentials.
 */
UCLASS(BlueprintType, Blueprintable, Category = "Khaaos|Discord")
class KHAAOSRUN_API UKhaaosDiscordOAuth2 : public UEngineSubsystem
{
	GENERATED_BODY()

public:

	// --- Lifecycle ---------------------------------------------------------

	/**
	 * Initialize the Discord OAuth2 subsystem with the given configuration.
	 * @param Config  OAuth2 credentials, guild/role IDs, feature flags.
	 * @return True if configuration is valid and the subsystem is ready.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	bool InitializeOAuth2(const FKhaaosDiscordOAuth2Config& Config);

	/** Shut down the OAuth2 subsystem, clearing all state and tokens. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void ShutdownOAuth2();

	/** Returns true if the subsystem has been successfully initialized. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
	bool IsInitialized() const;

	// --- OAuth2 Auth Flow -------------------------------------------------

	/**
	 * Start the Discord OAuth2 authorization flow.
	 * Constructs the authorize URL and opens it in the player's browser.
	 * The player authorizes, Discord redirects to RedirectUri with a code.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void StartAuthFlow();

	/**
	 * Complete the OAuth2 auth flow by exchanging the authorization code
	 * for an access token.
	 * @param AuthorizationCode  Code received from the Discord redirect.
	 * @return True if the code was accepted for processing.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	bool CompleteAuthFlow(const FString& AuthorizationCode);

	// --- Account Linking ---------------------------------------------------

	/**
	 * Link a Discord user to an EOS ProductUserId.
	 * Creates or updates the FKhaaosDiscordLinkInfo in the link map.
	 * @param DiscordUserId    Discord snowflake ID.
	 * @param EOSProductUserId EOS ProductUserId to link.
	 * @return True if the link was created/updated successfully.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	bool LinkDiscordToEOS(const FString& DiscordUserId, const FString& EOSProductUserId);

	/**
	 * Remove the Discord <-> EOS link for the given EOS user.
	 * @param EOSProductUserId  The EOS identity to unlink.
	 * @return True if the link was found and removed.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	bool UnlinkDiscordFromEOS(const FString& EOSProductUserId);

	/**
	 * Retrieve the Discord link info for a given EOS ProductUserId.
	 * @param EOSProductUserId  The EOS identity to look up.
	 * @return Link info struct (Unlinked state if not found).
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
	FKhaaosDiscordLinkInfo GetDiscordLinkInfo(const FString& EOSProductUserId) const;

	// --- Role-Based Beta Access --------------------------------------------

	/**
	 * Asynchronously check if a Discord user has the beta role in the
	 * configured guild. Broadcasts OnDiscordRoleCheckComplete when done.
	 * @param DiscordUserId  Discord snowflake ID to check.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void CheckBetaRole(const FString& DiscordUserId);

	/**
	 * Check whether a given EOS user is allowed into the beta.
	 * Looks up the linked Discord identity and checks HasBetaRole.
	 * @param EOSProductUserId  The EOS identity to check.
	 * @return True if the user has beta access (or if beta role is not required).
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
	bool IsBetaAccessAllowed(const FString& EOSProductUserId) const;

	// --- Token Management --------------------------------------------------

	/**
	 * Refresh the Discord OAuth2 access token using the stored refresh token.
	 * In production, POSTs to /oauth2/token with grant_type=refresh_token.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	void RefreshDiscordToken();

	// --- Discord API Helpers -----------------------------------------------

	/**
	 * Retrieve all role IDs for a Discord user in the configured guild.
	 * In production, calls GET /guilds/{guild.id}/members/{user.id}.
	 * @param DiscordUserId  Discord snowflake ID.
	 * @return Array of role IDs (snowflakes as int64).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
	TArray<int64> GetDiscordUserRoles(const FString& DiscordUserId);

	// --- Delegates ---------------------------------------------------------

	/** Broadcast when the OAuth2 auth flow completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
	FOnDiscordAuthComplete OnDiscordAuthComplete;

	/** Broadcast when a Discord <-> EOS link operation completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
	FOnDiscordLinkComplete OnDiscordLinkComplete;

	/** Broadcast when a Discord role check completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
	FOnDiscordRoleCheckComplete OnDiscordRoleCheckComplete;

private:

	// --- Internal State ----------------------------------------------------

	/** True after InitializeOAuth2 succeeds. */
	bool bInitialized = false;

	/** Active OAuth2 configuration. */
	FKhaaosDiscordOAuth2Config CurrentConfig;

	/** Map of EOS ProductUserId -> Discord link info. */
	UPROPERTY()
	TMap<FString, FKhaaosDiscordLinkInfo> DiscordLinkMap;

	/** Current OAuth2 access token (short-lived). */
	FString AccessToken;

	/** Current OAuth2 refresh token (long-lived). */
	FString RefreshToken;

	/** Unix timestamp (seconds) when the access token expires. */
	int64 TokenExpiryTime = 0;
};
