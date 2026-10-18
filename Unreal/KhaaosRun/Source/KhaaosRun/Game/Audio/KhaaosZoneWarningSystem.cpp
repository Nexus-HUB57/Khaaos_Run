// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosZoneWarningSystem.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosZoneWarningSystem::UKhaaosZoneWarningSystem()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;

	CautionDistanceFraction = 0.2f;
	WarningDistance   = 50.0f;
	DangerDistance    = 150.0f;
	CriticalDamageThreshold = 20.0f;
	BasePulseRate    = 1.0f;

	WarningLevel     = 0;
	PulseTimer       = 0.0f;
	DistanceToEdge   = 1000.0f;
	NearestSafePoint = FVector::ZeroVector;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosZoneWarningSystem::InitializeComponent()
{
	Super::InitializeComponent();
}

void UKhaaosZoneWarningSystem::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (WarningLevel <= 0) return;

	// Pulse timer for warning sound
	float PulseRate = ComputePulseRate();
	PulseTimer += DeltaTime;

	if (PulseTimer >= 1.0f / PulseRate)
	{
		PulseTimer = 0.0f;

		// In production: play zone warning sound at NearestSafePoint
		// with 3D spatial audio and HRTF
		OnZoneWarning.Broadcast(DistanceToEdge, 0.0f);
	}
}

// ─── Warning API ────────────────────────────────────────────────────────────────

void UKhaaosZoneWarningSystem::UpdateZoneProximity(float DistanceToZoneEdge, float ZoneRadius, float DamagePerTick, const FVector& InNearestSafePoint)
{
	DistanceToEdge = DistanceToZoneEdge;
	NearestSafePoint = InNearestSafePoint;

	int32 NewLevel = ComputeWarningLevel(DistanceToZoneEdge, DamagePerTick);

	if (NewLevel != WarningLevel)
	{
		WarningLevel = NewLevel;
		UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosZoneWarning: Level %d (dist: %.0f, dmg: %.1f)"),
			WarningLevel, DistanceToZoneEdge, DamagePerTick);
	}
}

// ─── Private ────────────────────────────────────────────────────────────────────

int32 UKhaaosZoneWarningSystem::ComputeWarningLevel(float Distance, float Damage) const
{
	// Distance is negative when outside the zone
	if (Distance < -DangerDistance || Damage >= CriticalDamageThreshold)
	{
		return 4; // Critical
	}
	if (Distance < -WarningDistance)
	{
		return 3; // Danger
	}
	if (Distance < 0.0f)
	{
		return 2; // Warning (outside zone)
	}
	if (Distance < 50.0f) // Within caution margin
	{
		return 1; // Caution
	}
	return 0; // Safe
}

float UKhaaosZoneWarningSystem::ComputePulseRate() const
{
	switch (WarningLevel)
	{
	case 1:  return BasePulseRate;          // 1 Hz (caution)
	case 2:  return BasePulseRate * 2.0f;   // 2 Hz (warning)
	case 3:  return BasePulseRate * 4.0f;   // 4 Hz (danger)
	case 4:  return BasePulseRate * 6.0f;   // 6 Hz (critical)
	default: return 0.0f;
	}
}
