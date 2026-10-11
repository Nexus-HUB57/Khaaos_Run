// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSMatchmaking.h"
#include "OnlineSubsystem.h"
#include "OnlineSessionInterface.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosEOSMatchmaking::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bIsSearching = false;
	Config = FMatchmakingConfig();

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSMatchmaking: Initialized"));
}

void UKhaaosEOSMatchmaking::Deinitialize()
{
	if (bIsSearching)
	{
		CancelMatchmaking();
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSMatchmaking: Deinitialized"));
	Super::Deinitialize();
}

// ─── StartMatchmaking ─────────────────────────────────────────────────────────

void UKhaaosEOSMatchmaking::StartMatchmaking(FString PoolName, FString Region, int32 SkillRating)
{
	if (bIsSearching)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSMatchmaking::StartMatchmaking - Already searching"));
		return;
	}

	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		HandleMatchFailure(TEXT("No OnlineSubsystem"));
		return;
	}

	// Update config
	Config.PoolName = PoolName;
	Config.Region = Region;

	// Generate a unique ticket ID for tracking
	CurrentTicketId = FGuid::NewGuid().ToString();
	bIsSearching = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSMatchmaking: Started matchmaking (Pool=%s, Region=%s, Skill=%d, Ticket=%s)"),
		*PoolName, *Region, SkillRating, *CurrentTicketId);

	// In a full implementation, this would call EOS_Matching_AddNotification
	// and EOS_Matching_SubmitTicket with the player's attributes:
	//   - PoolName
	//   - Region
	//   - SkillRating (as a matchmaking attribute)
	//   - PlayerId
	//
	// For EOSIntegrationKit, matchmaking is handled via session search
	// with the session interface acting as the matchmaking backend.

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (SessionInt.IsValid())
	{
		// Start session search as matchmaking proxy
		FOnlineSessionSearchParams SearchParams;
		SearchParams.SetSetting(FName("PoolName"), PoolName);
		SearchParams.SetSetting(FName("Region"), Region);
		SearchParams.SetSetting(FName("SkillRating"), SkillRating);

		// Bind search completion
		FOnFindSessionsCompleteDelegate FindDelegate = FOnFindSessionsCompleteDelegate::CreateLambda(
			[this](bool bSuccess)
			{
				if (bSuccess)
				{
					// In production, the EOS matchmaking notification would provide
					// the actual session ID and server address.
					HandleMatchNotification(TEXT("MatchSession"), TEXT("127.0.0.1:7777"));
				}
				else
				{
					HandleMatchFailure(TEXT("Session search failed"));
				}
			}
		);

		SessionInt->AddOnFindSessionsCompleteDelegate_Handle(FindDelegate);
	}
}

// ─── CancelMatchmaking ────────────────────────────────────────────────────────

void UKhaaosEOSMatchmaking::CancelMatchmaking()
{
	if (!bIsSearching)
	{
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSMatchmaking: Cancelling ticket %s"), *CurrentTicketId);

	// In a full implementation, this would call EOS_Matching_DeleteTicket
	// with the CurrentTicketId.

	bIsSearching = false;
	CurrentTicketId.Empty();
}

// ─── Internal Handlers ───────────────────────────────────────────────────────

void UKhaaosEOSMatchmaking::HandleMatchNotification(const FString& SessionId, const FString& ServerAddress)
{
	bIsSearching = false;
	CurrentTicketId.Empty();

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSMatchmaking: Match found (Session=%s, Server=%s)"),
		*SessionId, *ServerAddress);

	OnMatchFound.Broadcast(SessionId, ServerAddress);
}

void UKhaaosEOSMatchmaking::HandleMatchFailure(const FString& ErrorMessage)
{
	bIsSearching = false;
	CurrentTicketId.Empty();

	UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSMatchmaking: Failed - %s"), *ErrorMessage);

	OnMatchmakingFailed.Broadcast(ErrorMessage);
}
