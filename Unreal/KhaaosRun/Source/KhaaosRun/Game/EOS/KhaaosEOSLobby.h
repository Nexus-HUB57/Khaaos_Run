// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/EOS/KhaaosEOSManager.h"
#include "KhaaosEOSLobby.generated.h"

// ─── Lobby Details Struct ─────────────────────────────────────────────────────

/** Runtime info about an EOS lobby. */
USTRUCT(BlueprintType)
struct FLobbyDetails
{
	GENERATED_BODY()

	/** Unique lobby ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Lobby")
	FString LobbyId;

	/** Maximum members allowed. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Lobby")
	int32 MaxMembers = 100;

	/** Current member count. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Lobby")
	int32 CurrentMembers = 0;

	/** Owner's EOS Product User ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Lobby")
	FEosProductId OwnerId;

	/** Whether this is a presence lobby. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Lobby")
	uint8 bIsPresence : 1;

	/** Custom attributes (key-value). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS|Lobby")
	TMap<FString, FString> CustomAttributes;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a lobby is created. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnLobbyCreated, bool, bSuccess, const FString&, LobbyId);

/** Broadcast when a lobby is joined. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnLobbyJoined, bool, bSuccess, const FString&, LobbyId);

/** Broadcast when a lobby is left. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLobbyLeft, bool, bSuccess);

/**
 * UKhaaosEOSLobby
 *
 * GameInstanceSubsystem for EOS Lobby management.
 * Supports creating, joining, and leaving lobbies with
 * presence tracking and custom attributes.
 *
 * Depends on UKhaaosEOSManager for authentication.
 */
UCLASS(BlueprintType)
class UKhaaosEOSLobby : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Lobby Operations ──────────────────────────────────────────────────────

	/**
	 * Create a new EOS lobby.
	 * @param MaxMembers  Maximum players (default 100 for BR).
	 * @param bIsPresence Whether this is a presence lobby (shows in social overlay).
	 * @param LobbyId     Optional custom lobby ID (auto-generated if empty).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Lobby")
	void CreateLobby(int32 MaxMembers = 100, bool bIsPresence = true, FString LobbyId = FString());

	/**
	 * Join an existing EOS lobby by ID.
	 * @param LobbyId The lobby ID to join.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Lobby")
	void JoinLobby(FString LobbyId);

	/** Leave the current lobby. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Lobby")
	void LeaveLobby();

	// ─── Queries ───────────────────────────────────────────────────────────────

	/** Get all members in the current lobby. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Lobby")
	TArray<FEosProductId> GetLobbyMembers() const;

	/** Get the lobby owner's Product User ID. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Lobby")
	FEosProductId GetLobbyOwner() const;

	/** Get current lobby details. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Lobby")
	FLobbyDetails GetCurrentLobbyDetails() const { return CurrentLobby; }

	/** Check if currently in a lobby. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS|Lobby")
	bool IsInLobby() const { return bInLobby; }

	// ─── Lobby Management ──────────────────────────────────────────────────────

	/** Promote another member to lobby owner. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Lobby")
	void PromoteMember(FEosProductId MemberId);

	/** Set a custom attribute on the current lobby. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS|Lobby")
	void SetLobbyAttribute(FString Key, FString Value);

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when lobby is created. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Lobby")
	FOnLobbyCreated OnLobbyCreated;

	/** Broadcast when lobby is joined. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Lobby")
	FOnLobbyJoined OnLobbyJoined;

	/** Broadcast when lobby is left. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS|Lobby")
	FOnLobbyLeft OnLobbyLeft;

private:

	/** Whether currently in a lobby. */
	bool bInLobby = false;

	/** Current lobby details. */
	FLobbyDetails CurrentLobby;

	/** Cached member IDs. */
	TArray<FEosProductId> CachedMembers;
};
