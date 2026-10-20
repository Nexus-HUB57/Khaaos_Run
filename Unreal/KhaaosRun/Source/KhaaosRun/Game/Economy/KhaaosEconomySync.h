// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "WebSocketsModule.h"
#include "KhaaosEconomySync.generated.h"

// ─── Economy Sync Data Types ───────────────────────────────────────────────────

/**
 * EKhaaosSyncState
 * WebSocket connection state for economy sync.
 */
UENUM(BlueprintType)
enum class EKhaaosSyncState : uint8
{
	Disconnected  UMETA(DisplayName = "DISCONNECTED"),
	Connecting    UMETA(DisplayName = "CONNECTING"),
	Connected     UMETA(DisplayName = "CONNECTED"),
	Reconnecting  UMETA(DisplayName = "RECONNECTING"),
	Error         UMETA(DisplayName = "ERROR")
};

/**
 * FKhaaosInventorySync
 * Inventory snapshot for delta-sync with Economy API.
 * Only changed slots are transmitted (delta compression).
 */
USTRUCT(BlueprintType)
struct FKhaaosInventorySync
{
	GENERATED_BODY()

	/** Player EOS ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	FString PlayerEosId;

	/** Changed slot indices (0-5, sparse). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	TArray<int32> ChangedSlots;

	/** Item IDs per changed slot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	TArray<FString> ItemIds;

	/** Quantities per changed slot. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	TArray<int32> Quantities;

	/** Sequence number for ordering. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	int64 SequenceNumber = 0;
};

/**
 * FKhaaosKRCBalance
 * KRC balance snapshot with atomic verification.
 */
USTRUCT(BlueprintType)
struct FKhaaosKRCBalance
{
	GENERATED_BODY()

	/** Player EOS ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|KRC")
	FString PlayerEosId;

	/** Current KRC balance (atomic ledger). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|KRC")
	int64 Balance = 0;

	/** Ledger hash (SHA-256 of last transaction). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|KRC")
	FString LedgerHash;

	/** Last sync timestamp (unix ms). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Economy|KRC")
	int64 LastSyncTimestamp = 0;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnSyncStateChanged, EKhaaosSyncState, NewState, EKhaaosSyncState, OldState);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnInventorySynced, bool, bSuccess, const FKhaaosInventorySync&, SyncData);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnKRCBalanceUpdated, bool, bSuccess, const FKhaaosKRCBalance&, Balance);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnSyncError, const FString&, ErrorMessage);

/**
 * UKhaaosEconomySync
 *
 * Real-time WebSocket bridge between UE5 dedicated server and Node.js Economy API.
 * Provides delta-sync for player inventory and KRC balances, replacing poll-based
 * HTTP with push-based updates for sub-50ms economy state propagation.
 *
 * Architecture:
 *   UE5 Server ←WebSocket→ Node.js Economy API ←→ PostgreSQL AtomicLedger
 *
 * Features:
 *   - Delta-compressed inventory sync (only changed slots transmitted)
 *   - SHA-256 ledger hash verification on every balance update
 *   - Automatic reconnection with exponential backoff (1s→2s→4s→8s→16s→30s cap)
 *   - Message sequencing for ordering guarantees
 *   - Heartbeat keepalive every 30s
 *   - Rate limit: max 60 messages/second to prevent flooding
 *   - Queue offline messages (up to 100) for delivery on reconnect
 *
 * Parity with Free Fire:
 *   - Instant KRC deduction on purchase (no polling delay)
 *   - Real-time shop rotation push (no client refresh needed)
 *   - Inventory sync on world transition (seamless cross-world)
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosEconomySync : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosEconomySync();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void InitializeComponent() override;
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// ─── Connection ─────────────────────────────────────────────────────────

	/** Connect to Economy API WebSocket. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Sync")
	void Connect(const FString& ServerUrl);

	/** Disconnect from Economy API. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Sync")
	void Disconnect();

	/** Get current sync state. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Economy|Sync")
	EKhaaosSyncState GetSyncState() const { return SyncState; }

	// ─── Inventory Sync ─────────────────────────────────────────────────────

	/**
	 * Push inventory delta to Economy API.
	 * Only changed slots are transmitted for bandwidth efficiency.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Sync")
	void PushInventoryDelta(const FKhaaosInventorySync& Delta);

	/**
	 * Request full inventory snapshot from Economy API.
	 * Used on initial connect or after reconnect.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Sync")
	void RequestFullSync(const FString& PlayerEosId);

	// ─── KRC Balance ────────────────────────────────────────────────────────

	/**
	 * Request KRC balance from Economy API.
	 * Verifies SHA-256 ledger hash for integrity.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Sync")
	void RequestKRCBalance(const FString& PlayerEosId);

	/**
	 * Deduct KRC atomically via Economy API.
	 * Returns new balance via delegate if successful.
	 * Fails if insufficient balance or hash mismatch.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Economy|Sync")
	void DeductKRC(const FString& PlayerEosId, int64 Amount, const FString& Reason);

	// ─── Configuration ──────────────────────────────────────────────────────

	/** WebSocket server URL. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	FString WsServerUrl;

	/** Reconnect base delay (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	float ReconnectBaseDelay;

	/** Maximum reconnect delay (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	float ReconnectMaxDelay;

	/** Heartbeat interval (seconds). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	float HeartbeatInterval;

	/** Max queued offline messages. */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	int32 MaxOfflineQueueSize;

	/** Max messages per second (rate limit). */
	UPROPERTY(EditDefaultsOnly, Config, BlueprintReadOnly, Category = "Khaaos|Economy|Sync")
	int32 MaxMessagesPerSecond;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Economy|Sync")
	FOnSyncStateChanged OnSyncStateChanged;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Economy|Sync")
	FOnInventorySynced OnInventorySynced;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Economy|Sync")
	FOnKRCBalanceUpdated OnKRCBalanceUpdated;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Economy|Sync")
	FOnSyncError OnSyncError;

private:

	/** Current sync state. */
	EKhaaosSyncState SyncState;

	/** WebSocket connection. */
	TSharedPtr<IWebSocket> WebSocket;

	/** Monotonic sequence number. */
	int64 SequenceCounter;

	/** Reconnect attempt counter. */
	int32 ReconnectAttempt;

	/** Reconnect timer. */
	float ReconnectTimer;

	/** Heartbeat timer. */
	float HeartbeatTimer;

	/** Messages sent this second. */
	int32 MessagesThisSecond;

	/** Rate limit reset timer. */
	float RateLimitTimer;

	/** Offline message queue. */
	TArray<FString> OfflineQueue;

	/** Cached KRC balances (PlayerEosId → Balance). */
	TMap<FString, FKhaaosKRCBalance> CachedBalances;

	/** Set sync state and broadcast. */
	void SetSyncState(EKhaaosSyncState NewState);

	/** Send JSON message (respects rate limit and offline queue). */
	void SendMessage(const FString& Json);

	/** Handle WebSocket connected. */
	void OnWebSocketConnected();

	/** Handle WebSocket connection error. */
	void OnWebSocketError(const FString& Error);

	/** Handle WebSocket closed. */
	void OnWebSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean);

	/** Handle WebSocket message received. */
	void OnWebSocketMessage(const FString& Message);

	/** Parse and handle incoming message. */
	void HandleIncomingMessage(const TSharedPtr<FJsonObject>& JsonObj);

	/** Flush offline queue after reconnect. */
	void FlushOfflineQueue();

	/** Compute exponential backoff. */
	float GetReconnectDelay() const;
};
