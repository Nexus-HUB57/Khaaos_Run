// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosEOSSession.generated.h"

// ─── Session Settings Struct ───────────────────────────────────────────────────

/** Configuration for a dedicated server session. */
USTRUCT(BlueprintType)
struct FSessionSettings
{
	GENERATED_BODY()

	/** Map name to load. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Session")
	FString MapName = TEXT("KhaaosBR_Main");

	/** Maximum players. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Session")
	int32 MaxPlayers = 100;

	/** Whether this is a dedicated server session. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Session")
	uint8 bIsDedicated : 1;

	/** Server display name. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Session")
	FString ServerName = TEXT("Khaaos BR Server");

	/** Region for EOS session. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Session")
	FString Region = TEXT("sa1");

	/** Custom rules (key-value). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|EOS|Session")
	TMap<FString, FString> CustomRules;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when session is created. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSessionCreated, bool, bSuccess, const FString&, SessionId);

/** Broadcast when session is joined. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSessionJoined, bool, bSuccess, const FString&, SessionId);

/** Broadcast when session is destroyed. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSessionDestroyed, bool, bSuccess);

/**
 * UKhaaosEOSSession
 *
 * GameInstanceSubsystem for dedicated server session management via EOS.
 * Handles hosting, joining, and destroying game sessions.
 * Also handles dedicated server registration with EOS backend.
 *
 * Depends on UKhaaosEOSManager for authentication.
 *
 * Flow (Client):
 *   1. JoinDedicatedServerSession(SessionId, ServerAddress)
 *   2. OnSessionJoined → travel to server
 *
 * Flow (Dedicated Server):
 *   1. RegisterServer()
 *   2. HostDedicatedServerSession(MapName, MaxPlayers)
 *   3. Accept connections via EOS
 */
UCLASS(BlueprintType)
class UKhaaosEOSSession : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Dedicated Server Session ──────────────────────────────────────────────

	/**
	 * Host a dedicated server session.
	 * Creates an EOS session and registers it for matchmaking.
	 *
	 * @param MapName    Map to host
	 * @param MaxPlayers Maximum player count
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Session")
	void HostDedicatedServerSession(FString MapName, int32 MaxPlayers);

	/**
	 * Join a dedicated server session by ID and address.
	 *
	 * @param SessionId     EOS session ID
	 * @param ServerAddress Server IP:port to connect to
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Session")
	void JoinDedicatedServerSession(FString SessionId, FString ServerAddress);

	/** Destroy the current session. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Session")
	void DestroySession();

	/**
	 * Register this server as a dedicated server with EOS.
	 * Called on dedicated server startup before HostDedicatedServerSession.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Session")
	void RegisterServer();

	// ─── Queries ───────────────────────────────────────────────────────────────

	/** Get the current session ID. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Session")
	FString GetSessionId() const { return CurrentSessionId; }

	/** Get the number of connected players. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Session")
	int32 GetConnectedPlayers() const { return ConnectedPlayers; }

	/** Check if currently in a session. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Session")
	bool IsInSession() const { return bInSession; }

	/** Get session settings. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Session")
	FSessionSettings GetSessionSettings() const { return Settings; }

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when session is created. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Session")
	FOnSessionCreated OnSessionCreated;

	/** Broadcast when session is joined. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Session")
	FOnSessionJoined OnSessionJoined;

	/** Broadcast when session is destroyed. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Session")
	FOnSessionDestroyed OnSessionDestroyed;

private:

	/** Whether currently in a session. */
	bool bInSession = false;

	/** Whether this is a registered dedicated server. */
	bool bIsRegisteredServer = false;

	/** Current session ID. */
	FString CurrentSessionId;

	/** Number of connected players. */
	int32 ConnectedPlayers = 0;

	/** Session settings. */
	FSessionSettings Settings;

	/** Handle session creation callback. */
	void HandleSessionCreated(bool bSuccess, const FString& SessionId);

	/** Handle session join callback. */
	void HandleSessionJoined(bool bSuccess, const FString& SessionId);

	/** Handle session destroy callback. */
	void HandleSessionDestroyed(bool bSuccess);
};
