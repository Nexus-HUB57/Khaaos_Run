// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/WorldGen/KhaaosWorldTransition.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosWorldTransitionComponent::UKhaaosWorldTransitionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;

	DefaultConfig = FKhaaosTransitionConfig();
	CurrentConcurrentCount = 0;

	// World pipeline: CIGKV → Barburhen → Priadus → Ckesalth → Arukheea
	WorldPipelineNames = {
		TEXT("CIGKV"),
		TEXT("Barburhen"),
		TEXT("Priadus"),
		TEXT("Ckesalth"),
		TEXT("Arukheea")
	};
}

// ─── Transition Control ─────────────────────────────────────────────────────────

bool UKhaaosWorldTransitionComponent::RequestTransition(
	int32 SourceWorldId, int32 TargetWorldId, const TArray<int32>& PlayerIds)
{
	// Validate world IDs
	if (!IsValidWorldId(SourceWorldId) || !IsValidWorldId(TargetWorldId))
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("WorldTransition::RequestTransition - INVALID world IDs: %d → %d"),
			SourceWorldId, TargetWorldId);
		return false;
	}

	// Check concurrent transition limit
	if (CurrentConcurrentCount >= DefaultConfig.MaxConcurrentTransitions)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("WorldTransition::RequestTransition - CONCURRENT LIMIT reached (%d/%d)"),
			CurrentConcurrentCount, DefaultConfig.MaxConcurrentTransitions);
		return false;
	}

	// Check if target already has an active transition
	if (FKhaaosWorldTransitionState* Existing = ActiveTransitions.Find(TargetWorldId))
	{
		if (Existing->bIsActive)
		{
			UE_LOG(LogKhaaosRun, Warning, TEXT("WorldTransition::RequestTransition - Target world %d already has active transition"),
				TargetWorldId);
			return false;
		}
	}

	// Create transition state
	FKhaaosWorldTransitionState State;
	State.Phase = EKhaaosTransitionPhase::PreTransition;
	State.SourceWorldId = SourceWorldId;
	State.TargetWorldId = TargetWorldId;
	State.ElapsedTime = 0.0f;
	State.PlayersInTransit = PlayerIds;
	State.bIsActive = true;

	// Store transition config
	FKhaaosTransitionConfig Config;
	Config.SourceWorldId = SourceWorldId;
	Config.TargetWorldId = TargetWorldId;
	Config.TransitionDurationSeconds = DefaultConfig.TransitionDurationSeconds;
	Config.bAllowReturn = DefaultConfig.bAllowReturn;
	Config.MaxConcurrentTransitions = DefaultConfig.MaxConcurrentTransitions;

	ActiveTransitions.Add(TargetWorldId, State);
	TransitionConfigs.Add(TargetWorldId, Config);
	++CurrentConcurrentCount;

	// Broadcast
	OnWorldTransitionStarted.Broadcast(SourceWorldId, TargetWorldId);

	UE_LOG(LogKhaaosRun, Log, TEXT("WorldTransition: Started %d → %d (%d players, phase=PreTransition)"),
		SourceWorldId, TargetWorldId, PlayerIds.Num());

	return true;
}

FKhaaosWorldTransitionState UKhaaosWorldTransitionComponent::GetTransitionState(int32 WorldId) const
{
	if (const FKhaaosWorldTransitionState* State = ActiveTransitions.Find(WorldId))
	{
		return *State;
	}

	// Return idle state if no transition exists
	return FKhaaosWorldTransitionState();
}

bool UKhaaosWorldTransitionComponent::CancelTransition(int32 WorldId)
{
	FKhaaosWorldTransitionState* State = ActiveTransitions.Find(WorldId);
	if (!State || !State->bIsActive)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("WorldTransition::CancelTransition - No active transition for world %d"), WorldId);
		return false;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("WorldTransition: Cancelled transition for world %d (was %d → %d)"),
		WorldId, State->SourceWorldId, State->TargetWorldId);

	State->bIsActive = false;
	State->Phase = EKhaaosTransitionPhase::Idle;
	State->PlayersInTransit.Empty();
	--CurrentConcurrentCount;

	ActiveTransitions.Remove(WorldId);
	TransitionConfigs.Remove(WorldId);

	return true;
}

void UKhaaosWorldTransitionComponent::CompleteTransition(int32 WorldId)
{
	FKhaaosWorldTransitionState* State = ActiveTransitions.Find(WorldId);
	if (!State || !State->bIsActive)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("WorldTransition::CompleteTransition - No active transition for world %d"), WorldId);
		return;
	}

	const int32 SourceId = State->SourceWorldId;
	const int32 TargetId = State->TargetWorldId;

	UE_LOG(LogKhaaosRun, Log, TEXT("WorldTransition: Completed %d → %d"), SourceId, TargetId);

	// Broadcast completion
	OnWorldTransitionCompleted.Broadcast(SourceId, TargetId);

	// Cleanup
	State->bIsActive = false;
	State->Phase = EKhaaosTransitionPhase::Idle;
	State->PlayersInTransit.Empty();
	--CurrentConcurrentCount;

	ActiveTransitions.Remove(WorldId);
	TransitionConfigs.Remove(WorldId);
}

TArray<FString> UKhaaosWorldTransitionComponent::GetWorldPipeline() const
{
	return WorldPipelineNames;
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosWorldTransitionComponent::TickComponent(
	float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (GetOwnerRole() != ROLE_Authority) return;

	// Advance all active transitions
	TArray<int32> WorldIds;
	ActiveTransitions.GetKeys(WorldIds);

	for (const int32 WorldId : WorldIds)
	{
		AdvanceTransitionPhase(WorldId, DeltaTime);
	}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

bool UKhaaosWorldTransitionComponent::IsValidWorldId(int32 WorldId) const
{
	return WorldId >= 0 && WorldId < WorldPipelineNames.Num();
}

void UKhaaosWorldTransitionComponent::AdvanceTransitionPhase(int32 WorldId, float DeltaTime)
{
	FKhaaosWorldTransitionState* State = ActiveTransitions.Find(WorldId);
	if (!State || !State->bIsActive) return;

	const FKhaaosTransitionConfig* Config = TransitionConfigs.Find(WorldId);
	const float Duration = Config ? Config->TransitionDurationSeconds : DefaultConfig.TransitionDurationSeconds;

	State->ElapsedTime += DeltaTime;

	// Phase progression based on elapsed time
	// PreTransition:  0.0 - 1.0s  (countdown)
	// Loading:        1.0 - 3.0s  (streaming)
	// Active:         3.0 - Duration (players moving)
	// PostTransition:  Duration+   (cleanup)
	const float PreTransitionEnd = 1.0f;
	const float LoadingEnd = 3.0f;
	const float ActiveEnd = Duration;

	switch (State->Phase)
	{
	case EKhaaosTransitionPhase::PreTransition:
		if (State->ElapsedTime >= PreTransitionEnd)
		{
			State->Phase = EKhaaosTransitionPhase::Loading;
			UE_LOG(LogKhaaosRun, Log, TEXT("WorldTransition: World %d phase → Loading"), WorldId);
		}
		break;

	case EKhaaosTransitionPhase::Loading:
		if (State->ElapsedTime >= LoadingEnd)
		{
			State->Phase = EKhaaosTransitionPhase::Active;
			UE_LOG(LogKhaaosRun, Log, TEXT("WorldTransition: World %d phase → Active (%d players in transit)"),
				WorldId, State->PlayersInTransit.Num());
		}
		break;

	case EKhaaosTransitionPhase::Active:
		if (State->ElapsedTime >= ActiveEnd)
		{
			State->Phase = EKhaaosTransitionPhase::PostTransition;
			UE_LOG(LogKhaaosRun, Log, TEXT("WorldTransition: World %d phase → PostTransition"), WorldId);
		}
		break;

	case EKhaaosTransitionPhase::PostTransition:
		// Auto-complete after a brief cleanup period
		CompleteTransition(WorldId);
		break;

	default:
		break;
	}
}
