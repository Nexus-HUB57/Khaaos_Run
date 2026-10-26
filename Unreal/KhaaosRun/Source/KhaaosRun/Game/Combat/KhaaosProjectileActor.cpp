// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Combat/KhaaosProjectileActor.h"
#include "Game/Combat/KhaaosDamageManager.h"
#include "Player/KhaaosCharacter.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "Components/SphereComponent.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"
#include "TimerManager.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosProjectileActor::AKhaaosProjectileActor()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;

    // ── Collision Sphere ──
    CollisionComponent = CreateDefaultSubobject<USphereComponent>(TEXT("CollisionComponent"));
    RootComponent = CollisionComponent;
    CollisionComponent->SetSphereRadius(5.0f);
    CollisionComponent->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    CollisionComponent->SetCollisionResponseToAllChannels(ECR_Block);
    CollisionComponent->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

    // ── Projectile Movement (Ballistic) ──
    MovementComponent = CreateDefaultSubobject<UProjectileMovementComponent>(TEXT("MovementComponent"));
    MovementComponent->SetUpdatedComponent(CollisionComponent);
    MovementComponent->InitialSpeed = 3000.0f;
    MovementComponent->MaxSpeed = 5000.0f;
    MovementComponent->bRotationFollowsVelocity = true;
    MovementComponent->bShouldBounce = false;
    MovementComponent->ProjectileGravityScale = 0.5f;
    MovementComponent->ProjectileLifespan = 5.0f;

    // ── Trail VFX ──
    TrailVFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("TrailVFX"));
    TrailVFX->SetupAttachment(RootComponent);
    TrailVFX->bAutoActivate = true;

    // ── Configuration Defaults ──
    DamageAmount    = 25.0f;
    DamageType      = EKhaaosDamageType::Bullet;
    InstigatorId    = TEXT("");
    WeaponID        = NAME_None;
    MaxRange        = 10000.0f;
    bShouldBounce   = false;
    BounceCount     = 0;
    GravityScale    = 0.5f;
    DragCoefficient = 0.0f;
    InitialSpeed    = 3000.0f;
    MaxSpeed        = 5000.0f;
    Lifetime        = 5.0f;

    // ── Pooling ──
    bIsPooled = true;
    bIsActive = false;

    // ── Internal State ──
    DistanceTraveled   = 0.0f;
    TimeAlive          = 0.0f;
    SpawnPosition      = FVector::ZeroVector;
    RemainingBounces   = 0;

    bReplicates = true;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProjectileActor: Constructed"));
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosProjectileActor::BeginPlay()
{
    Super::BeginPlay();

    // Bind collision delegates
    if (CollisionComponent)
    {
        CollisionComponent->OnComponentHit.AddDynamic(this, &AKhaaosProjectileActor::OnHit);
    }

    // Server-only: don't simulate physics on clients
    if (GetLocalRole() != ROLE_Authority)
    {
        if (MovementComponent)
        {
            MovementComponent->SetActive(false);
        }
    }

    // Start in pooled (inactive) state
    ReturnToPool();

    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosProjectileActor::BeginPlay"));
}

void AKhaaosProjectileActor::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (!bIsActive)
    {
        return;
    }

    // Track distance and lifetime
    TimeAlive += DeltaSeconds;
    DistanceTraveled = FVector::Dist(GetActorLocation(), SpawnPosition);

    // Auto-deactivate if exceeded max range or lifetime
    if (DistanceTraveled > MaxRange || TimeAlive > Lifetime)
    {
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosProjectileActor::Tick - Range/Lifetime exceeded (Dist=%.0f/%.0f Time=%.1f/%.1f)"),
            DistanceTraveled, MaxRange, TimeAlive, Lifetime);
        ReturnToPool();
    }
}

void AKhaaosProjectileActor::LifeSpanExpired()
{
    // Override to prevent destruction — return to pool instead
    ReturnToPool();
}

// ─── Collision Handling ─────────────────────────────────────────────────────────

void AKhaaosProjectileActor::OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor,
    UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit)
{
    if (!bIsActive || !OtherActor)
    {
        return;
    }

    // Don't hit instigator/owner
    if (OtherActor == CachedInstigator.Get() || OtherActor == GetOwner())
    {
        return;
    }

    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosProjectileActor::OnHit - Hit %s at %s"),
        *OtherActor->GetName(), *Hit.Location.ToString());

    // Check if we should bounce
    if (bShouldBounce && RemainingBounces > 0)
    {
        // Let the projectile movement component handle the bounce reflection
        // Broadcast bounce event
        FVector VelocityAfterBounce = MovementComponent ? MovementComponent->Velocity : FVector::ZeroVector;
        HandleBounce(Hit, VelocityAfterBounce);
        return;
    }

    // Process the hit (apply damage, spawn effects)
    ProcessHit(OtherActor, Hit);

    // Deactivate after hit (no more bounces)
    ReturnToPool();
}

// ─── Impact Processing ──────────────────────────────────────────────────────────

void AKhaaosProjectileActor::ProcessHit(AActor* HitActor, const FHitResult& Hit)
{
    if (!HitActor)
    {
        return;
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProjectileActor::ProcessHit - Actor=%s Damage=%.1f Type=%d"),
        *HitActor->GetName(), DamageAmount, static_cast<int32>(DamageType));

    // Apply damage through DamageManager
    ApplyDamageToActor(HitActor, Hit);

    // Spawn impact VFX/SFX on client
    ClientSpawnImpactFX(Hit);

    // Broadcast hit delegate
    OnProjectileHit.Broadcast(this, HitActor, DamageAmount, Hit);
}

void AKhaaosProjectileActor::ApplyDamageToActor(AActor* Target, const FHitResult& Hit)
{
    // Server-authoritative only
    if (GetLocalRole() != ROLE_Authority)
    {
        return;
    }

    if (!Target)
    {
        return;
    }

    // Build FKhaaosHitResult for DamageManager
    FKhaaosHitResult HitResult;
    HitResult.InstigatorId = InstigatorId;
    HitResult.DamageAmount = DamageAmount;
    HitResult.DamageType   = DamageType;
    HitResult.WeaponID     = WeaponID;
    HitResult.bIsHeadshot  = UKhaaosDamageManagerComponent::IsHeadshotBone(Hit.BoneName);
    HitResult.DistanceM    = DistanceTraveled / 100.0f; // Convert cm to meters
    HitResult.Timestamp    = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    // Get victim ID from PlayerState
    if (const APawn* TargetPawn = Cast<APawn>(Target))
    {
        if (APlayerState* TargetPS = TargetPawn->GetPlayerState())
        {
            HitResult.VictimId = TargetPS->GetUniqueId().ToString();
        }
    }

    // Find DamageManager and process damage
    if (UWorld* World = GetWorld())
    {
        // Try to find DamageManager on the game state or game mode
        if (AGameStateBase* GameState = World->GetGameState())
        {
            if (UKhaaosDamageManagerComponent* DamageManager = GameState->FindComponentByClass<UKhaaosDamageManagerComponent>())
            {
                const float ActualDamage = DamageManager->ProcessDamage(HitResult);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProjectileActor::ApplyDamageToActor - DamageManager applied %.1f damage to %s"),
                    ActualDamage, *Target->GetName());
                return;
            }
        }

		// Fallback when no DamageManager is attached: keep typed Khaaos paths first.
		const FGameplayTag DamageTag = UKhaaosDamageManagerComponent::GetGameplayTagForDamageType(DamageType);
		if (AKhaaosCharacter* CharacterVictim = Cast<AKhaaosCharacter>(Target))
		{
			CharacterVictim->ApplyDamage(DamageAmount, CachedInstigator.Get(), DamageTag);
			return;
		}
		if (APawn* TargetPawn = Cast<APawn>(Target))
		{
			if (AKhaaosPlayerState* TargetPlayerState = Cast<AKhaaosPlayerState>(TargetPawn->GetPlayerState()))
			{
				APlayerState* InstigatorPlayerState = nullptr;
				if (const APawn* InstigatorPawn = Cast<APawn>(CachedInstigator.Get()))
				{
					InstigatorPlayerState = InstigatorPawn->GetPlayerState();
				}
				TargetPlayerState->ApplyDamageOfType(DamageAmount, DamageTag, InstigatorPlayerState);
				return;
			}
		}

        UGameplayStatics::ApplyDamage(
            Target,
            DamageAmount,
            CachedInstigator.IsValid() ? CachedInstigator->GetInstigatorController() : nullptr,
            this,
            UDamageType::StaticClass()
        );

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProjectileActor::ApplyDamageToActor - Fallback damage %.1f to %s"),
            DamageAmount, *Target->GetName());
    }
}

void AKhaaosProjectileActor::ClientSpawnImpactFX_Implementation(const FHitResult& Hit)
{
    // Client-side impact VFX and SFX
    // Subclasses override with specific effects (sparks, blood, explosion)
    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosProjectileActor::ClientSpawnImpactFX at %s"), *Hit.Location.ToString());
}

// ─── Bounce Logic ───────────────────────────────────────────────────────────────

void AKhaaosProjectileActor::HandleBounce(const FHitResult& Hit, const FVector& VelocityAfterBounce)
{
    RemainingBounces--;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProjectileActor::HandleBounce - Bounced! Remaining=%d Speed=%.0f"),
        RemainingBounces, VelocityAfterBounce.Size());

    // Broadcast bounce delegate
    OnProjectileBounce.Broadcast(this, Hit, VelocityAfterBounce);

    // If no bounces remaining, next hit will process damage
    if (RemainingBounces <= 0)
    {
        bShouldBounce = false;
    }
}

// ─── Pooling Interface ──────────────────────────────────────────────────────────

bool AKhaaosProjectileActor::ActivateProjectile(const FVector& Position, const FVector& Direction,
    AActor* InInstigator, const FName& InWeaponID, float InDamage)
{
    if (bIsActive)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosProjectileActor::ActivateProjectile - Already active"));
        return false;
    }

    // Initialize state
    SpawnPosition    = Position;
    DistanceTraveled = 0.0f;
    TimeAlive        = 0.0f;
    RemainingBounces = BounceCount;

    // Set position and direction
    SetActorLocation(Position);
    SetActorRotation(Direction.Rotation());

    // Set instigator
    CachedInstigator = InInstigator;
    SetInstigator(InInstigator);
    SetOwner(InInstigator);

    // Set weapon ID
    WeaponID = InWeaponID;

    // Set instigator ID string
    if (InInstigator)
    {
        if (const APawn* Pawn = Cast<APawn>(InInstigator))
        {
            if (APlayerState* PS = Pawn->GetPlayerState())
            {
                InstigatorId = PS->GetUniqueId().ToString();
            }
        }
    }

    // Override damage if specified
    if (InDamage > 0.0f)
    {
        DamageAmount = InDamage;
    }

    // Activate projectile
    bIsActive = true;
    bIsPooled = false;

    // Enable collision and visibility
    SetActorHiddenInGame(false);
    SetActorEnableCollision(true);

    // Fire projectile movement
    if (MovementComponent)
    {
        MovementComponent->InitialSpeed = InitialSpeed;
        MovementComponent->MaxSpeed = MaxSpeed;
        MovementComponent->ProjectileGravityScale = GravityScale;
        MovementComponent->bShouldBounce = bShouldBounce;
        MovementComponent->Velocity = Direction * InitialSpeed;
        MovementComponent->Activate(true);
    }

    // Activate trail VFX
    if (TrailVFX)
    {
        TrailVFX->Activate();
    }

    // Set lifespan
    SetLifeSpan(Lifetime);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProjectileActor::ActivateProjectile - Launched from %s dir=%s dmg=%.1f weapon=%s"),
        *Position.ToString(), *Direction.ToString(), DamageAmount, *WeaponID.ToString());

    return true;
}

void AKhaaosProjectileActor::ReturnToPool()
{
    bIsActive = false;
    bIsPooled = true;

    // Stop movement
    if (MovementComponent)
    {
        MovementComponent->Deactivate();
        MovementComponent->Velocity = FVector::ZeroVector;
    }

    // Deactivate trail VFX
    if (TrailVFX)
    {
        TrailVFX->Deactivate();
    }

    // Disable collision and visibility
    SetActorHiddenInGame(true);
    SetActorEnableCollision(false);

    // Clear lifespan timer
    SetLifeSpan(0.0f);

    // Move far away (safety — prevent accidental overlaps)
    SetActorLocation(FVector(0.0f, 0.0f, -100000.0f));

    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosProjectileActor::ReturnToPool - Deactivated"));
}

bool AKhaaosProjectileActor::IsAvailableForPool() const
{
    return bIsPooled && !bIsActive;
}

// ─── RepNotify ──────────────────────────────────────────────────────────────────

void AKhaaosProjectileActor::OnRep_IsActive()
{
    // Client-side: show/hide projectile based on active state
    if (!bIsActive)
    {
        SetActorHiddenInGame(true);
        SetActorEnableCollision(false);

        if (TrailVFX)
        {
            TrailVFX->Deactivate();
        }
    }
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosProjectileActor::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME(AKhaaosProjectileActor, InstigatorId);
    DOREPLIFETIME(AKhaaosProjectileActor, WeaponID);
    DOREPLIFETIME(AKhaaosProjectileActor, bIsPooled);
    DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosProjectileActor, bIsActive, COND_None, REPNOTIFY_Always);
}
