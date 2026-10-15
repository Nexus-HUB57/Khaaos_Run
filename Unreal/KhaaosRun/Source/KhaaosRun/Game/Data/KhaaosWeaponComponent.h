// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Data/KhaaosWeaponDataAsset.h"
#include "KhaaosWeaponComponent.generated.h"

// ─── Delegates ─────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAmmoChanged, int32, CurrentAmmo, int32, MaxAmmo);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWeaponSwitched, FName, WeaponID);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnFireModeChanged, EWeaponFireMode, OldMode, EWeaponFireMode, NewMode);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnAttachmentChanged, FName, SlotName, const FKhaaosWeaponAttachment&, Attachment, bool, bEquipped);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnOverheatChanged, bool, bIsOverheated);

/**
 * UKhaaosWeaponComponent
 *
 * PhD-Level ActorComponent managing weapon state for a player:
 *   - Current weapon + reserve ammo
 *   - Reload state + timing
 *   - Recoil accumulation + recovery (per-shot pattern)
 *   - Fire mode switching (Semi / Auto / Burst cycle)
 *   - Burst fire tracking
 *   - Attachment system (runtime equip / unequip with stat modifiers)
 *   - Overheat mechanics (LMG / sustained fire)
 *   - Per-shot recoil pattern indexing
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosWeaponComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosWeaponComponent();

    // ─── Weapon Assignment ──────────────────────────────────────────────────

    /** Equip a weapon from DataAsset. Resets all runtime state. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon")
    void EquipWeapon(const UKhaaosWeaponDataAsset* WeaponAsset);

    /** Get current weapon. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon")
    const UKhaaosWeaponDataAsset* GetCurrentWeapon() const { return CurrentWeapon; }

    // ─── Ammo ───────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Ammo")
    int32 GetCurrentAmmo() const { return CurrentAmmo; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Ammo")
    int32 GetReserveAmmo() const { return ReserveAmmo; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Ammo")
    int32 GetMaxReserveAmmo() const { return MaxReserveAmmo; }

    /** Consume one round. Returns false if empty or overheated. Auto-reloads on empty. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Ammo")
    bool ConsumeAmmo();

    /** Start reload. Returns false if already reloading or full. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Ammo")
    bool StartReload();

    /** Cancel active reload. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Ammo")
    void CancelReload();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Ammo")
    bool IsReloading() const { return bIsReloading; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Ammo")
    float GetReloadProgress() const;

    // ─── Fire Mode ──────────────────────────────────────────────────────────

    /** Get the active fire mode. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|FireMode")
    EWeaponFireMode GetActiveFireMode() const { return ActiveFireMode; }

    /** Cycle fire mode: Semi → Auto → Burst → Semi. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|FireMode")
    void CycleFireMode();

    /** Set fire mode directly. Clamps to Semi/Auto/Burst cycle. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|FireMode")
    void SetFireMode(EWeaponFireMode NewMode);

    // ─── Burst Fire ─────────────────────────────────────────────────────────

    /** Start a burst fire sequence. Returns false if already burst-firing or invalid mode. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Burst")
    bool StartBurst();

    /** Fire one shot within a burst. Returns false if burst complete or cannot fire. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Burst")
    bool FireBurstShot();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Burst")
    bool IsBurstFiring() const { return bIsBurstFiring; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Burst")
    int32 GetBurstShotsRemaining() const { return BurstShotsRemaining; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Burst")
    int32 GetBurstShotsFired() const { return BurstShotsFired; }

    // ─── Attachment System ──────────────────────────────────────────────────

    /** Equip an attachment to a named slot. Returns false if slot already occupied. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Attachment")
    bool EquipAttachment(FName SlotName, const FKhaaosWeaponAttachment& Attachment);

    /** Remove attachment from a named slot. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Attachment")
    void UnequipAttachment(FName SlotName);

    /** Get equipped attachment for a slot (returns false if none). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Attachment")
    bool GetEquippedAttachment(FName SlotName, FKhaaosWeaponAttachment& OutAttachment) const;

    /** Get cumulative stat modifier from all equipped attachments. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Attachment")
    float GetAttachmentStatModifier(FName StatName) const;

    /** Get all equipped attachments. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Attachment")
    const TMap<FName, FKhaaosWeaponAttachment>& GetAllEquippedAttachments() const { return EquippedAttachments; }

    // ─── Overheat ───────────────────────────────────────────────────────────

    /** Add heat (typically called per-shot). Triggers overheat when threshold exceeded. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Overheat")
    void AddHeat(float HeatPerShot);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Overheat")
    float GetHeatLevel() const { return HeatLevel; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Overheat")
    bool IsOverheated() const { return bIsOverheated; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Overheat")
    float GetOverheatThreshold() const { return OverheatThreshold; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Overheat")
    float GetHeatDecayRate() const { return HeatDecayRate; }

    // ─── Recoil ─────────────────────────────────────────────────────────────

    /** Add recoil from a shot. Uses per-shot pattern if available. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Recoil")
    void AddRecoil();

    /** Get current recoil offset (pitch, yaw). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Recoil")
    void GetRecoilOffset(float& OutPitch, float& OutYaw) const;

    /** Get total shots fired (for pattern indexing / stats). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Weapon|Recoil")
    int32 GetShotsFired() const { return ShotsFired; }

    /** Reset shots fired counter (e.g. on weapon idle timeout). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Weapon|Recoil")
    void ResetShotsFired() { ShotsFired = 0; }

    // ─── Delegates ──────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Weapon")
    FOnAmmoChanged OnAmmoChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Weapon")
    FOnWeaponSwitched OnWeaponSwitched;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Weapon|FireMode")
    FOnFireModeChanged OnFireModeChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Weapon|Attachment")
    FOnAttachmentChanged OnAttachmentChanged;

    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Weapon|Overheat")
    FOnOverheatChanged OnOverheatChanged;

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    // ─── Weapon ──────────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon")
    const UKhaaosWeaponDataAsset* CurrentWeapon = nullptr;

    // ─── Ammo ────────────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Ammo")
    int32 CurrentAmmo = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Ammo")
    int32 ReserveAmmo = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Ammo")
    int32 MaxReserveAmmo = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Ammo")
    bool bIsReloading = false;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Ammo")
    float ReloadTimeRemaining = 0.0f;

    // ─── Fire Mode ───────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|FireMode")
    EWeaponFireMode ActiveFireMode = EWeaponFireMode::Auto;

    // ─── Burst Fire ──────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Burst")
    bool bIsBurstFiring = false;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Burst")
    int32 BurstShotsRemaining = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Burst")
    int32 BurstShotsFired = 0;

    /** Timeout (seconds) for burst window; if shots don't arrive in time, burst resets. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Weapon|Burst")
    float BurstTimeout = 0.1f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Burst")
    float BurstTimeoutRemaining = 0.0f;

    // ─── Attachments ─────────────────────────────────────────────────────────

    /** Currently equipped attachments: Key = slot name (e.g. "Optic","Barrel"), Value = attachment data. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Attachment")
    TMap<FName, FKhaaosWeaponAttachment> EquippedAttachments;

    // ─── Overheat ────────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    float HeatLevel = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    bool bIsOverheated = false;

    /** Heat level at which the weapon overheats and cannot fire. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    float OverheatThreshold = 100.0f;

    /** Heat units recovered per second when not firing. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    float HeatDecayRate = 15.0f;

    /** Heat added per shot (default; can be overridden by attachment modifiers). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    float HeatPerShot = 5.0f;

    /** Cooldown delay (seconds) after overheat before heat decay resumes. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    float OverheatCooldownDelay = 2.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Overheat")
    float OverheatCooldownRemaining = 0.0f;

    // ─── Recoil ──────────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Recoil")
    float AccumulatedRecoilPitch = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Recoil")
    float AccumulatedRecoilYaw = 0.0f;

    /** Total shots fired in current engagement (for pattern indexing). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Weapon|Recoil")
    int32 ShotsFired = 0;

private:

    /** Returns true if the weapon can fire (has ammo, not reloading, not overheated). */
    bool CanFire() const;
};
