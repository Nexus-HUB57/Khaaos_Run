// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Performance/KhaaosLODStrategy.h"
#include "GameFramework/Actor.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosLOD, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosLODStrategyComponent::UKhaaosLODStrategyComponent()
{
	PrimaryComponentTick.bCanEverTick = false; // No tick needed — LOD computed on demand
	PrimaryComponentTick.bStartWithTickEnabled = false;

	// Initialize default config
	ActiveConfig.InitDefaults();
	RecomputeSquaredThresholds();

	UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: Constructed | WorldType=%d | Thresholds=[%.0f, %.0f, %.0f, %.0f]"),
		static_cast<int32>(CurrentWorldType),
		ActiveConfig.DistanceThresholds[0], ActiveConfig.DistanceThresholds[1],
		ActiveConfig.DistanceThresholds[2], ActiveConfig.DistanceThresholds[3]);
}

// ─── LOD Computation ─────────────────────────────────────────────────────────

EKhaaosLODLevel UKhaaosLODStrategyComponent::ComputeLODForActor(AActor* Actor, float DistanceToPlayer)
{
	if (!Actor)
	{
		return EKhaaosLODLevel::LOD4_Culled;
	}

	// Use squared distance for performance
	const float DistanceSq = DistanceToPlayer * DistanceToPlayer;
	return ComputeLODSquared(Actor, DistanceSq);
}

EKhaaosLODLevel UKhaaosLODStrategyComponent::ComputeLODSquared(AActor* Actor, float DistanceSqToPlayer)
{
	if (!Actor)
	{
		return EKhaaosLODLevel::LOD4_Culled;
	}

	// Determine LOD from squared distance thresholds
	EKhaaosLODLevel NewLOD = EKhaaosLODLevel::LOD4_Culled;

	if (DistanceThresholdsSq.Num() >= 4)
	{
		if (DistanceSqToPlayer < DistanceThresholdsSq[0])
		{
			NewLOD = EKhaaosLODLevel::LOD0_Full;
		}
		else if (DistanceSqToPlayer < DistanceThresholdsSq[1])
		{
			NewLOD = EKhaaosLODLevel::LOD1_Medium;
		}
		else if (DistanceSqToPlayer < DistanceThresholdsSq[2])
		{
			NewLOD = EKhaaosLODLevel::LOD2_Low;
		}
		else if (DistanceSqToPlayer < DistanceThresholdsSq[3])
		{
			NewLOD = EKhaaosLODLevel::LOD3_Billboard;
		}
		// else: LOD4_Culled (already set as default)
	}

	// Check for LOD change and broadcast delegate
	TWeakObjectPtr<AActor> WeakActor(Actor);
	EKhaaosLODLevel* CachedLOD = CachedActorLOD.Find(WeakActor);

	if (CachedLOD)
	{
		if (*CachedLOD != NewLOD)
		{
			EKhaaosLODLevel OldLOD = *CachedLOD;
			*CachedLOD = NewLOD;

			OnActorLODChanged.Broadcast(Actor, OldLOD, NewLOD);

			UE_LOG(LogKhaaosLOD, Verbose, TEXT("KhaaosLOD: %s LOD changed %d -> %d (distSq=%.0f)"),
				*Actor->GetName(), static_cast<int32>(OldLOD), static_cast<int32>(NewLOD), DistanceSqToPlayer);
		}
	}
	else
	{
		// First time seeing this actor — cache the LOD
		CachedActorLOD.Add(WeakActor, NewLOD);

		UE_LOG(LogKhaaosLOD, Verbose, TEXT("KhaaosLOD: %s initial LOD=%d (distSq=%.0f)"),
			*Actor->GetName(), static_cast<int32>(NewLOD), DistanceSqToPlayer);
	}

	return NewLOD;
}

// ─── Tick Rate ───────────────────────────────────────────────────────────────

float UKhaaosLODStrategyComponent::GetTickRateForLOD(EKhaaosLODLevel Level) const
{
	const int32 Index = static_cast<int32>(Level);
	if (ActiveConfig.TickRateMultiplier.IsValidIndex(Index))
	{
		return ActiveConfig.TickRateMultiplier[Index];
	}
	return 0.0f; // Unknown level = no tick
}

// ─── Replication ─────────────────────────────────────────────────────────────

bool UKhaaosLODStrategyComponent::ShouldReplicateForLOD(EKhaaosLODLevel Level) const
{
	return GetReplicationRateForLOD(Level) > 0.0f;
}

float UKhaaosLODStrategyComponent::GetReplicationRateForLOD(EKhaaosLODLevel Level) const
{
	const int32 Index = static_cast<int32>(Level);
	if (ActiveConfig.ReplicationRateMultiplier.IsValidIndex(Index))
	{
		return ActiveConfig.ReplicationRateMultiplier[Index];
	}
	return 0.0f; // Unknown level = no replication
}

// ─── World Configuration ─────────────────────────────────────────────────────

void UKhaaosLODStrategyComponent::SetWorldType(EKhaaosWorldType NewWorldType)
{
	if (NewWorldType == CurrentWorldType)
	{
		return;
	}

	EKhaaosWorldType OldWorldType = CurrentWorldType;
	CurrentWorldType = NewWorldType;

	// Build new config for the world type
	ActiveConfig = BuildConfigForWorld(NewWorldType);
	RecomputeSquaredThresholds();

	// Clear cached LODs since thresholds changed
	CachedActorLOD.Empty();

	UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: WorldType changed %d -> %d | Density=%.2f | Thresholds=[%.0f, %.0f, %.0f, %.0f]"),
		static_cast<int32>(OldWorldType), static_cast<int32>(NewWorldType), ActiveConfig.DensityMultiplier,
		ActiveConfig.DistanceThresholds[0], ActiveConfig.DistanceThresholds[1],
		ActiveConfig.DistanceThresholds[2], ActiveConfig.DistanceThresholds[3]);
}

// ─── Build Config For World ──────────────────────────────────────────────────

FKhaaosLODConfig UKhaaosLODStrategyComponent::BuildConfigForWorld(EKhaaosWorldType WorldType) const
{
	FKhaaosLODConfig Config;
	Config.InitDefaults();
	Config.WorldType = WorldType;

	switch (WorldType)
	{
	case EKhaaosWorldType::Ckesalth:
	{
		// Dense urban world: all thresholds * 0.6
		Config.DensityMultiplier = 0.6f;
		Config.ApplyDensityMultiplier();

		UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: Ckesalth config — density 0.6x (dense urban)"));
		break;
	}

	case EKhaaosWorldType::Priadus:
	{
		// Mixed terrain: slightly tighter than default
		Config.DensityMultiplier = 0.85f;
		Config.ApplyDensityMultiplier();

		UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: Priadus config — density 0.85x (mixed terrain)"));
		break;
	}

	case EKhaaosWorldType::Barburhen:
	{
		// Open terrain: wider thresholds (can see further)
		Config.DensityMultiplier = 1.2f;
		Config.ApplyDensityMultiplier();

		UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: Barburhen config — density 1.2x (open terrain)"));
		break;
	}

	case EKhaaosWorldType::Arukheea:
	{
		// Mountainous: slightly tighter (vertical occlusion helps)
		Config.DensityMultiplier = 0.8f;
		Config.ApplyDensityMultiplier();

		UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: Arukheea config — density 0.8x (mountainous)"));
		break;
	}

	case EKhaaosWorldType::CIGKV:
	{
		// Special event world: standard with event-specific tuning
		Config.DensityMultiplier = 0.9f;
		Config.ApplyDensityMultiplier();

		UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: CIGKV config — density 0.9x (event world)"));
		break;
	}

	case EKhaaosWorldType::Default:
	default:
	{
		// Default: no density adjustment
		UE_LOG(LogKhaaosLOD, Log, TEXT("KhaaosLODStrategy: Default config — density 1.0x"));
		break;
	}
	}

	return Config;
}

// ─── Recompute Squared Thresholds ────────────────────────────────────────────

void UKhaaosLODStrategyComponent::RecomputeSquaredThresholds()
{
	DistanceThresholdsSq.Reset(ActiveConfig.DistanceThresholds.Num());

	for (int32 i = 0; i < ActiveConfig.DistanceThresholds.Num(); ++i)
	{
		float Threshold = ActiveConfig.DistanceThresholds[i];
		if (Threshold < FLT_MAX)
		{
			DistanceThresholdsSq.Add(Threshold * Threshold);
		}
		else
		{
			DistanceThresholdsSq.Add(FLT_MAX);
		}
	}
}
