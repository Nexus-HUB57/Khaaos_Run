// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/VFX/KhaaosVFXManager.h"
#include "NiagaraFunctionLibrary.h"
#include "SignificanceManager.h"
#include "Engine/World.h"
#include "TimerManager.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosVFXManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	if (UWorld* World = GetWorld())
	{
		SignificanceManager = World->GetSubsystem<USignificanceManager>();
	}

	// Default pool configuration
	PoolConfig.MaxPoolSize = 32;
	PoolConfig.AutoReleaseThreshold = 5.0f;
	PoolConfig.bPoolingEnabled = true;

	bInitialized = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosVFXManager: Initialized with SignificanceManager=%s"),
		SignificanceManager ? TEXT("Valid") : TEXT("Null"));
}

void UKhaaosVFXManager::Deinitialize()
{
	// Stop and destroy all active VFX
	for (auto It = ActiveVFXComponents.CreateIterator(); It; ++It)
	{
		if (It.Value().IsValid())
		{
			It.Value()->DestroyComponent();
		}
	}
	ActiveVFXComponents.Empty();
	VFXRegistry.Empty();

	if (SignificanceManager.IsValid())
	{
		SignificanceManager = nullptr;
	}

	bInitialized = false;
	Super::Deinitialize();
}

void UKhaaosVFXManager::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Clean up expired weak pointers periodically
	for (auto It = ActiveVFXComponents.CreateIterator(); It; ++It)
	{
		if (!It.Value().IsValid())
		{
			It.RemoveCurrent();
		}
	}
}

TStatId UKhaaosVFXManager::GetStatId() const
{
	RETURN_QUICK_DECLARE_STAT_ID(KhaaosVFXManager);
}

// ─── VFX Registry ────────────────────────────────────────────────────────────

void UKhaaosVFXManager::RegisterVFX(FName VFXName, TSoftObjectPtr<UNiagaraSystem> NiagaraSystem)
{
	if (!VFXName.IsValid() || !NiagaraSystem.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosVFXManager::RegisterVFX: Invalid name or system for '%s'"), *VFXName.ToString());
		return;
	}

	VFXRegistry.Add(VFXName, NiagaraSystem);
	UE_LOG(LogTemp, Log, TEXT("KhaaosVFXManager: Registered VFX '%s'"), *VFXName.ToString());
}

void UKhaaosVFXManager::UnregisterVFX(FName VFXName)
{
	VFXRegistry.Remove(VFXName);

	// Stop all active instances of this VFX
	StopAllVFX(VFXName, true);
}

bool UKhaaosVFXManager::IsVFXRegistered(FName VFXName) const
{
	return VFXRegistry.Contains(VFXName);
}

// ─── VFX Spawning ────────────────────────────────────────────────────────────

UNiagaraComponent* UKhaaosVFXManager::SpawnVFXAtLocation(
	FName VFXName,
	const FVector& WorldLocation,
	const FRotator& WorldRotation,
	const FKhaaosVFXSpawnParams& SpawnParams)
{
	if (!bInitialized || !VFXName.IsValid())
	{
		return nullptr;
	}

	// Look up the Niagara system
	TSoftObjectPtr<UNiagaraSystem>* SoftSys = VFXRegistry.Find(VFXName);
	TSoftObjectPtr<UNiagaraSystem> SystemRef = SoftSys ? *SoftSys : SpawnParams.NiagaraSystem;

	UNiagaraSystem* NiagaraSys = ResolveNiagaraSystem(SystemRef);
	if (!NiagaraSys)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosVFXManager::SpawnVFXAtLocation: Failed to resolve Niagara system for '%s'"), *VFXName.ToString());
		return nullptr;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return nullptr;
	}

	// Spawn the Niagara component
	UNiagaraComponent* NiagaraComp = UNiagaraFunctionLibrary::SpawnSystemAtLocation(
		World,
		NiagaraSys,
		WorldLocation,
		WorldRotation,
		FVector::OneVector,
		SpawnParams.bAutoDestroy,
		SpawnParams.bAutoActivate,
		SpawnParams.bUsePooling ? ENCPoolMethod::AutoRelease : ENCPoolMethod::None,
		SpawnParams.bAutoDestroy
	);

	if (!NiagaraComp)
	{
		return nullptr;
	}

	// Apply duration override
	if (SpawnParams.DurationOverride > 0.0f)
	{
		NiagaraComp->SetDuration(SpawnParams.DurationOverride);
	}

	// Track the active component
	TrackActiveVFX(VFXName, NiagaraComp);

	// Register with significance manager for distance-based culling
	if (SignificanceManager.IsValid() && SpawnParams.PoolId.IsValid())
	{
		SignificanceManager->RegisterObject(NiagaraComp, SpawnParams.PoolId, CalculateVFXSignificance, PostSignificanceSetup);
	}

	return NiagaraComp;
}

UNiagaraComponent* UKhaaosVFXManager::SpawnVFXAttached(
	FName VFXName,
	USceneComponent* AttachComponent,
	FName AttachPointName,
	const FVector& LocationOffset,
	const FRotator& RotationOffset,
	EAttachLocation::Type AttachLocationType,
	const FKhaaosVFXSpawnParams& SpawnParams)
{
	if (!bInitialized || !VFXName.IsValid() || !AttachComponent)
	{
		return nullptr;
	}

	// Look up the Niagara system
	TSoftObjectPtr<UNiagaraSystem>* SoftSys = VFXRegistry.Find(VFXName);
	TSoftObjectPtr<UNiagaraSystem> SystemRef = SoftSys ? *SoftSys : SpawnParams.NiagaraSystem;

	UNiagaraSystem* NiagaraSys = ResolveNiagaraSystem(SystemRef);
	if (!NiagaraSys)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosVFXManager::SpawnVFXAttached: Failed to resolve Niagara system for '%s'"), *VFXName.ToString());
		return nullptr;
	}

	// Spawn the Niagara component attached
	UNiagaraComponent* NiagaraComp = UNiagaraFunctionLibrary::SpawnSystemAttached(
		NiagaraSys,
		AttachComponent,
		AttachPointName,
		LocationOffset,
		RotationOffset,
		AttachLocationType,
		SpawnParams.bAutoDestroy,
		SpawnParams.bAutoActivate,
		SpawnParams.bUsePooling ? ENCPoolMethod::AutoRelease : ENCPoolMethod::None,
		SpawnParams.bAutoDestroy
	);

	if (!NiagaraComp)
	{
		return nullptr;
	}

	// Apply duration override
	if (SpawnParams.DurationOverride > 0.0f)
	{
		NiagaraComp->SetDuration(SpawnParams.DurationOverride);
	}

	// Track the active component
	TrackActiveVFX(VFXName, NiagaraComp);

	// Register with significance manager for distance-based culling
	if (SignificanceManager.IsValid() && SpawnParams.PoolId.IsValid())
	{
		SignificanceManager->RegisterObject(NiagaraComp, SpawnParams.PoolId, CalculateVFXSignificance, PostSignificanceSetup);
	}

	return NiagaraComp;
}

// ─── VFX Control ─────────────────────────────────────────────────────────────

void UKhaaosVFXManager::StopVFX(UNiagaraComponent* NiagaraComp, bool bDestroy)
{
	if (!NiagaraComp)
	{
		return;
	}

	NiagaraComp->DeactivateImmediate();

	// Unregister from significance manager
	if (SignificanceManager.IsValid())
	{
		SignificanceManager->UnregisterObject(NiagaraComp);
	}

	UntrackActiveVFX(NiagaraComp);

	if (bDestroy)
	{
		NiagaraComp->DestroyComponent();
	}
}

void UKhaaosVFXManager::StopAllVFX(FName VFXName, bool bDestroy)
{
	TArray<TWeakObjectPtr<UNiagaraComponent>> Components;
	ActiveVFXComponents.MultiFind(VFXName, Components);

	for (TWeakObjectPtr<UNiagaraComponent>& WeakComp : Components)
	{
		if (WeakComp.IsValid())
		{
			StopVFX(WeakComp.Get(), bDestroy);
		}
	}

	ActiveVFXComponents.Remove(VFXName);
}

void UKhaaosVFXManager::SetVFXParam(UNiagaraComponent* NiagaraComp, const FString& ParamName, float Value)
{
	if (NiagaraComp)
	{
		NiagaraComp->SetVariableFloat(FName(*ParamName), Value);
	}
}

void UKhaaosVFXManager::SetVFXParamVector(UNiagaraComponent* NiagaraComp, const FString& ParamName, const FVector& Value)
{
	if (NiagaraComp)
	{
		NiagaraComp->SetVariableVec3(FName(*ParamName), Value);
	}
}

void UKhaaosVFXManager::SetVFXParamColor(UNiagaraComponent* NiagaraComp, const FString& ParamName, const FLinearColor& Value)
{
	if (NiagaraComp)
	{
		NiagaraComp->SetVariableLinearColor(FName(*ParamName), Value);
	}
}

// ─── Significance Manager Integration ────────────────────────────────────────

float UKhaaosVFXManager::CalculateVFXSignificance(USignificanceManager::FManagedObjectInfo* ObjectInfo, float& OutRank)
{
	if (!ObjectInfo || !ObjectInfo->GetObject())
	{
		OutRank = 100.0f;
		return 0.0f;
	}

	// Distance-based significance: closer = more significant
	// OutRank controls LOD tier; lower rank = higher priority
	const AActor* Owner = Cast<AActor>(ObjectInfo->GetObject());
	if (Owner)
	{
		// Rank is derived from distance - closer objects get lower (higher priority) rank
		const float DistanceSq = Owner->GetDistanceTo(Owner->GetWorld()->GetFirstPlayerController() ? Owner->GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr);
		OutRank = FMath::Sqrt(DistanceSq) / 1000.0f; // Normalize to ~1.0 per 1000 units
		return 1.0f / (1.0f + OutRank); // Inverse distance significance
	}

	OutRank = 50.0f;
	return 0.5f;
}

void UKhaaosVFXManager::PostSignificanceSetup(USignificanceManager::FManagedObjectInfo* ObjectInfo, float CurrentSignificance)
{
	if (!ObjectInfo || !ObjectInfo->GetObject())
	{
		return;
	}

	UNiagaraComponent* NiagaraComp = Cast<UNiagaraComponent>(ObjectInfo->GetObject());
	if (NiagaraComp)
	{
		// Very low significance: deactivate to save GPU
		if (CurrentSignificance < 0.1f)
		{
			NiagaraComp->Deactivate();
		}
		// Restore when significance increases
		else if (!NiagaraComp->IsActive() && CurrentSignificance >= 0.2f)
		{
			NiagaraComp->Activate();
		}
	}
}

// ─── Stats & Debug ───────────────────────────────────────────────────────────

int32 UKhaaosVFXManager::GetActiveVFXCount() const
{
	int32 Count = 0;
	for (const auto& Pair : ActiveVFXComponents)
	{
		if (Pair.Value.IsValid())
		{
			++Count;
		}
	}
	return Count;
}

int32 UKhaaosVFXManager::GetActiveVFXCountForName(FName VFXName) const
{
	int32 Count = 0;
	TArray<TWeakObjectPtr<UNiagaraComponent>> Components;
	ActiveVFXComponents.MultiFind(VFXName, Components);
	for (const auto& WeakComp : Components)
	{
		if (WeakComp.IsValid())
		{
			++Count;
		}
	}
	return Count;
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

UNiagaraSystem* UKhaaosVFXManager::ResolveNiagaraSystem(TSoftObjectPtr<UNiagaraSystem> SoftRef)
{
	if (SoftRef.IsValid())
	{
		return SoftRef.Get();
	}

	if (SoftRef.IsPending())
	{
		// Synchronous load for immediate spawn (streaming handled elsewhere)
		return SoftRef.LoadSynchronous();
	}

	return nullptr;
}

void UKhaaosVFXManager::TrackActiveVFX(FName VFXName, UNiagaraComponent* NiagaraComp)
{
	if (NiagaraComp)
	{
		ActiveVFXComponents.Add(VFXName, NiagaraComp);

		// Auto-cleanup when component is destroyed
		NiagaraComp->OnSystemFinished.AddWeakLambda(this, [this, VFXName, WeakComp = TWeakObjectPtr<UNiagaraComponent>(NiagaraComp)]()
		{
			if (WeakComp.IsValid())
			{
				UntrackActiveVFX(WeakComp.Get());
			}
		});
	}
}

void UKhaaosVFXManager::UntrackActiveVFX(UNiagaraComponent* NiagaraComp)
{
	for (auto It = ActiveVFXComponents.CreateIterator(); It; ++It)
	{
		if (It.Value().Get() == NiagaraComp)
		{
			It.RemoveCurrent();
			break;
		}
	}
}
