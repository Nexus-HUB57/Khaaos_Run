// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Pool/KhaaosPooledProjectile.h"
#include "Components/SphereComponent.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "Engine/World.h"
#include "TimerManager.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

AKhaaosPooledProjectile::AKhaaosPooledProjectile()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;

	bIsActive = false;
	bShouldBounce = false;
	CurrentLifetime = 0.0f;

	// Collision component
	CollisionComponent = CreateDefaultSubobject<USphereComponent>(TEXT("CollisionComponent"));
	CollisionComponent->InitSphereRadius(5.0f);
	CollisionComponent->SetCollisionProfileName(TEXT("Projectile"));
	RootComponent = CollisionComponent;

	// Projectile movement
	MovementComponent = CreateDefaultSubobject<UProjectileMovementComponent>(TEXT("MovementComponent"));
	MovementComponent->SetIsReplicated(true);
	MovementComponent->InitialSpeed = InitialSpeed;
	MovementComponent->MaxSpeed = 5000.0f;
	MovementComponent->bShouldBounce = false;
	MovementComponent->ProjectileGravityScale = 0.0f; // No gravity by default

	// Bind hit
	CollisionComponent->OnComponentHit.AddDynamic(this, &AKhaaosPooledProjectile::OnHit);
}

// ─── BeginPlay ────────────────────────────────────────────────────────────────

void AKhaaosPooledProjectile::BeginPlay()
{
	Super::BeginPlay();

	// Start inactive (pooled state)
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
	SetActorTickEnabled(false);
}

// ─── Activate ─────────────────────────────────────────────────────────────────

bool AKhaaosPooledProjectile::Activate(const FTransform& StartTransform, FVector Velocity, AActor* Owner)
{
	if (bIsActive)
	{
		return false; // Already active
	}

	// Set transform and ownership
	SetActorTransform(StartTransform);
	SetInstigator(Owner);
	SetOwner(Owner);

	// Set velocity
	if (MovementComponent)
	{
		MovementComponent->Velocity = Velocity;
		MovementComponent->InitialSpeed = Velocity.Size();
		MovementComponent->bShouldBounce = bShouldBounce;
		MovementComponent->SetActive(true);
	}

	// Activate
	bIsActive = true;
	CurrentLifetime = 0.0f;

	SetActorHiddenInGame(false);
	SetActorEnableCollision(true);
	SetActorTickEnabled(true);

	// Set max lifetime timer
	if (MaxLifetime > 0.0f)
	{
		GetWorldTimerManager().SetTimer(LifetimeTimer, this, &AKhaaosPooledProjectile::OnLifetimeExpired, MaxLifetime, false);
	}

	return true;
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

void AKhaaosPooledProjectile::Deactivate()
{
	if (!bIsActive)
	{
		return;
	}

	bIsActive = false;
	CurrentLifetime = 0.0f;

	// Stop movement
	if (MovementComponent)
	{
		MovementComponent->Velocity = FVector::ZeroVector;
		MovementComponent->SetActive(false);
	}

	// Clear timer
	GetWorldTimerManager().ClearTimer(LifetimeTimer);

	// Hide and disable
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
	SetActorTickEnabled(false);

	// Move far away (safety)
	SetActorLocation(FVector(0.0f, 0.0f, -100000.0f));

	// Broadcast pool return
	OnProjectilePooled.Broadcast(this);
}

// ─── LifeSpanExpired ──────────────────────────────────────────────────────────

void AKhaaosPooledProjectile::LifeSpanExpired()
{
	// Override to prevent destruction — return to pool instead
	Deactivate();
}

// ─── OnHit ────────────────────────────────────────────────────────────────────

void AKhaaosPooledProjectile::OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit)
{
	if (!bIsActive)
	{
		return;
	}

	// Don't hit self or owner
	if (OtherActor == this || OtherActor == GetOwner())
	{
		return;
	}

	// Apply damage
	if (OtherActor)
	{
		ApplyDamageToActor(OtherActor, Hit);
	}

	// Return to pool
	Deactivate();
}

// ─── ApplyDamageToActor ──────────────────────────────────────────────────────

void AKhaaosPooledProjectile::ApplyDamageToActor(AActor* Target, const FHitResult& Hit)
{
	// In a full implementation, this would:
	// 1. Get the target's AbilitySystemComponent
	// 2. Create a damage GameplayEffect via UKhaaosGameplayEffects::CreateDamageEffect
	// 3. Apply the effect spec to the target ASC
	//
	// For now, use the generic damage application:
	if (!HasAuthority())
	{
		return; // Server-authoritative
	}

	UE_LOG(LogTemp, Verbose, TEXT("KhaaosPooledProjectile: Hit %s for %.1f damage"),
		*Target->GetName(), Damage);

	// FGenericTeamId-based damage or GAS-based would be integrated here
}

// ─── OnLifetimeExpired ────────────────────────────────────────────────────────

void AKhaaosPooledProjectile::OnLifetimeExpired()
{
	if (bIsActive)
	{
		UE_LOG(LogTemp, Verbose, TEXT("KhaaosPooledProjectile: Lifetime expired, deactivating"));
		Deactivate();
	}
}

// ─── Replication ──────────────────────────────────────────────────────────────

void AKhaaosPooledProjectile::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	DOREPLIFETIME(AKhaaosPooledProjectile, bIsActive);
}
