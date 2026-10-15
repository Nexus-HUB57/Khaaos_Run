// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Combat/KhaaosProjectile.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "KhaaosRun.h"

#include "Components/SphereComponent.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"
#include "Game/Player/KhaaosVitalityComponent.h"
#include "KhaaosAttributeSet.h"
#include "AbilitySystemComponent.h"
#include "AbilitySystemBlueprintLibrary.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosProjectile::AKhaaosProjectile()
{
        PrimaryActorTick.bCanEverTick = true;
        PrimaryActorTick.bStartWithTickEnabled = true;

        // ── Components ──
        CollisionComponent = CreateDefaultSubobject<USphereComponent>(TEXT("CollisionComponent"));
        RootComponent = CollisionComponent;
        CollisionComponent->SetSphereRadius(5.0f);
        CollisionComponent->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        CollisionComponent->SetCollisionResponseToAllChannels(ECR_Block);
        CollisionComponent->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

        MovementComponent = CreateDefaultSubobject<UProjectileMovementComponent>(TEXT("MovementComponent"));
        MovementComponent->SetUpdatedComponent(CollisionComponent);
        MovementComponent->InitialSpeed = 3000.0f;
        MovementComponent->MaxSpeed = 3000.0f;
        MovementComponent->bRotationFollowsVelocity = true;
        MovementComponent->bShouldBounce = false;
        MovementComponent->ProjectileLifespan = 5.0f;

        MeshComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MeshComponent"));
        MeshComponent->SetupAttachment(RootComponent);

        // ── Configuration defaults ──
        Damage        = 25.0f;
        InitialSpeed  = 3000.0f;
        MaxRange      = 5000.0f;
        Lifetime      = 5.0f;
        bShouldBounce = false;
        DamageRadius  = 0.0f;

        // ── Replicated state ──
        ReplicatedLocation = FVector::ZeroVector;
        bIsActive         = false;
        InstigatorActor   = nullptr;

        // ── Internal state ──
        DistanceTraveled  = 0.0f;
        TimeAlive         = 0.0f;
        SpawnPosition     = FVector::ZeroVector;
        bIsPooled         = true;

        bReplicates = true;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosProjectile::BeginPlay()
{
        Super::BeginPlay();

        // Bind collision delegates
        if (CollisionComponent)
        {
                CollisionComponent->OnComponentHit.AddDynamic(this, &AKhaaosProjectile::OnHit);
                CollisionComponent->OnComponentBeginOverlap.AddDynamic(this, &AKhaaosProjectile::OnOverlap);
        }

        // Start pooled (inactive)
        Deactivate();
}

void AKhaaosProjectile::Tick(float DeltaSeconds)
{
        Super::Tick(DeltaSeconds);

        if (!bIsActive)
        {
                return;
        }

        // Track distance and time
        TimeAlive += DeltaSeconds;
        DistanceTraveled = FVector::Dist(GetActorLocation(), SpawnPosition);

        // Auto-deactivate if exceeded max range or lifetime
        if (DistanceTraveled > MaxRange || TimeAlive > Lifetime)
        {
                Deactivate();
                return;
        }

        // Server: update replicated location for client interpolation
        if (GetLocalRole() == ROLE_Authority)
        {
                ReplicatedLocation = GetActorLocation();
        }
}

void AKhaaosProjectile::LifeSpanExpired()
{
        Deactivate();
}

// ─── Pooling Interface ──────────────────────────────────────────────────────────

bool AKhaaosProjectile::Activate(const FVector& Position, const FVector& Direction, AActor* InInstigator, float InDamage)
{
        if (bIsActive)
        {
                return false;
        }

        // Initialize state
        SpawnPosition = Position;
        DistanceTraveled = 0.0f;
        TimeAlive = 0.0f;

        // Set position and direction
        SetActorLocation(Position);
        SetActorRotation(Direction.Rotation());

        // Set instigator
        InstigatorActor = InInstigator;
        SetInstigator(InInstigator);

        // Set damage override
        if (InDamage > 0.0f)
        {
                Damage = InDamage;
        }

        // Activate
        bIsActive = true;
        bIsPooled = false;

        // Enable collision and visibility
        SetActorHiddenInGame(false);
        SetActorEnableCollision(true);

        // Fire projectile movement
        if (MovementComponent)
        {
                MovementComponent->Velocity = Direction * InitialSpeed;
                MovementComponent->Activate();
        }

        // Set lifespan
        SetLifeSpan(Lifetime);

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosProjectile::Activate - Launched from %s toward %s"),
                *Position.ToString(), *Direction.ToString());

        return true;
}

void AKhaaosProjectile::Deactivate()
{
        bIsActive = false;
        bIsPooled = true;

        // Stop movement
        if (MovementComponent)
        {
                MovementComponent->Deactivate();
                MovementComponent->Velocity = FVector::ZeroVector;
        }

        // Disable collision and visibility
        SetActorHiddenInGame(true);
        SetActorEnableCollision(false);

        // Clear lifespan timer
        SetLifeSpan(0.0f);
}

bool AKhaaosProjectile::IsAvailableForPool() const
{
        return bIsPooled && !bIsActive;
}

// ─── RepNotify ──────────────────────────────────────────────────────────────────

void AKhaaosProjectile::OnRep_ReplicatedTransform()
{
        // Client-side: interpolate projectile visual position
        if (!bIsActive)
        {
                return;
        }

        // Snap position (could be interpolated for smoother visuals)
        SetActorLocation(ReplicatedLocation);
}

// ─── Collision Handling ─────────────────────────────────────────────────────────

void AKhaaosProjectile::OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit)
{
        if (!bIsActive || !OtherActor)
        {
                return;
        }

        // Don't hit instigator
        if (OtherActor == InstigatorActor.Get())
        {
                return;
        }

        // Apply damage
        ApplyDamageToActor(OtherActor, Hit);

        // Spawn impact effects on client
        ClientSpawnImpactFX(Hit);

        // Deactivate after hit
        Deactivate();
}

void AKhaaosProjectile::OnOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
        if (!bIsActive || !OtherActor)
        {
                return;
        }

        // Don't overlap instigator
        if (OtherActor == InstigatorActor.Get())
        {
                return;
        }

        // Apply damage on overlap
        ApplyDamageToActor(OtherActor, SweepResult);

        // Spawn impact effects
        ClientSpawnImpactFX(SweepResult);

        // Deactivate after overlap
        Deactivate();
}

void AKhaaosProjectile::ApplyDamageToActor(AActor* Target, const FHitResult& Hit)
{
        if (!Target || GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        // 1) Prefer Vitality pipeline (CIGKV/Barburhen survival layer)
        if (UKhaaosVitalityComponent* Vitality = Target->FindComponentByClass<UKhaaosVitalityComponent>())
        {
                Vitality->ApplyDamage(Damage, InstigatorActor.Get());
                return;
        }

        // 2) Prefer AttributeSet Health via ASC
        if (UAbilitySystemComponent* ASC = UAbilitySystemBlueprintLibrary::GetAbilitySystemComponent(Target))
        {
                if (const UKhaaosAttributeSet* ConstAttr = ASC->GetSet<UKhaaosAttributeSet>())
                {
                        UKhaaosAttributeSet* Attr = const_cast<UKhaaosAttributeSet*>(ConstAttr);
                        Attr->ApplyDamage(Damage, InstigatorActor.Get());
                        return;
                }
        }

        // 3) Fallback engine damage
        if (DamageRadius > 0.0f)
        {
                UGameplayStatics::ApplyRadialDamage(
                        GetWorld(),
                        Damage,
                        Hit.Location,
                        DamageRadius,
                        UDamageType::StaticClass(),
                        TArray<AActor*>(),
                        InstigatorActor.Get(),
                        true
                );
        }
        else
        {
                UGameplayStatics::ApplyDamage(
                        Target,
                        Damage,
                        InstigatorActor ? InstigatorActor->GetInstigatorController() : nullptr,
                        this,
                        UDamageType::StaticClass()
                );
        }
}

void AKhaaosProjectile::ClientSpawnImpactFX_Implementation(const FHitResult& Hit)
{
        // Client-side impact VFX/SFX
        // Subclasses override with specific effects
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosProjectile::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosProjectile, ReplicatedLocation, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosProjectile, bIsActive);
        DOREPLIFETIME(AKhaaosProjectile, InstigatorActor);
}
