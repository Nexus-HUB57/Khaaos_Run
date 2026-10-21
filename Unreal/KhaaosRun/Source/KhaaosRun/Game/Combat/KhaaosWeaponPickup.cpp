// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Combat/KhaaosWeaponPickup.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "Components/SphereComponent.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Net/UnrealNetwork.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/Character.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosWeaponPickup::AKhaaosWeaponPickup()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;

    // ── Overlap Sphere ──
    PickupSphere = CreateDefaultSubobject<USphereComponent>(TEXT("PickupSphere"));
    RootComponent = PickupSphere;
    PickupRadius = 80.0f;
    PickupSphere->SetSphereRadius(PickupRadius);
    PickupSphere->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    PickupSphere->SetCollisionResponseToAllChannels(ECR_Ignore);
    PickupSphere->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

    // ── Rarity Glow VFX ──
    RarityGlowVFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("RarityGlowVFX"));
    RarityGlowVFX->SetupAttachment(RootComponent);
    RarityGlowVFX->bAutoActivate = true;

    // ── Replicated State ──
    WeaponID       = NAME_None;
    Rarity         = EKhaaosRarity::Comum;
    AmmoCount      = 30;
    bIsSpawnPickup = true;
    bIsPickedUp    = false;

    // ── Animation ──
    BobAmplitude = 5.0f;
    BobSpeed     = 2.0f;

    // ── Timing ──
    DestroyDelay = 0.5f;

    // ── Internal ──
    InitialZ = 0.0f;
    BobTime  = 0.0f;

    bReplicates = true;
    bOnlyRelevantToPlayers = true;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWeaponPickup: Constructed"));
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::BeginPlay()
{
    Super::BeginPlay();

    // Bind overlap delegate
    if (PickupSphere)
    {
        PickupSphere->OnComponentBeginOverlap.AddDynamic(this, &AKhaaosWeaponPickup::OnOverlapBegin);
    }

    // Store initial Z for bobbing
    InitialZ = GetActorLocation().Z;

    // Apply rarity glow
    ApplyRarityGlow();

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWeaponPickup::BeginPlay - WeaponID=%s Rarity=%d Ammo=%d"),
        *WeaponID.ToString(), static_cast<int32>(Rarity), AmmoCount);
}

void AKhaaosWeaponPickup::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    // Don't animate if already picked up
    if (bIsPickedUp)
    {
        return;
    }

    // Floating bobbing animation: sin wave on Z axis
    BobTime += DeltaSeconds * BobSpeed;
    const float BobOffset = FMath::Sin(BobTime) * BobAmplitude;
    FVector CurrentLocation = GetActorLocation();
    CurrentLocation.Z = InitialZ + BobOffset;
    SetActorLocation(CurrentLocation);
}

// ─── Overlap Handling ───────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
    UPrimitiveComponent* OtherComp, int32 OtherBodyIndex,
    bool bFromSweep, const FHitResult& SweepResult)
{
    if (!OtherActor || bIsPickedUp)
    {
        return;
    }

    // Check if the overlapping actor is a player character
    APlayerState* PlayerState = nullptr;
    if (const APawn* Pawn = Cast<APawn>(OtherActor))
    {
        PlayerState = Pawn->GetPlayerState();
    }

    if (!PlayerState)
    {
        return;
    }

    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosWeaponPickup::OnOverlapBegin - Player %s overlapped weapon %s"),
        *PlayerState->GetUniqueId().ToString(), *WeaponID.ToString());

    // Server-interact: only call on authority
    if (GetLocalRole() == ROLE_Authority)
    {
        ServerInteract_Implementation(PlayerState);
    }
    else
    {
        // Client requests server interaction
        ServerInteract(PlayerState);
    }
}

// ─── Server Interaction ─────────────────────────────────────────────────────────

bool AKhaaosWeaponPickup::ServerInteract_Validate(APlayerState* InteractingPlayer)
{
    return InteractingPlayer != nullptr;
}

void AKhaaosWeaponPickup::ServerInteract_Implementation(APlayerState* InteractingPlayer)
{
    if (!InteractingPlayer || bIsPickedUp)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosWeaponPickup::ServerInteract - Invalid or already picked up"));
        return;
    }

    // Validate that the player can pick up (has inventory component)
    if (!TryAddToInventory(InteractingPlayer))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosWeaponPickup::ServerInteract - Failed to add weapon %s to inventory"),
            *WeaponID.ToString());
        return;
    }

    // Pickup successful
    HandlePickupComplete(InteractingPlayer);
}

// ─── Inventory Integration ──────────────────────────────────────────────────────

bool AKhaaosWeaponPickup::TryAddToInventory(APlayerState* PlayerState)
{
    if (!PlayerState)
    {
        return false;
    }

    // Find the inventory component on the player's pawn
    APawn* Pawn = PlayerState->GetPawn();
    if (!Pawn)
    {
        return false;
    }

    UKhaaosInventoryComponent* Inventory = Pawn->FindComponentByClass<UKhaaosInventoryComponent>();
    if (!Inventory)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosWeaponPickup::TryAddToInventory - No inventory component on %s"),
            *Pawn->GetName());
        return false;
    }

    // Attempt to add weapon to inventory
    const bool bAdded = Inventory->AddItem(WeaponID, AmmoCount);
    if (bAdded)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWeaponPickup::TryAddToInventory - Added %s (Ammo=%d) to %s"),
            *WeaponID.ToString(), AmmoCount, *PlayerState->GetUniqueId().ToString());
    }

    return bAdded;
}

// ─── Pickup Completion ──────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::HandlePickupComplete(APlayerState* Picker)
{
    // Mark as picked up (replicated)
    bIsPickedUp = true;

    // Broadcast delegate
    OnWeaponPickedUp.Broadcast(WeaponID, Rarity, Picker);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWeaponPickup::HandlePickupComplete - %s picked up %s"),
        *Picker->GetUniqueId().ToString(), *WeaponID.ToString());

    // Schedule delayed destroy (for network replication to complete)
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().SetTimer(DestroyTimerHandle, this,
            &AKhaaosWeaponPickup::DelayedDestroy, DestroyDelay, false);
    }
}

// ─── Delayed Destroy ────────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::DelayedDestroy()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosWeaponPickup::DelayedDestroy - Destroying %s"), *GetName());

    Destroy();
}

// ─── RepNotify ──────────────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::OnRep_IsPickedUp()
{
    if (bIsPickedUp)
    {
        // Client-side: hide pickup, stop VFX
        SetActorHiddenInGame(true);
        SetActorEnableCollision(false);

        if (RarityGlowVFX)
        {
            RarityGlowVFX->Deactivate();
        }
    }
}

// ─── Rarity Glow ────────────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::ApplyRarityGlow()
{
    if (!RarityGlowVFX)
    {
        return;
    }

    const FLinearColor GlowColor = GetRarityGlowColor(Rarity);
    RarityGlowVFX->SetNiagaraVariableLinearColor(FString("GlowColor"), GlowColor);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosWeaponPickup::ApplyRarityGlow - Rarity=%d Color=(%.2f,%.2f,%.2f)"),
        static_cast<int32>(Rarity), GlowColor.R, GlowColor.G, GlowColor.B);
}

FLinearColor AKhaaosWeaponPickup::GetRarityGlowColor(EKhaaosRarity InRarity)
{
    switch (InRarity)
    {
    case EKhaaosRarity::Comum:    return FLinearColor(0.0f, 1.0f, 0.0f, 1.0f);   // Green
    case EKhaaosRarity::Raro:     return FLinearColor(0.0f, 0.5f, 1.0f, 1.0f);   // Blue
    case EKhaaosRarity::Epico:    return FLinearColor(0.5f, 0.0f, 1.0f, 1.0f);   // Purple
    case EKhaaosRarity::Lendario: return FLinearColor(1.0f, 0.84f, 0.0f, 1.0f);  // Gold
    case EKhaaosRarity::Mitico:   return FLinearColor(1.0f, 0.0f, 0.0f, 1.0f);   // Red
    default:                      return FLinearColor::White;
    }
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosWeaponPickup::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME(AKhaaosWeaponPickup, WeaponID);
    DOREPLIFETIME(AKhaaosWeaponPickup, Rarity);
    DOREPLIFETIME(AKhaaosWeaponPickup, AmmoCount);
    DOREPLIFETIME(AKhaaosWeaponPickup, bIsSpawnPickup);
    DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosWeaponPickup, bIsPickedUp, COND_None, REPNOTIFY_Always);
}
