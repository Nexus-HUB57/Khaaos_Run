// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Pool/KhaaosSignificanceManager.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosSignificanceSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bAutoDisableTick = true;
	bAutoReturnToPool = false; // Off by default — enable when pool integration is ready
	LowNetUpdateFrequency = 2.0f;  // 2 updates/sec for insignificant actors
	DefaultNetUpdateFrequency = 30.0f; // Default UE replication rate

	// Initialize distance thresholds
	LevelThresholds.Add(EKhaaosSignificanceLevel::Critical, 500.0f);
	LevelThresholds.Add(EKhaaosSignificanceLevel::High, 1500.0f);
	LevelThresholds.Add(EKhaaosSignificanceLevel::Medium, 3000.0f);
	LevelThresholds.Add(EKhaaosSignificanceLevel::Low, 5000.0f);
	LevelThresholds.Add(EKhaaosSignificanceLevel::Insignificant, FLT_MAX);

	UE_LOG(LogTemp, Log, TEXT("KhaaosSignificanceSubsystem: Initialized"));
}

void UKhaaosSignificanceSubsystem::Deinitialize()
{
	RegisteredActors.Empty();
	ViewerPositions.Empty();
	ViewerActors.Empty();

	UE_LOG(LogTemp, Log, TEXT("KhaaosSignificanceSubsystem: Deinitialized"));
	Super::Deinitialize();
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

void UKhaaosSignificanceSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Update viewer positions from local players
	UpdateViewerPositions();

	if (ViewerPositions.Num() == 0)
	{
		return; // No viewers — skip significance update
	}

	// Evaluate all registered actors
	for (auto& Pair : RegisteredActors)
	{
		AActor* Actor = Pair.Key;
		FSignificanceInfo& Info = Pair.Value;

		if (!Actor || Actor->IsPendingKill())
		{
			continue;
		}

		// Find closest viewer
		float ClosestDistSq = FLT_MAX;
		AActor* ClosestViewer = nullptr;
		FVector ActorLocation = Actor->GetActorLocation();

		for (int32 i = 0; i < ViewerPositions.Num(); ++i)
		{
			float DistSq = FVector::DistSquared(ActorLocation, ViewerPositions[i]);
			if (DistSq < ClosestDistSq)
			{
				ClosestDistSq = DistSq;
				if (i < ViewerActors.Num())
				{
					ClosestViewer = ViewerActors[i];
				}
			}
		}

		float ClosestDist = FMath::Sqrt(ClosestDistSq);
		Info.CurrentDistance = ClosestDist;
		Info.ViewerClosest = ClosestViewer;
		Info.bIsVisible = (ClosestDist < 5000.0f); // Visible if within Low threshold

		// Calculate new significance level
		EKhaaosSignificanceLevel NewLevel = CalculateSignificanceLevel(ClosestDist);

		// Check for level change
		if (NewLevel != Info.Level)
		{
			Info.PreviousLevel = Info.Level;
			Info.Level = NewLevel;

			// Apply optimizations
			ApplySignificanceOptimizations(Actor, NewLevel, Info.PreviousLevel);

			// Broadcast change
			OnSignificanceChanged.Broadcast(Actor, Info.PreviousLevel, NewLevel);

			UE_LOG(LogTemp, Verbose, TEXT("KhaaosSignificance: %s changed from %d to %d (dist=%.1f)"),
				*Actor->GetName(), static_cast<int32>(Info.PreviousLevel), static_cast<int32>(NewLevel), ClosestDist);
		}
	}
}

TStatId UKhaaosSignificanceSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_STAT_ID_STATIC("KhaaosSignificance", STATGROUP_Tickables);
}

// ─── RegisterSignificantActor ─────────────────────────────────────────────────

void UKhaaosSignificanceSubsystem::RegisterSignificantActor(AActor* Actor, EKhaaosSignificanceLevel Level)
{
	if (!Actor || RegisteredActors.Contains(Actor))
	{
		return;
	}

	FSignificanceInfo Info;
	Info.Actor = Actor;
	Info.Level = Level;
	Info.PreviousLevel = Level;
	Info.bIsVisible = true;

	RegisteredActors.Add(Actor, Info);

	UE_LOG(LogTemp, Log, TEXT("KhaaosSignificance: Registered %s at level %d"),
		*Actor->GetName(), static_cast<int32>(Level));
}

// ─── UnregisterSignificantActor ───────────────────────────────────────────────

void UKhaaosSignificanceSubsystem::UnregisterSignificantActor(AActor* Actor)
{
	if (!Actor)
	{
		return;
	}

	if (RegisteredActors.Remove(Actor) > 0)
	{
		UE_LOG(LogTemp, Log, TEXT("KhaaosSignificance: Unregistered %s"), *Actor->GetName());
	}
}

// ─── GetActorsInRange ─────────────────────────────────────────────────────────

TArray<AActor*> UKhaaosSignificanceSubsystem::GetActorsInRange(float Radius, FVector Center) const
{
	TArray<AActor*> Result;
	float RadiusSq = Radius * Radius;

	for (const auto& Pair : RegisteredActors)
	{
		AActor* Actor = Pair.Key;
		if (Actor && !Actor->IsPendingKill())
		{
			float DistSq = FVector::DistSquared(Actor->GetActorLocation(), Center);
			if (DistSq <= RadiusSq)
			{
				Result.Add(Actor);
			}
		}
	}

	return Result;
}

// ─── GetActorSignificanceLevel ────────────────────────────────────────────────

EKhaaosSignificanceLevel UKhaaosSignificanceSubsystem::GetActorSignificanceLevel(AActor* Actor) const
{
	const FSignificanceInfo* Info = RegisteredActors.Find(Actor);
	if (Info)
	{
		return Info->Level;
	}
	return EKhaaosSignificanceLevel::Insignificant;
}

// ─── UpdateViewerPositions ────────────────────────────────────────────────────

void UKhaaosSignificanceSubsystem::UpdateViewerPositions()
{
	ViewerPositions.Empty();
	ViewerActors.Empty();

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Get all local player controllers
	for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
	{
		APlayerController* PC = It->Get();
		if (PC && PC->IsLocalPlayerController())
		{
			APawn* Pawn = PC->GetPawnOrSpectator();
			if (Pawn)
			{
				ViewerPositions.Add(Pawn->GetActorLocation());
				ViewerActors.Add(Pawn);
			}
		}
	}
}

// ─── CalculateSignificanceLevel ───────────────────────────────────────────────

EKhaaosSignificanceLevel UKhaaosSignificanceSubsystem::CalculateSignificanceLevel(float Distance) const
{
	const float* Critical = LevelThresholds.Find(EKhaaosSignificanceLevel::Critical);
	const float* High = LevelThresholds.Find(EKhaaosSignificanceLevel::High);
	const float* Medium = LevelThresholds.Find(EKhaaosSignificanceLevel::Medium);
	const float* Low = LevelThresholds.Find(EKhaaosSignificanceLevel::Low);

	if (Critical && Distance < *Critical) return EKhaaosSignificanceLevel::Critical;
	if (High && Distance < *High) return EKhaaosSignificanceLevel::High;
	if (Medium && Distance < *Medium) return EKhaaosSignificanceLevel::Medium;
	if (Low && Distance < *Low) return EKhaaosSignificanceLevel::Low;

	return EKhaaosSignificanceLevel::Insignificant;
}

// ─── ApplySignificanceOptimizations ───────────────────────────────────────────

void UKhaaosSignificanceSubsystem::ApplySignificanceOptimizations(AActor* Actor, EKhaaosSignificanceLevel NewLevel, EKhaaosSignificanceLevel OldLevel)
{
	if (!Actor)
	{
		return;
	}

	const bool bWasInsignificant = (OldLevel == EKhaaosSignificanceLevel::Insignificant);
	const bool bIsInsignificant = (NewLevel == EKhaaosSignificanceLevel::Insignificant);

	if (bAutoDisableTick)
	{
		if (bIsInsignificant && !bWasInsignificant)
		{
			// Dropping to insignificant — disable tick
			Actor->SetActorTickEnabled(false);
		}
		else if (!bIsInsignificant && bWasInsignificant)
		{
			// Rising from insignificant — restore tick
			Actor->SetActorTickEnabled(true);
		}
	}

	// Adjust NetUpdateFrequency based on significance
	if (Actor->HasAuthority())
	{
		if (bIsInsignificant)
		{
			Actor->NetUpdateFrequency = LowNetUpdateFrequency;
		}
		else if (bWasInsignificant)
		{
			Actor->NetUpdateFrequency = DefaultNetUpdateFrequency;
		}
	}

	// Adjust tick interval for Medium/Low significance
	if (NewLevel == EKhaaosSignificanceLevel::Low)
	{
		Actor->SetActorTickInterval(0.1f); // 10 Hz
	}
	else if (NewLevel == EKhaaosSignificanceLevel::Medium)
	{
		Actor->SetActorTickInterval(0.033f); // 30 Hz
	}
	else if (!bIsInsignificant)
	{
		Actor->SetActorTickInterval(0.0f); // Every frame
	}
}
