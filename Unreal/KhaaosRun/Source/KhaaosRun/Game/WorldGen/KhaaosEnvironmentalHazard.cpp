// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/WorldGen/KhaaosEnvironmentalHazard.h"
#include "KhaaosRun.h"

#include "Math/UnrealMathUtility.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosEnvironmentalHazardComponent::UKhaaosEnvironmentalHazardComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;

	MaxActiveHazards = 100;
	GlobalDamageMultiplier = 1.0f;
	NextHazardId = 1;
}

// ─── Hazard Spawning ────────────────────────────────────────────────────────────

int32 UKhaaosEnvironmentalHazardComponent::SpawnHazard(const FKhaaosHazardConfig& Config, const FVector& Location)
{
	if (ActiveHazardMap.Num() >= MaxActiveHazards)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("EnvironmentalHazard::SpawnHazard - MAX HAZARDS reached (%d/%d)"),
			ActiveHazardMap.Num(), MaxActiveHazards);
		return INDEX_NONE;
	}

	const int32 HazardId = NextHazardId++;

	// Create active hazard (starts in warning phase)
	FKhaaosActiveHazard Hazard;
	Hazard.Config = Config;
	Hazard.OriginLocation = Location;
	Hazard.RemainingTime = Config.DurationSeconds;
	Hazard.bIsActive = false; // Not damaging yet — warning first
	Hazard.AffectedPlayerIds.Empty();

	ActiveHazardMap.Add(HazardId, Hazard);

	// Start warning timer
	WarningTimers.Add(HazardId, Config.WarningTimeSeconds);

	UE_LOG(LogKhaaosRun, Log, TEXT("EnvironmentalHazard: Spawned hazard %d (type=%d, radius=%.0f, duration=%.1fs) at (%.0f, %.0f, %.0f)"),
		HazardId, (int32)Config.HazardType, Config.Radius, Config.DurationSeconds,
		Location.X, Location.Y, Location.Z);

	// Broadcast warning
	OnHazardWarning.Broadcast(HazardId, Config.HazardType, Location);

	return HazardId;
}

bool UKhaaosEnvironmentalHazardComponent::RemoveHazard(int32 HazardId)
{
	FKhaaosActiveHazard Hazard;
	if (FKhaaosActiveHazard* Found = ActiveHazardMap.Find(HazardId))
	{
		Hazard = *Found;
	}
	else
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("EnvironmentalHazard::RemoveHazard - Hazard %d not found"), HazardId);
		return false;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("EnvironmentalHazard: Removed hazard %d (type=%d)"),
		HazardId, (int32)Hazard.Config.HazardType);

	// Broadcast ended
	OnHazardEnded.Broadcast(HazardId, Hazard.Config.HazardType, Hazard.OriginLocation);

	// Cleanup
	ActiveHazardMap.Remove(HazardId);
	WarningTimers.Remove(HazardId);
	PeriodicCooldowns.Remove(HazardId);

	return true;
}

TArray<FKhaaosActiveHazard> UKhaaosEnvironmentalHazardComponent::GetActiveHazards() const
{
	TArray<FKhaaosActiveHazard> Results;
	ActiveHazardMap.GenerateValueArray(Results);
	return Results;
}

bool UKhaaosEnvironmentalHazardComponent::IsLocationInHazard(const FVector& Location) const
{
	for (const auto& Pair : ActiveHazardMap)
	{
		const FKhaaosActiveHazard& Hazard = Pair.Value;
		if (Hazard.bIsActive && IsInRadius(Location, Hazard.OriginLocation, Hazard.Config.Radius))
		{
			return true;
		}
	}
	return false;
}

float UKhaaosEnvironmentalHazardComponent::GetHazardDamageAtLocation(const FVector& Location) const
{
	float TotalDamage = 0.0f;

	for (const auto& Pair : ActiveHazardMap)
	{
		const FKhaaosActiveHazard& Hazard = Pair.Value;
		if (Hazard.bIsActive && IsInRadius(Location, Hazard.OriginLocation, Hazard.Config.Radius))
		{
			TotalDamage += Hazard.Config.DamagePerSecond * GlobalDamageMultiplier;
		}
	}

	return TotalDamage;
}

void UKhaaosEnvironmentalHazardComponent::TickHazards(float DeltaTime)
{
	// ─── Process Warning Timers ─────────────────────────────────────────────

	TArray<int32> WarningIds;
	WarningTimers.GetKeys(WarningIds);

	for (const int32 HazardId : WarningIds)
	{
		float& WarningTime = WarningTimers.FindChecked(HazardId);
		WarningTime -= DeltaTime;

		if (WarningTime <= 0.0f)
		{
			// Warning complete → activate hazard
			if (FKhaaosActiveHazard* Hazard = ActiveHazardMap.Find(HazardId))
			{
				Hazard->bIsActive = true;

				UE_LOG(LogKhaaosRun, Log, TEXT("EnvironmentalHazard: Hazard %d ACTIVATED (type=%d)"),
					HazardId, (int32)Hazard->Config.HazardType);

				OnHazardStarted.Broadcast(HazardId, Hazard->Config.HazardType, Hazard->OriginLocation);
			}
			WarningTimers.Remove(HazardId);
		}
	}

	// ─── Process Active Hazards ─────────────────────────────────────────────

	TArray<int32> HazardIds;
	ActiveHazardMap.GetKeys(HazardIds);

	for (const int32 HazardId : HazardIds)
	{
		FKhaaosActiveHazard* Hazard = ActiveHazardMap.Find(HazardId);
		if (!Hazard || !Hazard->bIsActive) continue;

		Hazard->RemainingTime -= DeltaTime;

		// Apply damage to affected players
		const float DamageThisTick = Hazard->Config.DamagePerSecond * GlobalDamageMultiplier * DeltaTime;
		for (const int32 PlayerId : Hazard->AffectedPlayerIds)
		{
			OnPlayerDamagedByHazard.Broadcast(PlayerId, DamageThisTick, Hazard->Config.HazardType);
		}

		// Check if hazard expired
		if (Hazard->RemainingTime <= 0.0f)
		{
			if (Hazard->Config.bIsPeriodic)
			{
				// Periodic hazard: enter cooldown, then reactivate
				Hazard->bIsActive = false;
				Hazard->RemainingTime = Hazard->Config.DurationSeconds;
				PeriodicCooldowns.Add(HazardId, Hazard->Config.PeriodIntervalSeconds);

				UE_LOG(LogKhaaosRun, Log, TEXT("EnvironmentalHazard: Hazard %d entering periodic cooldown (%.1fs)"),
					HazardId, Hazard->Config.PeriodIntervalSeconds);
			}
			else
			{
				// Non-periodic: hazard ends
				UE_LOG(LogKhaaosRun, Log, TEXT("EnvironmentalHazard: Hazard %d EXPIRED (type=%d)"),
					HazardId, (int32)Hazard->Config.HazardType);

				OnHazardEnded.Broadcast(HazardId, Hazard->Config.HazardType, Hazard->OriginLocation);
				ActiveHazardMap.Remove(HazardId);
				PeriodicCooldowns.Remove(HazardId);
			}
		}
	}

	// ─── Process Periodic Cooldowns ─────────────────────────────────────────

	TArray<int32> CooldownIds;
	PeriodicCooldowns.GetKeys(CooldownIds);

	for (const int32 HazardId : CooldownIds)
	{
		float& Cooldown = PeriodicCooldowns.FindChecked(HazardId);
		Cooldown -= DeltaTime;

		if (Cooldown <= 0.0f)
		{
			// Cooldown complete → reactivate with warning
			if (FKhaaosActiveHazard* Hazard = ActiveHazardMap.Find(HazardId))
			{
				WarningTimers.Add(HazardId, Hazard->Config.WarningTimeSeconds);

				UE_LOG(LogKhaaosRun, Log, TEXT("EnvironmentalHazard: Hazard %d periodic reactivation warning"),
					HazardId);

				OnHazardWarning.Broadcast(HazardId, Hazard->Config.HazardType, Hazard->OriginLocation);
			}
			PeriodicCooldowns.Remove(HazardId);
		}
	}
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosEnvironmentalHazardComponent::TickComponent(
	float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (GetOwnerRole() != ROLE_Authority) return;

	TickHazards(DeltaTime);
}

// ─── Internal ───────────────────────────────────────────────────────────────────

bool UKhaaosEnvironmentalHazardComponent::IsInRadius(
	const FVector& Location, const FVector& Origin, float Radius)
{
	const float DistSquared = FVector::DistSquared(Location, Origin);
	const float RadiusSquared = Radius * Radius;
	return DistSquared <= RadiusSquared;
}
