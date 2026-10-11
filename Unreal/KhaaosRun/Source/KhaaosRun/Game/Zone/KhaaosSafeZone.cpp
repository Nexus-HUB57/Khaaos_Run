// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Zone/KhaaosSafeZone.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Engine/EngineTypes.h"
#include "TimerManager.h"
#include "Net/UnrealNetwork.h"
#include "Kismet/KismetMathLibrary.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosSafeZone::AKhaaosSafeZone()
{
        PrimaryActorTick.bCanEverTick = true;
        PrimaryActorTick.bStartWithTickEnabled = true;

        // ── Default zone state ──
        ZoneCenter       = FVector2D(50.0f, 50.0f);
        ZoneRadius       = 100.0f;
        TargetRadius     = 100.0f;
        ShrinkRate       = 0.0f;
        CurrentPhase     = 0;
        bIsShrinking     = false;
        bIsActive        = false;
        DamagePerTick    = 0.0f;

        // ── Configuration ──
        MapSize           = 10000.0f;
        DamageTickInterval = 1.0f;

        // ── Internal state ──
        WaitTimeRemaining  = 0.0f;
        ShrinkTimeRemaining = 0.0f;
        ShrinkStartRadius  = 100.0f;

        // Initialize default zone phases
        InitDefaultZonePhases();
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosSafeZone::BeginPlay()
{
        Super::BeginPlay();
}

void AKhaaosSafeZone::Tick(float DeltaSeconds)
{
        Super::Tick(DeltaSeconds);

        if (!bIsActive || GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        // Phase wait period
        if (!bIsShrinking && WaitTimeRemaining > 0.0f)
        {
                WaitTimeRemaining -= DeltaSeconds;
                if (WaitTimeRemaining <= 0.0f)
                {
                        BeginShrink();
                }
                return;
        }

        // Shrink interpolation
        if (bIsShrinking && ShrinkTimeRemaining > 0.0f)
        {
                ShrinkTimeRemaining -= DeltaSeconds;

                // Interpolate radius from ShrinkStartRadius to TargetRadius
                if (ShrinkTimeRemaining <= 0.0f)
                {
                        // Shrink complete
                        ZoneRadius = TargetRadius;
                        bIsShrinking = false;

                        // Advance to next phase
                        AdvancePhase();
                }
                else
                {
                        // Linear interpolation toward target
                        float TotalShrinkTime = 1.0f; // Will be set per phase
                        if (CurrentPhase > 0 && CurrentPhase <= ZonePhases.Num())
                        {
                                TotalShrinkTime = ZonePhases[CurrentPhase - 1].ShrinkSeconds;
                        }

                        float Elapsed = TotalShrinkTime - ShrinkTimeRemaining;
                        float Alpha = FMath::Clamp(Elapsed / TotalShrinkTime, 0.0f, 1.0f);
                        ZoneRadius = FMath::Lerp(ShrinkStartRadius, TargetRadius, Alpha);
                }
        }
}

// ─── RepNotify ──────────────────────────────────────────────────────────────────

void AKhaaosSafeZone::OnRep_ZoneCenter()
{
        // Client-side zone center visual update
}

void AKhaaosSafeZone::OnRep_ZoneRadius()
{
        // Client-side zone ring visual update
}

void AKhaaosSafeZone::OnRep_Phase()
{
        // Client-side phase UI notification
}

// ─── Server Methods ─────────────────────────────────────────────────────────────

void AKhaaosSafeZone::ActivateZone()
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        bIsActive = true;
        CurrentPhase = 0;

        // Start first phase
        AdvancePhase();

        // Start damage tick timer
        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().SetTimer(DamageTickHandle, DamageTickInterval, true);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSafeZone::ActivateZone - Zone activated"));
}

void AKhaaosSafeZone::DeactivateZone()
{
        bIsActive = false;
        bIsShrinking = false;

        if (UWorld* World = GetWorld())
        {
                World->GetTimerManager().ClearTimer(DamageTickHandle);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSafeZone::DeactivateZone - Zone deactivated"));
}

bool AKhaaosSafeZone::IsInsideZone(const FVector2D& Position) const
{
        float DistSq = FVector2D::DistSquared(Position, ZoneCenter);
        float RadiusSq = ZoneRadius * ZoneRadius;
        return DistSq <= RadiusSq;
}

float AKhaaosSafeZone::DistanceToZoneEdge(const FVector2D& Position) const
{
        float Distance = FVector2D::Distance(Position, ZoneCenter);
        return Distance - ZoneRadius; // Negative = inside
}

void AKhaaosSafeZone::GetZoneStatus(float& OutRadiusPct, float& OutTargetPct, int32& OutPhase, bool& OutShrinking, float& OutDamage, float& OutWaitRemaining, float& OutShrinkRemaining) const
{
        OutRadiusPct     = ZoneRadius;
        OutTargetPct     = TargetRadius;
        OutPhase         = CurrentPhase;
        OutShrinking     = bIsShrinking ? true : false;
        OutDamage        = DamagePerTick;
        OutWaitRemaining = WaitTimeRemaining;
        OutShrinkRemaining = ShrinkTimeRemaining;
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosSafeZone::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosSafeZone, ZoneCenter, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosSafeZone, ZoneRadius, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosSafeZone, TargetRadius);
        DOREPLIFETIME(AKhaaosSafeZone, ShrinkRate);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosSafeZone, CurrentPhase, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosSafeZone, bIsShrinking);
        DOREPLIFETIME(AKhaaosSafeZone, bIsActive);
        DOREPLIFETIME(AKhaaosSafeZone, DamagePerTick);
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void AKhaaosSafeZone::PickNextZoneCenter()
{
        // Pick a random point within the current zone circle
        // Constrain to map bounds (0-100)
        float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
        float MaxOffset = ZoneRadius * 0.3f; // Stay within 30% of radius from current center
        float Distance = FMath::FRandRange(0.0f, MaxOffset);

        FVector2D NewCenter(
                ZoneCenter.X + Distance * FMath::Cos(Angle),
                ZoneCenter.Y + Distance * FMath::Sin(Angle)
        );

        // Clamp to map bounds
        NewCenter.X = FMath::Clamp(NewCenter.X, 5.0f, 95.0f);
        NewCenter.Y = FMath::Clamp(NewCenter.Y, 5.0f, 95.0f);

        ZoneCenter = NewCenter;
}

void AKhaaosSafeZone::AdvancePhase()
{
        int32 OldPhase = CurrentPhase;
        CurrentPhase++;

        if (CurrentPhase > ZonePhases.Num())
        {
                // All phases complete
                DeactivateZone();
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSafeZone: All zone phases complete"));
                return;
        }

        const FZonePhaseConfig& PhaseConfig = ZonePhases[CurrentPhase - 1];

        // Pick new center for next phase
        if (CurrentPhase > 1)
        {
                PickNextZoneCenter();
        }

        // Set target radius from phase config
        TargetRadius = PhaseConfig.RadiusPct;
        DamagePerTick = PhaseConfig.DamagePerTick;

        // Start wait period
        WaitTimeRemaining = PhaseConfig.WaitSeconds;
        bIsShrinking = false;

        // Broadcast phase change
        OnPhaseChanged.Broadcast(OldPhase, CurrentPhase);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSafeZone: Phase %d — Target: %.1f%%, Wait: %.1fs, Damage: %.1f"),
                CurrentPhase, TargetRadius, WaitTimeRemaining, DamagePerTick);
}

void AKhaaosSafeZone::BeginShrink()
{
        if (CurrentPhase < 1 || CurrentPhase > ZonePhases.Num())
        {
                return;
        }

        const FZonePhaseConfig& PhaseConfig = ZonePhases[CurrentPhase - 1];

        bIsShrinking = true;
        ShrinkStartRadius = ZoneRadius;
        ShrinkTimeRemaining = PhaseConfig.ShrinkSeconds;

        // Compute shrink rate
        float RadiusDelta = FMath::Abs(ShrinkStartRadius - TargetRadius);
        ShrinkRate = (ShrinkTimeRemaining > 0.0f) ? (RadiusDelta / ShrinkTimeRemaining) : 0.0f;

        OnZoneShrinkStart.Broadcast();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSafeZone: Shrink started — %.1f%% → %.1f%% over %.1fs"),
                ShrinkStartRadius, TargetRadius, ShrinkTimeRemaining);
}

void AKhaaosSafeZone::InitDefaultZonePhases()
{
        // Zone phases from schema.ts ZONE_PHASES
        ZonePhases.Empty(5);

        // Phase 1: 75% radius, 30s wait, 15s shrink, 5 dmg/tick
        FZonePhaseConfig Phase1;
        Phase1.Phase = 1;
        Phase1.RadiusPct = 75.0f;
        Phase1.WaitSeconds = 30.0f;
        Phase1.ShrinkSeconds = 15.0f;
        Phase1.DamagePerTick = 5.0f;
        ZonePhases.Add(Phase1);

        // Phase 2: 55% radius, 25s wait, 12s shrink, 10 dmg/tick
        FZonePhaseConfig Phase2;
        Phase2.Phase = 2;
        Phase2.RadiusPct = 55.0f;
        Phase2.WaitSeconds = 25.0f;
        Phase2.ShrinkSeconds = 12.0f;
        Phase2.DamagePerTick = 10.0f;
        ZonePhases.Add(Phase2);

        // Phase 3: 35% radius, 20s wait, 10s shrink, 18 dmg/tick
        FZonePhaseConfig Phase3;
        Phase3.Phase = 3;
        Phase3.RadiusPct = 35.0f;
        Phase3.WaitSeconds = 20.0f;
        Phase3.ShrinkSeconds = 10.0f;
        Phase3.DamagePerTick = 18.0f;
        ZonePhases.Add(Phase3);

        // Phase 4: 18% radius, 15s wait, 8s shrink, 28 dmg/tick
        FZonePhaseConfig Phase4;
        Phase4.Phase = 4;
        Phase4.RadiusPct = 18.0f;
        Phase4.WaitSeconds = 15.0f;
        Phase4.ShrinkSeconds = 8.0f;
        Phase4.DamagePerTick = 28.0f;
        ZonePhases.Add(Phase4);

        // Phase 5: 5% radius, 10s wait, 6s shrink, 45 dmg/tick
        FZonePhaseConfig Phase5;
        Phase5.Phase = 5;
        Phase5.RadiusPct = 5.0f;
        Phase5.WaitSeconds = 10.0f;
        Phase5.ShrinkSeconds = 6.0f;
        Phase5.DamagePerTick = 45.0f;
        ZonePhases.Add(Phase5);
}
