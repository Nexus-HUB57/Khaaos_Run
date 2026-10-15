// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Zone/KhaaosZoneManager.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosZoneManagerComponent::UKhaaosZoneManagerComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = false;

    ZoneCenter       = FVector2D::ZeroVector;
    ZoneRadius       = 10000.0f;
    TargetCenter     = FVector2D::ZeroVector;
    TargetRadius     = 10000.0f;
    CurrentDamagePerTick = 0.0f;
    CurrentPhase     = -1;
    bIsShrinking     = false;
    ShrinkProgress   = 0.0f;
    PhaseTimeRemaining = 0.0f;

    InterpolationSpeed = 2.0f;
    MinimumRadius      = 500.0f;
    MaxCenterDriftPct  = 0.3f;

    PhaseState = EPhaseState::Inactive;
}

// ─── Initialization ─────────────────────────────────────────────────────────────

void UKhaaosZoneManagerComponent::InitializeZone(const FVector2D& InMapCenter, float InMapRadius)
{
    if (GetOwnerRole() != ROLE_Authority)
    {
        return;
    }

    MapCenterPoint  = InMapCenter;
    MapRadiusUnits  = InMapRadius;

    ZoneCenter   = InMapCenter;
    ZoneRadius   = InMapRadius;
    TargetCenter = InMapCenter;
    TargetRadius = InMapRadius;

    CurrentDamagePerTick = 0.0f;
    CurrentPhase   = -1;
    bIsShrinking   = false;
    ShrinkProgress = 0.0f;

    if (ZonePhases.Num() == 0)
    {
        GenerateDefaultPhases();
    }

    AdvancePhase();

    PrimaryComponentTick.SetTickFunctionEnable(true);

    UE_LOG(LogKhaaosRun, Log, TEXT("ZoneManager::InitializeZone - Center=(%.0f,%.0f) Radius=%.0f Phases=%d"),
        InMapCenter.X, InMapCenter.Y, InMapRadius, ZonePhases.Num());
}

void UKhaaosZoneManagerComponent::SetZonePhases(const TArray<FKhaaosZonePhase>& InPhases)
{
    ZonePhases = InPhases;
}

// ─── Default Phase Generation ───────────────────────────────────────────────────

void UKhaaosZoneManagerComponent::GenerateDefaultPhases()
{
    ZonePhases.Empty(5);

    FKhaaosZonePhase Phase0;
    Phase0.WaitTimeSeconds   = 120.0f;
    Phase0.ShrinkTimeSeconds = 60.0f;
    Phase0.TargetRadiusPct   = 0.50f;
    Phase0.DamagePerTick     = 1.0f;
    Phase0.bIsMoving         = false;
    ZonePhases.Add(Phase0);

    FKhaaosZonePhase Phase1;
    Phase1.WaitTimeSeconds   = 90.0f;
    Phase1.ShrinkTimeSeconds = 45.0f;
    Phase1.TargetRadiusPct   = 0.30f;
    Phase1.DamagePerTick     = 2.0f;
    Phase1.bIsMoving         = true;
    ZonePhases.Add(Phase1);

    FKhaaosZonePhase Phase2;
    Phase2.WaitTimeSeconds   = 60.0f;
    Phase2.ShrinkTimeSeconds = 30.0f;
    Phase2.TargetRadiusPct   = 0.15f;
    Phase2.DamagePerTick     = 5.0f;
    Phase2.bIsMoving         = true;
    ZonePhases.Add(Phase2);

    FKhaaosZonePhase Phase3;
    Phase3.WaitTimeSeconds   = 30.0f;
    Phase3.ShrinkTimeSeconds = 20.0f;
    Phase3.TargetRadiusPct   = 0.05f;
    Phase3.DamagePerTick     = 8.0f;
    Phase3.bIsMoving         = true;
    ZonePhases.Add(Phase3);

    FKhaaosZonePhase Phase4;
    Phase4.WaitTimeSeconds   = 15.0f;
    Phase4.ShrinkTimeSeconds = 10.0f;
    Phase4.TargetRadiusPct   = 0.0f;
    Phase4.DamagePerTick     = 10.0f;
    Phase4.bIsMoving         = true;
    ZonePhases.Add(Phase4);
}

// ─── Phase Advancement ──────────────────────────────────────────────────────────

void UKhaaosZoneManagerComponent::AdvancePhase()
{
    int32 OldPhase = CurrentPhase;
    CurrentPhase++;

    if (CurrentPhase >= ZonePhases.Num())
    {
        PhaseState = EPhaseState::Inactive;
        bIsShrinking = false;
        UE_LOG(LogKhaaosRun, Log, TEXT("ZoneManager::AdvancePhase - All phases complete (zone closed)"));
        return;
    }

    const FKhaaosZonePhase& Phase = ZonePhases[CurrentPhase];

    TargetRadius = FMath::Max(MinimumRadius, Phase.TargetRadiusPct * MapRadiusUnits);

    if (Phase.bIsMoving)
    {
        TargetCenter = ComputeRandomTargetCenter();
    }
    else
    {
        TargetCenter = ZoneCenter;
    }

    CurrentDamagePerTick = Phase.DamagePerTick;

    PhaseState = EPhaseState::Waiting;
    PhaseTimeRemaining = Phase.WaitTimeSeconds;
    bIsShrinking = false;
    ShrinkProgress = 0.0f;

    OnZonePhaseChanged.Broadcast(OldPhase, CurrentPhase, Phase.DamagePerTick);

    UE_LOG(LogKhaaosRun, Log, TEXT("ZoneManager::AdvancePhase - Phase %d: Wait=%.0fs Shrink=%.0fs TargetR=%.0f Dmg=%.1f Moving=%d"),
        CurrentPhase, Phase.WaitTimeSeconds, Phase.ShrinkTimeSeconds,
        TargetRadius, Phase.DamagePerTick, Phase.bIsMoving ? 1 : 0);
}

FVector2D UKhaaosZoneManagerComponent::ComputeRandomTargetCenter() const
{
    const float MaxDrift = MaxCenterDriftPct * ZoneRadius;
    const float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
    const float Dist = FMath::FRandRange(0.0f, MaxDrift);

    return FVector2D(
        ZoneCenter.X + FMath::Cos(Angle) * Dist,
        ZoneCenter.Y + FMath::Sin(Angle) * Dist
    );
}

// ─── Debug Controls ─────────────────────────────────────────────────────────────

void UKhaaosZoneManagerComponent::SkipCurrentWait()
{
    if (GetOwnerRole() != ROLE_Authority) return;
    if (PhaseState != EPhaseState::Waiting) return;

    PhaseTimeRemaining = 0.0f;
    UE_LOG(LogKhaaosRun, Log, TEXT("ZoneManager::SkipCurrentWait - Skipped wait for phase %d"), CurrentPhase);
}

void UKhaaosZoneManagerComponent::ForceNextPhase()
{
    if (GetOwnerRole() != ROLE_Authority) return;

    if (PhaseState == EPhaseState::Shrinking)
    {
        ZoneCenter = TargetCenter;
        ZoneRadius = TargetRadius;
    }

    AdvancePhase();
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosZoneManagerComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority) return;
    if (PhaseState == EPhaseState::Inactive) return;

    PhaseTimeRemaining -= DeltaTime;

    if (PhaseState == EPhaseState::Waiting)
    {
        if (PhaseTimeRemaining <= 0.0f)
        {
            PhaseState = EPhaseState::Shrinking;
            bIsShrinking = true;
            ShrinkProgress = 0.0f;

            ShrinkStartCenter = ZoneCenter;
            ShrinkStartRadius = ZoneRadius;

            const FKhaaosZonePhase& Phase = ZonePhases[CurrentPhase];
            PhaseTimeRemaining = Phase.ShrinkTimeSeconds;

            OnZoneShrinkStarted.Broadcast(CurrentPhase, Phase.ShrinkTimeSeconds);

            UE_LOG(LogKhaaosRun, Log, TEXT("ZoneManager - Shrink started: Phase %d (%.0fs)"),
                CurrentPhase, Phase.ShrinkTimeSeconds);
        }
    }
    else if (PhaseState == EPhaseState::Shrinking)
    {
        const FKhaaosZonePhase& Phase = ZonePhases[CurrentPhase];
        const float ShrinkDuration = Phase.ShrinkTimeSeconds;

        const float Elapsed = ShrinkDuration - PhaseTimeRemaining;
        ShrinkProgress = FMath::Clamp(Elapsed / FMath::Max(ShrinkDuration, 0.01f), 0.0f, 1.0f);

        const float EasedT = CubicEaseInOut(ShrinkProgress);

        ZoneCenter = FMath::Lerp(ShrinkStartCenter, TargetCenter, EasedT);
        ZoneRadius = FMath::Lerp(ShrinkStartRadius, TargetRadius, EasedT);
        ZoneRadius = FMath::Max(ZoneRadius, MinimumRadius);

        if (PhaseTimeRemaining <= 0.0f || ShrinkProgress >= 1.0f)
        {
            ZoneCenter = TargetCenter;
            ZoneRadius = FMath::Max(TargetRadius, MinimumRadius);
            bIsShrinking = false;
            ShrinkProgress = 1.0f;

            OnZoneShrinkComplete.Broadcast(CurrentPhase);

            UE_LOG(LogKhaaosRun, Log, TEXT("ZoneManager - Shrink complete: Phase %d Center=(%.0f,%.0f) R=%.0f"),
                CurrentPhase, ZoneCenter.X, ZoneCenter.Y, ZoneRadius);

            AdvancePhase();
        }
    }
}

// ─── Cubic Ease-In-Out ──────────────────────────────────────────────────────────

float UKhaaosZoneManagerComponent::CubicEaseInOut(float T)
{
    if (T < 0.5f)
    {
        return 4.0f * T * T * T;
    }
    else
    {
        const float F = (-2.0f * T) + 2.0f;
        return 1.0f - (F * F * F) / 2.0f;
    }
}
