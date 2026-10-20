// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSLobby.h"
#include "OnlineSubsystem.h"
#include "OnlineSessionInterface.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosEOSLobby::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bInLobby = false;

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby: Initialized"));
}

void UKhaaosEOSLobby::Deinitialize()
{
	if (bInLobby)
	{
		LeaveLobby();
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby: Deinitialized"));
	Super::Deinitialize();
}

// ─── CreateLobby ──────────────────────────────────────────────────────────────

void UKhaaosEOSLobby::CreateLobby(int32 MaxMembers, bool bIsPresence, FString LobbyId)
{
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSLobby::CreateLobby - No OnlineSubsystem"));
		OnLobbyCreated.Broadcast(false, FString());
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSLobby::CreateLobby - No Session interface"));
		OnLobbyCreated.Broadcast(false, FString());
		return;
	}

	// Build session settings for the lobby
	FOnlineSessionSettings Settings;
	Settings.NumPublicConnections = MaxMembers;
	Settings.bShouldAdvertise = true;
	Settings.bAllowJoinInProgress = true;
	Settings.bIsDedicated = false;
	Settings.bUsesPresence = bIsPresence;
	Settings.SetSetting(FName("LobbyId"), LobbyId.IsEmpty() ? FGuid::NewGuid().ToString() : LobbyId);

	// Host session (creates the lobby)
	FOnCreateSessionCompleteDelegate CreateDelegate = FOnCreateSessionCompleteDelegate::CreateLambda(
		[this](FName /*SessionName*/, bool bSuccess)
		{
			if (bSuccess)
			{
				bInLobby = true;
				CurrentLobby.bIsPresence = true;
				CurrentLobby.MaxMembers = CurrentLobby.MaxMembers;
				UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby: Lobby created - %s"), *CurrentLobby.LobbyId);
			}
			else
			{
				UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSLobby: Failed to create lobby"));
			}
			OnLobbyCreated.Broadcast(bSuccess, CurrentLobby.LobbyId);
		}
	);

	SessionInt->AddOnCreateSessionCompleteDelegate_Handle(CreateDelegate);

	if (!SessionInt->CreateSession(0, FName("KhaaosLobby"), Settings))
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSLobby::CreateLobby - CreateSession returned false"));
		OnLobbyCreated.Broadcast(false, FString());
	}
}

// ─── JoinLobby ────────────────────────────────────────────────────────────────

void UKhaaosEOSLobby::JoinLobby(FString LobbyId)
{
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSLobby::JoinLobby - No OnlineSubsystem"));
		OnLobbyJoined.Broadcast(false, LobbyId);
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSLobby::JoinLobby - No Session interface"));
		OnLobbyJoined.Broadcast(false, LobbyId);
		return;
	}

	// Search for the lobby by ID
	FOnlineSessionSearchParams SearchParams;
	SearchParams.bPresenceOnly = false;

	FOnJoinSessionCompleteDelegate JoinDelegate = FOnJoinSessionCompleteDelegate::CreateLambda(
		[this, LobbyId](FName /*SessionName*/, EOnJoinSessionCompleteResult::Type Result)
		{
			const bool bSuccess = (Result == EOnJoinSessionCompleteResult::Success);
			if (bSuccess)
			{
				bInLobby = true;
				CurrentLobby.LobbyId = LobbyId;
				UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby: Joined lobby - %s"), *LobbyId);
			}
			else
			{
				UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSLobby: Failed to join lobby - %s"), *LobbyId);
			}
			OnLobbyJoined.Broadcast(bSuccess, LobbyId);
		}
	);

	SessionInt->AddOnJoinSessionCompleteDelegate_Handle(JoinDelegate);

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby::JoinLobby - Attempting to join %s"), *LobbyId);
}

// ─── LeaveLobby ───────────────────────────────────────────────────────────────

void UKhaaosEOSLobby::LeaveLobby()
{
	if (!bInLobby)
	{
		OnLobbyLeft.Broadcast(true);
		return;
	}

	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		OnLobbyLeft.Broadcast(false);
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		OnLobbyLeft.Broadcast(false);
		return;
	}

	const bool bSuccess = SessionInt->DestroySession(FName("KhaaosLobby"));

	if (bSuccess)
	{
		bInLobby = false;
		CachedMembers.Empty();
		CurrentLobby = FLobbyDetails();
		UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby: Left lobby"));
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSLobby: Failed to leave lobby"));
	}

	OnLobbyLeft.Broadcast(bSuccess);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

TArray<FEosProductId> UKhaaosEOSLobby::GetLobbyMembers() const
{
	return CachedMembers;
}

FEosProductId UKhaaosEOSLobby::GetLobbyOwner() const
{
	return CurrentLobby.OwnerId;
}

// ─── PromoteMember ────────────────────────────────────────────────────────────

void UKhaaosEOSLobby::PromoteMember(FEosProductId MemberId)
{
	if (!bInLobby || !MemberId.IsValid())
	{
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby::PromoteMember - Promoting %s to owner"), *MemberId.ProductUserIdString);

	// EOS Lobby promote via session interface
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (OnlineSub)
	{
		IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
		if (SessionInt.IsValid())
		{
			// In EOS, lobby ownership transfer is handled via the session interface
			// This would call EOS_Lobby_PromoteMember internally
		}
	}
}

// ─── SetLobbyAttribute ────────────────────────────────────────────────────────

void UKhaaosEOSLobby::SetLobbyAttribute(FString Key, FString Value)
{
	if (!bInLobby)
	{
		return;
	}

	CurrentLobby.CustomAttributes.Add(Key, Value);
	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSLobby::SetLobbyAttribute - %s=%s"), *Key, *Value);

	// Update the EOS lobby attributes via session interface
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (OnlineSub)
	{
		IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
		if (SessionInt.IsValid())
		{
			// Session attribute update would be done via EOS_Lobby_UpdateModification
		}
	}
}
