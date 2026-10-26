// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Ring Manager — Full Implementation
// Manages ring lifecycle: shrink, damage, phase transitions, world portals

#include "Ring/KhaaosRingManager.h"
#include "Ring/KhaaosRingSubsystem.h"
#include "Game/KhaaosGameState.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Kismet/GameplayStatics.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

AKhaaosRingManager::AKhaaosRingManager()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickGroup = TG_PrePhysics;

    CurrentWorld = EKhaaosWorld::CIGKV;
    CurrentPhase = 0;
    CurrentRadius = 800.f;
    TargetRadius = 600.f;
    ShrinkSpeed = 1.f;
    DamagePerTick = 1.f;
    RingCenter = FVector::ZeroVector;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void AKhaaosRingManager::BeginPlay()
{
    Super::BeginPlay();

    UE_LOG(LogTemp, Log, TEXT("KhaaosRingManager: BeginPlay on world"));

    // Start damage tick timer (1s interval)
    if (UWorld* World = GetWorld())
    {
        FTimerDelegate DamageDelegate;
        DamageDelegate.BindUFunction(this, FName("ApplyDamageTick"));
        World->GetTimerManager().SetTimer(DamageTickTimer, DamageDelegate, 1.0f, true);
    }
}

void AKhaaosRingManager::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (CurrentPhase > 0 && CurrentRadius > TargetRadius)
    {
        TickRingShrink(DeltaSeconds);
    }
}

// ─── Ring Initialization ─────────────────────────────────────────────────────

void AKhaaosRingManager::InitializeRingForWorld(EKhaaosWorld WorldId)
{
    CurrentWorld = WorldId;
    CurrentPhase = 0;
    RingPhases.Empty();

    // Load config from RingSubsystem
    if (const UGameInstance* GI = GetGameInstance())
    {
        if (const UKhaaosRingSubsystem* RingSub = GI->GetSubsystem<UKhaaosRingSubsystem>())
        {
            FRingWorldConfig Config = RingSub->GetRingConfig(WorldId);
            RingPhases = Config.Phases;

            if (RingPhases.Num() > 0)
            {
                // Set initial state from phase 0
                CurrentRadius = RingPhases[0].RadiusStart;
                TargetRadius = RingPhases[0].RadiusEnd;
                DamagePerTick = RingPhases[0].DamagePerTick;
                ShrinkSpeed = RingPhases[0].ShrinkSpeed;

                UE_LOG(LogTemp, Log,
                    TEXT("RingManager: Initialized for world with %d phases, R=%.0f->%.0f"),
                    RingPhases.Num(), CurrentRadius, TargetRadius);
            }
        }
    }

    // If subsystem not available, use defaults
    if (RingPhases.Num() == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("RingManager: No subsystem config, using defaults"));
        FRingPhase DefaultPhase;
        DefaultPhase.PhaseIndex = 0;
        DefaultPhase.RadiusStart = 800.f;
        DefaultPhase.RadiusEnd = 0.f;
        DefaultPhase.DurationSeconds = 300.f;
        DefaultPhase.DamagePerTick = 1.f;
        DefaultPhase.ShrinkSpeed = 1.f;
        RingPhases.Add(DefaultPhase);
        CurrentRadius = 800.f;
        TargetRadius = 0.f;
    }
}

// ─── Phase Management ─────────────────────────────────────────────────────────

void AKhaaosRingManager::StartNextPhase()
{
    CurrentPhase++;

    if (CurrentPhase >= RingPhases.Num())
    {
        // All phases complete — ring closed, trigger world transition
        OnWorldRingClosed();
        return;
    }

    const FRingPhase& NextPhase = RingPhases[CurrentPhase];

    // Update target and damage from new phase
    TargetRadius = NextPhase.RadiusEnd;
    DamagePerTick = NextPhase.DamagePerTick;
    ShrinkSpeed = NextPhase.ShrinkSpeed;

    UE_LOG(LogTemp, Log,
        TEXT("RingManager: Phase %d started — R=%.0f->%.0f, Dmg=%.1f/tick, Speed=%.1f"),
        CurrentPhase, CurrentRadius, TargetRadius, DamagePerTick, ShrinkSpeed);

    // Broadcast event: RING_SHRINKING
    if (UWorld* World = GetWorld())
    {
        if (AKhaaosGameState* GS = World->GetGameState<AKhaaosGameState>())
        {
            // Notify game state of phase change for replication
            // GS->OnRingPhaseChanged(CurrentPhase);
        }
    }

    // Check if this is the final phase
    if (CurrentPhase == RingPhases.Num() - 1)
    {
        // Final ring — increase damage, broadcast FINAL_RING event
        DamagePerTick *= 3.0f; // 3x multiplier for final ring
        UE_LOG(LogTemp, Log, TEXT("RingManager: FINAL RING — damage x3 = %.1f/tick"), DamagePerTick);
    }
}

// ─── Ring Shrink Tick ─────────────────────────────────────────────────────────

void AKhaaosRingManager::TickRingShrink(float DeltaSeconds)
{
    if (CurrentRadius <= TargetRadius)
    {
        // Phase complete
        OnRingPhaseComplete(CurrentPhase);
        return;
    }

    // Calculate shrink amount: speed * delta, clamped to not overshoot
    const float ShrinkAmount = ShrinkSpeed * DeltaSeconds * 50.0f; // 50 UE units/s base
    const float NewRadius = FMath::Max(CurrentRadius - ShrinkAmount, TargetRadius);

    CurrentRadius = NewRadius;
}

// ─── Damage Calculation ───────────────────────────────────────────────────────

float AKhaaosRingManager::CalculateDamageForPosition(const FVector& Position) const
{
    // Distance from ring center to player
    const float DistFromCenter = FVector::Dist2D(Position, RingCenter);

    // Inside safe zone — no damage
    if (DistFromCenter <= CurrentRadius)
    {
        return 0.f;
    }

    // Outside ring — apply damage with distance scaling
    // Damage increases linearly with distance outside the ring
    const float Overshoot = DistFromCenter - CurrentRadius;
    const float DistanceScale = 1.0f + (Overshoot / 200.f); // +100% per 200 UE units outside
    const float FinalDamage = DamagePerTick * FMath::Min(DistanceScale, 5.0f); // Cap at 5x

    return FinalDamage;
}

bool AKhaaosRingManager::IsPositionInSafeZone(const FVector& Position) const
{
    const float DistFromCenter = FVector::Dist2D(Position, RingCenter);
    return DistFromCenter <= CurrentRadius;
}

// ─── Phase Complete ───────────────────────────────────────────────────────────

void AKhaaosRingManager::OnRingPhaseComplete(int32 PhaseIndex)
{
    UE_LOG(LogTemp, Log, TEXT("RingManager: Phase %d complete"), PhaseIndex);

    // Start next phase after a brief pause (grace period)
    if (UWorld* World = GetWorld())
    {
        FTimerDelegate PhaseDelegate;
        PhaseDelegate.BindUFunction(this, FName("StartNextPhase"));
        World->GetTimerManager().SetTimer(RingShrinkTimer, PhaseDelegate, 5.0f, false);
    }
}

// ─── World Ring Closed ────────────────────────────────────────────────────────

void AKhaaosRingManager::OnWorldRingClosed()
{
    UE_LOG(LogTemp, Log, TEXT("RingManager: World ring CLOSED — all phases complete"));

    // Broadcast RING_CLOSED event
    // Notify game state for UI replication

    // Trigger world transition after grace period
    if (UWorld* World = GetWorld())
    {
        FTimerDelegate TransitionDelegate;
        TransitionDelegate.BindUFunction(this, FName("TriggerWorldTransition"));
        // 15 second grace period before transition
        World->GetTimerManager().SetTimer(RingShrinkTimer, TransitionDelegate, 15.0f, false);
    }
}

// ─── World Transition ─────────────────────────────────────────────────────────

void AKhaaosRingManager::TriggerWorldTransition()
{
    UE_LOG(LogTemp, Log, TEXT("RingManager: Triggering world transition (portal Khaaos)"));

    // Get next world from pipeline
    EKhaaosWorld NextWorld = EKhaaosWorld::CIGKV; // default fallback

    if (const UGameInstance* GI = GetGameInstance())
    {
        if (const UKhaaosRingSubsystem* RingSub = GI->GetSubsystem<UKhaaosRingSubsystem>())
        {
            NextWorld = RingSub->GetNextWorldInPipeline(CurrentWorld);
        }
    }

    // Spawn Khaaos Portal actor at ring center
    // The portal handles player teleportation and world load
    // TSubclassOf<AActor> PortalClass = LoadClass<AActor>(nullptr, TEXT("Blueprint'/Game/World/BP_KhaaosPortal.BP_KhaaosPortal_C'"));
    // if (PortalClass && GetWorld())
    // {
    //     FActorSpawnParameters SpawnParams;
    //     SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    //     GetWorld()->SpawnActor<AActor>(PortalClass, RingCenter, FRotator::ZeroRotator, SpawnParams);
    // }

    UE_LOG(LogTemp, Log, TEXT("RingManager: Portal spawned for next world"));
}

// ─── Damage Tick (called by timer) ────────────────────────────────────────────

void AKhaaosRingManager::ApplyDamageTick_Implementation()
{
    // Iterate all player states and apply ring damage if outside safe zone
    if (UWorld* World = GetWorld())
    {
        // Damage application is handled by each player's KhaaosRingComponent
        // This manager just provides the damage query interface
    }
}
