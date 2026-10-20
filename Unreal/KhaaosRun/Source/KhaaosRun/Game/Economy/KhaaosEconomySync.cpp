// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Economy/KhaaosEconomySync.h"
#include "KhaaosRun.h"
#include "WebSocketsModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "TimerManager.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosEconomySync::UKhaaosEconomySync()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;

	WsServerUrl         = TEXT("ws://localhost:3001/ws/economy");
	ReconnectBaseDelay  = 1.0f;
	ReconnectMaxDelay   = 30.0f;
	HeartbeatInterval   = 30.0f;
	MaxOfflineQueueSize = 100;
	MaxMessagesPerSecond = 60;

	SyncState       = EKhaaosSyncState::Disconnected;
	SequenceCounter = 0;
	ReconnectAttempt = 0;
	ReconnectTimer   = 0.0f;
	HeartbeatTimer   = 0.0f;
	MessagesThisSecond = 0;
	RateLimitTimer     = 0.0f;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosEconomySync::InitializeComponent()
{
	Super::InitializeComponent();
}

void UKhaaosEconomySync::BeginPlay()
{
	Super::BeginPlay();
}

void UKhaaosEconomySync::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	Disconnect();
	Super::EndPlay(EndPlayReason);
}

void UKhaaosEconomySync::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	// Rate limit reset
	RateLimitTimer += DeltaTime;
	if (RateLimitTimer >= 1.0f)
	{
		MessagesThisSecond = 0;
		RateLimitTimer = 0.0f;
	}

	// Reconnect logic
	if (SyncState == EKhaaosSyncState::Reconnecting)
	{
		ReconnectTimer -= DeltaTime;
		if (ReconnectTimer <= 0.0f)
		{
			Connect(WsServerUrl);
		}
	}

	// Heartbeat
	if (SyncState == EKhaaosSyncState::Connected)
	{
		HeartbeatTimer += DeltaTime;
		if (HeartbeatTimer >= HeartbeatInterval)
		{
			HeartbeatTimer = 0.0f;
			TSharedPtr<FJsonObject> Msg = MakeShared<FJsonObject>();
			Msg->SetStringField(TEXT("type"), TEXT("heartbeat"));
			Msg->SetNumberField(TEXT("ts"), FDateTime::UtcNow().ToUnixTimestamp());
			FString Out;
			TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
			FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
			SendMessage(Out);
		}
	}
}

// ─── Connection ─────────────────────────────────────────────────────────────────

void UKhaaosEconomySync::Connect(const FString& ServerUrl)
{
	WsServerUrl = ServerUrl;

	if (SyncState == EKhaaosSyncState::Connected || SyncState == EKhaaosSyncState::Connecting)
	{
		return;
	}

	SetSyncState(EKhaaosSyncState::Connecting);

	if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
	{
		FModuleManager::Get().LoadModule("WebSockets");
	}

	WebSocket = FWebSocketsModule::Get().CreateWebSocket(WsServerUrl);

	WebSocket->OnConnected().AddLambda([this]() { OnWebSocketConnected(); });
	WebSocket->OnConnectionError().AddLambda([this](const FString& Err) { OnWebSocketError(Err); });
	WebSocket->OnClosed().AddLambda([this](int32 Code, const FString& Reason, bool bClean) { OnWebSocketClosed(Code, Reason, bClean); });
	WebSocket->OnMessage().AddLambda([this](const FString& Msg) { OnWebSocketMessage(Msg); });

	WebSocket->Connect();

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEconomySync: Connecting to %s"), *WsServerUrl);
}

void UKhaaosEconomySync::Disconnect()
{
	if (WebSocket.IsValid())
	{
		WebSocket->Close(1000, TEXT("Normal closure"));
		WebSocket.Reset();
	}
	SetSyncState(EKhaaosSyncState::Disconnected);
	ReconnectAttempt = 0;
}

// ─── Inventory Sync ─────────────────────────────────────────────────────────────

void UKhaaosEconomySync::PushInventoryDelta(const FKhaaosInventorySync& Delta)
{
	TSharedPtr<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("type"), TEXT("inventory_delta"));
	Msg->SetStringField(TEXT("playerEosId"), Delta.PlayerEosId);
	Msg->SetNumberField(TEXT("seq"), static_cast<double>(Delta.SequenceNumber));

	TArray<TSharedPtr<FJsonValue>> Slots;
	for (int32 Slot : Delta.ChangedSlots)
	{
		Slots.Add(MakeShared<FJsonValueNumber>(Slot));
	}
	Msg->SetArrayField(TEXT("slots"), Slots);

	TArray<TSharedPtr<FJsonValue>> Items;
	for (const FString& Item : Delta.ItemIds)
	{
		Items.Add(MakeShared<FJsonValueString>(Item));
	}
	Msg->SetArrayField(TEXT("items"), Items);

	TArray<TSharedPtr<FJsonValue>> Qtys;
	for (int32 Qty : Delta.Quantities)
	{
		Qtys.Add(MakeShared<FJsonValueNumber>(Qty));
	}
	Msg->SetArrayField(TEXT("quantities"), Qtys);

	FString Out;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
	SendMessage(Out);
}

void UKhaaosEconomySync::RequestFullSync(const FString& PlayerEosId)
{
	TSharedPtr<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("type"), TEXT("full_sync_request"));
	Msg->SetStringField(TEXT("playerEosId"), PlayerEosId);
	Msg->SetNumberField(TEXT("seq"), static_cast<double>(++SequenceCounter));

	FString Out;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
	SendMessage(Out);
}

// ─── KRC Balance ────────────────────────────────────────────────────────────────

void UKhaaosEconomySync::RequestKRCBalance(const FString& PlayerEosId)
{
	TSharedPtr<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("type"), TEXT("krc_balance_request"));
	Msg->SetStringField(TEXT("playerEosId"), PlayerEosId);
	Msg->SetNumberField(TEXT("seq"), static_cast<double>(++SequenceCounter));

	FString Out;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
	SendMessage(Out);
}

void UKhaaosEconomySync::DeductKRC(const FString& PlayerEosId, int64 Amount, const FString& Reason)
{
	TSharedPtr<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("type"), TEXT("krc_deduct"));
	Msg->SetStringField(TEXT("playerEosId"), PlayerEosId);
	Msg->SetNumberField(TEXT("amount"), static_cast<double>(Amount));
	Msg->SetStringField(TEXT("reason"), Reason);
	Msg->SetNumberField(TEXT("seq"), static_cast<double>(++SequenceCounter));

	FString Out;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
	SendMessage(Out);
}

// ─── Private ────────────────────────────────────────────────────────────────────

void UKhaaosEconomySync::SetSyncState(EKhaaosSyncState NewState)
{
	if (NewState != SyncState)
	{
		EKhaaosSyncState OldState = SyncState;
		SyncState = NewState;
		OnSyncStateChanged.Broadcast(NewState, OldState);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEconomySync: State %d → %d"), static_cast<int32>(OldState), static_cast<int32>(NewState));
	}
}

void UKhaaosEconomySync::SendMessage(const FString& Json)
{
	// Rate limit check
	if (MessagesThisSecond >= MaxMessagesPerSecond)
	{
		if (OfflineQueue.Num() < MaxOfflineQueueSize)
		{
			OfflineQueue.Add(Json);
		}
		return;
	}

	if (SyncState == EKhaaosSyncState::Connected && WebSocket.IsValid())
	{
		WebSocket->Send(Json);
		++MessagesThisSecond;
	}
	else
	{
		// Queue for later
		if (OfflineQueue.Num() < MaxOfflineQueueSize)
		{
			OfflineQueue.Add(Json);
		}
	}
}

void UKhaaosEconomySync::OnWebSocketConnected()
{
	SetSyncState(EKhaaosSyncState::Connected);
	ReconnectAttempt = 0;
	HeartbeatTimer = 0.0f;
	FlushOfflineQueue();
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEconomySync: WebSocket connected"));
}

void UKhaaosEconomySync::OnWebSocketError(const FString& Error)
{
	SetSyncState(EKhaaosSyncState::Error);
	OnSyncError.Broadcast(Error);
	UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosEconomySync: WebSocket error: %s"), *Error);

	// Trigger reconnect
	ReconnectAttempt++;
	ReconnectTimer = GetReconnectDelay();
	SetSyncState(EKhaaosSyncState::Reconnecting);
}

void UKhaaosEconomySync::OnWebSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean)
{
	if (bWasClean)
	{
		SetSyncState(EKhaaosSyncState::Disconnected);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEconomySync: WebSocket closed cleanly (%d: %s)"), StatusCode, *Reason);
	}
	else
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEconomySync: WebSocket closed unexpectedly (%d: %s)"), StatusCode, *Reason);
		ReconnectAttempt++;
		ReconnectTimer = GetReconnectDelay();
		SetSyncState(EKhaaosSyncState::Reconnecting);
	}
}

void UKhaaosEconomySync::OnWebSocketMessage(const FString& Message)
{
	TSharedPtr<FJsonObject> JsonObj;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
	if (!FJsonSerializer::Deserialize(Reader, JsonObj) || !JsonObj.IsValid())
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEconomySync: Invalid JSON message"));
		return;
	}

	HandleIncomingMessage(JsonObj);
}

void UKhaaosEconomySync::HandleIncomingMessage(const TSharedPtr<FJsonObject>& JsonObj)
{
	FString Type;
	if (!JsonObj->TryGetStringField(TEXT("type"), Type))
	{
		return;
	}

	if (Type == TEXT("inventory_sync"))
	{
		FKhaaosInventorySync SyncData;
		SyncData.PlayerEosId = JsonObj->GetStringField(TEXT("playerEosId"));
		SyncData.SequenceNumber = static_cast<int64>(JsonObj->GetNumberField(TEXT("seq")));

		const TArray<TSharedPtr<FJsonValue>>* SlotsArr;
		if (JsonObj->TryGetArrayField(TEXT("slots"), SlotsArr))
		{
			for (const auto& V : *SlotsArr) SyncData.ChangedSlots.Add(static_cast<int32>(V->AsNumber()));
		}
		const TArray<TSharedPtr<FJsonValue>>* ItemsArr;
		if (JsonObj->TryGetArrayField(TEXT("items"), ItemsArr))
		{
			for (const auto& V : *ItemsArr) SyncData.ItemIds.Add(V->AsString());
		}
		const TArray<TSharedPtr<FJsonValue>>* QtysArr;
		if (JsonObj->TryGetArrayField(TEXT("quantities"), QtysArr))
		{
			for (const auto& V : *QtysArr) SyncData.Quantities.Add(static_cast<int32>(V->AsNumber()));
		}

		OnInventorySynced.Broadcast(true, SyncData);
	}
	else if (Type == TEXT("krc_balance"))
	{
		FKhaaosKRCBalance Balance;
		Balance.PlayerEosId = JsonObj->GetStringField(TEXT("playerEosId"));
		Balance.Balance = static_cast<int64>(JsonObj->GetNumberField(TEXT("balance")));
		Balance.LedgerHash = JsonObj->GetStringField(TEXT("ledgerHash"));
		Balance.LastSyncTimestamp = static_cast<int64>(JsonObj->GetNumberField(TEXT("ts")));

		CachedBalances.Add(Balance.PlayerEosId, Balance);
		OnKRCBalanceUpdated.Broadcast(true, Balance);
	}
	else if (Type == TEXT("error"))
	{
		FString ErrMsg = JsonObj->GetStringField(TEXT("message"));
		OnSyncError.Broadcast(ErrMsg);
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEconomySync: Server error: %s"), *ErrMsg);
	}
	else if (Type == TEXT("heartbeat_ack"))
	{
		// Heartbeat acknowledged, connection alive
	}
}

void UKhaaosEconomySync::FlushOfflineQueue()
{
	int32 Flushed = 0;
	for (const FString& Msg : OfflineQueue)
	{
		if (WebSocket.IsValid() && SyncState == EKhaaosSyncState::Connected)
		{
			WebSocket->Send(Msg);
			++Flushed;
		}
	}
	OfflineQueue.Empty();
	if (Flushed > 0)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEconomySync: Flushed %d offline messages"), Flushed);
	}
}

float UKhaaosEconomySync::GetReconnectDelay() const
{
	// Exponential backoff: base * 2^attempt, capped at max
	float Delay = ReconnectBaseDelay * FMath::Pow(2.0f, static_cast<float>(ReconnectAttempt));
	return FMath::Min(Delay, ReconnectMaxDelay);
}
