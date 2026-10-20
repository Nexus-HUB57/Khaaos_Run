// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Performance/KhaaosSignificanceManager.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosSigConfig, Log, All);

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosSignificanceConfigSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Initialize default significance configuration
	SignificanceConfig.CriticalDistance = 500.0f;
	SignificanceConfig.HighDistance = 1500.0f;
	SignificanceConfig.MediumDistance = 3000.0f;
	SignificanceConfig.LowDistance = 5000.0f;

	SignificanceConfig.CriticalTickRate = 1.0f;
	SignificanceConfig.HighTickRate = 0.5f;
	SignificanceConfig.MediumTickRate = 0.25f;
	SignificanceConfig.LowTickRate = 0.1f;
	SignificanceConfig.InvisibleTickRate = 0.0f;

	SignificanceConfig.CacheRefreshInterval = 1.0f;
	SignificanceConfig.DensityMultiplier = 1.0f;

	CurrentWorldTime = 0.0f;

	UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificanceConfigSubsystem: Initialized | Thresholds=[%.0f, %.0f, %.0f, %.0f]"),
		SignificanceConfig.CriticalDistance, SignificanceConfig.HighDistance,
		SignificanceConfig.MediumDistance, SignificanceConfig.LowDistance);
}

void UKhaaosSignificanceConfigSubsystem::Deinitialize()
{
	RegisteredActors.Empty();

	UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificanceConfigSubsystem: Deinitialized"));
	Super::Deinitialize();
}

// ─── Registration ─────────────────────────────────────────────────────────────

void UKhaaosSignificanceConfigSubsystem::RegisterActorSignificance(AActor* Actor, EKhaaosSignificance Significance)
{
	if (!Actor || RegisteredActors.Contains(Actor))
	{
		return;
	}

	FKhaaosActorSignificanceEntry Entry;
	Entry.Actor = Actor;
	Entry.Significance = Significance;
	Entry.OverrideSignificance = Significance;
	Entry.bHasOverride = false;
	Entry.CachedDistance = 0.0f;
	Entry.LastUpdateTime = CurrentWorldTime;
	Entry.bIsDownedPlayer = false;
	Entry.bIsVehicleInUse = false;

	RegisteredActors.Add(Actor, Entry);

	UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: Registered %s at level %d"),
		*Actor->GetName(), static_cast<int32>(Significance));
}

void UKhaaosSignificanceConfigSubsystem::UnregisterActorSignificance(AActor* Actor)
{
	if (!Actor)
	{
		return;
	}

	if (RegisteredActors.Remove(Actor) > 0)
	{
		UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: Unregistered %s"), *Actor->GetName());
	}
}

// ─── Significance Update ─────────────────────────────────────────────────────

void UKhaaosSignificanceConfigSubsystem::UpdateSignificance(AActor* Actor, float DistanceToNearestPlayer)
{
	if (!Actor)
	{
		return;
	}

	FKhaaosActorSignificanceEntry* Entry = RegisteredActors.Find(Actor);
	if (!Entry)
	{
		return;
	}

	// Update world time for cache management
	UWorld* World = GetWorld();
	if (World)
	{
		CurrentWorldTime = World->GetTimeSeconds();
	}

	// Cache refresh: skip if not enough time has elapsed
	float TimeSinceLastUpdate = CurrentWorldTime - Entry->LastUpdateTime;
	if (TimeSinceLastUpdate < SignificanceConfig.CacheRefreshInterval && Entry->CachedDistance > 0.0f)
	{
		// Use cached significance — no update needed
		return;
	}

	// Update cached distance
	Entry->CachedDistance = DistanceToNearestPlayer;
	Entry->LastUpdateTime = CurrentWorldTime;

	// Calculate new significance from distance
	EKhaaosSignificance NewSignificance = CalculateSignificanceFromDistance(DistanceToNearestPlayer, *Entry);

	// Apply override if present
	if (Entry->bHasOverride)
	{
		// Override takes priority, but only if it's MORE significant than distance-based
		if (static_cast<uint8>(Entry->OverrideSignificance) < static_cast<uint8>(NewSignificance))
		{
			NewSignificance = Entry->OverrideSignificance;
		}
	}

	// Check for change and apply
	if (NewSignificance != Entry->Significance)
	{
		EKhaaosSignificance OldSignificance = Entry->Significance;
		Entry->Significance = NewSignificance;

		// Apply optimizations
		ApplySignificanceOptimizations(Actor, NewSignificance, OldSignificance);

		// Broadcast delegate
		OnSignificanceChanged.Broadcast(Actor, OldSignificance, NewSignificance);

		UE_LOG(LogKhaaosSigConfig, Verbose, TEXT("KhaaosSignificance: %s changed %d -> %d (dist=%.1f)"),
			*Actor->GetName(), static_cast<int32>(OldSignificance), static_cast<int32>(NewSignificance), DistanceToNearestPlayer);
	}
}

// ─── Queries ──────────────────────────────────────────────────────────────────

float UKhaaosSignificanceConfigSubsystem::GetTickRateForSignificance(EKhaaosSignificance Significance) const
{
	switch (Significance)
	{
	case EKhaaosSignificance::Critical:   return SignificanceConfig.CriticalTickRate;
	case EKhaaosSignificance::High:       return SignificanceConfig.HighTickRate;
	case EKhaaosSignificance::Medium:     return SignificanceConfig.MediumTickRate;
	case EKhaaosSignificance::Low:        return SignificanceConfig.LowTickRate;
	case EKhaaosSignificance::Invisible:  return SignificanceConfig.InvisibleTickRate;
	default:                              return 0.0f;
	}
}

EKhaaosSignificance UKhaaosSignificanceConfigSubsystem::GetActorSignificance(AActor* Actor) const
{
	const FKhaaosActorSignificanceEntry* Entry = RegisteredActors.Find(Actor);
	if (Entry)
	{
		return Entry->Significance;
	}
	return EKhaaosSignificance::Invisible;
}

int32 UKhaaosSignificanceConfigSubsystem::GetRegisteredActorCount() const
{
	return RegisteredActors.Num();
}

// ─── Battle Royale Specific ───────────────────────────────────────────────────

void UKhaaosSignificanceConfigSubsystem::SetActorAsDownedPlayer(AActor* Actor, bool bIsDowned)
{
	FKhaaosActorSignificanceEntry* Entry = RegisteredActors.Find(Actor);
	if (!Entry)
	{
		return;
	}

	Entry->bIsDownedPlayer = bIsDowned;

	if (bIsDowned)
	{
		// Downed players are capped at Medium significance (reduced tick, saves perf)
		Entry->bHasOverride = true;
		Entry->OverrideSignificance = EKhaaosSignificance::Medium;

		// Apply immediately
		if (Entry->Significance != EKhaaosSignificance::Medium)
		{
			EKhaaosSignificance OldSignificance = Entry->Significance;
			Entry->Significance = EKhaaosSignificance::Medium;
			ApplySignificanceOptimizations(Actor, EKhaaosSignificance::Medium, OldSignificance);
			OnSignificanceChanged.Broadcast(Actor, OldSignificance, EKhaaosSignificance::Medium);
		}

		UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: %s marked as DOWNED -> Medium"), *Actor->GetName());
	}
	else
	{
		// Remove the downed player override — revert to distance-based
		Entry->bHasOverride = false;
		UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: %s unmarked as DOWNED"), *Actor->GetName());
	}
}

void UKhaaosSignificanceConfigSubsystem::SetActorAsVehicleInUse(AActor* Actor, bool bInUse)
{
	FKhaaosActorSignificanceEntry* Entry = RegisteredActors.Find(Actor);
	if (!Entry)
	{
		return;
	}

	Entry->bIsVehicleInUse = bInUse;

	if (bInUse)
	{
		// Vehicles in use are boosted to High significance
		Entry->bHasOverride = true;
		Entry->OverrideSignificance = EKhaaosSignificance::High;

		// Apply immediately
		if (static_cast<uint8>(Entry->Significance) > static_cast<uint8>(EKhaaosSignificance::High))
		{
			EKhaaosSignificance OldSignificance = Entry->Significance;
			Entry->Significance = EKhaaosSignificance::High;
			ApplySignificanceOptimizations(Actor, EKhaaosSignificance::High, OldSignificance);
			OnSignificanceChanged.Broadcast(Actor, OldSignificance, EKhaaosSignificance::High);
		}

		UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: %s marked as VEHICLE IN USE -> High"), *Actor->GetName());
	}
	else
	{
		// Parked vehicles: remove the High override, will fall to distance-based (likely Low)
		Entry->bHasOverride = false;
		UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: %s unmarked as VEHICLE IN USE (parked)"), *Actor->GetName());
	}
}

// ─── World Configuration ─────────────────────────────────────────────────────

void UKhaaosSignificanceConfigSubsystem::ConfigureSignificanceForWorld(EKhaaosWorldType WorldType)
{
	// Reset to defaults first
	SignificanceConfig.CriticalDistance = 500.0f;
	SignificanceConfig.HighDistance = 1500.0f;
	SignificanceConfig.MediumDistance = 3000.0f;
	SignificanceConfig.LowDistance = 5000.0f;
	SignificanceConfig.DensityMultiplier = 1.0f;

	switch (WorldType)
	{
	case EKhaaosWorldType::Ckesalth:
	{
		// Dense urban: closer thresholds (0.6x)
		SignificanceConfig.DensityMultiplier = 0.6f;
		break;
	}

	case EKhaaosWorldType::Priadus:
	{
		// Mixed terrain: slightly closer (0.85x)
		SignificanceConfig.DensityMultiplier = 0.85f;
		break;
	}

	case EKhaaosWorldType::Barburhen:
	{
		// Open terrain: wider thresholds (1.2x)
		SignificanceConfig.DensityMultiplier = 1.2f;
		break;
	}

	case EKhaaosWorldType::Arukheea:
	{
		// Mountainous: slightly closer (0.8x)
		SignificanceConfig.DensityMultiplier = 0.8f;
		break;
	}

	case EKhaaosWorldType::CIGKV:
	{
		// Event world: standard (0.9x)
		SignificanceConfig.DensityMultiplier = 0.9f;
		break;
	}

	case EKhaaosWorldType::Default:
	default:
	{
		// Default: no density adjustment
		SignificanceConfig.DensityMultiplier = 1.0f;
		break;
	}
	}

	// Apply density multiplier to thresholds
	if (FMath::Abs(SignificanceConfig.DensityMultiplier - 1.0f) > KINDA_SMALL_NUMBER)
	{
		SignificanceConfig.CriticalDistance *= SignificanceConfig.DensityMultiplier;
		SignificanceConfig.HighDistance *= SignificanceConfig.DensityMultiplier;
		SignificanceConfig.MediumDistance *= SignificanceConfig.DensityMultiplier;
		SignificanceConfig.LowDistance *= SignificanceConfig.DensityMultiplier;
	}

	UE_LOG(LogKhaaosSigConfig, Log, TEXT("KhaaosSignificance: Configured for WorldType=%d | Density=%.2f | Thresholds=[%.0f, %.0f, %.0f, %.0f]"),
		static_cast<int32>(WorldType), SignificanceConfig.DensityMultiplier,
		SignificanceConfig.CriticalDistance, SignificanceConfig.HighDistance,
		SignificanceConfig.MediumDistance, SignificanceConfig.LowDistance);
}

// ─── Calculate Significance From Distance ─────────────────────────────────────

EKhaaosSignificance UKhaaosSignificanceConfigSubsystem::CalculateSignificanceFromDistance(
	float Distance, const FKhaaosActorSignificanceEntry& Entry) const
{
	// Battle royale rule: downed players are always at least Medium
	if (Entry.bIsDownedPlayer)
	{
		// Downed players: distance-based but capped at Medium (never Critical/High)
		if (Distance < SignificanceConfig.MediumDistance)
		{
			return EKhaaosSignificance::Medium;
		}
		else if (Distance < SignificanceConfig.LowDistance)
		{
			return EKhaaosSignificance::Low;
		}
		return EKhaaosSignificance::Invisible;
	}

	// Battle royale rule: vehicles in use get High when nearby
	if (Entry.bIsVehicleInUse)
	{
		// Vehicles in use: boost one level from distance-based
		if (Distance < SignificanceConfig.HighDistance)
		{
			return EKhaaosSignificance::Critical; // Boosted from High to Critical
		}
		else if (Distance < SignificanceConfig.MediumDistance)
		{
			return EKhaaosSignificance::High; // Boosted from Medium to High
		}
		else if (Distance < SignificanceConfig.LowDistance)
		{
			return EKhaaosSignificance::Medium; // Boosted from Low to Medium
		}
		else
		{
			return EKhaaosSignificance::Low; // Far vehicles in use still get Low
		}
	}

	// Standard distance-based significance
	if (Distance < SignificanceConfig.CriticalDistance)
	{
		return EKhaaosSignificance::Critical;
	}
	else if (Distance < SignificanceConfig.HighDistance)
	{
		return EKhaaosSignificance::High;
	}
	else if (Distance < SignificanceConfig.MediumDistance)
	{
		return EKhaaosSignificance::Medium;
	}
	else if (Distance < SignificanceConfig.LowDistance)
	{
		return EKhaaosSignificance::Low;
	}

	return EKhaaosSignificance::Invisible;
}

// ─── Apply Significance Optimizations ─────────────────────────────────────────

void UKhaaosSignificanceConfigSubsystem::ApplySignificanceOptimizations(
	AActor* Actor, EKhaaosSignificance NewSignificance, EKhaaosSignificance OldSignificance)
{
	if (!Actor)
	{
		return;
	}

	const bool bWasInvisible = (OldSignificance == EKhaaosSignificance::Invisible);
	const bool bIsInvisible = (NewSignificance == EKhaaosSignificance::Invisible);

	// Tick enable/disable
	if (bIsInvisible && !bWasInvisible)
	{
		Actor->SetActorTickEnabled(false);
	}
	else if (!bIsInvisible && bWasInvisible)
	{
		Actor->SetActorTickEnabled(true);
	}

	// Adjust tick interval based on significance
	float TickInterval = 0.0f;
	switch (NewSignificance)
	{
	case EKhaaosSignificance::Critical:
		TickInterval = 0.0f;    // Every frame
		break;
	case EKhaaosSignificance::High:
		TickInterval = 0.033f;  // ~30Hz
		break;
	case EKhaaosSignificance::Medium:
		TickInterval = 0.066f;  // ~15Hz
		break;
	case EKhaaosSignificance::Low:
		TickInterval = 0.166f;  // ~6Hz
		break;
	case EKhaaosSignificance::Invisible:
		TickInterval = -1.0f;   // No tick (already disabled above)
		break;
	}

	if (TickInterval >= 0.0f)
	{
		Actor->SetActorTickInterval(TickInterval);
	}

	// Adjust NetUpdateFrequency for server authority
	if (Actor->HasAuthority())
	{
		switch (NewSignificance)
		{
		case EKhaaosSignificance::Critical:
			Actor->NetUpdateFrequency = 30.0f;
			break;
		case EKhaaosSignificance::High:
			Actor->NetUpdateFrequency = 15.0f;
			break;
		case EKhaaosSignificance::Medium:
			Actor->NetUpdateFrequency = 8.0f;
			break;
		case EKhaaosSignificance::Low:
			Actor->NetUpdateFrequency = 2.0f;
			break;
		case EKhaaosSignificance::Invisible:
			Actor->NetUpdateFrequency = 1.0f;
			break;
		}
	}
}
