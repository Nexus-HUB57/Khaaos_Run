// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Game/Data/KhaaosEnums.h"
#include "KhaaosWeaponPickup.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class USphereComponent;
class UNiagaraComponent;
class UKhaaosInventoryComponent;

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnWeaponPickedUp, const FName&, WeaponID, EKhaaosRarity, Rarity, APlayerState*, Picker);

/**
 * AKhaaosWeaponPickup
 *
 * Interactable weapon pickup actor spawned in the world.
 * Players overlap the detection sphere to auto-pickup or interact.
 *
 * Architecture:
 *   - Overlap sphere for pickup detection
 *   - Server-authoritative: ServerInteract validates and adds to inventory
 *   - Rarity-based glow VFX via Niagara component
 *   - Floating/hovering bobbing animation (sin wave on Z)
 *   - Auto-destroy after pickup with short delay for network replication
 *   - Replicated: WeaponID, Rarity, AmmoCount, bIsPickedUp
 *
 * Free Fire Parity:
 *   - Rarity glow: Comum=green, Raro=blue, Epico=purple, Lendario=gold, Mitico=red
 *   - Floating pickup animation matches Free Fire weapon pickups
 *   - Auto-pickup on overlap (walk-over style)
 */
UCLASS(Abstract, ClassGroup=(Khaaos))
class AKhaaosWeaponPickup : public AActor
{
    GENERATED_BODY()

public:
    AKhaaosWeaponPickup();

    // ─── Components ─────────────────────────────────────────────────────────

    /** Overlap sphere for pickup detection. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    TObjectPtr<USphereComponent> PickupSphere;

    /** Rarity glow Niagara VFX component. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    TObjectPtr<UNiagaraComponent> RarityGlowVFX;

    // ─── Replicated State ───────────────────────────────────────────────────

    /** Weapon identifier (maps to weapon data asset). */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    FName WeaponID;

    /** Rarity tier of this weapon pickup. */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    EKhaaosRarity Rarity;

    /** Ammo count included with this pickup. */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    int32 AmmoCount;

    /** Whether this was spawned as a world spawn pickup (vs. player drop). */
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    uint8 bIsSpawnPickup : 1;

    /** Whether this pickup has been claimed. */
    UPROPERTY(ReplicatedUsing = OnRep_IsPickedUp, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    uint8 bIsPickedUp : 1;

    // ─── RepNotify ──────────────────────────────────────────────────────────

    UFUNCTION()
    void OnRep_IsPickedUp();

    // ─── Interaction ────────────────────────────────────────────────────────

    /**
     * Server-only: Player interacts with this pickup.
     * Validates ownership, adds weapon to inventory, marks as picked up.
     * @param InteractingPlayer - The player state of the interacting player.
     */
    UFUNCTION(BlueprintCallable, Server, Reliable, WithValidation, Category = "Khaaos|WeaponPickup")
    void ServerInteract(APlayerState* InteractingPlayer);

    // ─── Delegates ──────────────────────────────────────────────────────────

    /** Broadcast when this weapon is picked up. */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|WeaponPickup")
    FOnWeaponPickedUp OnWeaponPickedUp;

    // ─── Configuration ──────────────────────────────────────────────────────

    /** Pickup detection radius. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    float PickupRadius;

    /** Bobbing amplitude (Z offset). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WeaponPickup|Animation")
    float BobAmplitude;

    /** Bobbing speed (radians per second). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WeaponPickup|Animation")
    float BobSpeed;

    /** Delay before destroying after pickup (for network replication). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|WeaponPickup")
    float DestroyDelay;

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:

    // ─── Overlap Handling ───────────────────────────────────────────────────

    /** Called when another actor overlaps the pickup sphere. */
    UFUNCTION()
    void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
        UPrimitiveComponent* OtherComp, int32 OtherBodyIndex,
        bool bFromSweep, const FHitResult& SweepResult);

    // ─── Rarity Glow ────────────────────────────────────────────────────────

    /** Apply rarity-based color to the glow VFX. */
    void ApplyRarityGlow();

    /** Get the Niagara color for a given rarity. */
    static FLinearColor GetRarityGlowColor(EKhaaosRarity InRarity);

    // ─── Pickup Logic ───────────────────────────────────────────────────────

    /** Attempt to add weapon to a player's inventory. Returns true on success. */
    bool TryAddToInventory(APlayerState* PlayerState);

    /** Handle post-pickup: mark as picked up, broadcast, schedule destroy. */
    void HandlePickupComplete(APlayerState* Picker);

    /** Destroy this actor (called after DestroyDelay). */
    void DelayedDestroy();

private:

    /** Initial Z position for bobbing calculation. */
    float InitialZ;

    /** Accumulated time for bobbing sin wave. */
    float BobTime;

    /** Timer handle for delayed destroy. */
    FTimerHandle DestroyTimerHandle;
};
