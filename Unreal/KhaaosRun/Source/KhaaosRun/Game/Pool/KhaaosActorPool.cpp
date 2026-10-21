// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Pool/KhaaosActorPool.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosActorPool::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bAutoExpand = true;
	MaxPoolSize = 500;

	UE_LOG(LogTemp, Log, TEXT("KhaaosActorPool: Initialized (AutoExpand=%d, MaxPool=%d)"), bAutoExpand, MaxPoolSize);
}

void UKhaaosActorPool::Deinitialize()
{
	// Drain all pools
	for (auto& Pair : PoolMap)
	{
		for (AActor* Actor : Pair.Value)
		{
			if (Actor && !Actor->IsPendingKill())
			{
				Actor->Destroy();
			}
		}
	}

	for (auto& Pair : ActiveMap)
	{
		for (AActor* Actor : Pair.Value)
		{
			if (Actor && !Actor->IsPendingKill())
			{
				Actor->Destroy();
			}
		}
	}

	PoolMap.Empty();
	ActiveMap.Empty();
	PeakMap.Empty();
	TotalCreatedMap.Empty();

	UE_LOG(LogTemp, Log, TEXT("KhaaosActorPool: Deinitialized"));
	Super::Deinitialize();
}

// ─── GetPooledActor ───────────────────────────────────────────────────────────

AActor* UKhaaosActorPool::GetPooledActor(TSubclassOf<AActor> ActorClass, const FTransform& SpawnTransform)
{
	if (!ActorClass)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosActorPool::GetPooledActor - Invalid ActorClass"));
		return nullptr;
	}

	// Try to get from pool
	TArray<TObjectPtr<AActor>>* Pool = PoolMap.Find(ActorClass);
	if (Pool && Pool->Num() > 0)
	{
		AActor* Actor = Pool->Pop();
		if (Actor && !Actor->IsPendingKill())
		{
			ReactivateActor(Actor, SpawnTransform);

			// Track as active
			TArray<TObjectPtr<AActor>>& ActiveList = ActiveMap.FindOrAdd(ActorClass);
			ActiveList.Add(Actor);

			// Update peak
			int32& Peak = PeakMap.FindOrAdd(ActorClass, 0);
			Peak = FMath::Max(Peak, ActiveList.Num());

			return Actor;
		}
	}

	// Pool exhausted — auto-expand if enabled
	if (bAutoExpand)
	{
		int32 TotalCount = (Pool ? Pool->Num() : 0);
		TArray<TObjectPtr<AActor>>* Active = ActiveMap.Find(ActorClass);
		TotalCount += (Active ? Active->Num() : 0);

		if (TotalCount < MaxPoolSize)
		{
			AActor* NewActor = CreatePooledActor(ActorClass, SpawnTransform);
			if (NewActor)
			{
				ReactivateActor(NewActor, SpawnTransform);

				TArray<TObjectPtr<AActor>>& ActiveList = ActiveMap.FindOrAdd(ActorClass);
				ActiveList.Add(NewActor);

				int32& Peak = PeakMap.FindOrAdd(ActorClass, 0);
				Peak = FMath::Max(Peak, ActiveList.Num());

				return NewActor;
			}
		}
		else
		{
			UE_LOG(LogTemp, Warning, TEXT("KhaaosActorPool::GetPooledActor - Pool at max capacity (%d) for %s"),
				MaxPoolSize, *ActorClass->GetName());
		}
	}

	// Pool exhausted and cannot expand
	OnPoolExhausted.Broadcast(ActorClass, Pool ? Pool->Num() : 0);
	return nullptr;
}

// ─── ReturnToPool ─────────────────────────────────────────────────────────────

void UKhaaosActorPool::ReturnToPool(AActor* Actor)
{
	if (!Actor || Actor->IsPendingKill())
	{
		return;
	}

	TSubclassOf<AActor> ActorClass = Actor->GetClass();

	// Remove from active list
	TArray<TObjectPtr<AActor>>* ActiveList = ActiveMap.Find(ActorClass);
	if (ActiveList)
	{
		ActiveList->RemoveSingle(Actor);
	}

	// Deactivate and return to pool
	DeactivateActor(Actor);

	TArray<TObjectPtr<AActor>>& Pool = PoolMap.FindOrAdd(ActorClass);
	Pool.Add(Actor);
}

// ─── WarmPool ─────────────────────────────────────────────────────────────────

void UKhaaosActorPool::WarmPool(TSubclassOf<AActor> ActorClass, int32 Count, UWorld* World)
{
	if (!ActorClass || !World || Count <= 0)
	{
		return;
	}

	TArray<TObjectPtr<AActor>>& Pool = PoolMap.FindOrAdd(ActorClass);
	int32& TotalCreated = TotalCreatedMap.FindOrAdd(ActorClass, 0);

	FTransform ZeroTransform = FTransform::Identity;

	for (int32 i = 0; i < Count; ++i)
	{
		int32 TotalCount = Pool.Num();
		TArray<TObjectPtr<AActor>>* Active = ActiveMap.Find(ActorClass);
		TotalCount += (Active ? Active->Num() : 0);

		if (TotalCount >= MaxPoolSize)
		{
			UE_LOG(LogTemp, Log, TEXT("KhaaosActorPool::WarmPool - Reached max pool size (%d)"), MaxPoolSize);
			break;
		}

		AActor* NewActor = CreatePooledActor(ActorClass, ZeroTransform);
		if (NewActor)
		{
			DeactivateActor(NewActor);
			Pool.Add(NewActor);
			TotalCreated++;
		}
	}

	UE_LOG(LogTemp, Log, TEXT("KhaaosActorPool::WarmPool - Warmed %d instances of %s"),
		Count, *ActorClass->GetName());
}

// ─── DrainPool ────────────────────────────────────────────────────────────────

void UKhaaosActorPool::DrainPool(TSubclassOf<AActor> ActorClass)
{
	if (!ActorClass)
	{
		return;
	}

	// Destroy all inactive pooled actors
	TArray<TObjectPtr<AActor>>* Pool = PoolMap.Find(ActorClass);
	if (Pool)
	{
		for (AActor* Actor : *Pool)
		{
			if (Actor && !Actor->IsPendingKill())
			{
				Actor->Destroy();
			}
		}
		Pool->Empty();
	}

	// Destroy all active actors (force drain)
	TArray<TObjectPtr<AActor>>* Active = ActiveMap.Find(ActorClass);
	if (Active)
	{
		for (AActor* Actor : *Active)
		{
			if (Actor && !Actor->IsPendingKill())
			{
				Actor->Destroy();
			}
		}
		Active->Empty();
	}

	PeakMap.Remove(ActorClass);
	TotalCreatedMap.Remove(ActorClass);

	UE_LOG(LogTemp, Log, TEXT("KhaaosActorPool::DrainPool - Drained pool for %s"), *ActorClass->GetName());
}

// ─── GetPoolStats ─────────────────────────────────────────────────────────────

FPoolStats UKhaaosActorPool::GetPoolStats(TSubclassOf<AActor> ActorClass) const
{
	FPoolStats Stats;

	const TArray<TObjectPtr<AActor>>* Pool = PoolMap.Find(ActorClass);
	const TArray<TObjectPtr<AActor>>* Active = ActiveMap.Find(ActorClass);

	Stats.Available = Pool ? Pool->Num() : 0;
	Stats.Active = Active ? Active->Num() : 0;
	Stats.Peak = PeakMap.FindRef(ActorClass, 0);
	Stats.TotalCreated = TotalCreatedMap.FindRef(ActorClass, 0);

	return Stats;
}

// ─── Internal: DeactivateActor ────────────────────────────────────────────────

void UKhaaosActorPool::DeactivateActor(AActor* Actor)
{
	if (!Actor)
	{
		return;
	}

	// Hide the actor
	Actor->SetActorHiddenInGame(true);

	// Disable collision
	Actor->SetActorEnableCollision(false);

	// Disable tick
	Actor->SetActorTickEnabled(false);

	// Move far away (safety)
	Actor->SetActorLocation(FVector(0.0f, 0.0f, -100000.0f));
}

// ─── Internal: ReactivateActor ────────────────────────────────────────────────

void UKhaaosActorPool::ReactivateActor(AActor* Actor, const FTransform& SpawnTransform)
{
	if (!Actor)
	{
		return;
	}

	// Set transform
	Actor->SetActorTransform(SpawnTransform);

	// Show the actor
	Actor->SetActorHiddenInGame(false);

	// Enable collision
	Actor->SetActorEnableCollision(true);

	// Enable tick
	Actor->SetActorTickEnabled(true);
}

// ─── Internal: CreatePooledActor ──────────────────────────────────────────────

AActor* UKhaaosActorPool::CreatePooledActor(TSubclassOf<AActor> ActorClass, const FTransform& SpawnTransform)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		// Try to get world from game instance
		UGameInstance* GI = GetGameInstance();
		if (GI)
		{
			World = GI->GetWorld();
		}
	}

	if (!World)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosActorPool::CreatePooledActor - No World available"));
		return nullptr;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	SpawnParams.bDeferConstruction = false;

	AActor* NewActor = World->SpawnActor<AActor>(ActorClass, SpawnTransform, SpawnParams);
	if (NewActor)
	{
		int32& TotalCreated = TotalCreatedMap.FindOrAdd(ActorClass, 0);
		TotalCreated++;

		UE_LOG(LogTemp, Verbose, TEXT("KhaaosActorPool: Created new pooled actor of class %s"), *ActorClass->GetName());
	}

	return NewActor;
}
