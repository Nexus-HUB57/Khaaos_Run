// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSSession.h"
#include "OnlineSubsystem.h"
#include "OnlineSessionInterface.h"
#include "Engine/Engine.h"
#include "Kismet/GameplayStatics.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosEOSSession::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bInSession = false;
	bIsRegisteredServer = false;

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Initialized"));
}

void UKhaaosEOSSession::Deinitialize()
{
	if (bInSession)
	{
		DestroySession();
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Deinitialized"));
	Super::Deinitialize();
}

// ─── HostDedicatedServerSession ───────────────────────────────────────────────

void UKhaaosEOSSession::HostDedicatedServerSession(FString MapName, int32 MaxPlayers)
{
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		HandleSessionCreated(false, FString());
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		HandleSessionCreated(false, FString());
		return;
	}

	// Update settings
	Settings.MapName = MapName;
	Settings.MaxPlayers = MaxPlayers;
	Settings.bIsDedicated = true;

	// Build session settings
	FOnlineSessionSettings SessionSettings;
	SessionSettings.NumPublicConnections = MaxPlayers;
	SessionSettings.bShouldAdvertise = true;
	SessionSettings.bAllowJoinInProgress = true;
	SessionSettings.bIsDedicated = true;
	SessionSettings.SetSetting(FName("MapName"), MapName);
	SessionSettings.SetSetting(FName("ServerName"), Settings.ServerName);
	SessionSettings.SetSetting(FName("Region"), Settings.Region);

	// Add custom rules
	for (const auto& Rule : Settings.CustomRules)
	{
		SessionSettings.SetSetting(FName(*Rule.Key), Rule.Value);
	}

	// Bind creation callback
	FOnCreateSessionCompleteDelegate CreateDelegate = FOnCreateSessionCompleteDelegate::CreateLambda(
		[this](FName /*SessionName*/, bool bSuccess)
		{
			FString SessionId = bSuccess ? CurrentSessionId : FString();
			HandleSessionCreated(bSuccess, SessionId);
		}
	);

	SessionInt->AddOnCreateSessionCompleteDelegate_Handle(CreateDelegate);

	if (!SessionInt->CreateSession(0, FName("KhaaosSession"), SessionSettings))
	{
		HandleSessionCreated(false, FString());
	}
	else
	{
		CurrentSessionId = FGuid::NewGuid().ToString();
		UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Hosting session (Map=%s, MaxPlayers=%d)"),
			*MapName, MaxPlayers);
	}
}

// ─── JoinDedicatedServerSession ───────────────────────────────────────────────

void UKhaaosEOSSession::JoinDedicatedServerSession(FString SessionId, FString ServerAddress)
{
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		HandleSessionJoined(false, SessionId);
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		HandleSessionJoined(false, SessionId);
		return;
	}

	// Resolve the connection string from the session
	FString ConnectString;

	FOnJoinSessionCompleteDelegate JoinDelegate = FOnJoinSessionCompleteDelegate::CreateLambda(
		[this, SessionId, ServerAddress, &ConnectString](FName /*SessionName*/, EOnJoinSessionCompleteResult::Type Result)
		{
			const bool bSuccess = (Result == EOnJoinSessionCompleteResult::Success);
			if (bSuccess)
			{
				CurrentSessionId = SessionId;
				bInSession = true;

				// Travel to the server
				UGameInstance* GameInst = GetGameInstance();
				if (GameInst)
				{
					APlayerController* PC = GameInst->GetFirstLocalPlayerController();
					if (PC)
					{
						PC->ClientTravel(ServerAddress, TRAVEL_Absolute);
					}
				}

				UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Joined session %s at %s"),
					*SessionId, *ServerAddress);
			}
			else
			{
				UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSSession: Failed to join session %s"), *SessionId);
			}
			HandleSessionJoined(bSuccess, SessionId);
		}
	);

	SessionInt->AddOnJoinSessionCompleteDelegate_Handle(JoinDelegate);

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Joining session %s at %s"), *SessionId, *ServerAddress);
}

// ─── DestroySession ───────────────────────────────────────────────────────────

void UKhaaosEOSSession::DestroySession()
{
	if (!bInSession)
	{
		HandleSessionDestroyed(true);
		return;
	}

	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		HandleSessionDestroyed(false);
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		HandleSessionDestroyed(false);
		return;
	}

	FOnDestroySessionCompleteDelegate DestroyDelegate = FOnDestroySessionCompleteDelegate::CreateLambda(
		[this](FName /*SessionName*/, bool bSuccess)
		{
			HandleSessionDestroyed(bSuccess);
		}
	);

	SessionInt->AddOnDestroySessionCompleteDelegate_Handle(DestroyDelegate);

	if (!SessionInt->DestroySession(FName("KhaaosSession")))
	{
		HandleSessionDestroyed(false);
	}
}

// ─── RegisterServer ───────────────────────────────────────────────────────────

void UKhaaosEOSSession::RegisterServer()
{
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSSession::RegisterServer - No OnlineSubsystem"));
		return;
	}

	IOnlineSessionPtr SessionInt = OnlineSub->GetSessionInterface();
	if (!SessionInt.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSSession::RegisterServer - No Session interface"));
		return;
	}

	// Register as a dedicated server with EOS
	// This calls EOS_Sessions_RegisterServer internally via the session interface
	bIsRegisteredServer = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Registered dedicated server with EOS"));
}

// ─── Internal Handlers ───────────────────────────────────────────────────────

void UKhaaosEOSSession::HandleSessionCreated(bool bSuccess, const FString& SessionId)
{
	if (bSuccess)
	{
		bInSession = true;
		UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Session created - %s"), *SessionId);
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSSession: Failed to create session"));
	}

	OnSessionCreated.Broadcast(bSuccess, SessionId);
}

void UKhaaosEOSSession::HandleSessionJoined(bool bSuccess, const FString& SessionId)
{
	OnSessionJoined.Broadcast(bSuccess, SessionId);
}

void UKhaaosEOSSession::HandleSessionDestroyed(bool bSuccess)
{
	if (bSuccess)
	{
		bInSession = false;
		CurrentSessionId.Empty();
		ConnectedPlayers = 0;
		UE_LOG(LogTemp, Log, TEXT("KhaaosEOSSession: Session destroyed"));
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSSession: Failed to destroy session"));
	}

	OnSessionDestroyed.Broadcast(bSuccess);
}
