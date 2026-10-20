// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSSessionRecovery.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosEOSSessionRecovery::UKhaaosEOSSessionRecovery()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;

	NormalGracePeriod     = 60.0f;
	MigrationGracePeriod  = 120.0f;
	MaxRecoveriesPerMatch = 3;
	MaxPositionDelta      = 500.0f; // 5m in UE units

	RecoveryState = EKhaaosRecoveryState::Normal;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosEOSSessionRecovery::InitializeComponent()
{
	Super::InitializeComponent();
	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSSessionRecovery: Initialized"));
}

void UKhaaosEOSSessionRecovery::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	// Tick down grace periods
	for (auto& Pair : ActiveRecoveries)
	{
		Pair.Value.RemainingTime -= DeltaTime;
	}

	// Expire any entries that have timed out
	ExpireGracePeriods();
}

// ─── Recovery API ───────────────────────────────────────────────────────────────

void UKhaaosEOSSessionRecovery::OnPlayerDisconnect(const FString& PlayerEosId, const FKhaaosSessionSnapshot& Snapshot)
{
	// Check recovery count limit
	FRecoveryEntry* Existing = ActiveRecoveries.Find(PlayerEosId);
	int32 Count = Existing ? Existing->RecoveryCount + 1 : 1;

	if (Count > MaxRecoveriesPerMatch)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSSessionRecovery: %s exceeded max recoveries (%d)"), *PlayerEosId, MaxRecoveriesPerMatch);
		return;
	}

	FRecoveryEntry Entry;
	Entry.Snapshot = Snapshot;
	Entry.RemainingTime = NormalGracePeriod;
	Entry.RecoveryCount = Count;
	Entry.bInCombat = (Snapshot.Health < 50.0f); // In combat if low health

	ActiveRecoveries.Add(PlayerEosId, Entry);
	RecoveryState = EKhaaosRecoveryState::Disconnected;
	OnRecoveryStateChanged.Broadcast(RecoveryState);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSSessionRecovery: %s disconnected (grace: %.0fs, recovery #%d)"),
		*PlayerEosId, NormalGracePeriod, Count);
}

void UKhaaosEOSSessionRecovery::OnPlayerReconnect(const FString& PlayerEosId, const FOnRecoveryComplete& Callback)
{
	FRecoveryEntry* Entry = ActiveRecoveries.Find(PlayerEosId);
	if (!Entry)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSSessionRecovery: No recovery entry for %s"), *PlayerEosId);
		Callback.ExecuteIfBound(false, PlayerEosId);
		return;
	}

	if (Entry->RemainingTime <= 0.0f)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSSessionRecovery: Grace period expired for %s"), *PlayerEosId);
		Callback.ExecuteIfBound(false, PlayerEosId);
		return;
	}

	if (Entry->bInCombat)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosEOSSessionRecovery: %s was in combat, no recovery"), *PlayerEosId);
		Callback.ExecuteIfBound(false, PlayerEosId);
		ActiveRecoveries.Remove(PlayerEosId);
		return;
	}

	// State restoration would happen here via PlayerState
	ActiveRecoveries.Remove(PlayerEosId);
	RecoveryState = EKhaaosRecoveryState::Rejoined;
	OnRecoveryStateChanged.Broadcast(RecoveryState);

	UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSSessionRecovery: %s rejoined successfully"), *PlayerEosId);
	Callback.ExecuteIfBound(true, PlayerEosId);
}

void UKhaaosEOSSessionRecovery::CancelRecovery(const FString& PlayerEosId)
{
	if (ActiveRecoveries.Remove(PlayerEosId) > 0)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSSessionRecovery: Recovery cancelled for %s"), *PlayerEosId);
	}
}

bool UKhaaosEOSSessionRecovery::IsInGracePeriod(const FString& PlayerEosId) const
{
	const FRecoveryEntry* Entry = ActiveRecoveries.Find(PlayerEosId);
	return Entry && Entry->RemainingTime > 0.0f;
}

float UKhaaosEOSSessionRecovery::GetRemainingGracePeriod(const FString& PlayerEosId) const
{
	const FRecoveryEntry* Entry = ActiveRecoveries.Find(PlayerEosId);
	return Entry ? FMath::Max(0.0f, Entry->RemainingTime) : 0.0f;
}

// ─── Private ────────────────────────────────────────────────────────────────────

void UKhaaosEOSSessionRecovery::ExpireGracePeriods()
{
	TArray<FString> Expired;
	for (auto& Pair : ActiveRecoveries)
	{
		if (Pair.Value.RemainingTime <= 0.0f)
		{
			Expired.Add(Pair.Key);
		}
	}

	for (const FString& PlayerId : Expired)
	{
		ActiveRecoveries.Remove(PlayerId);
		RecoveryState = EKhaaosRecoveryState::Expired;
		OnRecoveryStateChanged.Broadcast(RecoveryState);
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosEOSSessionRecovery: Grace period expired for %s"), *PlayerId);
	}
}
